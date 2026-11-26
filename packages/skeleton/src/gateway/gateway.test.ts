import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BudgetExceeded,
  DemoModeOnlyError,
  GatewayError,
  JudgeConflictError,
  PriceMissingError,
  PromptTooLongError,
  StructuredOutputError,
} from "../errors.ts";
import type { Models, Routing } from "../manifest/schemas.ts";
import { createRedactor } from "../trace/redact.ts";
import { GEN_AI, OSSUARY } from "../trace/attributes.ts";
import { memorySpanSink, withTrace, type SpanRecord } from "../trace/trace.ts";
import { createFakeProvider, fakeModelRegister, type FakeOutcome, type FakeScript } from "./fake.ts";
import { createGateway, type ChargeBudget, type GatewayOptions, type ScopeOptions } from "./gateway.ts";
import type { ProviderRequest } from "./types.ts";

const routing: Routing = {
  steps: {
    gen: { tier: "small", effort: "low", timeout_ms: 1_000, max_output_tokens: 50 },
    judge: { tier: "mid", effort: "medium", role: "judge" },
    calc: { kind: "code" },
  },
};

function openBudget(remainingMs = 60_000): ChargeBudget & { overruns: number } {
  const b = {
    overruns: 0,
    reserve: (tokens: number, micros: number) => ({ tokens, micros, open: true }),
    settle: (r: { tokens: number; micros: number; open: boolean }, tokens: number, micros: number) => {
      r.open = false;
      const over = tokens > r.tokens || micros > r.micros;
      if (over) b.overruns += 1;
      return over;
    },
    release: (r: { open: boolean }) => void (r.open = false),
    remainingMs: () => remainingMs,
    timeExceeded: () => new BudgetExceeded("seconds", remainingMs, remainingMs),
  };
  return b;
}

const immediateTimer = (_ms: number, fire: () => void) => {
  const t = setTimeout(fire, 0);
  return () => clearTimeout(t);
};

function setup(script: FakeScript, over: Partial<GatewayOptions> = {}, scopeOver: Partial<ScopeOptions> = {}) {
  const fake = createFakeProvider(script);
  const sleeps: number[] = [];
  const gateway = createGateway({
    models: fakeModelRegister(),
    providers: [fake],
    vendorAdapters: false,
    timer: immediateTimer,
    sleep: async (ms) => void sleeps.push(ms),
    env: { DEMO_MODE: "true" },
    ...over,
  });
  const scoped = gateway.scope({ appId: "app", workspaceId: "w", workspaceCapUsd: 10, routing, stepName: "gen", budget: openBudget(), ...scopeOver });
  const sink = memorySpanSink();
  const call = <T>(req: Parameters<typeof scoped.call<T>>[0]) => withTrace({ sink, appId: "app" }, () => scoped.call<T>(req));
  const chats = () => sink.spans.filter((s) => s.name.startsWith("chat ")).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return { fake, gateway, scoped, call, chats, sleeps, sink };
}

const byModel = (map: Record<string, FakeOutcome[]>): FakeScript => {
  const seen: Record<string, number> = {};
  return (req: ProviderRequest) => {
    const n = (seen[req.modelId] = (seen[req.modelId] ?? -1) + 1);
    return map[req.modelId]?.[n] ?? { kind: "client" };
  };
};
const ok = (text: string): FakeOutcome => ({ kind: "ok", text });
const ask = { system: "You write epitaphs.", turn: [{ role: "user" as const, content: "a lighthouse keeper" }] };
const attr = (s: SpanRecord | undefined, k: string) => s?.attributes[k];

describe("createGateway (Requirement 9.7)", () => {
  it("refuses a register naming a vendor with no provider", () => {
    expect(() => createGateway({ models: fakeModelRegister(), vendorAdapters: false })).toThrow(/no provider is registered for vendor "fake"/);
  });
});

