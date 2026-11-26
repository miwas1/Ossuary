// Whether the prompt token estimate has been checked against real counts (D-71). The smoke test
// writes fixtures/token-counts.json; P1-5 reads it; /bones shows this status from Phase 3.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isPlaceholder, vendorOf, type Models, type Tier } from "../manifest/schemas.ts";
import { assemble } from "./assemble.ts";
import { TOKEN_CORPUS, type CorpusPrompt } from "./fixtures/token-corpus.ts";
import type { Segment } from "./types.ts";

export const TOKEN_COUNTS_FILE = fileURLToPath(new URL("./fixtures/token-counts.json", import.meta.url));

const Entry = z.strictObject({
  corpus_id: z.string(),
  vendor: z.string(),
  tier: z.enum(["small", "mid", "frontier"]),
  slot: z.enum(["primary", "fallback"]),
  input_tokens: z.int().positive(),
  recorded: z.iso.date(),
});
export type TokenCountEntry = z.infer<typeof Entry>;

export function readTokenCounts(file: string = TOKEN_COUNTS_FILE): TokenCountEntry[] {
  if (!fs.existsSync(file)) return [];
  return z.array(Entry).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** Replace one vendor's entries and keep the rest, sorted (Requirement 25.4). */
export function writeTokenCounts(vendor: string, fresh: readonly TokenCountEntry[], file: string = TOKEN_COUNTS_FILE): void {
  const kept = readTokenCounts(file).filter((e) => e.vendor !== vendor);
  const all = [...kept, ...fresh].sort((a, b) => `${a.vendor}/${a.tier}/${a.slot}/${a.corpus_id}`.localeCompare(`${b.vendor}/${b.tier}/${b.slot}/${b.corpus_id}`));
  fs.writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
}

/** The segments a corpus prompt is sent as, both when recording and when checking P1-5. */
export function corpusSegments(p: CorpusPrompt): Segment[] {
  return assemble({ system: p.system, reference: p.reference ? [p.reference] : [], turn: [{ role: "user", content: p.turn }] });
}

export interface Calibration {
  calibrated: boolean;
  entries: number;
  recorded: string[];
  missing: { vendor: string; tier: Tier; slot: "primary" | "fallback" }[];
}

export function estimateCalibration(models: Models, entries: readonly TokenCountEntry[] = readTokenCounts()): Calibration {
  const missing: Calibration["missing"] = [];
  for (const [tier, t] of Object.entries(models.tiers) as [Tier, { primary: string; fallback: string }][]) {
    for (const [slot, id] of [["primary", t.primary], ["fallback", t.fallback]] as const) {
      if (isPlaceholder(id)) continue;
      const vendor = vendorOf(id);
      const have = new Set(entries.filter((e) => e.vendor === vendor && e.tier === tier && e.slot === slot).map((e) => e.corpus_id));
      if (TOKEN_CORPUS.some((p) => !have.has(p.id))) missing.push({ vendor, tier, slot });
    }
  }
  return { calibrated: missing.length === 0, entries: entries.length, recorded: [...new Set(entries.map((e) => e.recorded))].sort(), missing };
}
