import { describe, expect, it } from "vitest";
import { createRedactor, redactText, secretValues } from "./redact.ts";

const r = createRedactor({});

describe("redaction (Requirement 23)", () => {
  it.each([
    "0803 123 4567",
    "08031234567",
    "(0803) 123-4567",
    "0705.123.4567",
    "0913-123-4567",
    "+234 803 123 4567",
    "2348031234567",
    "+234 (0) 803 123 4567",
    "+234-810-123-4567",
    "+234 1 234 5678",
    "+44 20 7946 0958",
  ])("replaces %s with [phone]", (phone) => {
    expect(r(`call ${phone} today`)).toBe("call [phone] today");
  });

  it("replaces email addresses", () => {
    expect(r("mail ada.obi+receipts@example.com.ng now")).toBe("mail [email] now");
  });

  it("does not swallow a neighbouring number", () => {
    expect(r("08031234567 12 times")).toBe("[phone] 12 times");
  });

  it("leaves amounts, dates, times and short numbers alone", () => {
    const clean = "₦12,500.00 on 2026-11-26 at 14:30, ref 482913, qty 3";
    expect(r(clean)).toBe(clean);
  });

  it("walks objects and arrays and leaves keys alone", () => {
    expect(r({ "a@b.co": ["x@y.io", { n: "08031234567" }], count: 2 })).toEqual({ "a@b.co": ["[email]", { n: "[phone]" }], count: 2 });
  });

  it("replaces secret values from the environment, longest first", () => {
    const env = { OPENAI_API_KEY: "sk-test-abcdefgh", DB_PASSWORD: "hunter2hunter2", SHORT_TOKEN: "abc", HOME: "/home/someone-long" };
    expect(secretValues(env)).toEqual(["sk-test-abcdefgh", "hunter2hunter2"]);
    expect(createRedactor(env)("key sk-test-abcdefgh and hunter2hunter2 at /home/someone-long")).toBe("key [secret] and [secret] at /home/someone-long");
    expect(redactText("DATABASE_URL leak", [])).toBe("DATABASE_URL leak");
  });
});
