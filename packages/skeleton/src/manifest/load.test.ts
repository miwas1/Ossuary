import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ManifestError, PolicyError } from "../errors.ts";
import { findRepoRoot, loadProduct, parseModels } from "./load.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const price = { input: 1, cached_input: 0.1, output: 2, currency: "USD", source: "https://example.com/p", checked: "2026-11-26" };
const models = {
  tiers: {
    small: { primary: "fake:small", fallback: "fake2:small" },
    mid: { primary: "fake:mid", fallback: "fake2:mid" },
    frontier: { primary: "fake:frontier", fallback: "fake2:<id>" },
  },
  prices: { "fake:small": price, "fake2:small": price, "fake:mid": price, "fake2:mid": price, "fake:frontier": price },
};
const product = {
  id: "echo",
  name: "Echo",
  code: "GEN-A1-R1",
  users: "The builder",
  market: ["NG"],
  north_star: "accepted epitaphs",
  pricing: { model: "per_unit", unit: "epitaph", currency: "USD" },
  routing: "./routing.yaml",
  evals: { dir: "./evals", core_set: "core" },
  limits: { max_steps: 8, max_tokens: 20000, max_seconds: 60, max_spend_usd: 0.02, max_workspace_spend_usd_per_day: 0.5 },
};
const routing = { steps: { generate: { tier: "small", effort: "low" }, evaluate: { tier: "mid", effort: "low", role: "judge" } } };

const dirs: string[] = [];
function app(files: Record<string, unknown>, base = os.tmpdir()): string {
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "ossuary-app-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof content === "string" ? content : stringify(content));
  }
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function manifestError(fn: () => unknown): ManifestError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ManifestError);
    return e as ManifestError;
  }
  throw new Error("expected a ManifestError");
}

describe("loadProduct (Requirement 2)", () => {
  it("returns a frozen product, routing, models and policy", () => {
    const loaded = loadProduct(app({ "product.yaml": product, "routing.yaml": routing }), { models });
    expect(loaded.policy.code).toBe("GEN-A1-R1");
    expect(loaded.routing.steps.evaluate).toMatchObject({ role: "judge" });
    expect(Object.isFrozen(loaded.product.limits)).toBe(true);
  });

  it("loads the real root models.yaml without error", () => {
    const root = findRepoRoot(here);
    const dir = app({ "product.yaml": product, "routing.yaml": routing }, path.join(root, "node_modules", ".cache"));
    expect(loadProduct(dir).models.tiers.small.primary).toMatch(/^anthropic:/);
  });

  it("names a missing product.yaml and a missing routing file", () => {
    expect(manifestError(() => loadProduct(app({}), { models })).message).toMatch(/file not found/);
    expect(manifestError(() => loadProduct(app({ "product.yaml": product }), { models })).file).toMatch(/routing\.yaml$/);
  });

  it("reports a YAML syntax error with its line and column", () => {
    const err = manifestError(() => loadProduct(app({ "product.yaml": "id: echo\nname: [unclosed\n", "routing.yaml": routing }), { models }));
    expect(err.message).toMatch(/YAML syntax error/);
    expect(err.issues[0]?.path).toMatch(/^line \d+, column \d+$/);
  });

  it("names each schema problem by field path", () => {
    const err = manifestError(() => loadProduct(app({ "product.yaml": { ...product, limits: { ...product.limits, max_steps: -1 } }, "routing.yaml": routing }), { models }));
    expect(err.issues.map((i) => i.path)).toContain("limits.max_steps");
  });

  it("requires THREATS.md for R2 and R3 (D-57)", () => {
    const r2 = { ...product, code: "GEN-A1-R2" };
    expect(manifestError(() => loadProduct(app({ "product.yaml": r2, "routing.yaml": routing }), { models })).message).toMatch(/THREATS\.md/);
    expect(loadProduct(app({ "product.yaml": r2, "routing.yaml": routing, "THREATS.md": "# Threats\n" }), { models }).policy.risk).toBe("R2");
  });

  it("requires A0 products to set release.threshold (D-43)", () => {
    const a0 = { ...product, code: "GEN-A0-R1" };
    expect(manifestError(() => loadProduct(app({ "product.yaml": a0, "routing.yaml": routing }), { models })).message).toMatch(/pass@1 target/);
    const ok = loadProduct(app({ "product.yaml": { ...a0, release: { threshold: 0.6 } }, "routing.yaml": routing }), { models });
    expect(ok.policy.release.threshold).toBe(0.6);
  });

  it("passes release.threshold to the resolver as an override", () => {
    const raised = loadProduct(app({ "product.yaml": { ...product, release: { threshold: 0.8 } }, "routing.yaml": routing }), { models });
    expect(raised.policy.release.threshold).toBe(0.8);
    expect(() => loadProduct(app({ "product.yaml": { ...product, release: { threshold: 0.5 } }, "routing.yaml": routing }), { models })).toThrow(PolicyError);
  });

  it("refuses an R4 product with the restricted error", () => {
    const err = (() => {
      try {
        loadProduct(app({ "product.yaml": { ...product, code: "GEN-A1-R4" }, "routing.yaml": routing }), { models });
      } catch (e) {
        return e as PolicyError;
      }
      throw new Error("expected an error");
    })();
    expect(err).toBeInstanceOf(PolicyError);
    expect(err.code).toBe("restricted");
  });
});

describe("parseModels cross-field rules (Requirement 4)", () => {
  it("rejects a placeholder primary, a same-vendor fallback and a missing price", () => {
    const paths = (m: unknown) => manifestError(() => parseModels(m)).issues.map((i) => i.path);
    expect(paths({ ...models, tiers: { ...models.tiers, small: { primary: "fake:<id>", fallback: "fake2:small" } } })).toContain("tiers.small.primary");
    expect(paths({ ...models, tiers: { ...models.tiers, mid: { primary: "fake:mid", fallback: "fake:small" } } })).toContain("tiers.mid.fallback");
    const { "fake2:mid": _gone, ...prices } = models.prices;
    expect(paths({ ...models, prices })).toContain("tiers.mid.fallback");
  });

  it("allows a placeholder fallback with no price", () => {
    expect(parseModels(models).tiers.frontier.fallback).toBe("fake2:<id>");
  });
});
