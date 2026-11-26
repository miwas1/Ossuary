// Structured output (Requirement 11): parse JSON, optionally inside one Markdown code fence, and
// validate it with the call's Zod schema.
import type { ZodType } from "zod";

export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: string[] };

const FENCE = /^\s*```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```\s*$/;

export function parseStructured<T>(text: string, schema: ZodType<T>): Parsed<T> {
  const body = FENCE.exec(text)?.[1] ?? text;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { ok: false, issues: [`not valid JSON: ${(e as Error).message}`] };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`) };
}
