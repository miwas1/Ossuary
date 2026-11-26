import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each database suite starts its own PGlite runtime. Limit peak memory in CI and WSL.
    maxWorkers: 1,
    reporters: ["verbose"],
  },
});
