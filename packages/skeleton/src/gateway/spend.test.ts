import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../db/client.ts";
import { dbSpendStore, memorySpendStore, utcDay, type SpendStore } from "./spend.ts";

const key = { appId: "echo", workspaceId: "w1", day: "2026-11-26" };

function contract(name: string, make: () => SpendStore) {
  describe(`${name} spend store (Requirement 13)`, () => {
    it("reserves up to the cap and refuses past it, changing nothing", async () => {
      const s = make();
      const k = { ...key, workspaceId: `${name}-cap` };
      expect(await s.reserve(k, 600, 1000)).toBe(true);
      expect(await s.reserve(k, 400, 1000)).toBe(true);
      expect(await s.reserve(k, 1, 1000)).toBe(false);
      expect(await s.spent(k)).toBe(1000);
      expect(await s.reserve({ ...k, workspaceId: `${name}-fresh` }, 1001, 1000)).toBe(false);
      expect(await s.spent({ ...k, workspaceId: `${name}-fresh` })).toBe(0);
    });

    it("settles to the actual cost, even above the reservation, and releases", async () => {
      const s = make();
      const k = { ...key, workspaceId: `${name}-settle` };
      await s.reserve(k, 500, 1000);
      await s.settle(k, 500, 700);
      expect(await s.spent(k)).toBe(700);
      await s.reserve(k, 200, 1000);
      await s.release(k, 200);
      expect(await s.spent(k)).toBe(700);
    });

    it("never lets concurrent reservations exceed the cap", async () => {
      const s = make();
      const k = { ...key, workspaceId: `${name}-race` };
      const results = await Promise.all(Array.from({ length: 10 }, () => s.reserve(k, 300, 1000)));
      expect(results.filter(Boolean)).toHaveLength(3);
      expect(await s.spent(k)).toBe(900);
    });
  });
}

contract("memory", memorySpendStore);

describe("on PGlite", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await createDb("pglite://memory");
    await h.migrate();
  }, 60_000);
  afterAll(() => h.close());
  contract("db", () => dbSpendStore(h));
});

describe.runIf(process.env.TEST_DATABASE_URL)("on TEST_DATABASE_URL", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await createDb(process.env.TEST_DATABASE_URL as string);
    await h.migrate();
  }, 60_000);
  afterAll(() => h.close());
  contract("postgres", () => dbSpendStore(h));
});

describe("utcDay", () => {
  it("uses the UTC calendar day", () => {
    expect(utcDay(Date.UTC(2026, 10, 26, 23, 59))).toBe("2026-11-26");
  });
});
