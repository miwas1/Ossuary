// OpenAI Responses API adapter (Requirement 9). Vendor cache order: tools, then one developer message
// holding the system prompt, Skills and reference documents, then the turn. The top-level
// `instructions` field is never used, because newer models append it after the input and bill it
// uncached (D-69). Explicit caching with a 30-minute lifetime ends at the developer message.
import OpenAI from "openai";
import { ProviderError } from "../../errors.ts";
import { imageCount } from "../estimate.ts";
import { textOf, type Provider, type ProviderRequest, type ProviderResponse } from "../types.ts";
import { toProviderError } from "./classify.ts";

type Block = { type: "input_text" | "output_text"; text: string; prompt_cache_breakpoint?: { mode: "explicit" } };

export interface OpenAiBody {
  model: string;
  tools?: { type: "function"; name: string; description?: string; parameters: Record<string, unknown>; strict: false }[];
  input: { role: "developer" | "user" | "assistant"; content: Block[] }[];
  prompt_cache_options: { mode: "explicit"; ttl: "30m" };
  reasoning: { effort: string };
  max_output_tokens: number;
  store: false;
  text?: { format: { type: "json_schema"; name: string; schema: Record<string, unknown>; strict: false } };
}

/** Pure: the request body for a provider request. */
export function buildOpenAiRequest(req: Omit<ProviderRequest, "signal">): OpenAiBody {
  const tools = req.segments
    .filter((s) => s.kind === "tool" && s.tool)
    .map((s) => ({ type: "function" as const, name: s.tool!.name, ...(s.tool!.description ? { description: s.tool!.description } : {}), parameters: s.tool!.inputSchema, strict: false as const }));
  const developer: Block[] = req.segments
    .filter((s) => s.kind === "system" || s.kind === "skill" || s.kind === "reference")
    .map((s) => ({ type: "input_text", text: textOf(s.parts) }));
  const lastDev = developer.at(-1);
  if (lastDev) lastDev.prompt_cache_breakpoint = { mode: "explicit" };
  const turns = req.segments
    .filter((s) => s.kind === "turn")
    .map((s) =>
      s.role === "assistant"
        ? { role: "assistant" as const, content: [{ type: "output_text" as const, text: textOf(s.parts) }] }
        : { role: "user" as const, content: [{ type: "input_text" as const, text: textOf(s.parts) }] },
    );
  return {
    model: req.model,
    ...(tools.length ? { tools } : {}),
    input: [...(developer.length ? [{ role: "developer" as const, content: developer }] : []), ...turns],
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    reasoning: { effort: req.effort },
    max_output_tokens: req.maxOutputTokens,
    store: false,
    ...(req.jsonSchema ? { text: { format: { type: "json_schema" as const, name: "output", schema: req.jsonSchema, strict: false as const } } } : {}),
  };
}

interface OpenAiResponse {
  model: string;
  status?: string | null;
  incomplete_details?: { reason?: string | null } | null;
  output_text: string;
  usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } } | null;
}

/** Pure: OpenAI's input_tokens is already the total; cached_tokens excludes tokens billed as writes. */
export function readOpenAiResponse(r: OpenAiResponse): ProviderResponse {
  return {
    text: r.output_text,
    model: r.model,
    finishReason: r.incomplete_details?.reason ?? r.status ?? "unknown",
    inputTokens: r.usage?.input_tokens ?? 0,
    cacheReadTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: r.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
  };
}

export function createOpenAiProvider(opts: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {}): Provider {
  return {
    vendors: ["openai"],
    async send(req) {
      if (imageCount(req.segments) > 0) throw new ProviderError("client", "image parts are not sent until Phase 4 (D-60)");
      const apiKey = (opts.env ?? process.env).OPENAI_API_KEY;
      if (!apiKey) throw new ProviderError("client", "OPENAI_API_KEY is not set");
      const client = new OpenAI({ apiKey, maxRetries: 0, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
      try {
        const resp = await client.responses.create(buildOpenAiRequest(req) as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming, { signal: req.signal });
        return readOpenAiResponse(resp as unknown as OpenAiResponse);
      } catch (err) {
        throw toProviderError("openai", err);
      }
    },
  };
}
