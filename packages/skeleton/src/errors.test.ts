import { describe, expect, it } from "vitest";
import {
  BudgetExceeded,
  DemoModeOnlyError,
  GatewayError,
  JudgeConflictError,
  ManifestError,
  PatternNotBuiltError,
  PolicyError,
  PriceMissingError,
  PromptTooLongError,
  ProviderError,
  StructuredOutputError,
  TaskStateError,
} from "./errors.ts";

describe("typed errors (Requirement 1.1)", () => {
  const cases: [Error & { code: string }, string, string][] = [
    [new ManifestError("product.yaml", [{ path: "id", message: "Required" }]), "ManifestError", "manifest"],
    [new PolicyError("restricted", "risk", "R4"), "PolicyError", "restricted"],
    [new GatewayError("no provider"), "GatewayError", "gateway"],
    [new PromptTooLongError(10, [{ model: "fake:a", limit: 5 }], []), "PromptTooLongError", "prompt_too_long"],
    [new JudgeConflictError(["fake:a"], []), "JudgeConflictError", "judge_conflict"],
    [new PriceMissingError("fake:a"), "PriceMissingError", "price_missing"],
    [new StructuredOutputError(["pass: Required"]), "StructuredOutputError", "structured_output"],
    [new BudgetExceeded("tokens", 10, 11), "BudgetExceeded", "budget_exceeded"],
    [new DemoModeOnlyError("killPrimary"), "DemoModeOnlyError", "demo_mode_only"],
    [new PatternNotBuiltError("planner-executor", "AGT"), "PatternNotBuiltError", "pattern_not_built"],
    [new TaskStateError("generate", "is not JSON"), "TaskStateError", "task_state"],
    [new ProviderError("rate_limited", "429", { status: 429, retryAfterMs: 500 }), "ProviderError", "provider_rate_limited"],
  ];

  it.each(cases)("%s sets name and code", (err, name, code) => {
    expect(err.name).toBe(name);
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(Error);
  });

  it("keeps subclasses catchable as GatewayError", () => {
    expect(new PromptTooLongError(1, [], [])).toBeInstanceOf(GatewayError);
    expect(new JudgeConflictError([], [])).toBeInstanceOf(GatewayError);
  });

  it("lists every manifest issue in the message", () => {
    const err = new ManifestError("routing.yaml", [
      { path: "steps.a.tier", message: "Invalid option" },
      { path: "steps.b", message: "Unrecognized key: \"x\"" },
    ]);
    expect(err.message).toContain("steps.a.tier: Invalid option");
    expect(err.message).toContain("steps.b: Unrecognized key");
  });
});
