// Drizzle schema for the shared `bones` tables (plan §6, Requirement 21). Money is integer
// micro-dollars in bigint columns; times are timestamptz. Phases 2 and 3 add columns by migration.
import { bigint, boolean, date, doublePrecision, index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const bones = pgSchema("bones");

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tasks = bones.table(
  "tasks",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    code: text("code").notNull(),
    traceId: text("trace_id").notNull(),
    status: text("status").notNull(),
    input: jsonb("input").notNull(),
    state: jsonb("state"),
    result: jsonb("result"),
    stopKind: text("stop_kind"),
    errorClass: text("error_class"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_app_workspace_created_idx").on(t.appId, t.workspaceId, t.createdAt)],
);

export const spans = bones.table(
  "spans",
  {
    spanId: text("span_id").primaryKey(),
    traceId: text("trace_id").notNull(),
    parentSpanId: text("parent_span_id"),
    taskId: text("task_id"),
    name: text("name").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    statusCode: text("status_code").notNull(),
    statusMessage: text("status_message"),
    attributes: jsonb("attributes").notNull().default({}),
    events: jsonb("events").notNull().default([]),
  },
  (t) => [index("spans_trace_idx").on(t.traceId)],
);

export const spend = bones.table(
  "spend",
  {
    appId: text("app_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    spentMicros: bigint("spent_micros", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.appId, t.workspaceId, t.day] })],
);

export const approvals = bones.table("approvals", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  decidedBy: text("decided_by"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const auditEvents = bones.table("audit_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  actor: text("actor").notNull(),
  event: text("event").notNull(),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});

export const evalRuns = bones.table("eval_runs", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull(),
  setName: text("set_name").notNull(),
  gitSha: text("git_sha"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary"),
});

export const evalResults = bones.table("eval_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  taskKey: text("task_key").notNull(),
  trial: integer("trial").notNull(),
  passed: boolean("passed").notNull(),
  score: doublePrecision("score"),
  costMicros: bigint("cost_micros", { mode: "number" }),
  detail: jsonb("detail"),
});

export const feedback = bones.table("feedback", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  rating: integer("rating").notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

export const BONES_TABLES = ["tasks", "spans", "approvals", "audit_events", "eval_runs", "eval_results", "feedback", "spend"] as const;
