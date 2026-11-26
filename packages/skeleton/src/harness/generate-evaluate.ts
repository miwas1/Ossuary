// generateEvaluate: generate, then evaluate on the judge role with the generator's models excluded,
// for up to maxRounds rounds (HAR-02, Requirement 19).
import { z } from "zod";
import { ManifestError } from "../errors.ts";
import type { StepRunner } from "./runtime.ts";
import type { GenerateEvaluateOutput, GenerateEvaluatePattern, Step, Verdict } from "./types.ts";

export const VerdictSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  feedback: z.string(),
});

export function generateEvaluate<I, C>(opts: {
  generate: Step<{ input: I; feedback: string | null; round: number }, C>;
  evaluate: Step<{ input: I; candidate: C; round: number }, Verdict>;
  maxRounds?: number;
}): GenerateEvaluatePattern<I, C> {
  const maxRounds = opts.maxRounds ?? 3;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 10) {
    throw new ManifestError("generateEvaluate", [{ path: "maxRounds", message: `must be an integer from 1 to 10, got ${maxRounds}` }]);
  }
  return { kind: "generate-evaluate", generate: opts.generate, evaluate: opts.evaluate, maxRounds };
}

export async function runGenerateEvaluate(
  pattern: GenerateEvaluatePattern<unknown, unknown>,
  input: unknown,
  run: StepRunner,
  servedBy: (key: string) => readonly string[],
): Promise<GenerateEvaluateOutput> {
  let feedback: string | null = null;
  for (let round = 1; ; round += 1) {
    const genKey = `generate#${round}`;
    const candidate = await run(pattern.generate as never, { input, feedback, round }, { key: genKey, round });
    const raw = await run(pattern.evaluate as never, { input, candidate, round }, { key: `evaluate#${round}`, round, exclude: new Set(servedBy(genKey)) });
    const verdict = VerdictSchema.parse(raw);
    if (verdict.pass || round >= pattern.maxRounds) return { candidate, verdict, rounds: round, accepted: verdict.pass };
    feedback = verdict.feedback;
  }
}
