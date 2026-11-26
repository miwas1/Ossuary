import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateCalibration, readTokenCounts, writeTokenCounts, type TokenCountEntry } from "./calibration.ts";
import { fakeModelRegister } from "./fake.ts";
import { TOKEN_CORPUS } from "./fixtures/token-corpus.ts";

const entry = (vendor: string, tier: "small" | "mid" | "frontier", slot: "primary" | "fallback", id: string): TokenCountEntry => ({
  corpus_id: id,
  vendor,
  tier,
  slot,
  input_tokens: 10,
  recorded: "2026-11-26",
});

describe("estimateCalibration (D-71)", () => {
  const models = fakeModelRegister();

  it("is not calibrated with no entries, and lists every vendor, tier and slot as missing", () => {
    const s = estimateCalibration(models, []);
    expect(s).toMatchObject({ calibrated: false, entries: 0 });
    expect(s.missing).toHaveLength(6);
  });

  it("is calibrated once every corpus prompt has a count for every tier model", () => {
    const all = (["small", "mid", "frontier"] as const).flatMap((tier) =>
      TOKEN_CORPUS.flatMap((p) => [entry("fake", tier, "primary", p.id), entry("fake-b", tier, "fallback", p.id)]),
    );
    expect(estimateCalibration(models, all)).toMatchObject({ calibrated: true, missing: [], recorded: ["2026-11-26"] });
    expect(estimateCalibration(models, all.slice(1)).missing).toEqual([{ vendor: "fake", tier: "small", slot: "primary" }]);
  });

  it("replaces only one vendor's entries when writing", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "counts-")), "token-counts.json");
    writeTokenCounts("fake", [entry("fake", "small", "primary", "english")], file);
    writeTokenCounts("fake-b", [entry("fake-b", "small", "fallback", "english")], file);
    writeTokenCounts("fake", [entry("fake", "mid", "primary", "json")], file);
    expect(readTokenCounts(file).map((e) => `${e.vendor}/${e.tier}/${e.corpus_id}`)).toEqual(["fake-b/small/english", "fake/mid/json"]);
  });

  it("ships with an empty, valid fixture file", () => {
    expect(readTokenCounts()).toEqual([]);
  });
});
