import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assemble, stableStringify } from "../assemble.ts";
import type { CallRequest, ProviderRequest } from "../types.ts";
import { buildAnthropicRequest } from "./anthropic.ts";
import { buildOpenAiRequest } from "./openai.ts";

const text = fc.string({ minLength: 1, maxLength: 40, unit: "grapheme" });
const tool = fc.record({ name: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), inputSchema: fc.dictionary(fc.string({ maxLength: 5 }), fc.integer(), { maxKeys: 3 }) });
const turn = fc.array(fc.record({ role: fc.constantFrom<"user" | "assistant">("user", "assistant"), content: text }), { minLength: 1, maxLength: 4 });
const stable = fc.record({
  system: text,
  skills: fc.array(text, { maxLength: 4 }),
  tools: fc.array(tool, { maxLength: 4 }),
  reference: fc.array(text, { maxLength: 4 }),
});

const toProvider = (r: CallRequest<unknown>): Omit<ProviderRequest, "signal"> => ({ modelId: "x:m", model: "m", segments: assemble(r), effort: "low", maxOutputTokens: 16 });

describe("vendor cache order", () => {
  // Feature: 01-skeleton-core, Property 6: Assembled prompts are always in cache order (each adapter's vendor order, D-65 and D-69)
  it("Property 6: each adapter's body follows its vendor cache order, and the stable prefix ignores the turn", () => {
    fc.assert(
      fc.property(stable, turn, turn, (s, t1, t2) => {
        const r1 = { ...s, turn: t1 };
        const r2 = { ...s, turn: t2 };
        const stableTexts = [s.system, ...s.skills, ...s.reference];

        // Anthropic: tools, then system blocks (system, skills, reference), then the turn as messages.
        const a1 = buildAnthropicRequest(toProvider(r1));
        const a2 = buildAnthropicRequest(toProvider(r2));
        expect((a1.tools ?? []).map((x) => x.name)).toEqual(s.tools.map((x) => x.name));
        expect((a1.system ?? []).map((b) => b.text)).toEqual(stableTexts);
        expect(a1.messages.map((m) => m.content[0]?.text)).toEqual(t1.map((m) => m.content));
        const aMarks = [...(a1.tools ?? []), ...(a1.system ?? [])].filter((b) => b.cache_control);
        expect(aMarks).toHaveLength(1);
        expect(aMarks[0]).toBe(a1.system?.at(-1));
        expect(a1.messages.some((m) => JSON.stringify(m).includes("cache_control"))).toBe(false);
        expect(stableStringify({ tools: a1.tools, system: a1.system })).toBe(stableStringify({ tools: a2.tools, system: a2.system }));

        // OpenAI: tools, then one developer message (system, skills, reference), then the turn.
        const o1 = buildOpenAiRequest(toProvider(r1));
        const o2 = buildOpenAiRequest(toProvider(r2));
        expect((o1.tools ?? []).map((x) => x.name)).toEqual(s.tools.map((x) => x.name));
        expect(o1.input[0]?.role).toBe("developer");
        expect(o1.input[0]?.content.map((b) => b.text)).toEqual(stableTexts);
        expect(o1.input.slice(1).map((m) => m.content[0]?.text)).toEqual(t1.map((m) => m.content));
        const oMarks = o1.input.flatMap((m) => m.content).filter((b) => b.prompt_cache_breakpoint);
        expect(oMarks).toHaveLength(1);
        expect(oMarks[0]).toBe(o1.input[0]?.content.at(-1));
        expect(o1).not.toHaveProperty("instructions");
        expect(stableStringify({ tools: o1.tools, dev: o1.input[0] })).toBe(stableStringify({ tools: o2.tools, dev: o2.input[0] }));
      }),
      { numRuns: 200 },
    );
  });
});
