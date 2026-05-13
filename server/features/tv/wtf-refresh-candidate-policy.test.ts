import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const refreshSource = readFileSync("server/features/tv/wtf-refresh.ts", "utf8");
const schemaSource = readFileSync("shared/schema-wallet.ts", "utf8");
const migrationSource = readFileSync(
  "drizzle/0077_wallet_holdings_refresh_candidates.sql",
  "utf8"
);

test("WTF TV refresh candidate query does not sort wallet holdings randomly", () => {
  assert.doesNotMatch(refreshSource, /RANDOM\s*\(/i);
  assert.match(refreshSource, /lastActivityAt\} DESC NULLS LAST/);
  assert.match(refreshSource, /derivedAt\} DESC/);
  assert.match(refreshSource, /asc\(walletHoldings\.id\)/);
});

test("wallet holdings expose an index for deterministic refresh candidate priority", () => {
  assert.match(schemaSource, /idxRefreshCandidates/);
  assert.match(schemaSource, /idx_holdings_refresh_candidates/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "idx_holdings_refresh_candidates"/);
  assert.match(migrationSource, /"wallet_holdings" \("last_activity_at", "derived_at", "id"\)/);
});
