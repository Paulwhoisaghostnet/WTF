import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { postgresFundingStore } from "./funding-store";
import type { FundingRecord } from "./funding";

const url = process.env.WTFIAP_TEST_DATABASE_URL;
test("PostgreSQL funding records survive new connections and serialize concurrent intents and deployment", { skip: !url && "Set the isolated local WTFIAP_TEST_DATABASE_URL to exercise PostgreSQL." }, async () => {
  const parsed = new URL(url!);
  assert(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "This proof may only write to a local disposable PostgreSQL database.");
  const schema = "wtfiap_proof_" + randomUUID().replace(/-/g, "");
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  let pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await pool.query(readFileSync("drizzle/0132_wtfiap_funding.sql", "utf8"));
    let store = postgresFundingStore(pool);
    const record = { schemaVersion: 1, roomCode: "durable-room", intents: [], count: 0 } as unknown as FundingRecord;
    await store.mutate(record.roomCode, () => ({ record, value: null }));
    await Promise.all(Array.from({ length: 8 }, (_, seat) => store.mutate(record.roomCode, old => {
      assert(old); (old as any).count++; old.intents.push({ id: String(seat) } as any); return { record: old, value: null };
    })));
    const saved = await store.read(record.roomCode); assert.equal((saved as any).count, 8); assert.equal(saved!.intents.length, 8);
    await assert.rejects(store.mutate(record.roomCode, old => { (old as any).count = 99; throw new Error("transaction failure"); }), /transaction failure/);
    await pool.end(); pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` }); store = postgresFundingStore(pool);
    assert.deepEqual(await store.read(record.roomCode), saved);
    const deployer = await pool.connect();
    await deployer.query("SELECT pg_advisory_lock(hashtextextended('wtfiap-deployment-gate',0))");
    let mutated = false;
    const pending = store.mutate(record.roomCode, old => { mutated = true; assert(old); return { record: old, value: null }; });
    // Observe PostgreSQL's actual lock wait instead of using an arbitrary sleep.
    while (true) {
      const waiters = await admin.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted");
      if (waiters.rows[0].n > 0) break;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    assert.equal(mutated, false);
    await deployer.query("SELECT pg_advisory_unlock(hashtextextended('wtfiap-deployment-gate',0))"); deployer.release();
    await pending; assert.equal(mutated, true);
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void; const inside = new Promise<void>(resolve => { entered = resolve; });
    const worker = store.exclusive(async () => { entered(); await hold; }); await inside;
    assert.equal(await store.exclusive(async () => { throw new Error("second worker entered"); }), false);
    release(); assert.equal(await worker, true);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); }
});
