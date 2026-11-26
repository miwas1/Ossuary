// The opt-in real-vendor smoke test (Requirement 25). `pnpm --filter @ossuary/skeleton smoke` runs it;
// the default `vitest run` never matches *.smoke.ts, so `pnpm verify` never calls a vendor.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.smoke.ts"],
    reporters: ["verbose"],
    testTimeout: 180_000,
  },
});
