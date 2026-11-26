// One trace per task, spans named with OpenTelemetry GenAI attributes, redaction before storage
// (OPS-01, OPS-09, Requirement 22). The current span lives in AsyncLocalStorage, so span() nests
// under whatever is running.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../db/client.ts";
import { GEN_AI, OPERATION, OSSUARY } from "./attributes.ts";
import { createRedactor, type Redactor } from "./redact.ts";

export type Attributes = Record<string, unknown>;

export interface SpanRecord {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  taskId: string | null;
  name: string;
  startTime: Date;
  endTime: Date;
  statusCode: "ok" | "error";
  statusMessage: string | null;
  attributes: Attributes;
  events: unknown[];
}

export interface SpanSink {
  write(span: SpanRecord): Promise<void>;
}

/** Writes spans to bones.spans. */
export function dbSpanSink(handle: Pick<DbHandle, "execute">): SpanSink {
  return {
    async write(s) {
      await handle.execute(sql`
        insert into bones.spans (span_id, trace_id, parent_span_id, task_id, name, start_time, end_time, status_code, status_message, attributes, events)
        values (${s.spanId}, ${s.traceId}, ${s.parentSpanId}, ${s.taskId}, ${s.name}, ${s.startTime.toISOString()}, ${s.endTime.toISOString()},
                ${s.statusCode}, ${s.statusMessage}, ${JSON.stringify(s.attributes)}::jsonb, ${JSON.stringify(s.events)}::jsonb)`);
    },
  };
}

/** How many spans bones.spans holds for a trace. */
export async function countSpans(handle: Pick<DbHandle, "execute">, traceId: string): Promise<number> {
  const rows = await handle.execute(sql`select count(*)::int as n from bones.spans where trace_id = ${traceId}`);
  return Number(rows[0]?.n ?? 0);
}

/** Every stored span of a trace, oldest first. */
export async function readTrace(handle: Pick<DbHandle, "execute">, traceId: string): Promise<SpanRecord[]> {
  const rows = await handle.execute(sql`
    select span_id, trace_id, parent_span_id, task_id, name, start_time, end_time, status_code, status_message, attributes, events
    from bones.spans where trace_id = ${traceId} order by start_time, span_id`);
  return rows.map((r) => ({
    spanId: String(r.span_id),
    traceId: String(r.trace_id),
    parentSpanId: (r.parent_span_id as string | null) ?? null,
    taskId: (r.task_id as string | null) ?? null,
    name: String(r.name),
    startTime: new Date(r.start_time as string),
    endTime: new Date(r.end_time as string),
    statusCode: r.status_code === "error" ? "error" : "ok",
    statusMessage: (r.status_message as string | null) ?? null,
    attributes: (r.attributes ?? {}) as Attributes,
    events: (r.events ?? []) as unknown[],
  }));
}

/** Keeps spans in memory, for tests. */
export function memorySpanSink(): SpanSink & { spans: SpanRecord[] } {
  const spans: SpanRecord[] = [];
  return { spans, write: async (s) => void spans.push(s) };
}

export interface TraceOptions {
  sink: SpanSink;
  appId: string;
  taskId?: string;
  traceId?: string;
  now?: () => number;
  redactor?: Redactor;
  attributes?: Attributes;
}

interface TraceState {
  traceId: string;
  taskId: string | null;
  sink: SpanSink;
  now: () => number;
  redact: Redactor;
}

export class ActiveSpan {
  readonly spanId = randomBytes(8).toString("hex");
  readonly attributes: Attributes = {};
  private status: { code: "ok" | "error"; message: string | null } = { code: "ok", message: null };
  constructor(
    readonly trace: TraceState,
    readonly name: string,
    readonly parentSpanId: string | null,
    readonly startTime: number,
  ) {}
  get traceId(): string {
    return this.trace.traceId;
  }
  set(attrs: Attributes): this {
    Object.assign(this.attributes, attrs);
    return this;
  }
  fail(err: unknown): void {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    this.status = { code: "error", message: `${name}: ${message}` };
    this.attributes[OSSUARY.errorClass] = name;
  }
  record(endTime: number): SpanRecord {
    return {
      spanId: this.spanId,
      traceId: this.trace.traceId,
      parentSpanId: this.parentSpanId,
      taskId: this.trace.taskId,
      name: this.name,
      startTime: new Date(this.startTime),
      endTime: new Date(endTime),
      statusCode: this.status.code,
      statusMessage: this.status.message,
      attributes: this.attributes,
      events: [],
    };
  }
}

const storage = new AsyncLocalStorage<ActiveSpan>();
const MESSAGE_ATTRIBUTES = [GEN_AI.systemInstructions, GEN_AI.inputMessages, GEN_AI.outputMessages];

export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function currentSpan(): ActiveSpan | undefined {
  return storage.getStore();
}

async function end(s: ActiveSpan): Promise<void> {
  const raw = s.record(s.trace.now());
  const attributes = s.trace.redact(raw.attributes);
  for (const key of MESSAGE_ATTRIBUTES) {
    if (Array.isArray(attributes[key])) attributes[key] = JSON.stringify(attributes[key]);
  }
  const record: SpanRecord = {
    ...raw,
    name: s.trace.redact(raw.name),
    statusMessage: s.trace.redact(raw.statusMessage),
    attributes,
    events: s.trace.redact(raw.events),
  };
  try {
    await s.trace.sink.write(record);
  } catch (err) {
    // Never log attribute values: they can hold prompt text (Requirement 22.8).
    console.error(`trace: span write failed (${err instanceof Error ? err.name : "unknown error"})`);
  }
}

async function run<T>(s: ActiveSpan, fn: (s: ActiveSpan) => Promise<T>): Promise<T> {
  try {
    return await storage.run(s, () => fn(s));
  } catch (err) {
    s.fail(err);
    throw err;
  } finally {
    await end(s);
  }
}

/** Open a task's trace and its root span (Requirement 22.1). */
export function withTrace<T>(opts: TraceOptions, fn: (root: ActiveSpan) => Promise<T>): Promise<T> {
  const state: TraceState = {
    traceId: opts.traceId ?? newTraceId(),
    taskId: opts.taskId ?? null,
    sink: opts.sink,
    now: opts.now ?? Date.now,
    redact: opts.redactor ?? createRedactor(process.env),
  };
  const root = new ActiveSpan(state, `${OPERATION.workflow} ${opts.appId}`, null, state.now());
  root.set({ [GEN_AI.operationName]: OPERATION.workflow, [GEN_AI.workflowName]: opts.appId, ...(opts.taskId ? { [OSSUARY.taskId]: opts.taskId } : {}), ...opts.attributes });
  return run(root, fn);
}

/** Add a child span to the current trace. Outside a trace, it just runs `fn`. */
export function span<T>(name: string, attrs: Attributes, fn: (s: ActiveSpan) => Promise<T>): Promise<T> {
  const parent = currentSpan();
  if (!parent) {
    const detached = new ActiveSpan({ traceId: "", taskId: null, sink: { write: async () => {} }, now: Date.now, redact: (v) => v }, name, null, Date.now());
    return fn(detached.set(attrs));
  }
  const child = new ActiveSpan(parent.trace, name, parent.spanId, parent.trace.now());
  child.set(attrs);
  return run(child, fn);
}
