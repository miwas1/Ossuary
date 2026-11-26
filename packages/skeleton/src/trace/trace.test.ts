import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.ts";
import { GEN_AI } from "./attributes.ts";
import { createRedactor } from "./redact.ts";
import { currentSpan, dbSpanSink, memorySpanSink, span, withTrace } from "./trace.ts";

describe("trace (Requirement 22)", () => {
  it("opens a root span and nests children under the current span", async () => {
    const sink = memorySpanSink();
    let traceId = "";
    await withTrace({ sink, appId: "echo", taskId: "t1" }, async (root) => {
      traceId = root.traceId;
      await span("step a", { "ossuary.step": "a" }, async (a) => {
        expect(currentSpan()).toBe(a);
        await span("chat x", {}, async () => {});
      });
    });
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    const byName = Object.fromEntries(sink.spans.map((s) => [s.name, s]));
    expect(byName["invoke_workflow echo"]?.attributes).toMatchObject({ [GEN_AI.operationName]: "invoke_workflow", [GEN_AI.workflowName]: "echo" });
    expect(byName["step a"]?.parentSpanId).toBe(byName["invoke_workflow echo"]?.spanId);
    expect(byName["chat x"]?.parentSpanId).toBe(byName["step a"]?.spanId);
    expect(sink.spans.every((s) => s.traceId === traceId && /^[0-9a-f]{16}$/.test(s.spanId))).toBe(true);
  });

  it("records an error status and rethrows", async () => {
    const sink = memorySpanSink();
    await expect(withTrace({ sink, appId: "echo" }, () => span("boom", {}, async () => Promise.reject(new TypeError("bad"))))).rejects.toThrow("bad");
    expect(sink.spans.find((s) => s.name === "boom")).toMatchObject({ statusCode: "error", statusMessage: "TypeError: bad" });
  });

  it("runs span() outside a trace without recording", async () => {
    expect(await span("loose", {}, async () => 42)).toBe(42);
  });

  it("logs a failed write without attribute values and lets the task go on", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await withTrace({ sink: { write: () => Promise.reject(new Error("db down")) }, appId: "echo", attributes: { secret: "ada@example.com" } }, async () => "done");
    expect(result).toBe("done");
    expect(log).toHaveBeenCalledWith("trace: span write failed (Error)");
    expect(JSON.stringify(log.mock.calls)).not.toContain("ada@example.com");
    log.mockRestore();
  });

  describe("on PGlite", () => {
    let h: DbHandle;
    beforeAll(async () => {
      h = await createDb("pglite://memory");
      await h.migrate();
    }, 60_000);
    afterAll(() => h.close());

    it("redacts a span before writing it to bones.spans", async () => {
      const redactor = createRedactor({ ANTHROPIC_API_KEY: "sk-ant-verysecret" });
      const traceId = await withTrace({ sink: dbSpanSink(h), appId: "echo", taskId: "t2", redactor }, async (root) => {
        await span("chat", { [GEN_AI.inputMessages]: "mail ada@example.com or call 0803 123 4567 with sk-ant-verysecret" }, async () => {});
        return root.traceId;
      });
      const rows = await h.execute(sql`select name, parent_span_id, task_id, attributes from bones.spans where trace_id = ${traceId} order by start_time, name`);
      expect(rows).toHaveLength(2);
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain("ada@example.com");
      expect(stored).not.toContain("0803 123 4567");
      expect(stored).not.toContain("sk-ant-verysecret");
      expect(stored).toContain("[email]");
      expect(rows.every((r) => r.task_id === "t2")).toBe(true);
    });
  });
});
