// runTask: run one task through its pattern under the budget, with one trace and the state saved
// after every step, so a run survives a restart (HAR-03, HAR-05, Requirements 17, 18, 20).
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../db/client.ts";
import { BudgetExceeded, TaskStateError } from "../errors.ts";
import type { Gateway } from "../gateway/gateway.ts";
import { capMicros } from "../money.ts";
import { OSSUARY } from "../trace/attributes.ts";
import { createRedactor, type Redactor } from "../trace/redact.ts";
import { dbSpanSink, newTraceId, span, withTrace, type ActiveSpan } from "../trace/trace.ts";
import { Budget } from "./budget.ts";
import type { AppDefinition } from "./define-app.ts";
import { runGenerateEvaluate } from "./generate-evaluate.ts";
import { runPipeline } from "./pipeline.ts";
import type { StepRunner } from "./runtime.ts";
import { initialState, parseState, serializeState, toJsonOutput, type TaskState } from "./task-state.ts";
import type { Pattern, RunContext } from "./types.ts";

export interface RunTaskOptions {
  input?: unknown;
  workspaceId?: string;
  /** Resume or replay this task; a new task gets a fresh ID when omitted. */
  taskId?: string;
  db: Pick<DbHandle, "execute">;
  gateway: Gateway;
  now?: () => number;
  redactor?: Redactor;
}

export type TaskStatus = "completed" | "failed" | "stopped";

export interface TaskResult<O = unknown> {
  taskId: string;
  traceId: string;
  status: TaskStatus;
  output?: O;
  stop?: { kind: string; scope: string; limit: number; used: number };
  error?: { class: string; message: string };
  steps: number;
  spendMicros: number;
}

interface TaskRow {
  status: string;
  trace_id: string;
  workspace_id: string;
  input: unknown;
  state: unknown;
  result: unknown;
}

const TERMINAL = new Set(["completed", "failed", "stopped"]);

async function loadRow(db: RunTaskOptions["db"], id: string): Promise<TaskRow | undefined> {
  const rows = await db.execute(sql`select status, trace_id, workspace_id, input, state, result from bones.tasks where id = ${id}`);
  return rows[0] as TaskRow | undefined;
}

export async function runTask<O = unknown>(app: AppDefinition<Pattern>, opts: RunTaskOptions): Promise<TaskResult<O>> {
  const { db, gateway } = opts;
  const now = opts.now ?? Date.now;
  const redact = opts.redactor ?? createRedactor(process.env);
  const taskId = opts.taskId ?? randomUUID();
  const existing = opts.taskId ? await loadRow(db, opts.taskId) : undefined;

  if (existing && TERMINAL.has(existing.status)) return existing.result as TaskResult<O>; // Requirement 20.5

  let state: TaskState;
  let traceId: string;
  let workspaceId: string;
  let input: unknown;
  if (existing) {
    traceId = existing.trace_id;
    workspaceId = existing.workspace_id;
    input = existing.input;
    try {
      state = parseState(existing.state);
    } catch (err) {
      const result: TaskResult<O> = { taskId, traceId, status: "failed", error: { class: "TaskStateError", message: redact((err as Error).message) }, steps: 0, spendMicros: 0 };
      await db.execute(sql`update bones.tasks set status = 'failed', result = ${JSON.stringify(result)}::jsonb, error_class = 'TaskStateError', error_message = ${result.error!.message}, updated_at = now() where id = ${taskId}`);
      return result;
    }
  } else {
    traceId = newTraceId();
    workspaceId = opts.workspaceId ?? "local";
    input = opts.input ?? null;
    state = initialState(app.pattern.kind);
    await db.execute(sql`
      insert into bones.tasks (id, app_id, workspace_id, code, trace_id, status, input, state)
      values (${taskId}, ${app.id}, ${workspaceId}, ${app.policy.code}, ${traceId}, 'running', ${JSON.stringify(toJsonOutput("input", input))}::jsonb, ${serializeState(state)}::jsonb)`);
  }

  const limits = app.product.limits;
  const budget = new Budget(
    { steps: limits.max_steps, tokens: limits.max_tokens, activeMs: limits.max_seconds * 1000, spendMicros: capMicros(limits.max_spend_usd) },
    { now, used: state.budget },
  );
  const done = new Map(state.completed.map((c) => [c.step, c]));
  const save = async () => {
    state.budget = budget.snapshot();
    await db.execute(sql`update bones.tasks set state = ${serializeState(state)}::jsonb, updated_at = now() where id = ${taskId}`);
  };

  const runStep: StepRunner = async (step, stepInput, o) => {
    const saved = done.get(o.key);
    if (saved) return saved.output as never; // replay a completed step on resume (Requirement 20.4)
    budget.startStep();
    const scoped = gateway.scope({
      appId: app.id,
      workspaceId,
      workspaceCapUsd: limits.max_workspace_spend_usd_per_day,
      routing: app.routing,
      stepName: step.name,
      budget,
      ...(o.exclude ? { exclude: o.exclude } : {}),
    });
    const output = await span(`step ${step.name}`, { [OSSUARY.step]: step.name, [OSSUARY.taskId]: taskId }, async () => {
      const ctx: RunContext = { taskId, traceId, workspaceId, policy: app.policy, budget: budget.view(), gateway: scoped, span, step: step.name, round: o.round };
      const result = await step.run(stepInput, ctx);
      budget.check();
      return result;
    });
    const entry = { step: o.key, output: toJsonOutput(step.name, output), served: [...scoped.served] };
    state.completed.push(entry);
    state.round = Math.max(state.round, o.round);
    done.set(o.key, entry);
    await save();
    return output;
  };

  const finish = async (result: TaskResult<O>, root: ActiveSpan) => {
    state.budget = budget.snapshot();
    result.steps = state.budget.steps;
    result.spendMicros = state.budget.spendMicros;
    root.set({ "ossuary.task.status": result.status });
    await db.execute(sql`
      update bones.tasks set status = ${result.status}, state = ${serializeState(state)}::jsonb, result = ${JSON.stringify(result)}::jsonb,
        stop_kind = ${result.stop?.kind ?? null}, error_class = ${result.error?.class ?? null}, error_message = ${result.error?.message ?? null}, updated_at = now()
      where id = ${taskId}`);
    return result;
  };

  return withTrace({ sink: dbSpanSink(db), appId: app.id, taskId, traceId, now, redactor: redact }, async (root) => {
    try {
      const output =
        app.pattern.kind === "pipeline"
          ? await runPipeline(app.pattern, input, runStep)
          : await runGenerateEvaluate(app.pattern as never, input, runStep, (key) => done.get(key)?.served ?? []);
      return await finish({ taskId, traceId, status: "completed", output: output as O, steps: 0, spendMicros: 0 }, root);
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        root.set({ [OSSUARY.budgetStopKind]: err.kind, [OSSUARY.budgetLimit]: err.limit, [OSSUARY.budgetUsed]: err.used });
        return finish({ taskId, traceId, status: "stopped", stop: { kind: err.kind, scope: err.scope, limit: err.limit, used: err.used }, steps: 0, spendMicros: 0 }, root);
      }
      const name = err instanceof Error ? err.name : "Error";
      const message = redact(err instanceof Error ? err.message : String(err));
      root.fail(err instanceof TaskStateError ? err : new Error(message));
      return finish({ taskId, traceId, status: "failed", error: { class: name, message }, steps: 0, spendMicros: 0 }, root);
    }
  });
}
