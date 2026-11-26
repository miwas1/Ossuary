import { describe, expect, it } from "vitest";
import { BudgetExceeded } from "../errors.ts";
import { manualClock } from "./__tests__/helpers.ts";
import { Budget } from "./budget.ts";
import { parseState, toJsonOutput } from "./task-state.ts";

const caps = { steps: 2, tokens: 1_000, activeMs: 5_000, spendMicros: 500 };
const kind = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BudgetExceeded);
    return (e as BudgetExceeded).kind;
  }
  return "none";
};

describe("Budget (Requirement 17)", () => {
  it("refuses a step past max_steps", () => {
    const b = new Budget(caps);
    b.startStep();
    b.startStep();
    expect(kind(() => b.startStep())).toBe("steps");
    expect(b.snapshot().steps).toBe(2);
  });

  it("reserves, settles and releases tokens and spend", () => {
    const b = new Budget(caps);
    const r = b.reserve(600, 300);
    expect(kind(() => b.reserve(500, 1))).toBe("tokens");
    expect(kind(() => b.reserve(1, 201))).toBe("spend");
    expect(b.settle(r, 100, 50)).toBe(false);
    expect(b.snapshot()).toMatchObject({ tokens: 100, spendMicros: 50 });
    const r2 = b.reserve(10, 10);
    b.release(r2);
    expect(b.snapshot()).toMatchObject({ tokens: 100, spendMicros: 50 });
  });

  it("refuses every later charge after an overrun", () => {
    const b = new Budget(caps);
    expect(b.settle(b.reserve(10, 10), 10, 20)).toBe(true);
    expect(b.snapshot().overrun).toBe(true);
    expect(kind(() => b.reserve(1, 1))).toBe("spend");
  });

  it("counts active time across restarts and stops at the cap", () => {
    const clock = manualClock();
    const first = new Budget(caps, { now: clock.now });
    clock.advance(3_000);
    const saved = first.snapshot();
    expect(saved.activeMs).toBe(3_000);
    clock.advance(86_400_000); // a day passes while nothing runs
    const resumed = new Budget(caps, { now: clock.now, used: saved });
    expect(resumed.remainingMs()).toBe(2_000);
    clock.advance(2_000);
    expect(kind(() => resumed.check())).toBe("seconds");
    expect(kind(() => resumed.reserve(1, 1))).toBe("seconds");
  });

  it("gives steps a view with no way to change a cap or a counter", () => {
    const b = new Budget(caps);
    const view = b.view();
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.caps)).toBe(true);
    expect("reserve" in view).toBe(false);
    expect(view.remaining().tokens).toBe(1_000);
  });
});

describe("task state (Requirement 20)", () => {
  it("refuses outputs that don't survive JSON", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const bad of [new Date(0), new Map([[1, 2]]), { a: undefined }, undefined, cyclic, 10n]) {
      expect(() => toJsonOutput("s", bad)).toThrow(/task state for step "s"/);
    }
    expect(toJsonOutput("s", { a: [1, "x", null, true] })).toEqual({ a: [1, "x", null, true] });
  });

  it("rejects invalid saved state", () => {
    expect(() => parseState({ version: 2 })).toThrow(/saved state is invalid/);
  });
});
