// defineApp: load the product, check the pattern against the policy and routing, and return a
// definition whose runTask does the rest (plan §6, Requirements 16, 18.2, 19.5, 19.6).
import { fileURLToPath } from "node:url";
import { ManifestError, PatternNotBuiltError } from "../errors.ts";
import { loadProduct, type LoadedProduct } from "../manifest/load.ts";
import { ARCHETYPES } from "../manifest/policy.ts";
import { isModelStep } from "../manifest/schemas.ts";
import { runTask, type RunTaskOptions, type TaskResult } from "./run-task.ts";
import type { Pattern, Step } from "./types.ts";

export interface AppDefinition<P extends Pattern = Pattern> extends Readonly<LoadedProduct> {
  readonly id: string;
  readonly pattern: P;
  runTask<O = unknown>(opts: RunTaskOptions): Promise<TaskResult<O>>;
}

function stepsOf(p: Pattern): Step<never, unknown>[] {
  return p.kind === "pipeline" ? [...p.steps] : [p.generate as Step<never, unknown>, p.evaluate as Step<never, unknown>];
}

export function defineApp<P extends Pattern>(opts: { dir: string | URL; pattern: P; models?: unknown }): AppDefinition<P> {
  const dir = opts.dir instanceof URL ? fileURLToPath(opts.dir) : opts.dir;
  const loaded = loadProduct(dir, opts.models === undefined ? {} : { models: opts.models });
  const { policy, routing } = loaded;
  const label = `${loaded.product.id}/product.yaml`;

  const arch = ARCHETYPES[policy.archetype];
  if (!arch.built) {
    throw new PatternNotBuiltError(policy.pattern, `${policy.archetype} products (${policy.pattern}${arch.thresholded ? ", thresholded" : ""}) are not built in this phase`);
  }
  if (opts.pattern.kind !== policy.pattern) {
    throw new ManifestError(label, [{ path: "code", message: `${policy.code} uses the ${policy.pattern} pattern, but defineApp was given ${opts.pattern.kind}` }]);
  }

  for (const step of stepsOf(opts.pattern)) {
    if (step.kind === "action") throw new PatternNotBuiltError(policy.pattern, `action step "${step.name}" needs the Phase 2 approval gate (D-54)`);
    const entry = routing.steps[step.name];
    if (step.kind === "model" && (!entry || !isModelStep(entry))) {
      throw new ManifestError(label, [{ path: `routing.steps.${step.name}`, message: `model step "${step.name}" needs a model entry in routing.yaml` }]);
    }
    if (step.kind === "code" && entry && isModelStep(entry)) {
      throw new ManifestError(label, [{ path: `routing.steps.${step.name}`, message: `code step "${step.name}" cannot use a model entry (D-66)` }]);
    }
  }

  if (opts.pattern.kind === "generate-evaluate") {
    const judges = Object.entries(routing.steps).filter(([, e]) => isModelStep(e) && e.role === "judge");
    if (judges.length !== 1) {
      throw new ManifestError(label, [{ path: "routing.steps", message: `generateEvaluate needs exactly one step with role: judge in routing.yaml, found ${judges.length}` }]);
    }
    const [judgeName, judge] = judges[0] as [string, { tier: "small" | "mid" | "frontier" }];
    const gen = opts.pattern.generate;
    const evaluate = opts.pattern.evaluate;
    if (evaluate.name !== judgeName) {
      throw new ManifestError(label, [{ path: `routing.steps.${evaluate.name}`, message: `the evaluate step must be the judge entry "${judgeName}" (HAR-02)` }]);
    }
    const genEntry = routing.steps[gen.name];
    if (genEntry && isModelStep(genEntry)) {
      if (genEntry.role === "judge") throw new ManifestError(label, [{ path: `routing.steps.${gen.name}`, message: "the generate step can't have role: judge" }]);
      const genPrimary = loaded.models.tiers[genEntry.tier].primary;
      const judgePrimary = loaded.models.tiers[judge.tier].primary;
      if (genPrimary === judgePrimary) {
        throw new ManifestError(label, [
          { path: `routing.steps.${judgeName}`, message: `judge step "${judgeName}" and generate step "${gen.name}" share the primary model ${judgePrimary}; put them on tiers with different primaries (HAR-02)` },
        ]);
      }
    }
  }

  const app: AppDefinition<P> = {
    ...loaded,
    id: loaded.product.id,
    pattern: opts.pattern,
    runTask: <O>(o: RunTaskOptions) => runTask<O>(app, o),
  };
  return Object.freeze(app);
}
