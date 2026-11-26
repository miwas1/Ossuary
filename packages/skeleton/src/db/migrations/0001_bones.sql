CREATE SCHEMA "bones";
--> statement-breakpoint
CREATE TABLE "bones"."approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bones"."audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bones"."eval_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"task_key" text NOT NULL,
	"trial" integer NOT NULL,
	"passed" boolean NOT NULL,
	"score" double precision,
	"cost_micros" bigint,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "bones"."eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"set_name" text NOT NULL,
	"git_sha" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "bones"."feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"rating" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bones"."spans" (
	"span_id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"parent_span_id" text,
	"task_id" text,
	"name" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status_code" text NOT NULL,
	"status_message" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bones"."spend" (
	"app_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"day" date NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "spend_app_id_workspace_id_day_pk" PRIMARY KEY("app_id","workspace_id","day")
);
--> statement-breakpoint
CREATE TABLE "bones"."tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"code" text NOT NULL,
	"trace_id" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"state" jsonb,
	"result" jsonb,
	"stop_kind" text,
	"error_class" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "spans_trace_idx" ON "bones"."spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "tasks_app_workspace_created_idx" ON "bones"."tasks" USING btree ("app_id","workspace_id","created_at");