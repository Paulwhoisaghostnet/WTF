import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../drizzle/0076_tv_wtf_config_active_unique.sql",
  import.meta.url
);

test("tv WTF config migration deduplicates active rows before adding the partial unique index", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /ranked_active_configs/);
  assert.match(sql, /row_number\(\) OVER/i);
  assert.match(sql, /WHERE "enabled" = true/);
  assert.match(sql, /ranked\.rank > 1/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "tv_wtf_channel_config_one_enabled_idx"/
  );
  assert.match(sql, /WHERE "enabled" = true/);
});
