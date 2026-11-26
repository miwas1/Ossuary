// Every span attribute name, in one place (Requirement 22.6, D-47). The gen_ai.* names were checked
// against the OpenTelemetry semantic-conventions GenAI registry on 2026-11-26. Names the registry
// doesn't define use the ossuary. prefix, with underscores where a dot would make a namespace clash.

export const GEN_AI = {
  operationName: "gen_ai.operation.name",
  workflowName: "gen_ai.workflow.name",
  providerName: "gen_ai.provider.name",
  requestModel: "gen_ai.request.model",
  responseModel: "gen_ai.response.model",
  requestMaxTokens: "gen_ai.request.max_tokens",
  usageInputTokens: "gen_ai.usage.input_tokens",
  usageCacheReadInputTokens: "gen_ai.usage.cache_read.input_tokens",
  usageCacheCreationInputTokens: "gen_ai.usage.cache_creation.input_tokens",
  usageOutputTokens: "gen_ai.usage.output_tokens",
  responseFinishReasons: "gen_ai.response.finish_reasons",
  systemInstructions: "gen_ai.system_instructions",
  inputMessages: "gen_ai.input.messages",
  outputMessages: "gen_ai.output.messages",
} as const;

export const OSSUARY = {
  taskId: "ossuary.task.id",
  step: "ossuary.step",
  tier: "ossuary.tier",
  effort: "ossuary.effort",
  costMicros: "ossuary.cost.usd_micros",
  fallback: "ossuary.fallback",
  fallbackReason: "ossuary.fallback_reason",
  retry: "ossuary.retry",
  repair: "ossuary.repair",
  budgetOverrun: "ossuary.budget.overrun",
  promptLimitExceeded: "ossuary.prompt_limit_exceeded",
  budgetStopKind: "ossuary.budget.stop_kind",
  budgetLimit: "ossuary.budget.limit",
  budgetUsed: "ossuary.budget.used",
  errorClass: "ossuary.error.class",
} as const;

export const OPERATION = { workflow: "invoke_workflow", chat: "chat" } as const;