describe("scoped calls", () => {
  it("returns the text, records the served model and writes a complete chat span", async () => {
    const t = setup([ok("Here lies the keeper.")]);
    const res = await t.call(ask);
    expect(res.value).toBe("Here lies the keeper.");
    expect(t.scoped.served).toEqual(["fake:small"]);
    const [chat] = t.chats();
    expect(chat?.name).toBe("chat small");
    for (const key of [GEN_AI.operationName, GEN_AI.providerName, GEN_AI.requestModel, GEN_AI.responseModel, GEN_AI.requestMaxTokens, GEN_AI.usageInputTokens, GEN_AI.usageCacheReadInputTokens, GEN_AI.usageOutputTokens, GEN_AI.responseFinishReasons, GEN_AI.systemInstructions, GEN_AI.inputMessages, GEN_AI.outputMessages, OSSUARY.costMicros, OSSUARY.step, OSSUARY.tier, OSSUARY.effort]) {
      expect(chat?.attributes, key).toHaveProperty([key]);
    }
    expect(attr(chat, OSSUARY.fallback)).toBe(false);
    expect(t.fake.requests[0]?.maxOutputTokens).toBe(50);
    expect(t.fake.requests[0]?.effort).toBe("low");
  });

  it("redacts quoted and escaped secrets inside JSON trace messages", async () => {
    const secret = 'sample-"secret\\value';
    const t = setup([ok(secret)]);
    await withTrace({ sink: t.sink, appId: "app", redactor: createRedactor({ TEST_SECRET: secret }) }, () => t.scoped.call({ ...ask, system: secret }));
    const [chat] = t.chats();
    expect(JSON.parse(String(attr(chat, GEN_AI.systemInstructions)))).toEqual([{ type: "text", content: "[secret]" }]);
    expect(JSON.parse(String(attr(chat, GEN_AI.outputMessages)))[0].parts[0].content).toBe("[secret]");
  });

  it("lets a step call only its own routing entry, and never from a code step (D-66)", async () => {
    const t = setup([ok("x")]);
    await expect(t.call({ ...ask, step: "judge" })).rejects.toThrow(/may only call its own routing entry/);
    const code = setup([ok("x")], {}, { stepName: "calc" });
    await expect(code.call(ask)).rejects.toThrow(/code step/);
    expect(code.fake.requests).toHaveLength(0);
  });

  it("falls back once on a server error and records the reason", async () => {
    const t = setup(byModel({ "fake:small": [{ kind: "server" }], "fake-b:small": [ok("from fallback")] }));
    expect((await t.call(ask)).model).toBe("fake-b:small");
    const [first, second] = t.chats();
    expect(attr(first, OSSUARY.fallback)).toBe(false);
    expect(attr(second, OSSUARY.fallback)).toBe(true);
    expect(attr(second, OSSUARY.fallbackReason)).toBe("server");
    expect(attr(second, GEN_AI.responseModel)).toBe("small");
  });

  it("does not fall back on a client error", async () => {
    const t = setup(byModel({ "fake:small": [{ kind: "client" }], "fake-b:small": [ok("never")] }));
    await expect(t.call(ask)).rejects.toBeInstanceOf(GatewayError);
    expect(t.fake.requests.map((r) => r.modelId)).toEqual(["fake:small"]);
  });

  it("retries the same model once when Retry-After fits the wait, then falls back (D-70)", async () => {
    const t = setup(byModel({ "fake:small": [{ kind: "rate_limited", retryAfterMs: 300 }, { kind: "rate_limited", retryAfterMs: 300 }], "fake-b:small": [ok("fb")] }));
    expect((await t.call(ask)).model).toBe("fake-b:small");
    expect(t.sleeps).toEqual([300]);
    expect(t.fake.requests.map((r) => r.modelId)).toEqual(["fake:small", "fake:small", "fake-b:small"]);
    const spans = t.chats();
    expect(attr(spans[1], OSSUARY.retry)).toBe(true);
    expect(attr(spans[2], OSSUARY.fallbackReason)).toBe("rate_limited");
  });

  it("switches straight to the fallback when Retry-After is missing or too long", async () => {
    for (const outcome of [{ kind: "rate_limited" }, { kind: "rate_limited", retryAfterMs: 5_000 }] as FakeOutcome[]) {
      const t = setup(byModel({ "fake:small": [outcome], "fake-b:small": [ok("fb")] }));
      await t.call(ask);
      expect(t.sleeps).toEqual([]);
      expect(attr(t.chats()[1], OSSUARY.fallbackReason)).toBe("rate_limited");
    }
  });

  it("falls back on a timeout, and stops with BudgetExceeded when the time cap caused it", async () => {
    const t = setup(byModel({ "fake:small": [{ kind: "timeout" }], "fake-b:small": [ok("fb")] }));
    await t.call(ask);
    expect(attr(t.chats()[1], OSSUARY.fallbackReason)).toBe("timeout");
    const capped = setup(byModel({ "fake:small": [{ kind: "timeout" }], "fake-b:small": [ok("fb")] }), {}, { budget: openBudget(1_000) });
    const err = await capped.call(ask).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceeded);
    expect((err as BudgetExceeded).kind).toBe("seconds");
    expect(err).toMatchObject({ limit: 1_000, used: 1_000 });
    expect(capped.fake.requests).toHaveLength(1);
  });

  it("discards partial text from a failed attempt", async () => {
    const t = setup(byModel({ "fake:small": [{ kind: "partial", text: "HALF-ANSWER", then: "server" }], "fake-b:small": [ok("whole")] }));
    expect((await t.call(ask)).value).toBe("whole");
    expect(JSON.stringify(t.sink.spans)).not.toContain("HALF-ANSWER");
  });

  it("skips a too-long prompt's primary, and refuses one that fits no model (D-60)", async () => {
    const models = fakeModelRegister();
    models.prices["fake:small"] = { ...models.prices["fake:small"]!, max_prompt_tokens: 60 };
    const long = { ...ask, turn: [{ role: "user" as const, content: "x".repeat(200) }] };
    const t = setup([ok("fb")], { models });
    expect((await t.call(long)).model).toBe("fake-b:small");
    expect(t.fake.requests.map((r) => r.modelId)).toEqual(["fake-b:small"]);
    expect(attr(t.chats()[0], OSSUARY.fallbackReason)).toBe("prompt_too_long");

    models.prices["fake-b:small"] = { ...models.prices["fake-b:small"]!, max_prompt_tokens: 60 };
    const none = setup([ok("x")], { models });
    await expect(none.call(long)).rejects.toBeInstanceOf(PromptTooLongError);
    expect(none.fake.requests).toHaveLength(0);
  });

  it("flags a response over the prompt limit", async () => {
    const models = fakeModelRegister();
    models.prices["fake:small"] = { ...models.prices["fake:small"]!, max_prompt_tokens: 100 };
    const t = setup([{ kind: "ok", text: "x", usage: { inputTokens: 150 } }], { models });
    await t.call(ask);
    expect(attr(t.chats()[0], OSSUARY.promptLimitExceeded)).toBe(true);
  });

  it("refuses an unpriced model without contacting it", async () => {
    const models: Models = fakeModelRegister();
    delete models.prices["fake:small"];
    const t = setup([ok("x")], { models });
    await expect(t.call(ask)).rejects.toBeInstanceOf(PriceMissingError);
    expect(t.fake.requests).toHaveLength(0);
  });

  it("refuses a call that would break the workspace daily cap, before any vendor call", async () => {
    const t = setup([ok("x")], {}, { workspaceCapUsd: 0.000001 });
    const err = await t.call(ask).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceeded);
    expect((err as BudgetExceeded).scope).toBe("workspace");
    expect(t.fake.requests).toHaveLength(0);
  });

  it("flags an overrun when the actual cost beats the reservation", async () => {
    const budget = openBudget();
    const t = setup([{ kind: "ok", text: "x", usage: { outputTokens: 10_000 } }], {}, { budget });
    await t.call(ask);
    expect(attr(t.chats()[0], OSSUARY.budgetOverrun)).toBe(true);
    expect(budget.overruns).toBe(1);
  });

  it("excludes the generator's model from a judge call (Requirement 19.7)", async () => {
    const t = setup([ok('{"pass":true}')], {}, { stepName: "judge", exclude: new Set(["fake:mid"]) });
    expect((await t.call(ask)).model).toBe("fake-b:mid");
    expect(attr(t.chats()[0], OSSUARY.fallbackReason)).toBe("judge_excluded");
    const both = setup([ok("x")], {}, { stepName: "judge", exclude: new Set(["fake:mid", "fake-b:mid"]) });
    await expect(both.call(ask)).rejects.toBeInstanceOf(JudgeConflictError);
    const failed = setup([{ kind: "server" }], {}, { stepName: "judge", exclude: new Set(["fake:mid"]) });
    await expect(failed.call(ask)).rejects.toMatchObject({ name: "JudgeConflictError", excluded: ["fake:mid"] });
    expect(failed.fake.requests.map((req) => req.modelId)).toEqual(["fake-b:mid"]);
  });

  it("reports a judge conflict when the reported model is excluded and the fallback fails", async () => {
    const fake = createFakeProvider([ok("same model"), { kind: "server" }]);
    const t = setup([], { providers: [{ ...fake, send: async (req) => ({ ...await fake.send(req), model: "small" }) }] }, { stepName: "judge", exclude: new Set(["fake:small"]) });
    await expect(t.call(ask)).rejects.toMatchObject({ name: "JudgeConflictError", excluded: ["fake:small"] });
    expect(fake.requests.map((req) => req.modelId)).toEqual(["fake:mid", "fake-b:mid"]);
  });
});

