-- Analytics phase 1 — honest cost/sale/market tracking.
--
-- Drizzle-kit push --force will create these tables automatically from
-- shared/schema.ts on deploy.  This file exists for manual recovery
-- and for the import workflow, which runs it defensively *before*
-- COPYing the intel CSV dump so the target tables definitely exist
-- even if the current app container is running an older schema.
--
-- EVERYTHING here is idempotent: re-running is always safe.

-- ── address_labels additions ────────────────────────────────────────
ALTER TABLE "address_labels"
  ADD COLUMN IF NOT EXISTS "has_ever_minted" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_resolved_at" timestamp;
CREATE INDEX IF NOT EXISTS "idx_address_labels_minted"
  ON "address_labels" ("has_ever_minted");

-- ── token_metadata additions ───────────────────────────────────────
ALTER TABLE "token_metadata"
  ADD COLUMN IF NOT EXISTS "creator_address" varchar(64),
  ADD COLUMN IF NOT EXISTS "supply" bigint;
CREATE INDEX IF NOT EXISTS "idx_token_metadata_creator"
  ON "token_metadata" ("creator_address");

-- ── xtz_usd_daily ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "xtz_usd_daily" (
  "day"        date PRIMARY KEY,
  "price_usd"  numeric(18, 6) NOT NULL,
  "source"     varchar(32)    NOT NULL DEFAULT 'tzkt_quotes',
  "fetched_at" timestamp      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_xtz_usd_daily_source"
  ON "xtz_usd_daily" ("source");

-- ── token_mint_events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "token_mint_events" (
  "id"               serial PRIMARY KEY,
  "token_contract"   varchar(36) NOT NULL,
  "token_id"         text        NOT NULL,
  "editions"         integer     NOT NULL DEFAULT 1,
  "minter_address"   varchar(64) NOT NULL,
  "first_owner"      varchar(64),
  "op_hash"          varchar(72) NOT NULL,
  "block_level"      bigint,
  "minted_at"        timestamptz NOT NULL,
  "platform"         varchar(32),
  "objkt_event_id"   text,
  "mint_fee_mutez"   bigint,
  "source"           varchar(32) NOT NULL DEFAULT 'intel_csv',
  "imported_at"      timestamp   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_mint_op"
  ON "token_mint_events" ("token_contract", "token_id", "op_hash");
CREATE INDEX IF NOT EXISTS "idx_mint_events_token"
  ON "token_mint_events" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_mint_events_minter"
  ON "token_mint_events" ("minter_address");
CREATE INDEX IF NOT EXISTS "idx_mint_events_minted_at"
  ON "token_mint_events" ("minted_at");

-- ── token_sales ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "token_sales" (
  "id"                  serial PRIMARY KEY,
  "token_contract"      varchar(36) NOT NULL,
  "token_id"            text        NOT NULL,
  "legacy_id"           bigint,
  "tzkt_op_id"          bigint,
  "op_hash"             varchar(72) NOT NULL,
  "seller_address"      varchar(64) NOT NULL,
  "buyer_address"       varchar(64) NOT NULL,
  "price_mutez"         bigint      NOT NULL,
  "price_usd"           numeric(24, 6),
  "royalties_mutez"     bigint      DEFAULT 0,
  "platform_fee_mutez"  bigint      DEFAULT 0,
  "marketplace"         varchar(32),
  "objkt_event_id"      text,
  "is_primary"          boolean     NOT NULL DEFAULT false,
  "editions_sold"       integer     NOT NULL DEFAULT 1,
  "block_level"         bigint,
  "sold_at"             timestamptz NOT NULL,
  "source"              varchar(32) NOT NULL DEFAULT 'intel_csv',
  "imported_at"         timestamp   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sales_ophash"
  ON "token_sales" ("op_hash", "token_contract", "token_id", "seller_address", "buyer_address");
CREATE INDEX IF NOT EXISTS "idx_sales_token"
  ON "token_sales" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_sales_seller"
  ON "token_sales" ("seller_address");
CREATE INDEX IF NOT EXISTS "idx_sales_buyer"
  ON "token_sales" ("buyer_address");
CREATE INDEX IF NOT EXISTS "idx_sales_sold_at"
  ON "token_sales" ("sold_at");
CREATE INDEX IF NOT EXISTS "idx_sales_primary"
  ON "token_sales" ("is_primary");
CREATE INDEX IF NOT EXISTS "idx_sales_marketplace"
  ON "token_sales" ("marketplace");

-- ── acquisition_lots ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "acquisition_lots" (
  "id"                  serial PRIMARY KEY,
  "wallet_address"      varchar(64) NOT NULL,
  "token_contract"      varchar(36) NOT NULL,
  "token_id"            text        NOT NULL,
  "editions"            integer     NOT NULL DEFAULT 1,
  "acquisition_type"    varchar(24) NOT NULL DEFAULT 'purchase',
  "cost_mutez"          bigint      NOT NULL,
  "cost_usd"            numeric(24, 6),
  "royalties_mutez"     bigint      DEFAULT 0,
  "platform_fee_mutez"  bigint      DEFAULT 0,
  "marketplace"         varchar(32),
  "op_hash"             varchar(72) NOT NULL,
  "block_level"         bigint,
  "acquired_at"         timestamptz NOT NULL,
  "disposed_at"         timestamptz,
  "sale_id"             integer,
  "source"              varchar(32) NOT NULL DEFAULT 'derived',
  "imported_at"         timestamp   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_acq_lot"
  ON "acquisition_lots" ("wallet_address", "token_contract", "token_id", "op_hash");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_wallet"
  ON "acquisition_lots" ("wallet_address");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_token"
  ON "acquisition_lots" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_open"
  ON "acquisition_lots" ("disposed_at");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_acquired_at"
  ON "acquisition_lots" ("acquired_at");

-- ── token_listings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "token_listings" (
  "id"              serial PRIMARY KEY,
  "listing_id"      text        NOT NULL,
  "marketplace"     varchar(32) NOT NULL,
  "token_contract"  varchar(36) NOT NULL,
  "token_id"        text        NOT NULL,
  "seller_address"  varchar(64) NOT NULL,
  "price_mutez"     bigint      NOT NULL,
  "price_usd"       numeric(24, 6),
  "royalty_bps"     integer,
  "editions"        integer     NOT NULL DEFAULT 1,
  "active"          boolean     NOT NULL DEFAULT true,
  "listed_at"       timestamptz NOT NULL,
  "cancelled_at"    timestamptz,
  "sold_at"         timestamptz,
  "source"          varchar(32) NOT NULL DEFAULT 'objkt_gql',
  "raw"             jsonb,
  "fetched_at"      timestamp   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_token_listing"
  ON "token_listings" ("marketplace", "listing_id");
CREATE INDEX IF NOT EXISTS "idx_listings_token"
  ON "token_listings" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_listings_active"
  ON "token_listings" ("active");
CREATE INDEX IF NOT EXISTS "idx_listings_seller"
  ON "token_listings" ("seller_address");
CREATE INDEX IF NOT EXISTS "idx_listings_listed_at"
  ON "token_listings" ("listed_at");

-- ── token_market_summary ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "token_market_summary" (
  "token_contract"                 varchar(36) NOT NULL,
  "token_id"                       text        NOT NULL,
  "last_sale_mutez"                bigint,
  "last_sale_at"                   timestamptz,
  "highest_sale_mutez"             bigint,
  "lowest_sale_mutez"              bigint,
  "average_sale_mutez"             bigint,
  "total_volume_mutez"             bigint      DEFAULT 0,
  "sale_count"                     integer     NOT NULL DEFAULT 0,
  "primary_sale_count"             integer     NOT NULL DEFAULT 0,
  "secondary_sale_count"           integer     NOT NULL DEFAULT 0,
  "current_floor_mutez"            bigint,
  "current_highest_listing_mutez"  bigint,
  "average_active_listing_mutez"   bigint,
  "active_listing_count"           integer     NOT NULL DEFAULT 0,
  "unique_owners_count"            integer     NOT NULL DEFAULT 0,
  "total_royalties_mutez"          bigint      DEFAULT 0,
  "total_platform_fees_mutez"      bigint      DEFAULT 0,
  "refreshed_at"                   timestamp   NOT NULL DEFAULT now(),
  CONSTRAINT "pk_token_market_summary"
    PRIMARY KEY ("token_contract", "token_id")
);
CREATE INDEX IF NOT EXISTS "idx_market_floor"
  ON "token_market_summary" ("current_floor_mutez");
CREATE INDEX IF NOT EXISTS "idx_market_last_sale_at"
  ON "token_market_summary" ("last_sale_at");
