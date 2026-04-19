-- Cockpit migration — Phase 2
--
-- Derived wallet holdings table.  Populated by the `holdings-derive`
-- scheduler job from raw wallet_events.  Fixes the legacy
-- user_owned_tokens.last_seen_at sort bug.
--
-- Rollback: DROP TABLE IF EXISTS wallet_holdings CASCADE;

CREATE TABLE IF NOT EXISTS "wallet_holdings" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_address" varchar(36) NOT NULL,
  "token_contract" varchar(36) NOT NULL,
  "token_id" text NOT NULL,
  "balance" text NOT NULL,
  "first_acquired_at" timestamp,
  "last_activity_at" timestamp,
  "derived_at" timestamp DEFAULT now() NOT NULL,
  "tzkt_first_time" timestamp,
  "tzkt_last_time" timestamp,
  "is_creator" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_holdings_wallet_token"
  ON "wallet_holdings" ("wallet_address", "token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_holdings_user_activity"
  ON "wallet_holdings" ("user_id", "last_activity_at");
CREATE INDEX IF NOT EXISTS "idx_holdings_user_acquired"
  ON "wallet_holdings" ("user_id", "first_acquired_at");
CREATE INDEX IF NOT EXISTS "idx_holdings_contract_token"
  ON "wallet_holdings" ("token_contract", "token_id");
