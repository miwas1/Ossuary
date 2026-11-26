// Vendor-neutral gateway contracts (plan §6, Requirement 9.1).
import type { ZodType } from "zod";
import type { Effort } from "../manifest/schemas.ts";

export type SegmentKind = "system" | "skill" | "tool" | "reference" | "turn";
export const CACHE_ORDER: readonly SegmentKind[] = ["system", "skill", "tool", "reference", "turn"];

export type Part = { type: "text"; text: string } | { type: "image"; mediaType: string; data: Uint8Array };

export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface Segment {
  kind: SegmentKind;
  role: "system" | "user" | "assistant";
  parts: Part[];
  /** Set on tool segments, so adapters can send the structured definition. */
  tool?: ToolSpec;
}

export interface Message {
  role: "user" | "assistant";
  content: string | Part[];
}

export interface CallRequest<T = string> {
  /** The routing.yaml step; defaults to the running step's name and may not name another step (D-66). */
  step?: string;
  system: string;
  skills?: string[];
  tools?: ToolSpec[];
  reference?: string[];
  turn: Message[];
  schema?: ZodType<T>;
}

export interface ProviderRequest {
  /** The full Model ID, vendor included. */
  modelId: string;
  /** The vendor's own model name: the Model ID without "vendor:". */
  model: string;
  segments: readonly Segment[];
  effort: Effort;
  maxOutputTokens: number;
  jsonSchema?: Record<string, unknown>;
  signal: AbortSignal;
}

export interface ProviderResponse {
  text: string;
  model: string;
  finishReason: string;
  /** All input tokens, cached ones included (OpenTelemetry's gen_ai.usage.input_tokens). */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/** One provider interface for every vendor (MODEL-01). Failures are thrown as ProviderError. */
export interface Provider {
  readonly vendors: readonly string[];
  send(req: ProviderRequest): Promise<ProviderResponse>;
}

export function textOf(parts: readonly Part[]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}
