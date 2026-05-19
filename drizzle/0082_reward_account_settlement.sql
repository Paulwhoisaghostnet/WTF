ALTER TABLE "reward_ledger"
  ADD COLUMN IF NOT EXISTS "settlement_status" varchar(24) DEFAULT 'available' NOT NULL,
  ADD COLUMN IF NOT EXISTS "settlement_type" varchar(32),
  ADD COLUMN IF NOT EXISTS "settlement_ref" varchar(160),
  ADD COLUMN IF NOT EXISTS "settled_at" timestamp;

UPDATE "reward_ledger"
SET "settlement_status" = CASE WHEN "paid" THEN 'paid' ELSE 'available' END
WHERE "settlement_status" IS NULL;

CREATE INDEX IF NOT EXISTS "reward_ledger_user_settlement_idx"
  ON "reward_ledger" ("user_id", "settlement_status");

CREATE INDEX IF NOT EXISTS "reward_ledger_settlement_ref_idx"
  ON "reward_ledger" ("settlement_type", "settlement_ref");

ALTER TABLE "in_app_market_payment_intents"
  ALTER COLUMN "currency" TYPE varchar(16);

ALTER TABLE "in_app_market_purchases"
  ALTER COLUMN "currency" TYPE varchar(16);

CREATE TABLE IF NOT EXISTS "reward_cashout_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_address" varchar(80) NOT NULL,
  "amount_wtf" numeric(40, 0) NOT NULL,
  "amount_wtf_raw" numeric(40, 0) NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "ledger_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "op_hash" varchar(80),
  "operator_wallet_run_id" integer,
  "requested_at" timestamp DEFAULT now() NOT NULL,
  "processed_at" timestamp,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "reward_cashouts_user_status_idx"
  ON "reward_cashout_requests" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "reward_cashouts_status_requested_idx"
  ON "reward_cashout_requests" ("status", "requested_at");

CREATE INDEX IF NOT EXISTS "reward_cashouts_op_hash_idx"
  ON "reward_cashout_requests" ("op_hash");
