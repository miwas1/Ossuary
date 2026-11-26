// The prompt token estimate (D-60): text bytes / 2.5, images by per-model allowance, never image bytes.
// One estimate serves the prompt-limit check and the token and spend reservations. P1-5 checks it
// against counts real vendors reported.
import type { Segment } from "./types.ts";

export const SEGMENT_ALLOWANCE = 8;
export const REQUEST_ALLOWANCE = 32;

const encoder = new TextEncoder();

export function textBytes(segments: readonly Segment[]): number {
  let n = 0;
  for (const s of segments) for (const p of s.parts) if (p.type === "text") n += encoder.encode(p.text).length;
  return n;
}

export function imageCount(segments: readonly Segment[]): number {
  let n = 0;
  for (const s of segments) for (const p of s.parts) if (p.type === "image") n += 1;
  return n;
}

/** ceil(bytes × 2 / 5) + one allowance per image + per-segment and per-request allowances, in integers. */
export function promptTokenEstimate(segments: readonly Segment[], imageAllowance = 0): number {
  const bytes = textBytes(segments);
  return Math.ceil((bytes * 2) / 5) + imageCount(segments) * imageAllowance + segments.length * SEGMENT_ALLOWANCE + REQUEST_ALLOWANCE;
}
