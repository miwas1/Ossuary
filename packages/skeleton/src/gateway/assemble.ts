// Prompt assembly in cache order: system, Skills, tool schemas, reference documents, then the turn
// (MODEL-05, Requirement 10). Pure: no trimming, templating or extra content.
import type { CallRequest, Message, Part, Segment, ToolSpec } from "./types.ts";

/** JSON with object keys sorted, so equal values always give equal bytes. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

const text = (t: string): Part[] => [{ type: "text", text: t }];
const toolSegment = (tool: ToolSpec): Segment => ({ kind: "tool", role: "system", parts: text(stableStringify(tool)), tool });
const turnSegment = (m: Message): Segment => ({ kind: "turn", role: m.role, parts: typeof m.content === "string" ? text(m.content) : [...m.content] });

export function assemble(req: CallRequest<unknown>): Segment[] {
  return [
    ...(req.system ? [{ kind: "system", role: "system", parts: text(req.system) } satisfies Segment] : []),
    ...(req.skills ?? []).map((s): Segment => ({ kind: "skill", role: "system", parts: text(s) })),
    ...(req.tools ?? []).map(toolSegment),
    ...(req.reference ?? []).map((r): Segment => ({ kind: "reference", role: "system", parts: text(r) })),
    ...req.turn.map(turnSegment),
  ];
}

/** The repair call's prompt: the same segments plus one user turn with the invalid output and the issues (Requirement 11.2). */
export function withRepairTurn(segments: readonly Segment[], invalidOutput: string, issues: readonly string[]): Segment[] {
  const message =
    "Your last reply did not match the required JSON schema.\n" +
    `Your reply was:\n${invalidOutput}\n` +
    `Issues:\n${issues.map((i) => `- ${i}`).join("\n")}\n` +
    "Reply again with corrected JSON only.";
  return [...segments, { kind: "turn", role: "user", parts: text(message) }];
}
