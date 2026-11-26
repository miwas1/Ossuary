// The gateway: the only route from skeleton code to a model (MODEL-01 to 05, OPS-05, OPS-06).
// assemble → estimate → plan, then at most four attempts (one retry per vendor, one switch to the
// fallback), each reserved against the task budget and the workspace's daily cap before it is sent.
import { z } from "zod";
import type { DbHandle } from "../db/client.ts";
import {
  BudgetExceeded,
  DemoModeOnlyError,
  GatewayError,
  JudgeConflictError,
  PriceMissingError,
  PromptTooLongError,
  ProviderError,
  StructuredOutputError,
  type AttemptRecord,
  type FailureClass,
  type SkipReason,
} from "../errors.ts";
import { isModelStep, isPlaceholder, modelNameOf, vendorOf, type ModelStep, type Models, type Routing } from "../manifest/schemas.ts";
import { capMicros, costMicros, reservedTokens, toPicoPrice, worstCaseMicros, type Usage } from "../money.ts";
import { GEN_AI, OPERATION, OSSUARY } from "../trace/attributes.ts";
import { span, type ActiveSpan } from "../trace/trace.ts";
import { assemble, withRepairTurn } from "./assemble.ts";
import { promptTokenEstimate } from "./estimate.ts";
import { nextMove, planAttempts, type Candidate } from "./plan.ts";
import { dbSpendStore, memorySpendStore, utcDay, type SpendStore } from "./spend.ts";
import { parseStructured } from "./structured.ts";
import type { CallRequest, Provider, ProviderResponse, Segment } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
export const DEFAULT_RETRY_WAIT_MS = 2_000;

/** The part of the task Budget the gateway charges (implemented by harness Budget). */
export interface ChargeBudget {
  reserve(tokens: number, micros: number): { readonly tokens: number; readonly micros: number; open: boolean };
  settle(r: { readonly tokens: number; readonly micros: number; open: boolean }, tokens: number, micros: number): boolean;
  release(r: { readonly tokens: number; readonly micros: number; open: boolean }): void;
  remainingMs(): number;
}

export interface GatewayOptions {
  models: Models;
  /** Providers to use; vendor adapters for Anthropic and OpenAI are added unless `vendorAdapters` is false. */
  providers?: readonly Provider[];
  vendorAdapters?: boolean;
  /** Where workspace spend is kept: bones.spend when a database is given, memory otherwise. */
  db?: Pick<DbHandle, "execute">;
  spend?: SpendStore;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Starts the attempt timeout; returns a cancel function. Injected by tests. */
  timer?: (ms: number, onTimeout: () => void) => () => void;
}

export interface ScopeOptions {
  appId: string;
  workspaceId: string;
  /** The product's limits.max_workspace_spend_usd_per_day. */
  workspaceCapUsd: number;
  routing: Routing;
  /** The running step's name; calls may name only this routing entry (D-66). */
  stepName: string;
  budget: ChargeBudget;
  /** Model IDs this step may not be served by (the judge exclusion, Requirement 19.7). */
  exclude?: ReadonlySet<string>;
}

export interface CallResult<T> {
  value: T;
  text: string;
  model: string;
  costMicros: number;
  usage: Usage;
}

export interface ScopedGateway {
  call<T = string>(req: CallRequest<T>): Promise<CallResult<T>>;
  /** Model IDs that served this scope's calls, in order. */
  readonly served: readonly string[];
}

export interface Gateway {
  readonly models: Models;
  scope(opts: ScopeOptions): ScopedGateway;
  killPrimary(vendor: string): void;
  revivePrimary(vendor: string): void;
  killedVendors(): readonly string[];
}

const SIZE_SKIPS: ReadonlySet<SkipReason> = new Set(["prompt_too_long", "no_image_allowance"]);

function otelMessages(segments: readonly Segment[]) {
  const parts = (s: Segment) => s.parts.map((p) => (p.type === "text" ? { type: "text", content: p.text } : { type: "blob", mime_type: p.mediaType, modality: "image" }));
  const system = segments.filter((s) => s.kind !== "turn").map((s) => ({ type: "text", content: s.parts.map((p) => (p.type === "text" ? p.text : "")).join("") }));
  const input = segments.filter((s) => s.kind === "turn").map((s) => ({ role: s.role, parts: parts(s) }));
  return { system: JSON.stringify(system), input: JSON.stringify(input) };
}

