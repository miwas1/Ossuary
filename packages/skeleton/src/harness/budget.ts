// Hard limits on steps, tokens, time and spend, enforced in code (HAR-05, Requirement 17).
// Active time is summed across restarts (D-53); the clock is injected so properties can control it.
import { BudgetExceeded, type BudgetKind } from "../errors.ts";

export interface BudgetCaps {
  steps: number;
  tokens: number;
  activeMs: number;
  spendMicros: number;
}

export interface BudgetUsed {
  steps: number;
  tokens: number;
  activeMs: number;
  spendMicros: number;
  overrun: boolean;
}

export interface Reservation {
  readonly tokens: number;
  readonly micros: number;
  open: boolean;
}

/** What a step can see: read-only numbers and a time check (Requirement 17.8). */
export interface BudgetView {
  readonly caps: Readonly<BudgetCaps>;
  used(): Readonly<BudgetUsed>;
  remaining(): Readonly<Omit<BudgetCaps, "steps"> & { steps: number }>;
  check(): void;
}

export class Budget {
  readonly caps: Readonly<BudgetCaps>;
  private readonly now: () => number;
  private readonly base: BudgetUsed;
  private resumedAt: number;
  private overrunKind: BudgetKind | null = null;

  constructor(caps: BudgetCaps, opts: { now?: () => number; used?: BudgetUsed } = {}) {
    this.caps = Object.freeze({ ...caps });
    this.now = opts.now ?? Date.now;
    this.base = { steps: 0, tokens: 0, activeMs: 0, spendMicros: 0, overrun: false, ...opts.used };
    if (this.base.overrun) this.overrunKind = "spend";
    this.resumedAt = this.now();
  }

  activeMs(): number {
    return this.base.activeMs + Math.max(0, this.now() - this.resumedAt);
  }

  remainingMs(): number {
    return Math.max(0, this.caps.activeMs - this.activeMs());
  }

  timeExceeded(): BudgetExceeded {
    return new BudgetExceeded("seconds", this.caps.activeMs, Math.max(this.caps.activeMs, this.activeMs()));
  }

  /** Throws BudgetExceeded("seconds") once active time reaches the cap. */
  check(): void {
    if (this.remainingMs() === 0) throw this.timeExceeded();
  }

  startStep(): void {
    this.check();
    if (this.base.steps + 1 > this.caps.steps) throw new BudgetExceeded("steps", this.caps.steps, this.base.steps + 1);
    this.base.steps += 1;
  }

  /** Hold tokens and spend for a call before it is sent (Requirements 13.1, 17.3). */
  reserve(tokens: number, micros: number): Reservation {
    this.check();
    if (this.overrunKind) {
      const used = this.overrunKind === "tokens" ? this.base.tokens : this.base.spendMicros;
      throw new BudgetExceeded(this.overrunKind, this.overrunKind === "tokens" ? this.caps.tokens : this.caps.spendMicros, used);
    }
    if (this.base.tokens + tokens > this.caps.tokens) throw new BudgetExceeded("tokens", this.caps.tokens, this.base.tokens + tokens);
    if (this.base.spendMicros + micros > this.caps.spendMicros) throw new BudgetExceeded("spend", this.caps.spendMicros, this.base.spendMicros + micros);
    this.base.tokens += tokens;
    this.base.spendMicros += micros;
    return { tokens, micros, open: true };
  }

  /** Replace a reservation with the actual usage. Returns true when the actual exceeded the reservation. */
  settle(r: Reservation, tokens: number, micros: number): boolean {
    if (!r.open) return false;
    r.open = false;
    this.base.tokens += tokens - r.tokens;
    this.base.spendMicros += micros - r.micros;
    const over = tokens > r.tokens || micros > r.micros;
    if (over) {
      this.base.overrun = true;
      this.overrunKind = micros > r.micros ? "spend" : "tokens";
    }
    return over;
  }

  release(r: Reservation): void {
    if (!r.open) return;
    r.open = false;
    this.base.tokens -= r.tokens;
    this.base.spendMicros -= r.micros;
  }

  /** Counters for the task state; active time includes the time since resume. */
  snapshot(): BudgetUsed {
    return { ...this.base, activeMs: this.activeMs() };
  }

  view(): BudgetView {
    const caps = this.caps;
    return Object.freeze({
      caps,
      used: () => Object.freeze(this.snapshot()),
      remaining: () =>
        Object.freeze({
          steps: caps.steps - this.base.steps,
          tokens: caps.tokens - this.base.tokens,
          activeMs: this.remainingMs(),
          spendMicros: caps.spendMicros - this.base.spendMicros,
        }),
      check: () => this.check(),
    });
  }
}
