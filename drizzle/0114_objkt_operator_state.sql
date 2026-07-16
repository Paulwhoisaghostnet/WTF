BEGIN;

CREATE TABLE IF NOT EXISTS "objkt_operator_states" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "wallet_address" varchar(36),
  "settings" jsonb NOT NULL DEFAULT '{"spendCapXtz":10,"maxItemPriceXtz":2,"perCreatorLimit":20,"walletReserveXtz":0.15,"minCandidateScore":55,"minResaleConfidence":44,"minRecentSales180d":2,"requireSaleReference":true}'::jsonb,
  "creators" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "scan" jsonb,
  "queue" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "session" jsonb NOT NULL DEFAULT '{"kukaiStatus":"not_started","kukaiTabOpenedAt":null,"kukaiReadyAt":null,"objktAccountStatus":"not_started","objktAccountOpenedAt":null,"objktWalletAddress":null,"objktWalletLinkedAt":null,"runArmed":false}'::jsonb,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "objkt_operator_wallet_address_check"
    CHECK ("wallet_address" IS NULL OR "wallet_address" ~ '^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$')
);

COMMIT;
