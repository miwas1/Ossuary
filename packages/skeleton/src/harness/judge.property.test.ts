import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../db/client.ts";
import { fakeModelRegister } from "../gateway/fake.ts";
import { vendorOf, type Models } from "../manifest/schemas.ts";
import { fakeGateway, memDb, tempApp } from "./__tests__/helpers.ts";
import { defineApp } from "./define-app.ts";
import { generateEvaluate, VerdictSchema } from "./generate-evaluate.ts";
import type { TaskState } from "./task-state.ts";

const POOL = ["fake:a", "fake:c", "fake-b:b", "fake-b:d"];
const otherVendor = (id: string) => POOL.filter((p) => vendorOf(p) !== vendorOf(id));

const tiers = fc
  .tuple(fc.constantFrom(...POOL), fc.constantFrom(...POOL))
  .filter(([g, j]) => g !== j)
  .chain(([g, j]) => fc.tuple(fc.constant(g), fc.constantFrom(...otherVendor(g)), fc.constant(j), fc.constantFrom(...otherVendor(j))));

describe("judge separation", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await memDb();
  }, 60_000);
  afterAll(() => db.close());

  // Feature: 01-skeleton-core, Property P1-2: The judge and the generator are never served by the same model
  it("Property P1-2: every completed evaluate call is served by a different model from its round's generate call", async () => {
    await fc.assert(
      fc.asyncProperty(tiers, fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), async ([gp, gf, jp, jf], fails, passes) => {
        const base = fakeModelRegister();
        const price = base.prices["fake:small"]!;
        const models: Models = {
          tiers: { small: { primary: gp, fallback: gf }, mid: { primary: jp, fallback: jf }, frontier: base.tiers.frontier },
          prices: { ...base.prices, ...Object.fromEntries(POOL.map((id) => [id, price])) },
        };
        let n = 0;
        let round = 0;
        const { gateway } = fakeGateway(
          (req) => {
            const fail = fails[n++ % fails.length];
            if (fail) return { kind: "server" };
            const judging = req.segments.some((s) => s.kind === "system" && s.parts.some((p) => p.type === "text" && p.text === "judge"));
            if (!judging) return { kind: "ok", text: "candidate" };
            return { kind: "ok", text: JSON.stringify({ pass: passes[round++ % passes.length], score: 0.5, feedback: "again" }) };
          },
          { models },
        );
        const app = defineApp({
          dir: tempApp({ code: "GEN-A1-R1", routing: { generate: { tier: "small", effort: "low" }, evaluate: { tier: "mid", effort: "low", role: "judge" } } }),
          models,
          pattern: generateEvaluate({
            generate: { name: "generate", kind: "model", run: async (_i, ctx) => (await ctx.gateway.call({ system: "write", turn: [{ role: "user", content: "t" }] })).value },
            evaluate: { name: "evaluate", kind: "model", run: async (_i, ctx) => (await ctx.gateway.call({ system: "judge", turn: [{ role: "user", content: "c" }], schema: VerdictSchema })).value },
            maxRounds: 3,
          }),
        });
        const res = await app.runTask({ input: "t", db, gateway });
        const row = (await db.execute(sql`select state from bones.tasks where id = ${res.taskId}`))[0] as { state: TaskState };
        const served = new Map(row.state.completed.map((c) => [c.step, c.served]));
        for (const [key, evalServed] of served) {
          if (!key.startsWith("evaluate#")) continue;
          const genServed = served.get(key.replace("evaluate", "generate")) ?? [];
          expect(evalServed.length).toBeGreaterThan(0);
          for (const m of evalServed) expect(genServed).not.toContain(m);
        }
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
