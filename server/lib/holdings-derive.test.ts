import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./holdings-derive.ts", import.meta.url), "utf8");
const walletSchema = readFileSync(new URL("../../shared/schema-wallet.ts", import.meta.url), "utf8");
const bigintMigration = readFileSync(new URL("../../drizzle/0096_wallet_holdings_bigint_id.sql", import.meta.url), "utf8");

test("holdings derive normalizes token_amount before numeric aggregation", () => {
  assert.match(source, /WITH normalized_events AS/);
  assert.match(source, /NULLIF\(BTRIM\(we\.token_amount\), ''\) ~ '\^\[0-9\]\+\(\[.\]\[0-9\]\+\)\?\$'/);
  assert.match(source, /ELSE 1/);
  assert.match(source, /we\.token_amount_numeric/);
  assert.doesNotMatch(source, /NULLIF\(we\.token_amount,''\)::numeric/);
});

test("wallet holdings id uses bigint capacity in schema and migration", () => {
  assert.match(walletSchema, /bigserial\("id", \{ mode: "number" \}\)\.primaryKey\(\)/);
  assert.match(bigintMigration, /ALTER TABLE wallet_holdings\s+ALTER COLUMN id TYPE bigint;/);
  assert.match(bigintMigration, /ALTER SEQUENCE wallet_holdings_id_seq\s+AS bigint\s+NO MAXVALUE;/);
  assert.match(bigintMigration, /setval\(\s+'wallet_holdings_id_seq'/);
});
