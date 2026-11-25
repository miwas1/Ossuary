// drizzle-kit config. It sits at the package root, where drizzle-kit looks for it (D-31);
// the schema and migrations live in src/db/.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
});
