CREATE INDEX IF NOT EXISTS "idx_holdings_refresh_candidates"
  ON "wallet_holdings" ("last_activity_at", "derived_at", "id");
