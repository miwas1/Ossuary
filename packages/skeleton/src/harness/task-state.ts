// Restartable task state as JSON (HAR-03, Requirement 20). Saved on the task row after each step.
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { TaskStateError } from "../errors.ts";

export const TaskStateSchema = z.strictObject({
  version: z.literal(1),
  pattern: z.enum(["pipeline", "generate-evaluate"]),
  completed: z.array(z.strictObject({ step: z.string(), output: z.json(), served: z.array(z.string()) })),
  round: z.int().min(0),
  budget: z.strictObject({
    steps: z.int().min(0),
    tokens: z.int().min(0),
    activeMs: z.number().min(0),
    spendMicros: z.int().min(0),
    overrun: z.boolean(),
  }),
});
export type TaskState = z.infer<typeof TaskStateSchema>;

export function initialState(pattern: TaskState["pattern"]): TaskState {
  return { version: 1, pattern, completed: [], round: 0, budget: { steps: 0, tokens: 0, activeMs: 0, spendMicros: 0, overrun: false } };
}

/** A step output as stored JSON. Anything that doesn't survive the round trip unchanged is refused (Requirement 20.3). */
export function toJsonOutput(step: string, output: unknown): z.infer<ReturnType<typeof z.json>> {
  let text: string | undefined;
  try {
    text = JSON.stringify(output);
  } catch {
    throw new TaskStateError(step, "output can't be stored as JSON (it has a cycle or a BigInt)");
  }
  if (text === undefined) throw new TaskStateError(step, "output can't be stored as JSON (it is undefined or a function)");
  const back: unknown = JSON.parse(text);
  if (!isDeepStrictEqual(back, output)) throw new TaskStateError(step, "output changes when stored as JSON (a Date, Map, Set, class instance or undefined field)");
  return back as z.infer<ReturnType<typeof z.json>>;
}

export function serializeState(state: TaskState): string {
  return JSON.stringify(state);
}

export function parseState(raw: unknown): TaskState {
  const result = TaskStateSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
  if (!result.success) throw new TaskStateError("(resume)", `saved state is invalid: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return result.data;
}
