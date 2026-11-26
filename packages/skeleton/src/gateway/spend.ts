// The workspace daily spend cap (Requirement 13, OPS-06). A Reservation is one conditional
// insert-or-update, so concurrent calls for one workspace can never take the stored total over the cap.
import { sql } from "drizzle-orm";
import type { DbHandle } from "../db/client.ts";

export interface SpendKey {
  appId: string;
  workspaceId: string;
  /** UTC day, YYYY-MM-DD. */
  day: string;
}

export interface SpendStore {
  /** Add `micros` if the day's total stays within `capMicros`. Returns false, changing nothing, otherwise. */
  reserve(key: SpendKey, micros: number, capMicros: number): Promise<boolean>;
  /** Replace a Reservation with the actual cost (which may exceed it). */
  settle(key: SpendKey, reservedMicros: number, actualMicros: number): Promise<void>;
  release(key: SpendKey, reservedMicros: number): Promise<void>;
  spent(key: SpendKey): Promise<number>;
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function dbSpendStore(handle: Pick<DbHandle, "execute">): SpendStore {
  const add = (k: SpendKey, delta: number) =>
    handle.execute(sql`
      update bones.spend set spent_micros = spent_micros + ${delta}::bigint
      where app_id = ${k.appId} and workspace_id = ${k.workspaceId} and day = ${k.day}::date`);
  return {
    async reserve(k, micros, cap) {
      const rows = await handle.execute(sql`
        insert into bones.spend (app_id, workspace_id, day, spent_micros)
        select ${k.appId}, ${k.workspaceId}, ${k.day}::date, ${micros}::bigint
        where ${micros}::bigint <= ${cap}::bigint
        on conflict (app_id, workspace_id, day)
        do update set spent_micros = bones.spend.spent_micros + excluded.spent_micros
        where bones.spend.spent_micros + excluded.spent_micros <= ${cap}::bigint
        returning spent_micros`);
      return rows.length > 0;
    },
    async settle(k, reserved, actual) {
      if (actual !== reserved) await add(k, actual - reserved);
    },
    async release(k, reserved) {
      if (reserved !== 0) await add(k, -reserved);
    },
    async spent(k) {
      const rows = await handle.execute(sql`
        select spent_micros from bones.spend where app_id = ${k.appId} and workspace_id = ${k.workspaceId} and day = ${k.day}::date`);
      return Number(rows[0]?.spent_micros ?? 0);
    },
  };
}

/** An in-process store with the same contract, for tests and database-less runs. */
export function memorySpendStore(): SpendStore {
  const totals = new Map<string, number>();
  const id = (k: SpendKey) => `${k.appId}\u0000${k.workspaceId}\u0000${k.day}`;
  return {
    async reserve(k, micros, cap) {
      const next = (totals.get(id(k)) ?? 0) + micros;
      if (next > cap) return false;
      totals.set(id(k), next);
      return true;
    },
    async settle(k, reserved, actual) {
      totals.set(id(k), (totals.get(id(k)) ?? 0) + actual - reserved);
    },
    async release(k, reserved) {
      totals.set(id(k), (totals.get(id(k)) ?? 0) - reserved);
    },
    async spent(k) {
      return totals.get(id(k)) ?? 0;
    },
  };
}
