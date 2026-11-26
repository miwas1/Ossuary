// Zod schemas for product.yaml, routing.yaml and models.yaml (plan §5). Every object is strict,
// so a misspelt key fails at load time (D-58).
import { z } from "zod";
import type { ManifestIssue } from "../errors.ts";
import { atMostSixDecimals } from "../money.ts";

export const MODEL_ID = /^[a-z][a-z0-9-]*:[^\s:]+$/;
export const PLACEHOLDER = "<id>";

const ModelId = z.string().regex(MODEL_ID, "must be vendor:model-name");
const Usd = z.number().nonnegative().refine(atMostSixDecimals, "must have at most six decimals (D-62)");

export const ProductSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case"),
  name: z.string().min(1),
  code: z.string().min(1),
  users: z.string().min(1),
  market: z.array(z.string().regex(/^[A-Z]{2}$/, "must be an ISO 3166-1 alpha-2 code")).min(1),
  north_star: z.string().min(1),
  pricing: z.strictObject({
    model: z.string().min(1),
    unit: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code"),
  }),
  routing: z.string().min(1),
  evals: z.strictObject({ dir: z.string().min(1), core_set: z.string().min(1) }),
  limits: z.strictObject({
    max_steps: z.int().positive(),
    max_tokens: z.int().positive(),
    max_seconds: z.int().positive(),
    max_spend_usd: Usd.positive(),
    max_workspace_spend_usd_per_day: Usd.positive(),
  }),
  interfaces: z
    .strictObject({
      mcp: z.strictObject({ path: z.string().min(1), tools: z.array(z.string()) }).optional(),
      skills: z.array(z.string()).optional(),
    })
    .optional(),
  costume: z.string().optional(),
  release: z.strictObject({ threshold: z.number().min(0).max(1) }).optional(),
});

export const ModelStepSchema = z.strictObject({
  tier: z.enum(["small", "mid", "frontier"]),
  effort: z.enum(["low", "medium", "high"]),
  role: z.literal("judge").optional(),
  timeout_ms: z.int().min(1_000).max(300_000).optional(),
  max_output_tokens: z.int().min(1).max(64_000).optional(),
  max_retry_wait_ms: z.int().min(0).max(2_000).optional(),
});
export const CodeStepSchema = z.strictObject({ kind: z.literal("code") });

export const RoutingSchema = z.strictObject({
  steps: z
    .record(z.string().regex(/^[a-z][a-z0-9_-]*$/, "step names are lowercase"), z.union([ModelStepSchema, CodeStepSchema]))
    .refine((steps) => Object.keys(steps).length > 0, "needs at least one step"),
});

const TierSchema = z.strictObject({ primary: ModelId, fallback: ModelId });

export const PriceSchema = z.strictObject({
  input: Usd,
  cached_input: Usd,
  cache_write_input: Usd.optional(),
  output: Usd,
  max_prompt_tokens: z.int().positive().optional(),
  image_input_tokens: z.int().positive().optional(),
  currency: z.literal("USD"),
  source: z.url(),
  checked: z.iso.date(),
});

export const ModelsSchema = z.strictObject({
  tiers: z.strictObject({ small: TierSchema, mid: TierSchema, frontier: TierSchema }),
  prices: z.record(ModelId, PriceSchema),
});

export type Product = z.infer<typeof ProductSchema>;
export type ModelStep = z.infer<typeof ModelStepSchema>;
export type RoutingStep = ModelStep | z.infer<typeof CodeStepSchema>;
export type Routing = z.infer<typeof RoutingSchema>;
export type Price = z.infer<typeof PriceSchema>;
export type Models = z.infer<typeof ModelsSchema>;
export type Tier = keyof Models["tiers"];
export type Effort = ModelStep["effort"];

export function isModelStep(step: RoutingStep): step is ModelStep {
  return !("kind" in step);
}

export function vendorOf(modelId: string): string {
  return modelId.slice(0, modelId.indexOf(":"));
}

export function modelNameOf(modelId: string): string {
  return modelId.slice(modelId.indexOf(":") + 1);
}

export function isPlaceholder(modelId: string): boolean {
  return modelNameOf(modelId) === PLACEHOLDER;
}

/** Zod issues as `path: problem` entries for ManifestError. */
export function toIssues(error: z.ZodError): ManifestIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}