describe("structured output (Requirement 11)", () => {
  const schema = z.object({ pass: z.boolean() });
  it("makes one repair call on the same model", async () => {
    const t = setup(byModel({ "fake:small": [ok("not json"), ok('{"pass":true}')] }));
    expect((await t.call({ ...ask, schema })).value).toEqual({ pass: true });
    expect(t.fake.requests.map((r) => r.modelId)).toEqual(["fake:small", "fake:small"]);
    expect(attr(t.chats()[1], OSSUARY.repair)).toBe(true);
    expect(t.fake.requests[0]?.jsonSchema).toMatchObject({ type: "object" });
  });

  it("repairs on the actual served model and charges both replies at its price", async () => {
    const fake = createFakeProvider([
      { kind: "ok", text: "not json", usage: { inputTokens: 1, outputTokens: 1 } },
      { kind: "ok", text: '{"pass":true}', usage: { inputTokens: 1, outputTokens: 1 } },
    ]);
    const models = fakeModelRegister();
    models.prices["fake:mid"] = { ...models.prices["fake:mid"]!, input: 5, output: 8 };
    const t = setup([], { models, providers: [{ ...fake, send: async (req) => ({ ...await fake.send(req), model: "mid" }) }] });
    await expect(t.call({ ...ask, schema })).resolves.toMatchObject({ model: "fake:mid", costMicros: 26, value: { pass: true } });
    expect(fake.requests.map((req) => req.modelId)).toEqual(["fake:small", "fake:mid"]);
    expect(t.scoped.served).toEqual(["fake:mid", "fake:mid"]);
  });

  it("stops a repair that runs out of task time without switching vendors", async () => {
    const t = setup([ok("nope"), { kind: "timeout" }], {}, { budget: openBudget(500) });
    await expect(t.call({ ...ask, schema })).rejects.toMatchObject({ kind: "seconds", limit: 500, used: 500 });
    expect(t.fake.requests.map((req) => req.modelId)).toEqual(["fake:small", "fake:small"]);
  });

  it("retains the fallback reason on its repair attempt", async () => {
    const t = setup([{ kind: "server" }, ok("nope"), ok('{"pass":true}')]);
    await expect(t.call({ ...ask, schema })).resolves.toMatchObject({ model: "fake-b:small", value: { pass: true } });
    const repair = t.chats().find((chat) => attr(chat, OSSUARY.repair) === true);
    expect(repair?.attributes).toMatchObject({ [OSSUARY.fallback]: true, [OSSUARY.fallbackReason]: "server" });
  });

  it("throws StructuredOutputError when the repair fails too", async () => {
    const t = setup(byModel({ "fake:small": [ok("nope"), ok('{"pass":"yes"}')] }));
    const err = await t.call({ ...ask, schema }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StructuredOutputError);
    expect((err as StructuredOutputError).issues[0]).toMatch(/^pass: /);
  });
});

