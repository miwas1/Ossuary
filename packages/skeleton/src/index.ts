// @ossuary/skeleton public entry point. Apps import only from here (ARCH-02, Requirement 1.1).

// manifest
export { loadProduct, type LoadedProduct } from "./manifest/load.ts";
export { resolvePolicy, type Policy, type Archetype, type Autonomy, type Risk, type Approval, type Measure } from "./manifest/policy.ts";
export type { Product, Routing, Models, Price, Tier, Effort } from "./manifest/schemas.ts";

// gateway
export { createGateway, type Gateway, type GatewayOptions, type ScopedGateway, type CallResult } from "./gateway/gateway.ts";
export { createFakeProvider, fakeModelRegister, type FakeOutcome, type FakeProvider, type FakeScript } from "./gateway/fake.ts";
export { estimateCalibration, type Calibration } from "./gateway/calibration.ts";
export type { CallRequest, Message, Provider, ProviderRequest, ProviderResponse, ToolSpec } from "./gateway/types.ts";

// harness
export { defineApp, type AppDefinition } from "./harness/define-app.ts";
export { runTask, type RunTaskOptions, type TaskResult, type TaskStatus } from "./harness/run-task.ts";
export { pipeline } from "./harness/pipeline.ts";
export { generateEvaluate, VerdictSchema } from "./harness/generate-evaluate.ts";
export { Budget, type BudgetView } from "./harness/budget.ts";
export type { RunContext, Step, Verdict, GenerateEvaluateOutput } from "./harness/types.ts";

// trace
export { withTrace, span, countSpans, readTrace, type SpanRecord } from "./trace/trace.ts";
export { redact, createRedactor } from "./trace/redact.ts";

// db
export { createDb, type DbHandle } from "./db/client.ts";

// errors
export {
  OssuaryError,
  ManifestError,
  PolicyError,
  GatewayError,
  PromptTooLongError,
  JudgeConflictError,
  PriceMissingError,
  StructuredOutputError,
  BudgetExceeded,
  DemoModeOnlyError,
  PatternNotBuiltError,
  TaskStateError,
  ProviderError,
} from "./errors.ts";
