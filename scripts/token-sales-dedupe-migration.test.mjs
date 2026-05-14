import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../drizzle/0080_token_sales_dedupe_unique_key.sql",
  import.meta.url
);
const backfillPath = new URL("../server/lib/backfill-handlers.ts", import.meta.url);

test("token sales migration deduplicates before recreating the nullable-seller unique key", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /row_number\(\) OVER/i);
  assert.match(sql, /PARTITION BY\s+op_hash,\s+token_contract,\s+token_id,\s+coalesce\(seller_address, ''\),\s+buyer_address/is);
  assert.match(sql, /DELETE FROM token_sales AS loser/is);
  assert.match(sql, /DROP INDEX IF EXISTS uniq_sales_ophash/i);
  assert.match(sql, /CREATE UNIQUE INDEX uniq_sales_ophash/is);
  assert.match(sql, /coalesce\(seller_address, ''\)/i);
});

test("acquisition resolver upserts against the same expression unique key", async () => {
  const source = await readFile(backfillPath, "utf8");

  assert.match(
    source,
    /ON CONFLICT \(op_hash, token_contract, token_id, \(COALESCE\(seller_address, ''\)\), buyer_address\)/
  );
});
