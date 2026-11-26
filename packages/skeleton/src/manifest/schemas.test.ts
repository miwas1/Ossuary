import { describe, expect, it } from "vitest";
import { ModelsSchema, ProductSchema, RoutingSchema, isPlaceholder, toIssues, vendorOf } from "./schemas.ts";

const validProduct = {
  id: "echo",
  name: "Echo",
  code: "GEN-A1-R1",
  users: "The builder",
  market: ["NG"],
  north_star: "accepted epitaphs",
  pricing: { model: "per_unit", unit: "epitaph", currency: "USD" },
  routing: "./routing.yaml",
  evals: { dir: "./evals", core_set: "core" },
  limits: { max_steps: 8, max_tokens: 20000, max_seconds: 60, max_spend_usd: 0.02, max_workspace_spend_usd_per_day: 0.5 },
};

const price = { input: 0.1, cached_input: 0.01, output: 0.5, currency: "USD", source: "https://example.com/pricing", checked: "2026-11-26" };

function issuesOf(result: { success: boolean; error?: unknown }): string[] {
  expect(result.success).toBe(false);
  return toIssues(result.error as never).map((i) => `${i.path}: ${i.message}`);
}

describe("product.yaml schema (Requirement 2)", () => {
  it("accepts a full manifest with optional blocks", () => {
    const r = ProductSchema.safeParse({ ...validProduct, interfaces: { mcp: { path: "/api/mcp", tools: ["x"] }, skills: ["s"] }, costume: "crypt", release: { threshold: 0.8 } });
    expect(r.success).toBe(true);
  });

  it("names a missing field", () => {
    const { users: _users, ...rest } = validProduct;
    expect(issuesOf(ProductSchema.safeParse(rest)).join("\n")).toMatch(/^users: /m);
  });

  it("names a wrong type and an unknown key", () => {
    const issues = issuesOf(ProductSchema.safeParse({ ...validProduct, market: "NG", colour: "red" })).join("\n");
    expect(issues).toMatch(/^market: /m);
    expect(issues).toMatch(/colour/);
  });

  it("rejects non-positive and non-integer limits, a bad currency and a threshold above 1", () => {
    const issues = issuesOf(
      ProductSchema.safeParse({
        ...validProduct,
        pricing: { ...validProduct.pricing, currency: "naira" },
        limits: { ...validProduct.limits, max_steps: 0, max_tokens: 1.5 },
        release: { threshold: 1.2 },
      }),
    ).join("\n");
    expect(issues).toMatch(/^pricing\.currency: /m);
    expect(issues).toMatch(/^limits\.max_steps: /m);
    expect(issues).toMatch(/^limits\.max_tokens: /m);
    expect(issues).toMatch(/^release\.threshold: /m);
  });
});

describe("routing.yaml schema (Requirement 3)", () => {
  it("accepts model and code steps", () => {
    const r = RoutingSchema.safeParse({
      steps: { extract: { tier: "small", effort: "medium" }, validate: { kind: "code" }, grade: { tier: "mid", effort: "low", role: "judge", timeout_ms: 1000, max_output_tokens: 10, max_retry_wait_ms: 0 } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad tiers, efforts, roles and out-of-range numbers", () => {
    for (const step of [
      { tier: "huge", effort: "low" },
      { tier: "small", effort: "max" },
      { tier: "small", effort: "low", role: "critic" },
      { tier: "small", effort: "low", timeout_ms: 999 },
      { tier: "small", effort: "low", max_output_tokens: 64_001 },
      { tier: "small", effort: "low", max_retry_wait_ms: 2_001 },
      { tier: "small", effort: "low", extra: 1 },
    ]) {
      expect(RoutingSchema.safeParse({ steps: { a: step } }).success, JSON.stringify(step)).toBe(false);
    }
  });

  it("rejects an empty table and upper-case step names", () => {
    expect(RoutingSchema.safeParse({ steps: {} }).success).toBe(false);
    expect(RoutingSchema.safeParse({ steps: { Extract: { kind: "code" } } }).success).toBe(false);
  });
});

describe("models.yaml schema (Requirement 4)", () => {
  const tiers = { small: { primary: "a:one", fallback: "b:two" }, mid: { primary: "a:one", fallback: "b:<id>" }, frontier: { primary: "a:one", fallback: "b:two" } };

  it("accepts tiers and prices with the optional fields", () => {
    const r = ModelsSchema.safeParse({ tiers, prices: { "a:one": { ...price, cache_write_input: 0.125, max_prompt_tokens: 100000, image_input_tokens: 1500 } } });
    expect(r.success).toBe(true);
  });

  it("rejects a bad model ID, a missing tier, a seven-decimal price and a bad date", () => {
    expect(ModelsSchema.safeParse({ tiers: { ...tiers, small: { primary: "nocolon", fallback: "b:two" } }, prices: {} }).success).toBe(false);
    expect(ModelsSchema.safeParse({ tiers: { small: tiers.small, mid: tiers.mid }, prices: {} }).success).toBe(false);
    expect(ModelsSchema.safeParse({ tiers, prices: { "a:one": { ...price, input: 0.1234567 } } }).success).toBe(false);
    expect(ModelsSchema.safeParse({ tiers, prices: { "a:one": { ...price, checked: "26/11/2026" } } }).success).toBe(false);
  });

  it("splits model IDs and spots placeholders", () => {
    expect(vendorOf("openai:some-model")).toBe("openai");
    expect(isPlaceholder("google:<id>")).toBe(true);
    expect(isPlaceholder("google:real")).toBe(false);
  });
});
