import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bootBackfill = readFileSync("scripts/run-boot-backfill.ts", "utf8");

test("boot backfill refuses to synthesize a Supabase pooler URL without explicit region", () => {
  assert.doesNotMatch(bootBackfill, /SUPABASE_REGION\s*\|\|\s*["']us-west-2["']/);
  assert.match(bootBackfill, /const region = process\.env\.SUPABASE_REGION/);
  assert.match(bootBackfill, /if \(!region\) \{/);
  assert.match(
    bootBackfill,
    /SUPABASE_REGION is required for --supabase boot backfill; refusing to guess a pooler region/
  );
  assert.match(bootBackfill, /aws-1-\$\{region\}\.pooler\.supabase\.com/);
});

test("explicit Supabase backup URL remains the operator-pinned override", () => {
  assert.match(
    bootBackfill,
    /process\.env\.SUPABASE_BACKUP_URL \|\| \(await resolveSupabaseUrl\(\)\)/
  );
  assert.match(bootBackfill, /const sslmode = allowInsecureDbTls\(\) \? "no-verify" : "require"/);
});
