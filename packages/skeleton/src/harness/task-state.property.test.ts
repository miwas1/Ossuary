import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../db/client.ts";
import { fakeModelRegister } from "../gateway/fake.ts";
import { fakeGateway, memDb, tempApp } from "./__tests__/helpers.ts";
import { defineApp } from "./define-app.ts";
import { pipeline } from "./pipeline.ts";
import { parseState, serializeState, type TaskState } from "./task-state.ts";
import type { Step } from "./types.ts";

const json = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)) as unknown);
const state: fc.Arbitrary<TaskState> = fc.record({
  version: fc.constant(1 as const),
  pattern: fc.constantFrom("pipeline" as const, "generate-evaluate" as const),
  completed: fc.array(fc.record({ step: fc.string(), output: json, served: fc.array(fc.string(), { maxLength: 3 }) }), { maxLength: 5 }) as fc.Arbitrary<TaskState["completed"]>,
  round: fc.nat(10),
  budget: fc.record({ steps: fc.nat(100), tokens: fc.nat(1e6), activeMs: fc.nat(1e7), spendMicros: fc.nat(1e7), overrun: fc.boolean() }),
});

describe("task state properties", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await memDb();
  }, 60_000);
  afterAll(() => db.close());

  // Feature: 01-skeleton-core, Property P1-3: Task state saves and reloads unchanged, and a resumed task matches an uninterrupted one
  it("Property P1-3: saving then loading returns an equal state", () => {
    fc.assert(
      fc.property(state, (s) => {
        expect(parseState(JSON.parse(serializeState(s)))).toEqual(s);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: 01-skeleton-core, Property P1-3: Task state saves and reloads unchanged, and a resumed task matches an uninterrupted one
  it("Property P1-3: a task interrupted after any step and resumed matches an uninterrupted run", async () => {
    const ops = fc.array(fc.tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -5, max: 5 })), { minLength: 1, maxLength: 6 });
    await fc.assert(
      fc.asyncProperty(ops, fc.nat(), async (fns, at) => {
        const crashAt = at % fns.length;
        const runs = fns.map(() => 0);
        let crashed = false;
        let stash: unknown;
        const steps = (interrupt: boolean): Step<number, number>[] =>
          fns.map(([a, b], i) => ({
            name: `s${i}`,
            kind: "code",
            run: async (x, ctx) => {
              if (interrupt) runs[i] = (runs[i] ?? 0) + 1;
              if (interrupt && i === crashAt && !crashed) {
                crashed = true;
                // The process dies here: the row still holds the state saved after the previous step.
                stash = ((await db.execute(sql`select state from bones.tasks where id = ${ctx.taskId}`))[0] as { state: unknown }).state;
                throw new Error("process died");
              }
              return x * a + b;
            },
          }));
        const dir = tempApp({ code: "EXT-A1-R1", routing: { unused: { kind: "code" } } });
        const { gateway } = fakeGateway([]);
        const models = fakeModelRegister();
        const plain = await defineApp({ dir, pattern: pipeline(steps(false)), models }).runTask<number>({ input: 1, db, gateway });

        const app = defineApp({ dir, pattern: pipeline(steps(true)), models });
        const first = await app.runTask<number>({ input: 1, db, gateway });
        expect(first.status).toBe("failed");
        await db.execute(sql`update bones.tasks set status = 'running', state = ${JSON.stringify(stash)}::jsonb where id = ${first.taskId}`);
        const resumed = await app.runTask<number>({ taskId: first.taskId, db, gateway });

        expect(resumed.status).toBe("completed");
        expect(resumed.output).toBe(plain.output);
        expect(resumed.steps).toBe(plain.steps);
        // Steps completed before the crash never run again; the crashed step runs once more.
        runs.forEach((count, i) => expect(count, `step ${i}`).toBe(i === crashAt ? 2 : 1));
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
