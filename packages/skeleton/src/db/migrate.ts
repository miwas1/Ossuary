// pnpm db:migrate: apply pending migrations to DATABASE_URL (Requirement 5.6, 5.7).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.ts";

const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("db:migrate: DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}

/** Where we tried to connect, without the credentials. */
function target(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === "pglite:" ? "PGlite" : `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "the database";
  }
}

try {
  const handle = await createDb(url);
  try {
    await handle.migrate();
  } finally {
    await handle.close();
  }
  console.log(`db:migrate: migrations applied on ${target(url)}`);
} catch (err) {
  const message = (err instanceof Error ? err.message : String(err)).split(url).join("<DATABASE_URL>");
  console.error(`db:migrate: failed on ${target(url)}: ${message}`);
  process.exit(1);
}
