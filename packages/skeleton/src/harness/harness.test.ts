import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../db/client.ts";
import { ManifestError, PatternNotBuiltError } from "../errors.ts";
import { fakeModelRegister } from "../gateway/fake.ts";
import { OSSUARY } from "../trace/attributes.ts";
import { fakeGateway, manualClock, memDb, tempApp } from "./__tests__/helpers.ts";
import { defineApp } from "./define-app.ts";
import { generateEvaluate, VerdictSchema } from "./generate-evaluate.ts";
import { pipeline } from "./pipeline.ts";
import type { Step, Verdict } from "./types.ts";

const models = fakeModelRegister();
const geRouting = { generate: { tier: "small", effort: "low" }, evaluate: { tier: "mid", effort: "low", role: "judge" } };
const generate: Step<{ input: unknown; feedback: string | null }, string> = {
  name: "generate",
  kind: "model",
  run: async (_i, ctx) => (await ctx.gateway.call({ system: "write", turn: [{ role: "user", content: "topic" }] })).value,
};
const evaluate: Step<{ input: unknown; candidate: string }, Verdict> = {
  name: "evaluate",
  kind: "model",
  run: async (_i, ctx) => (await ctx.gateway.call({ system: "judge", turn: [{ role: "user", content: "c" }], schema: VerdictSchema })).value,
};
const code = (name: string, fn: (x: number) => number): Step<number, number> => ({ name, kind: "code", run: async (x) => fn(x) });

describe("defineApp (Requirement 16)", () => {
  it("rejects unbuilt patterns, a mismatched pattern, action steps and missing routing", () => {
    expect(() => defineApp({ dir: tempApp({ code: "AGT-A1-R1", routing: geRouting }), pattern: pipeline([]), models })).toThrow(PatternNotBuiltError);
    expect(() => defineApp({ dir: tempApp({ code: "MON-A1-R1", routing: geRouting }), pattern: pipeline([]), models })).toThrow(PatternNotBuiltError);
    expect(() => defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: geRouting }), pattern: pipeline([]), models })).toThrow(/uses the generate-evaluate pattern/);
    const action: Step<number, number> = { name: "post", kind: "action", run: async (x) => x };
    expect(() => defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([action]), models })).toThrow(/Phase 2 approval gate/);
    const model: Step<number, number> = { name: "extract", kind: "model", run: async (x) => x };
    expect(() => defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([model]), models })).toThrow(ManifestError);
    expect(() => defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([code("generate", (x) => x)]), models })).toThrow(/cannot use a model entry/);
  });

  it("needs exactly one judge, on the evaluate step, with a different primary from the generator (HAR-02)", () => {
    const pattern = generateEvaluate({ generate, evaluate });
    expect(() => defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: { ...geRouting, evaluate: { tier: "mid", effort: "low" } } }), pattern, models })).toThrow(/exactly one step with role: judge/);
    expect(() => defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: { ...geRouting, evaluate: { tier: "small", effort: "low", role: "judge" } } }), pattern, models })).toThrow(/share the primary model/);
    expect(defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: geRouting }), pattern, models }).policy.pattern).toBe("generate-evaluate");
  });

  it("checks maxRounds", () => {
    expect(() => generateEvaluate({ generate, evaluate, maxRounds: 0 })).toThrow(/1 to 10/);
    expect(() => generateEvaluate({ generate, evaluate, maxRounds: 11 })).toThrow(/1 to 10/);
    expect(generateEvaluate({ generate, evaluate }).maxRounds).toBe(3);
  });
});

