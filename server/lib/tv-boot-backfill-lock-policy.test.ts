import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/lib/tv-boot-backfill.ts", "utf8");

test("TV boot backfill is protected by a single-writer advisory lock", () => {
  const lockIndex = source.indexOf("pg_try_advisory_lock");
  const ddlIndex = source.indexOf("const tvHardeningDdl");
  const unlockIndex = source.indexOf("pg_advisory_unlock");
  const releaseIndex = source.indexOf("client.release()");

  assert.notEqual(lockIndex, -1, "boot backfill must attempt an advisory lock");
  assert.notEqual(ddlIndex, -1, "test expects the schema-like DDL block to exist");
  assert.ok(lockIndex < ddlIndex, "advisory lock must be acquired before schema-like work");
  assert.match(source, /if \(!lockAcquired\)[\s\S]*return;/);
  assert.notEqual(unlockIndex, -1, "boot backfill must release the advisory lock");
  assert.ok(unlockIndex < releaseIndex, "advisory lock must be released before the client is released");
  assert.match(source, /finally \{/);
});
