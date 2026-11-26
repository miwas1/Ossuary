import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { findRepoRoot, parseModels } from "../manifest/load.ts";
import { corpusSegments, estimateCalibration, readTokenCounts } from "./calibration.ts";
import { promptTokenEstimate } from "./estimate.ts";
import { TOKEN_CORPUS } from "./fixtures/token-corpus.ts";
import type { Segment } from "./types.ts";

const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const models = parseModels(parse(fs.readFileSync(path.join(root, "models.yaml"), "utf8")));
const entries = readTokenCounts();
const status = estimateCalibration(models, entries);
const byId = new Map(TOKEN_CORPUS.map((p) => [p.id, p]));
const NOT_CALIBRATED = "P1-5 not calibrated: no token-count recordings (run the smoke test with an API key, D-71)";

const withSuffix = (segs: Segment[], suffix: string): Segment[] => [...segs, { kind: "turn", role: "user", parts: [{ type: "text", text: suffix }] }];

describe("prompt token estimate", () => {
  if (entries.length === 0) {
    // Feature: 01-skeleton-core, Property P1-5: The estimate is never below a real token count recorded in the fixtures
    it.skip(NOT_CALIBRATED, () => {});
    return;
  }
  if (!status.calibrated) {
    console.log(`P1-5 partly calibrated: missing ${status.missing.map((m) => `${m.vendor}/${m.tier}/${m.slot}`).join(", ")}`);
  }

  // Feature: 01-skeleton-core, Property P1-5: The estimate is never below a real token count recorded in the fixtures
  it("Property P1-5: the estimate never undercounts a recorded count, and more text never lowers it", () => {
    const prompts = entries.map((entry) => {
      const prompt = byId.get(entry.corpus_id);
      if (!prompt) throw new Error(`unknown corpus id ${entry.corpus_id}`);
      const segments = corpusSegments(prompt);
      const estimate = promptTokenEstimate(segments);
      expect(estimate, `${entry.vendor}/${entry.tier}/${entry.corpus_id}`).toBeGreaterThanOrEqual(entry.input_tokens);
      return { segments, estimate };
    });
    fc.assert(
      fc.property(fc.constantFrom(...prompts), fc.string({ maxLength: 200, unit: "grapheme" }), ({ segments, estimate }, suffix) => {
        expect(promptTokenEstimate(withSuffix(segments, suffix))).toBeGreaterThanOrEqual(estimate);
      }),
      { numRuns: Math.max(100, entries.length * 4) },
    );
  });
});
