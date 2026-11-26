// Database tests (Requirement 5.5, 5.8): always on PGlite, and on TEST_DATABASE_URL when CI sets it.
// Tests never read DATABASE_URL, so they can't touch a development database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client.ts";
import { BONES_TABLES } from "./schema.ts";

const journal = JSON.parse(fs.readFileSync(new URL("./migrations/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: unknown[];
};

async function applied(h: DbHandle): Promise<number> {
  const rows = await h.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  return Number(rows[0]?.n);
}

const targets: [string, string][] = [["PGlite in memory", "pglite://memory"]];
if (process.env.TEST_DATABASE_URL) targets.push(["TEST_DATABASE_URL", process.env.TEST_DATABASE_URL]);

describe.each(targets)("migrations on %s", (_name, url) => {
  it("applies every migration once, and a second run adds none", { timeout: 60_000 }, async () => {
    const h = await createDb(url);
    try {
      await h.migrate();
      expect(await applied(h)).toBe(journal.entries.length);
      await h.migrate();
      expect(await applied(h)).toBe(journal.entries.length);
      const rows = await h.execute(sql`select table_name from information_schema.tables where table_schema = 'bones' order by table_name`);
      expect(rows.map((r) => r.table_name)).toEqual([...BONES_TABLES].sort());
    } finally {
      await h.close();
    }
  });
});

describe("createDb", () => {
  it("keeps a pglite://<folder> database between opens", { timeout: 60_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-"));
    try {
      const first = await createDb(`pglite://${dir}`);
      await first.migrate();
      await first.close();
      const second = await createDb(`pglite://${dir}`);
      expect(await applied(second)).toBe(journal.entries.length);
      await second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects other URL schemes without echoing the URL", async () => {
    const err = await createDb("mysql://root:hunter2@db:3306/x").catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/unsupported URL scheme "mysql"/);
    expect((err as Error).message).not.toMatch(/hunter2/);
  });

  it("keeps migration 0000 unchanged and adds the bones schema as 0001 (Requirement 21.2)", () => {
    const files = fs.readdirSync(new URL("./migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toBe("0000_init.sql");
    expect(files[1]).toMatch(/^0001_.*\.sql$/);
    expect(fs.readFileSync(new URL("./migrations/0000_init.sql", import.meta.url), "utf8").trim()).toBe("-- Custom SQL migration file, put your code below! --");
    expect(journal.entries).toHaveLength(2);
  });
});
