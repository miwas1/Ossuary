import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "../check-thresholds.ts";
import { compareThresholds, parseThresholds, type Doc, type Entry, type Kind } from "../lib/thresholds.ts";

const RUNS = { numRuns: 300 };
type Op = "keep" | "raise" | "lower" | "remove" | "flip";

/** Reference model, written from the rule in D-17 rather than from the implementation. */
function expectedKind(before: Entry, op: Op): Kind | null {
  switch (op) {
    case "remove":
      return "removed";
    case "flip":
      return "direction-changed";
    case "lower":
      return before.dir === "min" ? "min-lowered" : null; // a lower max is stricter
    case "raise":
      return before.dir === "max" ? "max-raised" : null; // a higher min is stricter
    case "keep":
      return null;
  }
}

function applyOp(e: Entry, op: Op, delta: number): Entry | undefined {
  switch (op) {
    case "keep":
      return e;
    case "raise":
      return { ...e, value: e.value + delta };
    case "lower":
      return { ...e, value: e.value - delta };
    case "remove":
      return undefined;
    case "flip":
      return { dir: e.dir === "min" ? "max" : "min", value: e.value };
  }
}

const entry = fc.record({ dir: fc.constantFrom<"min" | "max">("min", "max"), value: fc.double({ min: -1e6, max: 1e6, noNaN: true }) });
const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);

describe("threshold check properties", () => {
  // Feature: 00-foundations, Property P0-8: exactly the loosened keys are reported, each with the right kind.
  it("P0-8 reports exactly the loosened keys, with the right kind", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(key, entry, fc.constantFrom<Op>("keep", "raise", "lower", "remove", "flip"), fc.double({ min: 1e-6, max: 1e3, noNaN: true })), {
          selector: ([k]) => k,
          maxLength: 12,
        }),
        fc.uniqueArray(fc.tuple(key, entry), { selector: ([k]) => k, maxLength: 4 }),
        (rows, added) => {
          const base: Doc = new Map(rows.map(([k, e]) => [k, e]));
          const head: Doc = new Map();
          const expected = new Map<string, Kind>();
          for (const [k, e, op, delta] of rows) {
            const next = applyOp(e, op, delta);
            // raise/lower by tiny deltas can round to the same double: then it's unchanged
            const effectiveOp: Op = next && next.dir === e.dir && next.value === e.value ? "keep" : op;
            if (next) head.set(k, next);
            const kind = expectedKind(e, effectiveOp);
            if (kind) expected.set(k, kind);
          }
          for (const [k, e] of added) if (!base.has(k)) head.set(k, e);
          const got = compareThresholds("t.yaml", base, head);
          expect(new Map(got.map((l) => [l.key, l.kind]))).toEqual(expected);
          expect(got.length).toBe(expected.size);
        },
      ),
      RUNS,
    );
  });

  it("parses the min/max format and rejects everything else", () => {
    const ok = parseThresholds("t", "core_pass_k3: { min: 0.85 }\nsafety_failures: { max: 0 }\nlatency_p95_ms:\n  max: 1200\n");
    expect(ok.ok && [...ok.doc.entries()]).toEqual([
      ["core_pass_k3", { dir: "min", value: 0.85 }],
      ["safety_failures", { dir: "max", value: 0 }],
      ["latency_p95_ms", { dir: "max", value: 1200 }],
    ]);
    expect(parseThresholds("t", "").ok).toBe(true);
    for (const bad of [
      "a: 0.85",
      "a: { min: '0.85' }",
      "a: { min: 0.8, max: 0.9 }",
      "a: { least: 1 }",
      "a: { min: .nan }",
      "group:\n  a: { min: 1 }",
      "a: { min: 1 }\na: { min: 2 }",
      "- a",
      "a: [1",
    ]) {
      expect(parseThresholds("t", bad).ok, bad).toBe(false);
    }
  });
});

describe("thresholds:check against a git history", () => {
  let repo: string;
  const sha: Record<string, string> = {};
  const g = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const commit = (name: string, files: Record<string, string | null>) => {
    for (const [f, text] of Object.entries(files)) {
      const abs = path.join(repo, f);
      if (text === null) fs.rmSync(abs, { force: true });
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, text);
      }
    }
    g("add", "-A");
    g("commit", "-q", "--allow-empty", "-m", name);
    sha[name] = g("rev-parse", "HEAD");
  };

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "thresholds-"));
    g("init", "-q", "-b", "main");
    g("config", "user.email", "test@example.com");
    g("config", "user.name", "test");
    commit("base", { "apps/a/evals/thresholds.yaml": "core: { min: 0.85 }\nsafety: { max: 0 }\n" });
    commit("tighten", { "apps/a/evals/thresholds.yaml": "core: { min: 0.9 }\nsafety: { max: 0 }\nnew_key: { min: 0.1 }\n" });
    commit("loosen", { "apps/a/evals/thresholds.yaml": "core: { min: 0.5 }\nsafety: { max: 3 }\n" });
    commit("delete", { "apps/a/evals/thresholds.yaml": null });
    commit("broken", { "apps/a/evals/thresholds.yaml": "core: { min: 'high' }\n" });
  });
  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("passes when thresholds only tighten", () => {
    expect(runCheck({ cwd: repo, base: sha.base!, head: sha.tighten!, labelled: false }).exit).toBe(0);
  });
  it("fails on a lowered min and a raised max, and lists them", () => {
    const r = runCheck({ cwd: repo, base: sha.base!, head: sha.loosen!, labelled: false });
    expect(r.exit).toBe(1);
    expect(r.output.join("\n")).toMatch(/core \| min-lowered/);
    expect(r.output.join("\n")).toMatch(/safety \| max-raised/);
  });
  it("passes with the label and lists what it allowed", () => {
    const r = runCheck({ cwd: repo, base: sha.base!, head: sha.loosen!, labelled: true });
    expect(r.exit).toBe(0);
    expect(r.output[0]).toMatch(/allowed by the thresholds-change label/);
  });
  it("treats a deleted file as every key removed", () => {
    const r = runCheck({ cwd: repo, base: sha.base!, head: sha.delete!, labelled: false });
    expect(r.exit).toBe(1);
    expect(r.output.join("\n")).toMatch(/core \| removed/);
  });
  it("fails on a format error even with the label", () => {
    const r = runCheck({ cwd: repo, base: sha.base!, head: sha.broken!, labelled: true });
    expect(r.exit).toBe(1);
    expect(r.output.join("\n")).toMatch(/format errors/);
  });
});
