// Anthropic Messages API adapter (Requirement 9). Vendor cache order: tools, then the system prompt,
// Skills and reference documents as system blocks, then the turn (D-65). One 5-minute breakpoint
// ends the stable prefix.
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError } from "../../errors.ts";
import { imageCount } from "../estimate.ts";
import { textOf, type Provider, type ProviderRequest, type ProviderResponse } from "../types.ts";
import { toProviderError } from "./classify.ts";

const CACHE = { type: "ephemeral", ttl: "5m" } as const;

export interface AnthropicBody {
  model: string;
  max_tokens: number;
  tools?: { name: string; description?: string; input_schema: Record<string, unknown>; cache_control?: typeof CACHE }[];
  system?: { type: "text"; text: string; cache_control?: typeof CACHE }[];
  messages: { role: "user" | "assistant"; content: { type: "text"; text: string }[] }[];
  output_config: { effort: string; format?: { type: "json_schema"; schema: Record<string, unknown> } };
}

/** Pure: the request body for a provider request. */
export function buildAnthropicRequest(req: Omit<ProviderRequest, "signal">): AnthropicBody {
  const tools = req.segments
    .filter((s) => s.kind === "tool" && s.tool)
    .map((s) => ({ name: s.tool!.name, ...(s.tool!.description ? { description: s.tool!.description } : {}), input_schema: s.tool!.inputSchema }));
  const system = req.segments.filter((s) => s.kind === "system" || s.kind === "skill" || s.kind === "reference").map((s) => ({ type: "text" as const, text: textOf(s.parts) }));
  const messages = req.segments
    .filter((s) => s.kind === "turn")
    .map((s) => ({ role: s.role === "assistant" ? ("assistant" as const) : ("user" as const), content: [{ type: "text" as const, text: textOf(s.parts) }] }));
  const lastSystem = system.at(-1);
  if (lastSystem) Object.assign(lastSystem, { cache_control: CACHE });
  else if (tools.length > 0) Object.assign(tools.at(-1)!, { cache_control: CACHE });
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens,
    ...(tools.length ? { tools } : {}),
    ...(system.length ? { system } : {}),
    messages,
    output_config: { effort: req.effort, ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}) },
  };
}

interface AnthropicMessage {
  model: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
}

/** Pure: Anthropic reports input_tokens without cached tokens, so the total is the sum of the three. */
export function readAnthropicResponse(msg: AnthropicMessage): ProviderResponse {
  const write = msg.usage.cache_creation_input_tokens ?? 0;
  const read = msg.usage.cache_read_input_tokens ?? 0;
  return {
    text: msg.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join(""),
    model: msg.model,
    finishReason: msg.stop_reason ?? "unknown",
    inputTokens: msg.usage.input_tokens + write + read,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    outputTokens: msg.usage.output_tokens,
  };
}

export function createAnthropicProvider(opts: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {}): Provider {
  return {
    vendors: ["anthropic"],
    async send(req) {
      if (imageCount(req.segments) > 0) throw new ProviderError("client", "image parts are not sent until Phase 4 (D-60)");
      const apiKey = (opts.env ?? process.env).ANTHROPIC_API_KEY;
      if (!apiKey) throw new ProviderError("client", "ANTHROPIC_API_KEY is not set");
      const client = new Anthropic({ apiKey, maxRetries: 0, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
      try {
        const msg = await client.messages.create(buildAnthropicRequest(req) as unknown as Anthropic.MessageCreateParamsNonStreaming, { signal: req.signal });
        return readAnthropicResponse(msg as unknown as AnthropicMessage);
      } catch (err) {
        throw toProviderError("anthropic", err);
      }
    },
  };
}
