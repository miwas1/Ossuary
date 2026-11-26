// Attempt planning (Requirements 12 and 14, D-70). Two pure functions: planAttempts decides which
// candidate models may take a call, and nextMove decides what to do after a failed attempt.
import type { FailureClass, SkipReason } from "../errors.ts";
import { isPlaceholder, vendorOf, type Models } from "../manifest/schemas.ts";
import { imageCount, promptTokenEstimate } from "./estimate.ts";
import type { Segment } from "./types.ts";

export interface Candidate {
  id: string;
  slot: "primary" | "fallback";
  estimate: number;
  limit: number | null;
  skip?: SkipReason;
}

export interface PlanInput {
  tier: { primary: string; fallback: string };
  excluded: ReadonlySet<string>;
  killedVendors: ReadonlySet<string>;
  segments: readonly Segment[];
  prices: Models["prices"];
}

export function planAttempts(input: PlanInput): Candidate[] {
  const ids: [string, "primary" | "fallback"][] = [[input.tier.primary, "primary"]];
  if (!isPlaceholder(input.tier.fallback)) ids.push([input.tier.fallback, "fallback"]);
  const images = imageCount(input.segments);
  return ids.map(([id, slot]) => {
    const price = input.prices[id];
    const allowance = price?.image_input_tokens;
    const estimate = promptTokenEstimate(input.segments, allowance ?? 0);
    const limit = price?.max_prompt_tokens ?? null;
    let skip: SkipReason | undefined;
    if (input.excluded.has(id)) skip = "judge_excluded";
    else if (images > 0 && allowance === undefined) skip = "no_image_allowance";
    else if (limit !== null && estimate > limit) skip = "prompt_too_long";
    else if (slot === "primary" && input.killedVendors.has(vendorOf(id))) skip = "killed";
    return skip ? { id, slot, estimate, limit, skip } : { id, slot, estimate, limit };
  });
}

export type Move = "retry-same" | "switch" | "stop";

export interface MoveInput {
  failure: FailureClass;
  slot: "primary" | "fallback";
  /** True when this attempt's vendor was already retried in this call. */
  vendorRetried: boolean;
  retryAfterMs?: number | undefined;
  retryWaitMs: number;
  remainingMs: number;
  /** True when the timeout came from the task's time cap rather than the step's timeout. */
  timeCapHit: boolean;
  fallbackAvailable: boolean;
}

export function nextMove(m: MoveInput): Move {
  if (m.failure === "client") return "stop";
  if (m.failure === "timeout" && m.timeCapHit) return "stop";
  if (
    m.failure === "rate_limited" &&
    m.retryAfterMs !== undefined &&
    m.retryAfterMs <= m.retryWaitMs &&
    m.retryAfterMs < m.remainingMs &&
    !m.vendorRetried
  ) {
    return "retry-same";
  }
  return m.slot === "primary" && m.fallbackAvailable ? "switch" : "stop";
}
