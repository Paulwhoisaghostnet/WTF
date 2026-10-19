import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("backfill migration preserves IDs and resumes conflict-heavy seeding past the exhausted int4 sequence", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `backfill_capacity_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const proof = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  let applicationPool: pg.Pool | undefined;
  const previousUrl = process.env.DATABASE_URL;
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    await proof.query(readFileSync("drizzle/0017_backfill_manifest.sql", "utf8"));
    await proof.query("INSERT INTO backfill_manifest (id, task_type, target, payload, status, attempts) VALUES (1, 'address_label', 'preserve-complete', '{\"keep\":true}', 'completed', 2), (2147483647, 'address_label', 'preserve-pending', null, 'pending', 0)");
    await proof.query("SELECT setval('backfill_manifest_id_seq', 2147483647, true)");
    await assert.rejects(proof.query("INSERT INTO backfill_manifest (task_type, target) VALUES ('address_label', 'preserve-complete') ON CONFLICT (task_type,target) DO NOTHING"), (error: any) => error.code === "2200H");
    const migration = readFileSync("drizzle/0131_backfill_manifest_bigint_id.sql", "utf8");
    await proof.query(migration);
    await proof.query(migration); // The deploy path may safely re-apply SQL migrations.
    const sequence = await proof.query("SELECT last_value, is_called FROM backfill_manifest_id_seq");
    assert.deepEqual(sequence.rows[0], { last_value: "2147483647", is_called: true });
    const database = drizzle(proof, { schema });
    const [inserted] = await database.insert(schema.backfillManifest).values({ taskType: "address_label", target: "first-bigint" }).returning();
    assert.equal(inserted.id, 2147483648);
    assert.equal(typeof inserted.id, "number");
    // Exercise the actual manifest CRUD owner against this disposable schema.
    const scoped = new URL(connectionString!);
    scoped.searchParams.set("options", `-c search_path=${namespace},public`);
    process.env.DATABASE_URL = scoped.toString();
    const manifest = await import("./backfill-manifest");
    applicationPool = (await import("../db")).pool;
    const insertedCount = await manifest.enqueueBatch([
      { taskType: "address_label", target: "preserve-complete" },
      { taskType: "address_label", target: "second-bigint" },
    ]);
    assert.equal(insertedCount, 1);
    const claimed = await manifest.claim({ limit: 3, taskType: "address_label" });
    assert.deepEqual(claimed.map((row) => row.id).sort((a, b) => a - b), [2147483647, 2147483648, 2147483650]);
    assert.ok(claimed.every((row) => typeof row.id === "number" && Number.isSafeInteger(row.id)));
    for (const row of claimed) assert.equal(await manifest.complete(row.id), true);
    const preserved = await proof.query("SELECT id, payload, status, attempts FROM backfill_manifest WHERE target='preserve-complete'");
    assert.deepEqual(preserved.rows[0], { id: "1", payload: { keep: true }, status: "completed", attempts: 2 });
    const state = await proof.query("SELECT COUNT(*)::int AS count FROM backfill_manifest WHERE status='completed'");
    assert.equal(state.rows[0].count, 4);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await applicationPool?.end();
    await proof.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
