// Echo end to end on in-memory PGlite with the fake provider (Requirement 26.6).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDb, createFakeProvider, createGateway, fakeModelRegister, readTrace, type DbHandle, type GenerateEvaluateOutput, type SpanRecord } from "@ossuary/skeleton";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEchoApp } from "./domain/app.ts";
import { countWords, wordLimit } from "./domain/word-limit.ts";
import { echoFakeProvider, FAKE_EPITAPH } from "./fake.ts";

const CALL_ATTRIBUTES = [
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.request.model",
  "gen_ai.response.model",
  "gen_ai.request.max_tokens",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.cache_read.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.response.finish_reasons",
];

describe("Echo end to end", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await createDb("pglite://memory");
    await db.migrate();
  }, 60_000);
  afterAll(() => db.close());

  it("completes a task and leaves one full trace with a separate judge model", async () => {
    const app = createEchoApp({ models: fakeModelRegister() });
    expect(app.policy.code).toBe("GEN-A1-R1");
    const gateway = createGateway({ models: app.models, db, providers: [echoFakeProvider()], vendorAdapters: false });
    const res = await app.runTask<GenerateEvaluateOutput<string>>({ input: { topic: "a lighthouse keeper" }, db, gateway });
    expect(res.status).toBe("completed");
    expect(res.output).toMatchObject({ accepted: true, rounds: 1, candidate: FAKE_EPITAPH });

    const rows = await readTrace(db, res.traceId);
    expect(rows.every((r) => r.traceId === res.traceId && r.taskId === res.taskId)).toBe(true);
    const byName = (n: string) => rows.filter((r) => r.name === n);
    const root = byName("invoke_workflow echo")[0]!;
    expect(root.parentSpanId).toBeNull();
    const gen = byName("step generate")[0]!;
    const evaluate = byName("step evaluate")[0]!;
    expect(gen.parentSpanId).toBe(root.spanId);
    expect(evaluate.parentSpanId).toBe(root.spanId);
    const genCall = rows.find((r) => r.parentSpanId === gen.spanId)!;
    const judgeCall = rows.find((r) => r.parentSpanId === evaluate.spanId)!;
    for (const call of [genCall, judgeCall]) {
      expect(call.name).toMatch(/^chat /);
      for (const key of CALL_ATTRIBUTES) expect(call.attributes, key).toHaveProperty([key]);
    }
    const served = (c: SpanRecord) => `${c.attributes["gen_ai.provider.name"]}:${c.attributes["gen_ai.response.model"]}`;
    expect(served(judgeCall)).not.toBe(served(genCall));
  });

  it("counts words and rejects empty text or more than 25 words", () => {
    expect(countWords("  one two\nthree ")).toBe(3);
    expect(wordLimit("word ".repeat(25)).ok).toBe(true);
    expect(wordLimit("word ".repeat(26))).toEqual({ ok: false, words: 26 });
    expect(wordLimit("   ").ok).toBe(false);
  });

  it("rejects a long epitaph in code on every round without calling the judge", async () => {
    const app = createEchoApp({ models: fakeModelRegister() });
    const long = "word ".repeat(26).trim();
    const provider = createFakeProvider([{ kind: "ok", text: long }]);
    const gateway = createGateway({ models: app.models, db, providers: [provider], vendorAdapters: false });
    const res = await app.runTask({ input: { topic: "a lighthouse keeper" }, db, gateway });
    expect(res).toMatchObject({ status: "completed", output: { accepted: false, rounds: 3, candidate: long } });
    expect(provider.requests.map((req) => req.modelId)).toEqual(Array(3).fill(app.models.tiers.small.primary));
  });

  it("exits non-zero naming DATABASE_URL when it is unset", () => {
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    const out = spawnSync(process.execPath, ["--import", "tsx", cli, "--fake", "a topic"], {
      env: { ...process.env, DATABASE_URL: "", ECHO_NO_ENV_FILE: "1" },
      timeout: 25_000,
      encoding: "utf8",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    });
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("DATABASE_URL");
  }, 30_000);
});
