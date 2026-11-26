import type { Step } from "./types.ts";

export interface StepOptions {
  /** The step's key in the task state, unique within the task. */
  key: string;
  round: number;
  /** Model IDs the step's gateway calls may not be served by. */
  exclude?: ReadonlySet<string>;
}

/** Runs a step once: replays its saved output on resume, otherwise runs it and saves the state. */
export type StepRunner = <I, O>(step: Step<I, O>, input: I, opts: StepOptions) => Promise<O>;
