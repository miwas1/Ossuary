import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError } from "../errors.ts";
import { parseModels } from "../manifest/load.ts";
import { assemble, stableStringify, withRepairTurn } from "./assemble.ts";
import { promptTokenEstimate, REQUEST_ALLOWANCE, SEGMENT_ALLOWANCE } from "./estimate.ts";
import { createFakeProvider, fakeModelRegister, promptText } from "./fake.ts";
import { nextMove, planAttempts } from "./plan.ts";
import { parseStructured } from "./structured.ts";
import type { ProviderRequest, Segment } from "./types.ts";

const text = (s: string): Segment => ({ kind: "turn", role: "user", parts: [{ type: "text", text: s }] });

describe("assemble (Requirement 10)", () => {
  it("orders kinds, keeps item order, and leaves out empty kinds", () => {
    const segs = assemble({ system: "S", skills: ["k1", "k2"], reference: ["r1"], turn: [{ role: "user", content: "hi" }] });
    expect(segs.map((s) => s.kind)).toEqual(["system", "skill", "skill", "reference", "turn"]);
    expect(segs.map((s) => s.parts[0]?.type === "text" && s.parts[0].text)).toEqual(["S", "k1", "k2", "r1", "hi"]);
  });

  it("serialises tool schemas with sorted keys", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    const [seg] = assemble({ system: "", tools: [{ name: "t", inputSchema: { z: 1, a: 2 } }], turn: [] });
    expect(seg?.kind).toBe("tool");
    expect(seg?.parts[0]).toEqual({ type: "text", text: '{"inputSchema":{"a":2,"z":1},"name":"t"}' });
  });

  it("puts the repair turn last", () => {
    const segs = withRepairTurn(assemble({ system: "S", turn: [{ role: "user", content: "q" }] }), "{bad", ["pass: Required"]);
    expect(segs.at(-1)?.kind).toBe("turn");
    expect(segs.at(-1)?.role).toBe("user");
    expect(promptText({ segments: segs })).toContain("pass: Required");
  });
});

describe("promptTokenEstimate (D-60)", () => {
  it("divides text bytes by 2.5, rounding up, plus allowances", () => {
    expect(promptTokenEstimate([text("hello")])).toBe(2 + SEGMENT_ALLOWANCE + REQUEST_ALLOWANCE);
    expect(promptTokenEstimate([text("₦")])).toBe(Math.ceil((3 * 2) / 5) + SEGMENT_ALLOWANCE + REQUEST_ALLOWANCE);
  });

  it("counts an image by its allowance, never its bytes", () => {
    const image: Segment = { kind: "turn", role: "user", parts: [{ type: "image", mediaType: "image/png", data: new Uint8Array(5_000_000) }] };
    expect(promptTokenEstimate([image], 1500)).toBe(1500 + SEGMENT_ALLOWANCE + REQUEST_ALLOWANCE);
    expect(promptTokenEstimate([image])).toBe(SEGMENT_ALLOWANCE + REQUEST_ALLOWANCE);
  });
});

