import type { Pool, PoolClient } from "pg";
import type { FundingRecord } from "./funding";

export interface FundingStore {
  read(roomCode: string): Promise<FundingRecord | null>;
  list(): Promise<FundingRecord[]>;
  mutate<T>(roomCode: string, fn: (record: FundingRecord | null) => Promise<{ record: FundingRecord; value: T }> | { record: FundingRecord; value: T }): Promise<T>;
  exclusive(fn: () => Promise<void>): Promise<boolean>;
}

export function postgresFundingStore(pool: Pool, connection?: PoolClient): FundingStore {
  const queryable = connection || pool;
  return {
    async read(code) {
      const result = await queryable.query("SELECT document FROM wtfiap_funded_rooms WHERE room_code=$1", [code]);
      return result.rows[0]?.document ?? null;
    },
    async list() {
      const result = await queryable.query("SELECT document FROM wtfiap_funded_rooms ORDER BY room_code");
      return result.rows.map(row => row.document);
    },
    async mutate(code, fn) {
      const client = connection || await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('wtfiap-deployment-gate',0))");
        // The transaction-level advisory lock also covers first insertion,
        // where SELECT FOR UPDATE alone cannot lock a missing row.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["wtfiap-room:" + code]);
        const rows = await client.query("SELECT document FROM wtfiap_funded_rooms WHERE room_code=$1 FOR UPDATE", [code]);
        const result = await fn(rows.rows[0]?.document ?? null);
        await client.query(`INSERT INTO wtfiap_funded_rooms(room_code,document) VALUES($1,$2::jsonb)
          ON CONFLICT(room_code) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`, [code, JSON.stringify(result.record)]);
        await client.query("COMMIT");
        return result.value;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { if (!connection) client.release(); }
    },
    async exclusive(fn) {
      const client = connection || await pool.connect();
      let locked = false;
      try {
        const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended('wtfiap-funding-worker',0)) AS locked");
        locked = result.rows[0]?.locked === true;
        if (!locked) return false;
        await fn(); return true;
      } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('wtfiap-funding-worker',0))");
        if (!connection) client.release();
      }
    },
  };
}
