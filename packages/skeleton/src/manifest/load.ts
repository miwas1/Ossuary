// loadProduct(appDir): read and validate product.yaml, routing.yaml and the root models.yaml, then
// resolve the code into a Policy (plan §5, Requirements 2 to 8).
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import type { ZodType } from "zod";
import { ManifestError, type ManifestIssue } from "../errors.ts";
import { deepFreeze } from "../freeze.ts";
import { resolvePolicy, type Policy } from "./policy.ts";
import {
  ModelsSchema,
  ProductSchema,
  RoutingSchema,
  isPlaceholder,
  toIssues,
  vendorOf,
  type Models,
  type Product,
  type Routing,
} from "./schemas.ts";

export interface LoadedProduct {
  dir: string;
  product: Product;
  routing: Routing;
  models: Models;
  policy: Policy;
}

/** Walk up from `start` to the folder holding pnpm-workspace.yaml. */
export function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  while (!fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new ManifestError(start, [{ path: "", message: "no repo root (pnpm-workspace.yaml) above this folder" }]);
    dir = parent;
  }
  return dir;
}

function readYaml(file: string, label: string): unknown {
  if (!fs.existsSync(file)) throw new ManifestError(label, [{ path: "", message: `file not found: ${file}` }]);
  const doc = parseDocument(fs.readFileSync(file, "utf8"), { schema: "core" });
  if (doc.errors.length > 0) {
    throw new ManifestError(
      label,
      doc.errors.map((e) => {
        const pos = e.linePos?.[0];
        return { path: pos ? `line ${pos.line}, column ${pos.col}` : "", message: e.message.split("\n")[0] ?? e.message };
      }),
      "YAML syntax error",
    );
  }
  return doc.toJS();
}

function validate<T>(schema: ZodType<T>, raw: unknown, label: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ManifestError(label, toIssues(result.error));
  return result.data;
}

/** Validate a model register, including the rules that span fields (Requirement 4). */
export function parseModels(raw: unknown, label = "models.yaml"): Models {
  const models = validate(ModelsSchema, raw, label);
  const issues: ManifestIssue[] = [];
  for (const [tier, entry] of Object.entries(models.tiers)) {
    if (isPlaceholder(entry.primary)) issues.push({ path: `tiers.${tier}.primary`, message: `the ${tier} tier needs a real primary model, not a placeholder` });
    else if (!models.prices[entry.primary]) issues.push({ path: `tiers.${tier}.primary`, message: `${entry.primary} has no price` });
    if (!isPlaceholder(entry.fallback)) {
      if (vendorOf(entry.fallback) === vendorOf(entry.primary)) {
        issues.push({ path: `tiers.${tier}.fallback`, message: `the ${tier} fallback must be from a different vendor than its primary` });
      }
      if (!models.prices[entry.fallback]) issues.push({ path: `tiers.${tier}.fallback`, message: `${entry.fallback} has no price` });
    }
  }
  if (issues.length > 0) throw new ManifestError(label, issues);
  return models;
}

export interface LoadOptions {
  /** A model register to use instead of the root models.yaml (D-64). */
  models?: unknown;
}

export function loadProduct(appDir: string, opts: LoadOptions = {}): Readonly<LoadedProduct> {
  const dir = path.resolve(appDir);
  const productFile = path.join(dir, "product.yaml");
  const productLabel = path.basename(dir) + "/product.yaml";
  const product = validate(ProductSchema, readYaml(productFile, productLabel), productLabel);

  const routingFile = path.resolve(dir, product.routing);
  const routingLabel = path.basename(dir) + "/" + path.relative(dir, routingFile);
  const routing = validate(RoutingSchema, readYaml(routingFile, routingLabel), routingLabel);

  const models =
    opts.models !== undefined
      ? parseModels(opts.models, "models (given to defineApp)")
      : parseModels(readYaml(path.join(findRepoRoot(dir), "models.yaml"), "models.yaml"));

  const policy = resolvePolicy(product.code, product.release);

  if (policy.safety.requireThreatModel && !fs.existsSync(path.join(dir, "THREATS.md"))) {
    throw new ManifestError(productLabel, [{ path: "code", message: `risk tier ${policy.risk} requires a THREATS.md next to product.yaml (SEC-01)` }]);
  }
  if (policy.release.targetRequired && product.release?.threshold === undefined) {
    throw new ManifestError(productLabel, [
      { path: "release.threshold", message: `${policy.autonomy} products set their own pass@1 target; add release.threshold (D-43)` },
    ]);
  }

  return deepFreeze({ dir, product, routing, models, policy });
}
