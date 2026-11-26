import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OssuaryError } from "../errors.ts";
import type { Routing } from "../manifest/schemas.ts";
import { OSSUARY } from "../trace/attributes.ts";
import { memorySpanSink, withTrace } from "../trace/trace.ts";
import { createFakeProvider, fakeModelRegister, type FakeOutcome } from "./fake.ts";
import { createGateway, type ChargeBudget } from "./gateway.ts";
import type { ProviderRequest } from "./types.ts";

const PRIMARY = "fake:small";
const FALLBACK = "fake-b:small";

const outcome: fc.Arbitrary<FakeOutcome> = fc.oneof(
  fc.constant<FakeOutcome>({ kind: "ok", text: "COMPLETE" }),
  fc.constant<FakeOutcome>({ kind: "server" }),
  fc.constant<FakeOutcome>({ kind: "client" }),
  fc.option(fc.integer({ min: 0, max: 3_000 }), { nil: undefined }).map<FakeOutcome>((ms) => (ms === undefined ? { kind: "rate_limited" } : { kind: "rate_limited", retryAfterMs: ms })),
  fc.constant<FakeOutcome>({ kind: "timeout" }),
  fc.constantFrom<"server" | "timeout">("server", "timeout").map<FakeOutcome>((then) => ({ kind: "partial", text: "PARTIAL-TEXT", then })),
);

const scenario = fc.record({
  primary: fc.array(outcome, { minLength: 3, maxLength: 3 }),
  fallback: fc.array(outcome, { minLength: 3, maxLength: 3 }),
  retryWait: fc.integer({ min: 0, max: 2_000 }),
  killed: fc.boolean(),
  placeholder: fc.boolean(),
  // Prompt length against limits of 120 (primary) and 400 (fallback) estimated tokens.
  size: fc.constantFrom(10, 400, 2_000),
});

const open: ChargeBudget = {
  reserve: (tokens, micros) => ({ tokens, micros, open: true }),
  settle: (r) => ((r.open = false), false),
  release: (r) => void (r.open = false),
  remainingMs: () => 60_000,
  timeExceeded: () => { throw new Error("the test budget does not run out of time"); },
};

describe("gateway properties", () => {
  // Feature: 01-skeleton-core, Property 5: A primary-vendor failure returns the fallback's result or a typed error, never a partial result, and the span records the fallback
  it("Property 5: one complete result or a typed error, at most one switch and one retry per vendor", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (sc) => {
        const models = fakeModelRegister();
        models.prices[PRIMARY] = { ...models.prices[PRIMARY]!, max_prompt_tokens: 120 };
        models.prices[FALLBACK] = { ...models.prices[FALLBACK]!, max_prompt_tokens: 400 };
        if (sc.placeholder) models.tiers.small = { primary: PRIMARY, fallback: "fake-b:<id>" };
        const counts: Record<string, number> = {};
        const fake = createFakeProvider((req: ProviderRequest) => {
          const n = (counts[req.modelId] = (counts[req.modelId] ?? -1) + 1);
          return (req.modelId === PRIMARY ? sc.primary : sc.fallback)[n] ?? { kind: "client" };
        });
        const sleeps: number[] = [];
        const gateway = createGateway({
          models,
          providers: [fake],
          vendorAdapters: false,
          env: { DEMO_MODE: "true" },
          sleep: async (ms) => void sleeps.push(ms),
          timer: (_ms, fire) => {
            const t = setTimeout(fire, 0);
            return () => clearTimeout(t);
          },
        });
        if (sc.killed) gateway.killPrimary("fake");
        const routing: Routing = { steps: { gen: { tier: "small", effort: "low", max_retry_wait_ms: sc.retryWait } } };
        const scoped = gateway.scope({ appId: "p5", workspaceId: "w", workspaceCapUsd: 100, routing, stepName: "gen", budget: open });
        const sink = memorySpanSink();
        let value: string | undefined;
        let error: unknown;
        try {
          value = (await withTrace({ sink, appId: "p5" }, () => scoped.call({ system: "s", turn: [{ role: "user", content: "x".repeat(sc.size) }] }))).value;
        } catch (e) {
          error = e;
        }

        // Exactly one complete result, or a typed error.
        if (value !== undefined) expect(value).toBe("COMPLETE");
        else expect(error).toBeInstanceOf(OssuaryError);

        // Requests never go back to the primary after the fallback, and each vendor is tried at most twice.
        const seq = fake.requests.map((r) => r.modelId);
        const firstFallback = seq.indexOf(FALLBACK);
        if (firstFallback >= 0) expect(seq.slice(firstFallback).every((m) => m === FALLBACK)).toBe(true);
        expect(seq.filter((m) => m === PRIMARY).length).toBeLessThanOrEqual(2);
        expect(seq.filter((m) => m === FALLBACK).length).toBeLessThanOrEqual(2);
        expect(seq.length).toBeLessThanOrEqual(4);
        if (sc.killed) expect(seq).not.toContain(PRIMARY);

        // Waits only within the step's retry wait, at most once per vendor.
        expect(sleeps.every((ms) => ms <= sc.retryWait)).toBe(true);
        expect(sleeps.length).toBeLessThanOrEqual(2);

        // No partial text anywhere.
        expect(JSON.stringify(sink.spans)).not.toContain("PARTIAL-TEXT");

        // ossuary.fallback is true on a span if and only if that attempt went to the fallback.
        const chats = sink.spans.filter((s) => s.name.startsWith("chat ")).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        expect(chats).toHaveLength(seq.length);
        for (const s of chats) expect(s.attributes[OSSUARY.fallback]).toBe(s.name === "chat small" && s.attributes["gen_ai.provider.name"] === "fake-b");
        const firstFb = chats.find((s) => s.attributes[OSSUARY.fallback] === true);
        const lastPrimary = [...chats].reverse().find((s) => s.attributes[OSSUARY.fallback] === false);
        if (firstFb && lastPrimary && lastPrimary.attributes["ossuary.failure_class"] === "rate_limited") {
          expect(firstFb.attributes[OSSUARY.fallbackReason]).toBe("rate_limited");
        }
      }),
      { numRuns: 200 },
    );
  });
});
