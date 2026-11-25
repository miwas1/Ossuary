// createDb(url): one Drizzle database over PGlite (tests, evals, no server) or node-postgres
// (WSL PostgreSQL locally, Render in production). D-35, D-37. Internal until Phase 1 exports it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema.ts";

export type Schema = typeof schema;
export type Db = PgliteDatabase<Schema> | NodePgDatabase<Schema>;

export interface DbHandle {
  db: Db;
  driver: "pglite" | "postgres";
  /** Apply every pending migration in ./migrations. */
  migrate(): Promise<void>;
  /** Run a query and return its rows. */
  execute(query: SQL): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

export const ACCEPTED_URLS = "pglite://memory, pglite://<folder> or postgres://";

/** Open a database. The URL is never echoed in errors, because it can hold a password. */
export async function createDb(url: string): Promise<DbHandle> {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();

  if (scheme === "pglite") {
    const target = url.slice("pglite://".length);
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    const client = target === "memory" || target === "" ? new PGlite() : new PGlite(path.resolve(target));
    const db = drizzle(client, { schema });
    return {
      db,
      driver: "pglite",
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      execute: async (query) => (await db.execute(query)).rows as Record<string, unknown>[],
      close: () => client.close(),
    };
  }

  if (scheme === "postgres" || scheme === "postgresql") {
    const [pg, { drizzle }, { migrate }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new pg.default.Pool({ connectionString: url, max: 4 });
    const db = drizzle(pool, { schema });
    return {
      db,
      driver: "postgres",
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      execute: async (query) => (await db.execute(query)).rows as Record<string, unknown>[],
      close: () => pool.end(),
    };
  }

  throw new Error(`createDb: unsupported URL scheme "${scheme ?? ""}"; use ${ACCEPTED_URLS}`);
}
