import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PolicyError } from "../errors.ts";
import { ARCHETYPES, AUTONOMY, RISK, resolvePolicy } from "./policy.ts";

const archetype = fc.constantFrom(...(Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[]));
const autonomy = fc.constantFrom(...(Object.keys(AUTONOMY) as (keyof typeof AUTONOMY)[]));
const risk = fc.constantFrom(...(Object.keys(RISK) as (keyof typeof RISK)[]));
const code = fc.tuple(archetype, autonomy, risk);
const measure = fc.constantFrom("pass@1", "accept-rate", "pass^3", "pass^5", "made-up");
const override = fc.option(
  fc.record({ threshold: fc.option(fc.double({ min: -0.5, max: 1.5, noNaN: true }), { nil: undefined }), measure: fc.option(measure, { nil: undefined }) }),
  { nil: undefined },
);

describe("policy properties", () => {
  // Feature: 01-skeleton-core, Property 1: An override never lowers a resolved threshold
  it("Property 1: an override never lowers a resolved threshold", () => {
    fc.assert(
      fc.property(code, override, ([a, l, r], o) => {
        const row = AUTONOMY[l];
        const shouldAccept =
          (o?.measure === undefined || o.measure === row.measure) &&
          (o?.threshold === undefined || (o.threshold >= 0 && o.threshold <= 1 && o.threshold >= row.threshold));
        let policy;
        try {
          policy = resolvePolicy(`${a}-${l}-${r}`, o);
        } catch (e) {
          expect(e).toBeInstanceOf(PolicyError);
          expect((e as PolicyError).code).toBe("override");
          expect(shouldAccept).toBe(false);
          return;
        }
        expect(shouldAccept).toBe(true);
        expect(policy.release.threshold).toBeGreaterThanOrEqual(row.threshold);
        if (o?.threshold !== undefined) expect(policy.release.threshold).toBe(o.threshold);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: 01-skeleton-core, Property P1-1: Each code axis drives only its own Policy fields
  it("Property P1-1: each part of the code drives only its own policy fields", () => {
    fc.assert(
      fc.property(code, code, ([a1, l1, r1], [a2, l2, r2]) => {
        const p = resolvePolicy(`${a1}-${l1}-${r1}`);
        const q = resolvePolicy(`${a2}-${l2}-${r2}`);
        const archFields = (x: typeof p) => ({ pattern: x.pattern, thresholded: x.thresholded, grader: x.grader, pricingUnit: x.pricingUnit, northStar: x.northStar, steering: x.steering });
        const sameArch = JSON.stringify(archFields(p)) === JSON.stringify(archFields(q));
        const sameAuto = JSON.stringify([p.approval, p.release]) === JSON.stringify([q.approval, q.release]);
        const sameRisk = JSON.stringify(p.safety) === JSON.stringify(q.safety);
        expect(sameArch).toBe(a1 === a2);
        expect(sameAuto).toBe(l1 === l2);
        expect(sameRisk).toBe(r1 === r2);
      }),
      { numRuns: 300 },
    );
  });
});
