import { describe, expect, it } from "vitest";
import { atMostSixDecimals, capMicros, ceilDiv, costMicros, picoPerToken, reservedTokens, toPicoPrice, worstCaseMicros } from "./money.ts";

describe("money (D-46, D-62)", () => {
  it("converts prices to whole pico-dollars per token", () => {
    expect(picoPerToken(0.125)).toBe(125_000n);
    expect(picoPerToken(0.01)).toBe(10_000n);
    expect(picoPerToken(40)).toBe(40_000_000n);
    expect(picoPerToken(0.000001)).toBe(1n);
  });

  it("rejects prices with more than six decimals or below zero", () => {
    expect(atMostSixDecimals(0.1234567)).toBe(false);
    expect(() => picoPerToken(0.1234567)).toThrow(RangeError);
    expect(() => picoPerToken(-1)).toThrow(RangeError);
  });

  it("converts caps down to whole micro-dollars without float noise", () => {
    expect(capMicros(0.57)).toBe(570_000);
    expect(capMicros(0.05)).toBe(50_000);
    expect(capMicros(0.0000015)).toBe(1);
  });

  it("rounds a cost up to the next micro-dollar", () => {
    const price = toPicoPrice({ input: 0.1, cached_input: 0.01, cache_write_input: 0.125, output: 0.5 });
    // 1 uncached input token at 0.1 = 0.1 micro-dollars, so it rounds up to 1.
    expect(costMicros({ inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, price)).toBe(1);
    // 1,000 uncached at 0.1 + 2,000 read at 0.01 + 4,000 written at 0.125 + 100 output at 0.5 = 100 + 20 + 500 + 50.
    expect(costMicros({ inputTokens: 7_000, cacheReadTokens: 2_000, cacheWriteTokens: 4_000, outputTokens: 100 }, price)).toBe(670);
    expect(ceilDiv(0n, 7n)).toBe(0n);
  });

  it("prices cache writes at input when no write price is listed", () => {
    const price = toPicoPrice({ input: 2, cached_input: 0.1, output: 10 });
    expect(costMicros({ inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 10, outputTokens: 0 }, price)).toBe(20);
  });

  it("reserves at the dearer input rate (D-63)", () => {
    const price = toPicoPrice({ input: 2, cached_input: 0.1, cache_write_input: 2.5, output: 10 });
    expect(worstCaseMicros(1_000, 100, price)).toBe(2_500 + 1_000);
    expect(reservedTokens(1_000, 100)).toBe(1_100);
  });
});
