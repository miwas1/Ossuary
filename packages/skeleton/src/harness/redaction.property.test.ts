import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../db/client.ts";
import { fakeModelRegister, promptText } from "../gateway/fake.ts";
import { fakeGateway, memDb, tempApp } from "./__tests__/helpers.ts";
import { defineApp } from "./define-app.ts";
import { generateEvaluate, VerdictSchema } from "./generate-evaluate.ts";

const d = (n: number) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n }).map((a) => a.join(""));
const sep = fc.constantFrom(" ", "-", ".", "");
const mobilePrefix = fc.constantFrom("70", "71", "80", "81", "90", "91");

// Nigerian formats (Requirement 23.2) and any international number (23.3).
const phone = fc.oneof(
  // 11 digits: 0, the two-digit prefix, then 8 digits grouped 1+3+4, for example 0803 123 4567.
  fc.tuple(mobilePrefix, d(1), d(3), d(4), sep).map(([p, a, b, c, s]) => `0${p}${a}${s}${b}${s}${c}`),
  fc.tuple(mobilePrefix, d(1), d(3), d(4)).map(([p, a, b, c]) => `(0${p}${a}) ${b}-${c}`),
  fc.tuple(fc.constantFrom("+234 ", "234", "+234 (0) ", "+234-"), mobilePrefix, d(1), d(3), d(4), sep).map(([cc, p, a, b, c, s]) => `${cc}${p}${a}${s}${b}${s}${c}`),
  fc.tuple(d(3), d(4)).map(([a, b]) => `+234 1 ${a} ${b}`),
  fc.tuple(fc.integer({ min: 1, max: 9 }), d(2), d(4), d(4)).map(([c, a, b, e]) => `+${c}${a} ${b} ${e}`),
);
const email = fc.tuple(fc.stringMatching(/^[a-z][a-z0-9._]{0,10}$/), fc.stringMatching(/^[a-z]{2,10}$/), fc.constantFrom("com", "ng", "com.ng", "io")).map(([l, dom, tld]) => `${l}@${dom}.${tld}`);
const word = fc.stringMatching(/^[A-Za-z]{1,8}$/);
const planted = fc.array(fc.oneof(phone, email), { minLength: 1, maxLength: 4 });
const input = fc.tuple(planted, fc.array(word, { minLength: 1, maxLength: 6 })).map(([pii, words]) => ({ pii, text: [...words, ...pii.flatMap((p) => [p, "and"])].join(" ") }));

describe("redaction before storage", () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = await memDb();
  }, 60_000);
  afterAll(() => db.close());

  // Feature: 01-skeleton-core, Property 8: Stored spans never contain the email addresses or phone numbers planted in generated inputs
  it("Property 8: no planted email or phone number reaches bones.spans", async () => {
    const models = fakeModelRegister();
    const dir = tempApp({ code: "GEN-A1-R1", routing: { generate: { tier: "small", effort: "low" }, evaluate: { tier: "mid", effort: "low", role: "judge" } } });
    const app = defineApp({
      dir,
      models,
      pattern: generateEvaluate<string, string>({
        generate: { name: "generate", kind: "model", run: async ({ input }, ctx) => (await ctx.gateway.call({ system: "Echo the text.", turn: [{ role: "user", content: input }] })).value },
        evaluate: {
          name: "evaluate",
          kind: "model",
          run: async ({ input, candidate }, ctx) => (await ctx.gateway.call({ system: "judge", turn: [{ role: "user", content: `${input}\n${candidate}` }], schema: VerdictSchema })).value,
        },
        maxRounds: 1,
      }),
    });
    // The fake echoes its whole prompt, so planted values reach the input and output messages.
    const { gateway } = fakeGateway((req) =>
      req.modelId.endsWith(":mid") ? { kind: "ok", text: JSON.stringify({ pass: true, score: 1, feedback: promptText(req) }) } : { kind: "ok", text: promptText(req) },
    );

    await fc.assert(
      fc.asyncProperty(input, async ({ pii, text }) => {
        const res = await app.runTask({ input: text, db, gateway });
        expect(res.status).toBe("completed");
        const rows = await db.execute(sql`select name, status_message, attributes, events from bones.spans where trace_id = ${res.traceId}`);
        expect(rows.length).toBeGreaterThanOrEqual(5);
        const stored = JSON.stringify(rows);
        for (const value of pii) {
          expect(stored).not.toContain(value);
          if (!value.includes("@")) expect(stored).not.toContain(value.replace(/\D/g, ""));
        }
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
