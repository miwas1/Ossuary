import { describe, expect, it } from "vitest";
import { PolicyError } from "../errors.ts";
import { resolvePolicy } from "./policy.ts";

function policyError(fn: () => unknown): PolicyError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PolicyError);
    return e as PolicyError;
  }
  throw new Error("expected a PolicyError");
}

describe("resolvePolicy (Requirements 5 to 8)", () => {
  it("resolves every archetype, including the unbuilt ones", () => {
    expect(resolvePolicy("GEN-A1-R1").pattern).toBe("generate-evaluate");
    expect(resolvePolicy("EXT-A2-R2").pattern).toBe("pipeline");
    expect(resolvePolicy("ANS-A1-R1").pattern).toBe("retrieval-answer");
    expect(resolvePolicy("AGT-A3-R1").pattern).toBe("planner-executor");
    expect(resolvePolicy("CNV-A0-R2", { threshold: 0.6 }).pattern).toBe("realtime-split");
    expect(resolvePolicy("MON-A2-R1").thresholded).toBe(true);
  });

  it("names the invalid part of a code", () => {
    expect(policyError(() => resolvePolicy("GEN-A1")).field).toBe("code");
    expect(policyError(() => resolvePolicy("XYZ-A1-R1")).field).toBe("archetype");
    expect(policyError(() => resolvePolicy("GEN-A9-R1")).field).toBe("autonomy");
    expect(policyError(() => resolvePolicy("GEN-A1-R7")).field).toBe("risk");
  });

  it("refuses R4 with the restricted code", () => {
    const err = policyError(() => resolvePolicy("EXT-A2-R4"));
    expect(err.code).toBe("restricted");
    expect(err.message).toMatch(/EXT-A2-R4/);
    expect(err.message).toMatch(/not loaded/);
  });

  it("sets the autonomy rules", () => {
    const a0 = resolvePolicy("CNV-A0-R2");
    expect(a0.approval).toEqual({ reversible: "forbidden", irreversible: "forbidden" });
    expect(a0.release).toMatchObject({ measure: "pass@1", threshold: 0, targetRequired: true });
    expect(resolvePolicy("EXT-A2-R2").approval).toEqual({ reversible: "auto-with-undo", irreversible: "approve" });
    expect(resolvePolicy("GEN-A3-R1").approval.irreversible).toBe("auto");
    expect(resolvePolicy("GEN-A4-R1").release).toMatchObject({ measure: "pass^5", threshold: 0.95, longRuns: 10 });
  });

  it("switches risk controls on", () => {
    expect(resolvePolicy("GEN-A1-R1").safety).toMatchObject({ sets: ["standard"], requireThreatModel: false, reviewSample: "weekly-20" });
    expect(resolvePolicy("EXT-A2-R2").safety).toMatchObject({ requireThreatModel: true, privacyNote: true, expertLabels: "critical" });
    expect(resolvePolicy("EXT-A2-R3").safety).toMatchObject({ expertLabels: "all", fairness: true, reviewSample: "daily" });
  });

  it("lets an override raise the threshold but not lower it or change the measure", () => {
    expect(resolvePolicy("EXT-A2-R2", { threshold: 0.9 }).release.threshold).toBe(0.9);
    expect(resolvePolicy("EXT-A2-R2", { threshold: 0.85 }).release.threshold).toBe(0.85);
    const low = policyError(() => resolvePolicy("EXT-A2-R2", { threshold: 0.8 }));
    expect(low.code).toBe("override");
    expect(low.message).toMatch(/0\.8.*0\.85/);
    expect(policyError(() => resolvePolicy("EXT-A2-R2", { measure: "pass@1" })).field).toBe("release.measure");
    expect(policyError(() => resolvePolicy("EXT-A2-R2", { threshold: 1.5 })).field).toBe("release.threshold");
  });

  it("returns frozen, deeply equal policies for equal inputs", () => {
    const a = resolvePolicy("EXT-A2-R2");
    expect(a).toEqual(resolvePolicy("EXT-A2-R2"));
    expect(Object.isFrozen(a.safety.sets)).toBe(true);
    expect(() => {
      (a.release as { threshold: number }).threshold = 0;
    }).toThrow(TypeError);
  });
});
