// Echo's one App definition: generate an epitaph, then check it in code and with the judge.
import fs from "node:fs";
import { defineApp, generateEvaluate, VerdictSchema, type Step, type Verdict } from "@ossuary/skeleton";
import { MAX_WORDS, wordLimit } from "./word-limit.ts";

export interface EchoInput {
  topic: string;
}

const prompt = (name: string) => fs.readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8");

const generate: Step<{ input: EchoInput; feedback: string | null }, string> = {
  name: "generate",
  kind: "model",
  async run({ input, feedback }, ctx) {
    const turn = feedback ? `Subject: ${input.topic}\nFeedback on your last attempt: ${feedback}` : `Subject: ${input.topic}`;
    const res = await ctx.gateway.call({ system: prompt("generate"), turn: [{ role: "user", content: turn }] });
    return res.value.trim();
  },
};

const evaluate: Step<{ input: EchoInput; candidate: string }, Verdict> = {
  name: "evaluate",
  kind: "model",
  async run({ input, candidate }, ctx) {
    const limit = wordLimit(candidate);
    if (!limit.ok) return { pass: false, score: 0, feedback: `Use at most ${MAX_WORDS} words; this one has ${limit.words}.` };
    const res = await ctx.gateway.call({
      system: prompt("rubric"),
      turn: [{ role: "user", content: `Subject: ${input.topic}\nEpitaph: ${candidate}` }],
      schema: VerdictSchema,
    });
    return res.value;
  },
};

/** Build the app. `models` replaces models.yaml, for --fake runs and tests. */
export function createEchoApp(opts: { models?: unknown } = {}) {
  return defineApp({
    dir: new URL("../..", import.meta.url),
    pattern: generateEvaluate({ generate, evaluate, maxRounds: 3 }),
    ...(opts.models === undefined ? {} : { models: opts.models }),
  });
}
