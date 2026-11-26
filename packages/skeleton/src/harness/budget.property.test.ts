import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../db/client.ts";
import { fakeModelRegister } from "../gateway/fake.ts";
import { capMicros } from "../money.ts";
import { fakeGateway, manualClock, memDb, tempApp } from "./__tests__/helpers.ts";
import { defineApp } from "./define-app.ts";
import { pipeline } from "./pipeline.ts";
import type { TaskState } from "./task-state.ts";
import type { Step } from "./types.ts";

const routing = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`m${i}`, { tier: "small", effort: "low", max_output_tokens: 20 }]));

const scenario = fc.record({
  caps: fc.record({
    max_steps: fc.integer({ min: 1, max: 5 }),
    max_tokens: fc.integer({ min: 100, max: 2_000 }),
    max_seconds: fc.integer({ min: 1, max: 5 }),
    spendMicros: fc.integer({ min: 100, max: 5_000 }),
  }),
  steps: fc.array(fc.record({ calls: fc.integer({ min: 0, max: 3 }), advanceMs: fc.integer({ min: 0, max: 2_500 }), len: fc.integer({ min: 1, max: 400 }) }), { minLength: 1, maxLength: 6 }),
});

describe("budget properties", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await memDb();
  }, 60_000);
  afterAll(() => db.close());

  // Feature: 01-skeleton-core, Property 2: A run never exceeds its step, token, time or spend cap; it stops with BudgetExceeded
  it("Property 2: no task exceeds its caps, and a refused charge makes no vendor call", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ caps, steps }) => {
        const clock = manualClock();
        const startedAt = clock.now();
        const requestTimes: number[] = [];
        const stepStarts: number[] = [];
        const { gateway, fake } = fakeGateway(() => (requestTimes.push(clock.now()), { kind: "ok", text: "y" }), { now: clock.now });
        const defs: Step<number, number>[] = steps.map((s, i) => ({
          name: `m${i}`,
          kind: "model",
          run: async (x, ctx) => {
            stepStarts.push(clock.now());
            clock.advance(s.advanceMs);
            for (let c = 0; c < s.calls; c++) await ctx.gateway.call({ system: "s", turn: [{ role: "user", content: "x".repeat(s.len) }] });
            return x + 1;
          },
        }));
        const limits = { max_steps: caps.max_steps, max_tokens: caps.max_tokens, max_seconds: caps.max_seconds, max_spend_usd: caps.spendMicros / 1e6, max_workspace_spend_usd_per_day: 100 };
        const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing, limits }), pattern: pipeline(defs), models: fakeModelRegister() });
        const res = await app.runTask({ input: 0, db, gateway, now: clock.now });

        const row = (await db.execute(sql`select state from bones.tasks where id = ${res.taskId}`))[0] as { state: TaskState };
        const used = row.state.budget;
        expect(used.steps).toBeLessThanOrEqual(caps.max_steps);
        expect(used.tokens).toBeLessThanOrEqual(caps.max_tokens);
        expect(used.spendMicros).toBeLessThanOrEqual(capMicros(caps.spendMicros / 1e6));
        // No step and no vendor call ever starts once the time cap is reached.
        for (const t of [...stepStarts, ...requestTimes]) expect(t - startedAt).toBeLessThan(caps.max_seconds * 1000);

        // Every vendor request was a reserved, completed call: a refused charge left no request behind.
        const chats = await db.execute(sql`select count(*)::int as n from bones.spans where trace_id = ${res.traceId} and name like 'chat %'`);
        expect(Number(chats[0]?.n)).toBe(fake.requests.length);

        if (res.status === "stopped") {
          const stop = res.stop!;
          if (stop.kind === "seconds") expect(stop.used).toBeGreaterThanOrEqual(stop.limit);
          else expect(stop.used).toBeGreaterThan(stop.limit);
        } else {
          expect(res.status).toBe("completed");
          expect(used.activeMs).toBeLessThan(caps.max_seconds * 1_000);
          expect(res.output).toBe(steps.length);
        }
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