describe("planAttempts and nextMove (Requirements 12, 14, D-70)", () => {
  const models = fakeModelRegister();
  const tier = models.tiers.small;
  const plan = (over: Partial<Parameters<typeof planAttempts>[0]> = {}) =>
    planAttempts({ tier, excluded: new Set(), killedVendors: new Set(), segments: [text("hi")], prices: models.prices, ...over });

  it("lists the primary then the fallback, skipping a placeholder fallback", () => {
    expect(plan().map((c) => [c.slot, c.skip])).toEqual([["primary", undefined], ["fallback", undefined]]);
    expect(plan({ tier: { primary: "fake:small", fallback: "fake-b:<id>" } })).toHaveLength(1);
  });

  it("skips an excluded model, a killed primary, a too-long prompt and an image without allowance", () => {
    expect(plan({ excluded: new Set(["fake:small"]) })[0]?.skip).toBe("judge_excluded");
    expect(plan({ killedVendors: new Set(["fake"]) })[0]?.skip).toBe("killed");
    expect(plan({ killedVendors: new Set(["fake-b"]) })[1]?.skip).toBeUndefined();
    const limited = { ...models.prices, "fake:small": { ...models.prices["fake:small"]!, max_prompt_tokens: 50 } };
    expect(plan({ prices: limited, segments: [text("x".repeat(100))] }).map((c) => c.skip)).toEqual(["prompt_too_long", undefined]);
    const image: Segment = { kind: "turn", role: "user", parts: [{ type: "image", mediaType: "image/png", data: new Uint8Array(1) }] };
    expect(plan({ segments: [image] }).map((c) => c.skip)).toEqual(["no_image_allowance", "no_image_allowance"]);
  });

  const base = { slot: "primary" as const, vendorRetried: false, retryWaitMs: 2000, remainingMs: 60_000, timeCapHit: false, fallbackAvailable: true };
  it.each([
    [{ failure: "client" as const }, "stop"],
    [{ failure: "timeout" as const, timeCapHit: true }, "stop"],
    [{ failure: "timeout" as const }, "switch"],
    [{ failure: "server" as const }, "switch"],
    [{ failure: "server" as const, fallbackAvailable: false }, "stop"],
    [{ failure: "server" as const, slot: "fallback" as const }, "stop"],
    [{ failure: "rate_limited" as const, retryAfterMs: 500 }, "retry-same"],
    [{ failure: "rate_limited" as const, retryAfterMs: 2000 }, "retry-same"],
    [{ failure: "rate_limited" as const, retryAfterMs: 2001 }, "switch"],
    [{ failure: "rate_limited" as const }, "switch"],
    [{ failure: "rate_limited" as const, retryAfterMs: 500, vendorRetried: true }, "switch"],
    [{ failure: "rate_limited" as const, retryAfterMs: 500, retryWaitMs: 0 }, "switch"],
    [{ failure: "rate_limited" as const, retryAfterMs: 500, remainingMs: 400 }, "switch"],
    [{ failure: "rate_limited" as const, retryAfterMs: 500, slot: "fallback" as const }, "retry-same"],
  ])("nextMove %o → %s", (over, move) => {
    expect(nextMove({ ...base, ...over })).toBe(move);
  });
});

describe("parseStructured (Requirement 11)", () => {
  const schema = z.object({ pass: z.boolean() });
  it("accepts bare and fenced JSON", () => {
    expect(parseStructured('{"pass":true}', schema)).toEqual({ ok: true, value: { pass: true } });
    expect(parseStructured('```json\n{"pass":false}\n```', schema)).toEqual({ ok: true, value: { pass: false } });
  });
  it("reports invalid JSON and schema misses", () => {
    const bad = parseStructured("{nope", schema);
    expect(bad.ok).toBe(false);
    const miss = parseStructured('{"pass":"yes"}', schema);
    expect(miss.ok === false && miss.issues[0]).toMatch(/^pass: /);
  });
});

describe("fake provider (Requirement 24)", () => {
  const req = (over: Partial<ProviderRequest> = {}): ProviderRequest => ({
    modelId: "fake:small",
    model: "small",
    segments: [text("hello")],
    effort: "low",
    maxOutputTokens: 10,
    signal: new AbortController().signal,
    ...over,
  });

  it("is a valid model register", () => {
    expect(parseModels(fakeModelRegister()).tiers.mid.primary).toBe("fake:mid");
  });

  it("plays its script in order and records each request", async () => {
    const fake = createFakeProvider([{ kind: "ok", text: "one" }, { kind: "server" }]);
    expect((await fake.send(req())).text).toBe("one");
    await expect(fake.send(req())).rejects.toMatchObject({ failureClass: "server" });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]?.effort).toBe("low");
  });

  it("rejects non-fake vendors", async () => {
    await expect(createFakeProvider([{ kind: "ok", text: "x" }]).send(req({ modelId: "openai:x" }))).rejects.toBeInstanceOf(ProviderError);
  });

  it("waits for the abort signal on a timeout and keeps partial text on the error", async () => {
    const ac = new AbortController();
    const fake = createFakeProvider([{ kind: "timeout" }, { kind: "partial", text: "half an ans", then: "server" }]);
    const pending = fake.send(req({ signal: ac.signal }));
    ac.abort();
    await expect(pending).rejects.toMatchObject({ failureClass: "timeout" });
    await expect(fake.send(req())).rejects.toMatchObject({ failureClass: "server", partialText: "half an ans" });
  });

  it("reports a rate limit with its delay", async () => {
    await expect(createFakeProvider([{ kind: "rate_limited", retryAfterMs: 300 }]).send(req())).rejects.toMatchObject({ failureClass: "rate_limited", retryAfterMs: 300 });
  });

  it("replays a recorded token count for a matching prompt", async () => {
    const fake = createFakeProvider([{ kind: "ok", text: "x" }], { tokenCounts: [{ text: "hello", inputTokens: 7 }] });
    expect((await fake.send(req())).inputTokens).toBe(7);
  });
});
