// pipeline(steps): steps run in order, each output feeding the next (Requirement 18).
import type { PipelinePattern, Step } from "./types.ts";
import type { StepRunner } from "./runtime.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pipeline(steps: readonly Step<any, any>[]): PipelinePattern {
  return { kind: "pipeline", steps: [...steps] };
}

export async function runPipeline(pattern: PipelinePattern, input: unknown, run: StepRunner): Promise<unknown> {
  let value = input;
  for (const [i, step] of pattern.steps.entries()) {
    value = await run(step as never, value, { key: `${i}:${step.name}`, round: 0 });
  }
  return value;
}
