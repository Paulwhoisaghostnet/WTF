import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dbPush = readFileSync("scripts/db-push.mjs", "utf8");
const bootBackfill = readFileSync("scripts/run-boot-backfill.ts", "utf8");
const connectionCheck = readFileSync("scripts/check-db-connection.mjs", "utf8");
const urlResolver = readFileSync("scripts/resolve-database-url.mjs", "utf8");

test("Supabase database helpers require certificate and hostname verification", () => {
  for (const [name, source] of [
    ["db push", dbPush],
    ["boot backfill", bootBackfill],
    ["URL resolver", urlResolver],
  ]) {
    assert.match(source, /verify-full/, `${name} must emit verify-full`);
    assert.doesNotMatch(
      source,
      /sslmode=require|:\s*["']require["']/,
      `${name} must not rely on the pg 8 require alias`
    );
  }
  assert.match(
    connectionCheck,
    /parsed\.searchParams\.set\([\s\S]*?allowInsecureDbTls \? "no-verify" : "verify-full"/
  );
  assert.match(connectionCheck, /connectionString: normalizedDbUrl/);
  assert.doesNotMatch(connectionCheck, /connectionString: dbUrl/);
  assert.match(
    bootBackfill,
    /process\.env\.DATABASE_URL = normalizeSupabaseTls\(rawUrl\)/
  );
});

test("the TLS downgrade remains explicit and warning-backed", () => {
  for (const [name, source] of [
    ["db push", dbPush],
    ["boot backfill", bootBackfill],
    ["connection check", connectionCheck],
  ]) {
    assert.match(source, /ALLOW_INSECURE_DB_TLS/,
      `${name} must name the emergency override`);
    assert.match(source, /WARNING|Warning/,
      `${name} must warn when certificate verification is disabled`);
  }
});