describe("runTask on PGlite", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await memDb();
  }, 60_000);
  afterAll(() => db.close());

  const row = async (id: string) => (await db.execute(sql`select * from bones.tasks where id = ${id}`))[0] as Record<string, unknown>;
  const spans = (traceId: string) => db.execute(sql`select name, parent_span_id, status_code, status_message, attributes from bones.spans where trace_id = ${traceId}`);

  it("runs a pipeline in order, saves state and writes one trace (Requirement 18.1, 20.1, 20.2)", async () => {
    const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([code("double", (x) => x * 2), code("inc", (x) => x + 1)]), models });
    const { gateway } = fakeGateway([]);
    const res = await app.runTask<number>({ input: 5, db, gateway });
    expect(res).toMatchObject({ status: "completed", output: 11, steps: 2 });
    const r = await row(res.taskId);
    expect(r).toMatchObject({ status: "completed", app_id: "testapp", code: "EXT-A1-R1", workspace_id: "local", input: 5 });
    expect((r.state as { completed: unknown[] }).completed).toHaveLength(2);
    const names = (await spans(res.traceId)).map((s) => s.name).sort();
    expect(names).toEqual(["invoke_workflow testapp", "step double", "step inc"]);
  });

  it("returns a terminal task's stored result without running anything (Requirement 20.5)", async () => {
    let runs = 0;
    const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([code("count", (x) => (runs++, x))]), models });
    const { gateway } = fakeGateway([]);
    const first = await app.runTask({ input: 1, db, gateway });
    const again = await app.runTask({ taskId: first.taskId, db, gateway });
    expect(again).toEqual(first);
    expect(runs).toBe(1);
  });

  it("fails a task whose step output isn't JSON, and one whose saved state is invalid (Requirement 20.3, 20.6)", async () => {
    const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([{ name: "date", kind: "code", run: async () => new Date() }]), models });
    const { gateway } = fakeGateway([]);
    const res = await app.runTask({ input: 0, db, gateway });
    expect(res.status).toBe("failed");
    expect(res.error?.class).toBe("TaskStateError");

    const ok = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }), pattern: pipeline([code("id", (x) => x)]), models });
    await db.execute(sql`insert into bones.tasks (id, app_id, workspace_id, code, trace_id, status, input, state) values ('broken', 'testapp', 'local', 'EXT-A1-R1', ${"a".repeat(32)}, 'running', '1'::jsonb, '{"version":9}'::jsonb)`);
    const broken = await ok.runTask({ taskId: "broken", db, gateway });
    expect(broken).toMatchObject({ status: "failed", error: { class: "TaskStateError" } });
    expect((await row("broken")).status).toBe("failed");
  });

  it("stores a failing step's class and redacted message (Requirement 18.3, 23.4)", async () => {
    const app = defineApp({
      dir: tempApp({ code: "EXT-A1-R1", routing: geRouting }),
      pattern: pipeline([{ name: "boom", kind: "code", run: async () => Promise.reject(new RangeError("no receipt for ada@example.com")) }]),
      models,
    });
    const { gateway } = fakeGateway([]);
    const res = await app.runTask({ input: 0, db, gateway });
    expect(res).toMatchObject({ status: "failed", error: { class: "RangeError", message: "no receipt for [email]" } });
    const r = await row(res.taskId);
    expect(r).toMatchObject({ error_class: "RangeError", error_message: "no receipt for [email]" });
    const step = (await spans(res.traceId)).find((s) => s.name === "step boom");
    expect(step).toMatchObject({ status_code: "error", status_message: "RangeError: no receipt for [email]" });
  });

  it("stops on a budget cap with status stopped and records the cap (Requirement 17.7)", async () => {
    const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting, limits: { max_steps: 1 } }), pattern: pipeline([code("a", (x) => x), code("b", (x) => x)]), models });
    const { gateway } = fakeGateway([]);
    const res = await app.runTask({ input: 0, db, gateway });
    expect(res).toMatchObject({ status: "stopped", stop: { kind: "steps", limit: 1, used: 2 } });
    expect((await row(res.taskId)).stop_kind).toBe("steps");
    const root = (await spans(res.traceId)).find((s) => s.parent_span_id === null);
    expect((root?.attributes as Record<string, unknown>)[OSSUARY.budgetStopKind]).toBe("steps");
  });

  it("stops when the final code step reaches the time cap", async () => {
    const clock = manualClock();
    const slow = code("slow", (x) => {
      clock.advance(1_000);
      return x;
    });
    const app = defineApp({ dir: tempApp({ code: "EXT-A1-R1", routing: geRouting, limits: { max_seconds: 1 } }), pattern: pipeline([slow]), models });
    const { gateway } = fakeGateway([]);
    const res = await app.runTask({ input: 0, db, gateway, now: clock.now });
    expect(res).toMatchObject({ status: "stopped", stop: { kind: "seconds", limit: 1_000, used: 1_000 } });
    expect(res.output).toBeUndefined();
  });

  it("runs generateEvaluate rounds until the judge passes, with the generator's model excluded (Requirement 19)", async () => {
    const app = defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: geRouting }), pattern: generateEvaluate({ generate, evaluate, maxRounds: 3 }), models });
    let judged = 0;
    const { gateway, fake } = fakeGateway((req) => {
      if (req.modelId.endsWith(":small")) return { kind: "ok", text: "candidate" };
      judged += 1;
      return { kind: "ok", text: JSON.stringify({ pass: judged >= 2, score: judged / 2, feedback: "shorter" }) };
    });
    const res = await app.runTask<{ rounds: number; accepted: boolean; candidate: string }>({ input: "x", db, gateway, workspaceId: "w9" });
    expect(res.output).toMatchObject({ rounds: 2, accepted: true, candidate: "candidate" });
    expect(fake.requests.map((r) => r.modelId)).toEqual(["fake:small", "fake:mid", "fake:small", "fake:mid"]);
    expect((await row(res.taskId)).workspace_id).toBe("w9");
  });

  it("returns the last verdict with accepted false after maxRounds", async () => {
    const app = defineApp({ dir: tempApp({ code: "GEN-A1-R1", routing: geRouting }), pattern: generateEvaluate({ generate, evaluate, maxRounds: 2 }), models });
    const { gateway } = fakeGateway((req) => (req.modelId.endsWith(":small") ? { kind: "ok", text: "c" } : { kind: "ok", text: '{"pass":false,"score":0.1,"feedback":"no"}' }));
    const res = await app.runTask<{ rounds: number; accepted: boolean }>({ input: "x", db, gateway });
    expect(res.output).toMatchObject({ rounds: 2, accepted: false });
  });
});
