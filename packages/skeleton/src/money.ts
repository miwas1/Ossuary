// Money in integers (D-46, D-62). One US dollar per million tokens is one micro-dollar per token,
// so prices are held as integer pico-dollars per token (micro-dollars × 10⁶) and costs use BigInt.

const SCALE = 1e6;
const EPSILON = 1e-6;

/** True when `usd` has at most six decimals, so it converts to whole pico-dollars per token. */
export function atMostSixDecimals(usd: number): boolean {
  const scaled = usd * SCALE;
  return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < EPSILON;
}

/** A models.yaml price (US dollars per million tokens) as integer pico-dollars per token. */
export function picoPerToken(usdPerMillion: number): bigint {
  if (!(usdPerMillion >= 0) || !atMostSixDecimals(usdPerMillion)) {
    throw new RangeError(`price ${usdPerMillion} must be a non-negative number with at most six decimals`);
  }
  return BigInt(Math.round(usdPerMillion * SCALE));
}

/** Integer division rounding up, for non-negative operands. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return a === 0n ? 0n : (a + b - 1n) / b;
}

/** A dollar cap as whole micro-dollars, rounded down, with float noise snapped (0.57 → 570000). */
export function capMicros(usd: number): number {
  const scaled = usd * SCALE;
  const nearest = Math.round(scaled);
  return Math.abs(scaled - nearest) < EPSILON ? nearest : Math.floor(scaled);
}

export interface PicoPrice {
  input: bigint;
  cachedInput: bigint;
  cacheWrite: bigint;
  output: bigint;
}

export interface UsdPrice {
  input: number;
  cached_input: number;
  cache_write_input?: number | undefined;
  output: number;
}

export function toPicoPrice(p: UsdPrice): PicoPrice {
  return {
    input: picoPerToken(p.input),
    cachedInput: picoPerToken(p.cached_input),
    cacheWrite: picoPerToken(p.cache_write_input ?? p.input),
    output: picoPerToken(p.output),
  };
}

export interface Usage {
  /** All input tokens, cached ones included. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/** The cost of one completed call in micro-dollars, rounded up (Requirement 12.1). */
export function costMicros(usage: Usage, price: PicoPrice): number {
  const read = BigInt(usage.cacheReadTokens);
  const write = BigInt(usage.cacheWriteTokens);
  const uncached = BigInt(Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens));
  const pico = uncached * price.input + read * price.cachedInput + write * price.cacheWrite + BigInt(usage.outputTokens) * price.output;
  return Number(ceilDiv(pico, 1_000_000n));
}

/** The most a call can cost: every input token at the dearer input rate, plus the full output cap (D-63). */
export function worstCaseMicros(inputEstimate: number, maxOutputTokens: number, price: PicoPrice): number {
  const inputRate = price.input > price.cacheWrite ? price.input : price.cacheWrite;
  return Number(ceilDiv(BigInt(inputEstimate) * inputRate + BigInt(maxOutputTokens) * price.output, 1_000_000n));
}

/** The token Reservation for a call (Requirement 17.3). */
export function reservedTokens(inputEstimate: number, maxOutputTokens: number): number {
  return inputEstimate + maxOutputTokens;
}
