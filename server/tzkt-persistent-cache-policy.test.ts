import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("TzKT hot-route cache is persistent, expiring, and bounded", () => {
  const schema = readFileSync("shared/schema-ops.ts", "utf8");
  const migration = readFileSync("drizzle/0081_tzkt_response_cache.sql", "utf8");
  const helper = readFileSync("server/lib/tzkt-response-cache.ts", "utf8");
  const tzkt = readFileSync("server/tzkt.ts", "utf8");

  assert.match(schema, /tzktResponseCache/);
  assert.match(schema, /expiresAt:\s*timestamp\("expires_at"/);
  assert.match(schema, /hitCount:\s*integer\("hit_count"\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tzkt_response_cache/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS tzkt_response_cache_expires_idx/);
  assert.match(helper, /readTzktResponseCache/);
  assert.match(helper, /writeTzktResponseCache/);
  assert.match(helper, /pruneTzktResponseCache/);
  assert.match(helper, /OFFSET \$\{boundedLimit\}/);
  assert.match(tzkt, /readPersistentCached/);
  assert.match(tzkt, /writePersistentCached/);
});