describe("kill switch (Requirement 15)", () => {
  it("works only in demo mode", () => {
    const t = setup([ok("x")], { env: {} });
    expect(() => t.gateway.killPrimary("fake")).toThrow(DemoModeOnlyError);
    expect(() => t.gateway.revivePrimary("fake")).toThrow(DemoModeOnlyError);
    expect(t.gateway.killedVendors()).toEqual([]);
  });

  it("sends a killed vendor's primaries to the fallback without contacting them, until revived", async () => {
    const t = setup(byModel({ "fake-b:small": [ok("fb")], "fake:small": [ok("primary")] }));
    t.gateway.killPrimary("fake");
    expect(t.gateway.killedVendors()).toEqual(["fake"]);
    expect((await t.call(ask)).model).toBe("fake-b:small");
    expect(t.fake.requests.map((r) => r.modelId)).toEqual(["fake-b:small"]);
    expect(attr(t.chats()[0], OSSUARY.fallbackReason)).toBe("killed");
    t.gateway.revivePrimary("fake");
    expect((await t.call(ask)).model).toBe("fake:small");
  });
});

describe("timeouts (Requirement 14.5)", () => {
  it("aborts at the smaller of the step timeout and the remaining time", async () => {
    const seen: number[] = [];
    const t = setup([ok("x")], { timer: (ms) => (seen.push(ms), () => {}) }, { budget: openBudget(700) });
    await t.call(ask);
    expect(seen).toEqual([700]);
    const later = setup([ok("x")], { timer: (ms) => (seen.push(ms), () => {}) });
    await later.call(ask);
    expect(seen.at(-1)).toBe(1_000);
  });
});
