import fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as skeleton from "./index.ts";

describe("public entry (Requirement 1)", () => {
  it.each([
    "loadProduct",
    "resolvePolicy",
    "createGateway",
    "createFakeProvider",
    "fakeModelRegister",
    "estimateCalibration",
    "defineApp",
    "runTask",
    "pipeline",
    "generateEvaluate",
    "VerdictSchema",
    "Budget",
    "withTrace",
    "span",
    "redact",
    "createDb",
    "ManifestError",
    "PolicyError",
    "GatewayError",
    "PromptTooLongError",
    "JudgeConflictError",
    "PriceMissingError",
    "StructuredOutputError",
    "BudgetExceeded",
    "DemoModeOnlyError",
    "PatternNotBuiltError",
    "TaskStateError",
    "ProviderError",
  ])("exports %s", (name) => {
    expect(skeleton).toHaveProperty(name);
  });

  it("exposes the kill switch on the gateway", () => {
    const g = skeleton.createGateway({ models: skeleton.fakeModelRegister(), providers: [skeleton.createFakeProvider([])], vendorAdapters: false });
    expect(typeof g.killPrimary).toBe("function");
    expect(typeof g.revivePrimary).toBe("function");
    expect(g.killedVendors()).toEqual([]);
  });

  it("lists only the package root in exports (D-07)", () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> };
    expect(Object.keys(pkg.exports)).toEqual(["."]);
  });
});
