CREATE TABLE IF NOT EXISTS "user_etherlink_wallets" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_address" varchar(42) NOT NULL,
  "chain_id" integer NOT NULL,
  "network" varchar(32) NOT NULL,
  "provider_key" varchar(32),
  "provider_name" varchar(80),
  "native_balance_wei" text NOT NULL DEFAULT '0',
  "is_primary" boolean NOT NULL DEFAULT false,
  "linked_at" timestamp NOT NULL DEFAULT now(),
  "last_synced_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_etherlink_wallet_chain"
  ON "user_etherlink_wallets" ("chain_id", "wallet_address");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_etherlink_wallet_chain_lower"
  ON "user_etherlink_wallets" ("chain_id", lower("wallet_address"));
CREATE INDEX IF NOT EXISTS "idx_user_etherlink_wallet_user"
  ON "user_etherlink_wallets" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_etherlink_wallet_network"
  ON "user_etherlink_wallets" ("chain_id", "network");

CREATE TABLE IF NOT EXISTS "etherlink_wallet_auth_nonces" (
  "id" serial PRIMARY KEY,
  "wallet_address" varchar(42) NOT NULL,
  "chain_id" integer NOT NULL,
  "nonce" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_etherlink_nonce_wallet"
  ON "etherlink_wallet_auth_nonces" ("chain_id", "wallet_address", "nonce");
CREATE INDEX IF NOT EXISTS "idx_etherlink_nonce_expiry"
  ON "etherlink_wallet_auth_nonces" ("expires_at");

CREATE TABLE IF NOT EXISTS "etherlink_token_metadata" (
  "id" serial PRIMARY KEY,
  "chain_id" integer NOT NULL,
  "network" varchar(32) NOT NULL,
  "token_contract" varchar(42) NOT NULL,
  "token_id" text NOT NULL,
  "token_standard" varchar(16) NOT NULL,
  "name" text,
  "symbol" text,
  "decimals" integer,
  "description" text,
  "thumbnail" text,
  "artifact_uri" text,
  "display_uri" text,
  "external_url" text,
  "raw" jsonb,
  "fetched_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_etherlink_token_metadata"
  ON "etherlink_token_metadata" ("chain_id", "token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_etherlink_token_contract"
  ON "etherlink_token_metadata" ("chain_id", "token_contract");

CREATE TABLE IF NOT EXISTS "etherlink_wallet_holdings" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_address" varchar(42) NOT NULL,
  "chain_id" integer NOT NULL,
  "network" varchar(32) NOT NULL,
  "token_contract" varchar(42) NOT NULL,
  "token_id" text NOT NULL,
  "token_standard" varchar(16) NOT NULL,
  "balance" text NOT NULL,
  "derived_at" timestamp NOT NULL DEFAULT now(),
  "last_activity_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_etherlink_holdings_wallet_token"
  ON "etherlink_wallet_holdings" ("chain_id", "wallet_address", "token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_etherlink_holdings_user_activity"
  ON "etherlink_wallet_holdings" ("user_id", "derived_at");
CREATE INDEX IF NOT EXISTS "idx_etherlink_holdings_contract_token"
  ON "etherlink_wallet_holdings" ("chain_id", "token_contract", "token_id");
