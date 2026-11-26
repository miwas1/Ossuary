// The opt-in real-vendor smoke test (Requirement 25, D-71). Run with
//   OSSUARY_SMOKE=1 pnpm --filter @ossuary/skeleton smoke
// For each vendor whose key is set it makes one small check call, then records the real input token
// counts of the corpus into fixtures/token-counts.json (replacing only that vendor's entries).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { findRepoRoot, parseModels } from "../../manifest/load.ts";
import { isPlaceholder, modelNameOf, vendorOf, type Tier } from "../../manifest/schemas.ts";
import { corpusSegments, estimateCalibration, writeTokenCounts, type TokenCountEntry } from "../calibration.ts";
import { TOKEN_CORPUS } from "../fixtures/token-corpus.ts";
import { createGateway, type ChargeBudget } from "../gateway.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { createOpenAiProvider } from "./openai.ts";

const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
const enabled = process.env.OSSUARY_SMOKE === "1";
const models = parseModels(parse(fs.readFileSync(path.join(root, "models.yaml"), "utf8")));

const VENDORS = [
  { vendor: "anthropic", key: "ANTHROPIC_API_KEY", make: () => createAnthropicProvider(), minOutput: 1 },
  { vendor: "openai", key: "OPENAI_API_KEY", make: () => createOpenAiProvider(), minOutput: 16 },
] as const;

const open: ChargeBudget = {
  reserve: (tokens, micros) => ({ tokens, micros, open: true }),
  settle: (r) => ((r.open = false), false),
  release: (r) => void (r.open = false),
  remainingMs: () => 120_000,
  timeExceeded: () => { throw new Error("the smoke budget does not run out of time"); },
};

function tierModels(vendor: string) {
  const out: { tier: Tier; slot: "primary" | "fallback"; id: string }[] = [];
  for (const [tier, t] of Object.entries(models.tiers) as [Tier, { primary: string; fallback: string }][]) {
    for (const [slot, id] of [["primary", t.primary], ["fallback", t.fallback]] as const) {
      if (!isPlaceholder(id) && vendorOf(id) === vendor && models.prices[id]) out.push({ tier, slot, id });
    }
  }
  return out;
}

if (!enabled) console.log("smoke: skipped; set OSSUARY_SMOKE=1 to call real vendors");

describe.runIf(enabled)("real vendors (opt-in)", () => {
  for (const v of VENDORS) {
    const hasKey = Boolean(process.env[v.key]);
    if (!hasKey) {
      it.skip(`${v.vendor}: ${v.key} is not set`, () => {});
      continue;
    }

    it(`${v.vendor}: one gateway call on its cheapest tier model`, async () => {
      const candidates = tierModels(v.vendor).sort((a, b) => models.prices[a.id]!.output - models.prices[b.id]!.output);
      const pick = candidates[0]!;
      const tier = models.tiers[pick.tier];
      const other = pick.slot === "primary" ? tier.fallback : tier.primary;
      const gateway = createGateway({ models });
      const scoped = gateway.scope({
        appId: "smoke",
        workspaceId: "smoke",
        workspaceCapUsd: 0.05,
        routing: { steps: { smoke: { tier: pick.tier, effort: "low", max_output_tokens: 32 } } },
        stepName: "smoke",
        budget: open,
        exclude: new Set([other]),
      });
      const res = await scoped.call({ system: "Reply with one word.", turn: [{ role: "user", content: "Say hello." }] });
      expect(vendorOf(res.model)).toBe(v.vendor);
      expect(res.text.length).toBeGreaterThan(0);
      expect(res.usage.inputTokens).toBeGreaterThan(0);
      expect(res.usage.outputTokens).toBeGreaterThan(0);
      expect(res.costMicros).toBeGreaterThan(0);
    });

    it(`${v.vendor}: record the corpus token counts`, async () => {
      const provider = v.make();
      const recorded = new Date().toISOString().slice(0, 10);
      const fresh: TokenCountEntry[] = [];
      for (const m of tierModels(v.vendor)) {
        for (const p of TOKEN_CORPUS) {
          const resp = await provider.send({
            modelId: m.id,
            model: modelNameOf(m.id),
            segments: corpusSegments(p),
            effort: "low",
            maxOutputTokens: v.minOutput,
            signal: AbortSignal.timeout(60_000),
          });
          fresh.push({ corpus_id: p.id, vendor: v.vendor, tier: m.tier, slot: m.slot, input_tokens: resp.inputTokens, recorded });
        }
      }
      writeTokenCounts(v.vendor, fresh);
      const status = estimateCalibration(models);
      console.log(`smoke: recorded ${fresh.length} counts for ${v.vendor}; calibrated=${status.calibrated}${status.missing.length ? ` (missing ${status.missing.map((x) => `${x.vendor}/${x.tier}/${x.slot}`).join(", ")})` : ""}`);
      expect(fresh.length).toBe(tierModels(v.vendor).length * TOKEN_CORPUS.length);
    });
  }
});

describe.skipIf(enabled)("real vendors (skipped)", () => {
  it.skip("set OSSUARY_SMOKE=1 to call real vendors", () => {});
});
