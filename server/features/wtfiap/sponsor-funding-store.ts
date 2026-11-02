import type { Pool, PoolClient } from "pg";
import type { SponsorRecord, SponsorStore } from "./sponsor-funding";

/** Sponsor liabilities have their own table and worker lock. The shared
 * deployment-gate lock protects them alongside legacy funded rooms. */
export function postgresSponsorStore(pool: Pool, connection?: PoolClient): SponsorStore {
  const queryable = connection || pool;
  return {
    async read(code) {
      const rows = await queryable.query(
        "SELECT document FROM wtfiap_sponsor_funding WHERE room_code=$1", [code]);
      return rows.rows[0]?.document as SponsorRecord | null ?? null;
    },
    async list() {
      const rows = await queryable.query(
        "SELECT document FROM wtfiap_sponsor_funding ORDER BY room_code");
      return rows.rows.map(row => row.document as SponsorRecord);
    },
    async mutate(code, fn) {
      const client = connection || await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('wtfiap-deployment-gate',0))");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["wtfiap-sponsor:" + code]);
        const rows = await client.query("SELECT document FROM wtfiap_sponsor_funding WHERE room_code=$1 FOR UPDATE", [code]);
        const result = await fn(rows.rows[0]?.document ?? null);
        await client.query(`INSERT INTO wtfiap_sponsor_funding(room_code,document) VALUES($1,$2::jsonb)
          ON CONFLICT(room_code) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`,
          [code, JSON.stringify(result.record)]);
        await client.query("COMMIT");
        return result.value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        if (!connection) client.release();
      }
    },
    async exclusive(fn) {
      const client = connection || await pool.connect();
      let locked = false;
      try {
        const result = await client.query(
          "SELECT pg_try_advisory_lock(hashtextextended('wtfiap-sponsor-worker',0)) AS locked");
        locked = result.rows[0]?.locked === true;
        if (!locked) return false;
        await fn();
        return true;
      } finally {
        if (locked) await client.query(
          "SELECT pg_advisory_unlock(hashtextextended('wtfiap-sponsor-worker',0))");
        if (!connection) client.release();
      }
    },
  };
}
