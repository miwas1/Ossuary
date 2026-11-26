import { describe, expect, it } from "vitest";
import { ProviderError } from "../../errors.ts";
import { assemble } from "../assemble.ts";
import type { ProviderRequest, Segment } from "../types.ts";
import { buildAnthropicRequest, createAnthropicProvider, readAnthropicResponse } from "./anthropic.ts";
import { classifyStatus, parseRetryAfter, toProviderError } from "./classify.ts";
import { buildOpenAiRequest, createOpenAiProvider, readOpenAiResponse } from "./openai.ts";

const segments = assemble({
  system: "SYS",
  skills: ["SKILL"],
  tools: [{ name: "lookup", description: "find", inputSchema: { type: "object" } }],
  reference: ["REF"],
  turn: [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "A1" },
    { role: "user", content: "Q2" },
  ],
});
const req = (over: Partial<ProviderRequest> = {}): ProviderRequest => ({
  modelId: "x:m",
  model: "m",
  segments,
  effort: "medium",
  maxOutputTokens: 64,
  signal: new AbortController().signal,
  ...over,
});

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("classify (Requirement 9.1, D-70)", () => {
  it("classes statuses", () => {
    expect(classifyStatus(429)).toBe("rate_limited");
    expect(classifyStatus(529)).toBe("rate_limited");
    expect(classifyStatus(503)).toBe("server");
    expect(classifyStatus(400)).toBe("client");
    expect(classifyStatus(401)).toBe("client");
  });

  it("reads Retry-After as milliseconds, seconds or an HTTP date", () => {
    expect(parseRetryAfter({ "retry-after-ms": "250" })).toBe(250);
    expect(parseRetryAfter(new Headers({ "Retry-After": "2" }))).toBe(2000);
    expect(parseRetryAfter({ "retry-after": "Thu, 26 Nov 2026 10:00:01 GMT" }, Date.parse("Thu, 26 Nov 2026 10:00:00 GMT"))).toBe(1000);
    expect(parseRetryAfter({})).toBeUndefined();
    expect(parseRetryAfter({ "retry-after": "soon" })).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it("maps SDK errors without copying their messages", () => {
    const e = toProviderError("openai", { status: 429, headers: { "retry-after": "1" }, message: "secret prompt text" });
    expect(e).toMatchObject({ failureClass: "rate_limited", retryAfterMs: 1000, status: 429 });
    expect(e.message).not.toContain("secret prompt text");
    expect(toProviderError("openai", { name: "APIConnectionTimeoutError" }).failureClass).toBe("timeout");
    expect(toProviderError("openai", new TypeError("fetch failed")).failureClass).toBe("server");
  });
});

describe("Anthropic adapter (Requirement 9, D-65)", () => {
  it("builds tools first, then system blocks, with one 5-minute breakpoint at the end of the stable prefix", () => {
    const body = buildAnthropicRequest(req({ jsonSchema: { type: "object" } }));
    expect(body.tools?.map((t) => t.name)).toEqual(["lookup"]);
    expect(body.system?.map((b) => b.text)).toEqual(["SYS", "SKILL", "REF"]);
    expect(body.system?.at(-1)?.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(body.system?.slice(0, -1).some((b) => b.cache_control)).toBe(false);
    expect(body.messages.map((m) => [m.role, m.content[0]?.text])).toEqual([["user", "Q1"], ["assistant", "A1"], ["user", "Q2"]]);
    expect(body).toMatchObject({ model: "m", max_tokens: 64, output_config: { effort: "medium", format: { type: "json_schema" } } });
  });

  it("sums the three input counts", () => {
    const r = readAnthropicResponse({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 3, cache_read_input_tokens: 2 } });
    expect(r).toMatchObject({ text: "hi", inputTokens: 15, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 5, finishReason: "end_turn" });
  });

  it("sends the body through the SDK and makes no SDK retry on a 429", async () => {
    const okStub = stubFetch(200, { id: "msg", type: "message", role: "assistant", model: "m", content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 1 } });
    const p = createAnthropicProvider({ env: { ANTHROPIC_API_KEY: "test-key-123" }, fetch: okStub.fetch });
    expect((await p.send(req())).text).toBe("hi");
    expect(okStub.calls[0]?.body).toMatchObject({ model: "m", max_tokens: 64 });
    const limited = stubFetch(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, { "retry-after": "1" });
    const err = await createAnthropicProvider({ env: { ANTHROPIC_API_KEY: "test-key-123" }, fetch: limited.fetch }).send(req()).catch((e: unknown) => e);
    expect(err).toMatchObject({ failureClass: "rate_limited", retryAfterMs: 1000 });
    expect(limited.calls).toHaveLength(1);
  });

  it("refuses images and a missing key without a request", async () => {
    const stub = stubFetch(200, {});
    const image: Segment = { kind: "turn", role: "user", parts: [{ type: "image", mediaType: "image/png", data: new Uint8Array(3) }] };
    const p = createAnthropicProvider({ env: { ANTHROPIC_API_KEY: "k-12345678" }, fetch: stub.fetch });
    await expect(p.send(req({ segments: [image] }))).rejects.toMatchObject({ failureClass: "client" });
    await expect(createAnthropicProvider({ env: {}, fetch: stub.fetch }).send(req())).rejects.toBeInstanceOf(ProviderError);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("OpenAI adapter (Requirement 9, D-69)", () => {
  it("discards text from a failed response and preserves a normal output-token stop", () => {
    for (const status of ["failed", "cancelled", "queued", "in_progress"]) {
      expect(() => readOpenAiResponse({ model: "m", status, output_text: "partial reply" })).toThrow("OpenAI did not complete the response");
    }
    expect(() => readOpenAiResponse({ model: "m", status: "incomplete", incomplete_details: { reason: "content_filter" }, output_text: "partial reply" })).toThrow("OpenAI filtered the response");
    expect(readOpenAiResponse({ model: "m", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "reply" }).finishReason).toBe("max_output_tokens");
  });
  it("builds tools, then one developer message ending in the breakpoint, then the turn; never instructions", () => {
    const body = buildOpenAiRequest(req({ jsonSchema: { type: "object" } }));
    expect(body.tools?.map((t) => t.name)).toEqual(["lookup"]);
    expect(body.input[0]?.role).toBe("developer");
    expect(body.input[0]?.content.map((b) => b.text)).toEqual(["SYS", "SKILL", "REF"]);
    expect(body.input[0]?.content.at(-1)?.prompt_cache_breakpoint).toEqual({ mode: "explicit" });
    expect(body.input.slice(1).map((m) => [m.role, m.content[0]?.type, m.content[0]?.text])).toEqual([
      ["user", "input_text", "Q1"],
      ["assistant", "output_text", "A1"],
      ["user", "input_text", "Q2"],
    ]);
    expect(body).toMatchObject({ prompt_cache_options: { mode: "explicit", ttl: "30m" }, reasoning: { effort: "medium" }, max_output_tokens: 64, text: { format: { type: "json_schema" } } });
    expect(body).not.toHaveProperty("instructions");
  });

  it("reads total input, cache reads and cache writes", () => {
    const r = readOpenAiResponse({ model: "m", status: "completed", output_text: "hi", usage: { input_tokens: 20, output_tokens: 4, input_tokens_details: { cached_tokens: 5, cache_write_tokens: 3 } } });
    expect(r).toMatchObject({ inputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3, outputTokens: 4, finishReason: "completed" });
  });

  it("sends the body through the SDK and makes no SDK retry on a 500", async () => {
    const okStub = stubFetch(200, {
      id: "resp_1",
      object: "response",
      model: "m",
      status: "completed",
      output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "hello", annotations: [] }] }],
      usage: { input_tokens: 9, output_tokens: 2, total_tokens: 11, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    });
    const p = createOpenAiProvider({ env: { OPENAI_API_KEY: "test-key-123" }, fetch: okStub.fetch });
    expect((await p.send(req())).text).toBe("hello");
    expect(okStub.calls[0]?.body).toMatchObject({ model: "m", max_output_tokens: 64 });
    const broken = stubFetch(500, { error: { type: "server_error", message: "boom" } });
    const err = await createOpenAiProvider({ env: { OPENAI_API_KEY: "test-key-123" }, fetch: broken.fetch }).send(req()).catch((e: unknown) => e);
    expect(err).toMatchObject({ failureClass: "server" });
    expect(broken.calls).toHaveLength(1);
  });
});
