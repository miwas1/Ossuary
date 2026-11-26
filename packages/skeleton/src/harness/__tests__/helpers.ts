// Shared test helpers for the harness tests (not shipped; the bone count skips __tests__/).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { createDb, type DbHandle } from "../../db/client.ts";
import { createFakeProvider, fakeModelRegister, type FakeScript } from "../../gateway/fake.ts";
import { createGateway, type GatewayOptions } from "../../gateway/gateway.ts";
import type { Models } from "../../manifest/schemas.ts";

export interface Limits {
  max_steps: number;
  max_tokens: number;
  max_seconds: number;
  max_spend_usd: number;
  max_workspace_spend_usd_per_day: number;
}

export const LIMITS: Limits = { max_steps: 20, max_tokens: 100_000, max_seconds: 60, max_spend_usd: 1, max_workspace_spend_usd_per_day: 10 };

export function tempApp(opts: { code: string; routing: Record<string, unknown>; limits?: Partial<Limits>; id?: string; threats?: boolean; release?: number }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ossuary-harness-"));
  const product = {
    id: opts.id ?? "testapp",
    name: "Test app",
    code: opts.code,
    users: "tests",
    market: ["NG"],
    north_star: "n/a",
    pricing: { model: "per_unit", unit: "task", currency: "USD" },
    routing: "./routing.yaml",
    evals: { dir: "./evals", core_set: "core" },
    limits: { ...LIMITS, ...opts.limits },
    ...(opts.release !== undefined ? { release: { threshold: opts.release } } : {}),
  };
  fs.writeFileSync(path.join(dir, "product.yaml"), stringify(product));
  fs.writeFileSync(path.join(dir, "routing.yaml"), stringify({ steps: opts.routing }));
  if (opts.threats) fs.writeFileSync(path.join(dir, "THREATS.md"), "# Threats\n");
  return dir;
}

export async function memDb(): Promise<DbHandle> {
  const h = await createDb("pglite://memory");
  await h.migrate();
  return h;
}

export function fakeGateway(script: FakeScript, opts: { models?: Models } & Partial<GatewayOptions> = {}) {
  const fake = createFakeProvider(script);
  const gateway = createGateway({
    models: opts.models ?? fakeModelRegister(),
    providers: [fake],
    vendorAdapters: false,
    env: { DEMO_MODE: "true" },
    sleep: async () => {},
    ...opts,
  });
  return { fake, gateway };
}

export function manualClock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}
