// Every typed error the skeleton throws (Requirement 1.1). Each carries a string `code`, and no
// message holds a secret, prompt text or a URL (SEC-03).

export class OssuaryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export interface ManifestIssue {
  path: string;
  message: string;
}

/** A product.yaml, routing.yaml or models.yaml problem, or an app definition that doesn't fit its policy. */
export class ManifestError extends OssuaryError {
  readonly file: string;
  readonly issues: readonly ManifestIssue[];
  constructor(file: string, issues: readonly ManifestIssue[], summary?: string) {
    const lines = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message));
    super("manifest", `${file}: ${summary ?? (lines.length === 1 ? lines[0] : `${lines.length} problems`)}${lines.length > 1 || summary ? `\n  ${lines.join("\n  ")}` : ""}`);
    this.file = file;
    this.issues = issues;
  }
}

export type PolicyErrorCode = "invalid" | "restricted" | "override";

export class PolicyError extends OssuaryError {
  readonly field: string;
  constructor(code: PolicyErrorCode, field: string, message: string) {
    super(code, message);
    this.field = field;
  }
}

export type FailureClass = "server" | "rate_limited" | "timeout" | "client";
export type SkipReason = "killed" | "prompt_too_long" | "no_image_allowance" | "judge_excluded";

export interface AttemptRecord {
  model: string;
  outcome: FailureClass | SkipReason;
}

export class GatewayError extends OssuaryError {
  readonly attempts: readonly AttemptRecord[];
  constructor(message: string, attempts: readonly AttemptRecord[] = [], code = "gateway") {
    const detail = attempts.length ? ` (${attempts.map((a) => `${a.model}: ${a.outcome}`).join("; ")})` : "";
    super(code, `${message}${detail}`);
    this.attempts = attempts;
  }
}

export class PromptTooLongError extends GatewayError {
  readonly estimate: number;
  readonly limits: readonly { model: string; limit: number | null }[];
  constructor(estimate: number, limits: readonly { model: string; limit: number | null }[], attempts: readonly AttemptRecord[]) {
    super(
      `prompt token estimate ${estimate} fits no candidate model [${limits.map((l) => `${l.model} limit ${l.limit ?? "none"}`).join(", ")}]`,
      attempts,
      "prompt_too_long",
    );
    this.estimate = estimate;
    this.limits = limits;
  }
}

export class JudgeConflictError extends GatewayError {
  readonly excluded: readonly string[];
  constructor(excluded: readonly string[], attempts: readonly AttemptRecord[]) {
    super(`no judge model is left once the generator's models are excluded (${excluded.join(", ")})`, attempts, "judge_conflict");
    this.excluded = excluded;
  }
}

export class PriceMissingError extends OssuaryError {
  readonly model: string;
  constructor(model: string) {
    super("price_missing", `no price for ${model} in models.yaml; the gateway never calls an unpriced model`);
    this.model = model;
  }
}

export class StructuredOutputError extends OssuaryError {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super("structured_output", `model output failed validation after one repair: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

export type BudgetKind = "steps" | "tokens" | "seconds" | "spend";
export type BudgetScope = "task" | "workspace";

export class BudgetExceeded extends OssuaryError {
  readonly kind: BudgetKind;
  readonly scope: BudgetScope;
  readonly limit: number;
  readonly used: number;
  constructor(kind: BudgetKind, limit: number, used: number, scope: BudgetScope = "task") {
    super("budget_exceeded", `${scope} ${kind} cap reached: ${used} used of ${limit}`);
    this.kind = kind;
    this.scope = scope;
    this.limit = limit;
    this.used = used;
  }
}

export class DemoModeOnlyError extends OssuaryError {
  constructor(what: string) {
    super("demo_mode_only", `${what} works only when DEMO_MODE=true`);
  }
}

export class PatternNotBuiltError extends OssuaryError {
  readonly pattern: string;
  constructor(pattern: string, detail: string) {
    super("pattern_not_built", `pattern "${pattern}" is not built yet: ${detail}`);
    this.pattern = pattern;
  }
}

export class TaskStateError extends OssuaryError {
  readonly step: string;
  constructor(step: string, problem: string) {
    super("task_state", `task state for step "${step}" ${problem}`);
    this.step = step;
  }
}

/** A provider's failure. `partialText` holds any text received before the failure; the gateway never reads it. */
export class ProviderError extends OssuaryError {
  readonly failureClass: FailureClass;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly partialText: string | undefined;
  constructor(failureClass: FailureClass, message: string, opts: { status?: number; retryAfterMs?: number; partialText?: string } = {}) {
    super(`provider_${failureClass}`, message);
    this.failureClass = failureClass;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.partialText = opts.partialText;
  }
}