export function createGateway(opts: GatewayOptions): Gateway {
  const models = opts.models;
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timer =
    opts.timer ??
    ((ms: number, fire: () => void) => {
      const t = setTimeout(fire, ms);
      return () => clearTimeout(t);
    });
  const spendStore = opts.spend ?? (opts.db ? dbSpendStore(opts.db) : memorySpendStore());
  const killed = new Set<string>();

  const byVendor = new Map<string, Provider>();
  const register = (p: Provider) => p.vendors.forEach((v) => byVendor.set(v, p));
  if (opts.vendorAdapters !== false) {
    for (const p of vendorAdapterList()) register(p);
  }
  for (const p of opts.providers ?? []) register(p);
  for (const [tier, entry] of Object.entries(models.tiers)) {
    for (const id of [entry.primary, entry.fallback]) {
      if (!isPlaceholder(id) && !byVendor.has(vendorOf(id))) throw new GatewayError(`no provider is registered for vendor "${vendorOf(id)}" (tier ${tier})`);
    }
  }

  const demoGuard = (what: string) => {
    if (env.DEMO_MODE !== "true") throw new DemoModeOnlyError(what);
  };

  function scope(s: ScopeOptions): ScopedGateway {
    const served: string[] = [];
    const exclude = s.exclude ?? new Set<string>();
    const capUsdMicros = capMicros(s.workspaceCapUsd);

    async function attempt(
      cand: Candidate,
      ctx: { step: string; entry: ModelStep; segments: readonly Segment[]; jsonSchema: Record<string, unknown> | undefined; maxOut: number; flags: Record<string, unknown> },
    ): Promise<ProviderResponse & { costMicros: number }> {
      const price = models.prices[cand.id];
      if (!price) throw new PriceMissingError(cand.id);
      const pico = toPicoPrice(price);
      const provider = byVendor.get(vendorOf(cand.id));
      if (!provider) throw new GatewayError(`no provider for ${cand.id}`);
      const estimate = promptTokenEstimate(ctx.segments, price.image_input_tokens ?? 0);
      const reserved = s.budget.reserve(reservedTokens(estimate, ctx.maxOut), worstCaseMicros(estimate, ctx.maxOut, pico));
      const key = { appId: s.appId, workspaceId: s.workspaceId, day: utcDay(now()) };
      if (!(await spendStore.reserve(key, reserved.micros, capUsdMicros))) {
        s.budget.release(reserved);
        throw new BudgetExceeded("spend", capUsdMicros, (await spendStore.spent(key)) + reserved.micros, "workspace");
      }
      const stepTimeout = ctx.entry.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const remaining = s.budget.remainingMs();
      const timeoutMs = Math.min(stepTimeout, remaining);
      const capBound = remaining < stepTimeout;
      const modelName = modelNameOf(cand.id);
      const messages = otelMessages(ctx.segments);

      return span(
        `${OPERATION.chat} ${modelName}`,
        {
          [GEN_AI.operationName]: OPERATION.chat,
          [GEN_AI.providerName]: vendorOf(cand.id),
          [GEN_AI.requestModel]: modelName,
          [GEN_AI.requestMaxTokens]: ctx.maxOut,
          [GEN_AI.systemInstructions]: messages.system,
          [GEN_AI.inputMessages]: messages.input,
          [OSSUARY.step]: ctx.step,
          [OSSUARY.tier]: ctx.entry.tier,
          [OSSUARY.effort]: ctx.entry.effort,
          [OSSUARY.fallback]: cand.slot === "fallback",
          ...ctx.flags,
        },
        async (sp: ActiveSpan) => {
          const ac = new AbortController();
          const cancel = timer(timeoutMs, () => ac.abort());
          let resp: ProviderResponse;
          try {
            resp = await provider.send({ modelId: cand.id, model: modelName, segments: ctx.segments, effort: ctx.entry.effort, maxOutputTokens: ctx.maxOut, jsonSchema: ctx.jsonSchema, signal: ac.signal });
          } catch (err) {
            s.budget.release(reserved);
            await spendStore.release(key, reserved.micros);
            const pe = err instanceof ProviderError ? err : new ProviderError("server", err instanceof Error ? err.name : "provider failure");
            // A timeout we caused by aborting is a timeout, whatever the provider reported.
            const failure: FailureClass = ac.signal.aborted ? "timeout" : pe.failureClass;
            sp.set({ "ossuary.failure_class": failure });
            throw Object.assign(new ProviderError(failure, `${cand.id}: ${failure}`, pe.retryAfterMs === undefined ? {} : { retryAfterMs: pe.retryAfterMs }), { capBound: capBound && failure === "timeout" });
          } finally {
            cancel();
          }
          const usage: Usage = { inputTokens: resp.inputTokens, cacheReadTokens: resp.cacheReadTokens, cacheWriteTokens: resp.cacheWriteTokens, outputTokens: resp.outputTokens };
          const cost = costMicros(usage, pico);
          const overrun = s.budget.settle(reserved, resp.inputTokens + resp.outputTokens, cost);
          await spendStore.settle(key, reserved.micros, cost);
          sp.set({
            [GEN_AI.responseModel]: resp.model,
            [GEN_AI.usageInputTokens]: resp.inputTokens,
            [GEN_AI.usageCacheReadInputTokens]: resp.cacheReadTokens,
            [GEN_AI.usageCacheCreationInputTokens]: resp.cacheWriteTokens,
            [GEN_AI.usageOutputTokens]: resp.outputTokens,
            [GEN_AI.responseFinishReasons]: [resp.finishReason],
            [GEN_AI.outputMessages]: JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: resp.text }], finish_reason: resp.finishReason }]),
            [OSSUARY.costMicros]: cost,
            ...(overrun ? { [OSSUARY.budgetOverrun]: true } : {}),
            ...(cand.limit !== null && resp.inputTokens > cand.limit ? { [OSSUARY.promptLimitExceeded]: true } : {}),
          });
          return { ...resp, costMicros: cost };
        },
      );
    }

    async function run(step: string, entry: ModelStep, segments: readonly Segment[], jsonSchema: Record<string, unknown> | undefined) {
      const tier = models.tiers[entry.tier];
      const candidates = planAttempts({ tier, excluded: exclude, killedVendors: killed, segments, prices: models.prices });
      const log: AttemptRecord[] = candidates.filter((c) => c.skip).map((c) => ({ model: c.id, outcome: c.skip as SkipReason }));
      const eligible = candidates.filter((c) => !c.skip);
      if (eligible.length === 0) {
        if (candidates.every((c) => c.skip && SIZE_SKIPS.has(c.skip))) {
          throw new PromptTooLongError(candidates[0]?.estimate ?? 0, candidates.map((c) => ({ model: c.id, limit: c.limit })), log);
        }
        if (candidates.some((c) => c.skip === "judge_excluded")) throw new JudgeConflictError([...exclude], log);
        throw new GatewayError(`no model can take this call for step "${step}"`, log);
      }
      const maxOut = entry.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
      const retryWaitMs = entry.max_retry_wait_ms ?? DEFAULT_RETRY_WAIT_MS;
      const fallback = eligible.find((c) => c.slot === "fallback");
      let current = eligible[0] as Candidate;
      let reason: string | undefined = current.slot === "fallback" ? candidates[0]?.skip : undefined;
      const retried = new Set<string>();
      let retry = false;

      for (;;) {
        const flags: Record<string, unknown> = {};
        if (current.slot === "fallback" && reason) flags[OSSUARY.fallbackReason] = reason;
        if (retry) flags[OSSUARY.retry] = true;
        try {
          const resp = await attempt(current, { step, entry, segments, jsonSchema, maxOut, flags });
          served.push(current.id);
          return { resp, model: current, maxOut };
        } catch (err) {
          if (!(err instanceof ProviderError)) throw err;
          const capBound = (err as ProviderError & { capBound?: boolean }).capBound === true;
          log.push({ model: current.id, outcome: err.failureClass });
          const move = nextMove({
            failure: err.failureClass,
            slot: current.slot,
            vendorRetried: retried.has(vendorOf(current.id)),
            retryAfterMs: err.retryAfterMs,
            retryWaitMs,
            remainingMs: s.budget.remainingMs(),
            timeCapHit: capBound,
            fallbackAvailable: current.slot === "primary" && fallback !== undefined,
          });
          if (move === "retry-same") {
            retried.add(vendorOf(current.id));
            await sleep(err.retryAfterMs ?? 0);
            retry = true;
            continue;
          }
          if (move === "switch" && fallback) {
            reason = err.failureClass;
            current = fallback;
            retry = false;
            continue;
          }
          if (capBound) throw new BudgetExceeded("seconds", 0, 0);
          throw new GatewayError(`call for step "${step}" failed`, log);
        }
      }
    }

    return {
      served,
      async call<T = string>(req: CallRequest<T>): Promise<CallResult<T>> {
        const step = req.step ?? s.stepName;
        if (step !== s.stepName) throw new GatewayError(`step "${s.stepName}" may only call its own routing entry, not "${step}" (D-66)`);
        const entry = s.routing.steps[step];
        if (!entry) throw new GatewayError(`step "${step}" has no entry in routing.yaml`);
        if (!isModelStep(entry)) throw new GatewayError(`step "${step}" is a code step and can't call a model (HAR-06)`);
        const segments = assemble(req as CallRequest<unknown>);
        const jsonSchema = req.schema ? (z.toJSONSchema(req.schema) as Record<string, unknown>) : undefined;
        const first = await run(step, entry, segments, jsonSchema);
        const usage = (r: ProviderResponse): Usage => ({ inputTokens: r.inputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens, outputTokens: r.outputTokens });
        if (!req.schema) {
          return { value: first.resp.text as T, text: first.resp.text, model: first.model.id, costMicros: first.resp.costMicros, usage: usage(first.resp) };
        }
        const parsed = parseStructured(first.resp.text, req.schema);
        if (parsed.ok) return { value: parsed.value, text: first.resp.text, model: first.model.id, costMicros: first.resp.costMicros, usage: usage(first.resp) };

        // One repair call on the same served model (Requirement 11.2), if that model can take the longer prompt.
        const repairSegments = withRepairTurn(segments, first.resp.text, parsed.issues);
        const price = models.prices[first.model.id];
        const estimate = promptTokenEstimate(repairSegments, price?.image_input_tokens ?? 0);
        if (first.model.limit !== null && estimate > first.model.limit) throw new StructuredOutputError(parsed.issues);
        let repaired: ProviderResponse & { costMicros: number };
        try {
          repaired = await attempt(
            { ...first.model, estimate, skip: undefined } as Candidate,
            { step, entry, segments: repairSegments, jsonSchema, maxOut: first.maxOut, flags: { [OSSUARY.repair]: true } },
          );
        } catch (err) {
          if (err instanceof ProviderError) throw new GatewayError(`repair call for step "${step}" failed`, [{ model: first.model.id, outcome: err.failureClass }]);
          throw err;
        }
        served.push(first.model.id);
        const second = parseStructured(repaired.text, req.schema);
        if (!second.ok) throw new StructuredOutputError(second.issues);
        return {
          value: second.value,
          text: repaired.text,
          model: first.model.id,
          costMicros: first.resp.costMicros + repaired.costMicros,
          usage: {
            inputTokens: first.resp.inputTokens + repaired.inputTokens,
            cacheReadTokens: first.resp.cacheReadTokens + repaired.cacheReadTokens,
            cacheWriteTokens: first.resp.cacheWriteTokens + repaired.cacheWriteTokens,
            outputTokens: first.resp.outputTokens + repaired.outputTokens,
          },
        };
      },
    };
  }

  return {
    models,
    scope,
    killPrimary(vendor) {
      demoGuard("killPrimary");
      killed.add(vendor);
    },
    revivePrimary(vendor) {
      demoGuard("revivePrimary");
      killed.delete(vendor);
    },
    killedVendors: () => Object.freeze([...killed]),
  };
}

// The real vendor adapters, created on first use. Imported here so apps never import them.
import { createAnthropicProvider } from "./providers/anthropic.ts";
import { createOpenAiProvider } from "./providers/openai.ts";
let adapters: Provider[] | undefined;
function vendorAdapterList(): Provider[] {
  adapters ??= [createAnthropicProvider(), createOpenAiProvider()];
  return adapters;
}
