import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRedactor } from "./redact.ts";

const redact = createRedactor({});

const word = fc.stringMatching(/^[A-Za-z]{1,10}$/);
const naira = fc.tuple(fc.integer({ min: 0, max: 999_999 }), fc.integer({ min: 0, max: 99 })).map(([n, k]) => `₦${n.toLocaleString("en-NG")}.${String(k).padStart(2, "0")}`);
const isoDate = fc.date({ min: new Date("1990-01-01"), max: new Date("2099-12-31"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
const clock = fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
const shortNumber = fc.integer({ min: 0, max: 999_999 }).map(String);
// Each non-word token is followed by a word, so two numbers never sit side by side and read as one phone number.
const cleanText = fc.array(fc.tuple(fc.oneof(naira, isoDate, clock, shortNumber, word), word), { minLength: 1, maxLength: 12 }).map((pairs) => pairs.flat().join(" "));

const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constantFrom("0803 123 4567", "a@b.co", "+234 1 234 5678"),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 6 }), tie("value"), { maxKeys: 4 }),
  ),
})).value;

describe("redaction properties", () => {
  // Feature: 01-skeleton-core, Property P1-4: Redaction leaves clean text alone and is idempotent
  it("Property P1-4: clean text is unchanged", () => {
    fc.assert(
      fc.property(cleanText, (text) => {
        expect(redact(text)).toBe(text);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: 01-skeleton-core, Property P1-4: Redaction leaves clean text alone and is idempotent
  it("Property P1-4: redacting twice equals redacting once", () => {
    fc.assert(
      fc.property(json, (value) => {
        const once = redact(value);
        expect(redact(once)).toEqual(once);
      }),
      { numRuns: 300 },
    );
  });
});
