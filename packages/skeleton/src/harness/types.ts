// The contracts steps code against (plan §6 RunContext and Step, Phase 1 subset).
import type { ScopedGateway } from "../gateway/gateway.ts";
import type { Policy } from "../manifest/policy.ts";
import type { span } from "../trace/trace.ts";
import type { BudgetView } from "./budget.ts";

export interface RunContext {
  taskId: string;
  traceId: string;
  workspaceId: string;
  policy: Readonly<Policy>;
  /** Read-only: steps can look but not change a cap or a counter (Requirement 17.8). */
  budget: BudgetView;
  /** Bound to this task's budget, workspace, trace and this step's routing entry. */
  gateway: ScopedGateway;
  span: typeof span;
  /** The running step's name. */
  step: string;
  /** The round number in generateEvaluate; 0 in a pipeline. */
  round: number;
}

export interface Step<I = unknown, O = unknown> {
  /** Must appear in routing.yaml unless kind is "code". */
  name: string;
  kind: "model" | "code" | "action";
  reversible?: boolean;
  run(input: I, ctx: RunContext): Promise<O>;
}

export interface Verdict {
  pass: boolean;
  score: number;
  feedback: string;
}

export interface PipelinePattern {
  kind: "pipeline";
  steps: readonly Step<never, unknown>[];
}

export interface GenerateEvaluatePattern<I = unknown, C = unknown> {
  kind: "generate-evaluate";
  generate: Step<{ input: I; feedback: string | null; round: number }, C>;
  evaluate: Step<{ input: I; candidate: C; round: number }, Verdict>;
  maxRounds: number;
}

export type Pattern = PipelinePattern | GenerateEvaluatePattern<never, unknown>;

export interface GenerateEvaluateOutput<C = unknown> {
  candidate: C;
  verdict: Verdict;
  rounds: number;
  accepted: boolean;
}
