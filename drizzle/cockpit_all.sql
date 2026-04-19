-- Cockpit bundle — idempotent apply of migrations 0008..0014.
--
-- Paste into Supabase SQL Editor, `psql "$DATABASE_URL" -f cockpit_all.sql`,
-- or any Postgres session.  Every statement uses IF NOT EXISTS / IF EXISTS
-- or exception-swallowing DO blocks so re-running is safe.
--
-- What it does:
--   * adds sync_runs / indexing_queue / token_metadata / contract_metadata
--     / address_labels (Phase 0)
--   * adds user_wallets cockpit display columns (Phase 1)
--   * creates wallet_holdings (Phase 2)
--   * creates collections / collection_items + collection_type enum (Phase 4)
--   * backfills cockpit tables from user_owned_tokens, mirrors trade-board
--     rows into collection_items, then drops user_owned_tokens (Phase 6)
--   * extends auto_verify_type with cockpit-derived quest checks (Phase 7)
--
-- Phase 3 is intentionally a no-op; the tzkt_first_time / tzkt_last_time
-- columns already live on wallet_holdings from Phase 2.
--
-- Rollback steps live inline at the top of each original drizzle/00NN
-- file if you need to peel individual phases back.

---------------------------------------------------------------------------
-- Phase 0 — sync infrastructure + shared caches
---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" serial PRIMARY KEY,
  "job_name" varchar(64) NOT NULL,
  "scope" varchar(128),
  "status" varchar(16) NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "duration_ms" integer,
  "items_in" integer DEFAULT 0 NOT NULL,
  "items_out" integer DEFAULT 0 NOT NULL,
  "error" text,
  "cursor_before" jsonb,
  "cursor_after" jsonb
);
CREATE INDEX IF NOT EXISTS "idx_sync_runs_job_started"
  ON "sync_runs" ("job_name", "started_at");
CREATE INDEX IF NOT EXISTS "idx_sync_runs_job_status"
  ON "sync_runs" ("job_name", "status");

CREATE TABLE IF NOT EXISTS "indexing_queue" (
  "id" serial PRIMARY KEY,
  "target" varchar(64) NOT NULL,
  "target_kind" varchar(16) NOT NULL,
  "priority" integer DEFAULT 5 NOT NULL,
  "reason" varchar(64),
  "enqueued_at" timestamp DEFAULT now() NOT NULL,
  "picked_up_at" timestamp,
  "finished_at" timestamp,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text
);
CREATE INDEX IF NOT EXISTS "idx_indexing_queue_pri"
  ON "indexing_queue" ("priority", "enqueued_at");
CREATE INDEX IF NOT EXISTS "idx_indexing_queue_status"
  ON "indexing_queue" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_indexing_queue_target_pending"
  ON "indexing_queue" ("target", "target_kind", "status");

CREATE TABLE IF NOT EXISTS "token_metadata" (
  "token_contract" varchar(36) NOT NULL,
  "token_id" text NOT NULL,
  "name" text,
  "symbol" text,
  "description" text,
  "thumbnail" text,
  "artifact_uri" text,
  "display_uri" text,
  "mime_type" varchar(128),
  "creators" jsonb,
  "tags" jsonb,
  "formats" jsonb,
  "attributes" jsonb,
  "raw" jsonb,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pk_token_metadata"
  ON "token_metadata" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_token_metadata_contract"
  ON "token_metadata" ("token_contract");

CREATE TABLE IF NOT EXISTS "contract_metadata" (
  "address" varchar(36) PRIMARY KEY,
  "kind" varchar(32),
  "alias" text,
  "creator" varchar(36),
  "interfaces" jsonb,
  "raw" jsonb,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "address_labels" (
  "address" varchar(64) PRIMARY KEY,
  "label" text,
  "category" varchar(32),
  "tezos_domain" text,
  "notes" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_address_labels_category"
  ON "address_labels" ("category");

---------------------------------------------------------------------------
-- Phase 1 — user_wallets cockpit display columns
---------------------------------------------------------------------------

ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "first_activity_at" timestamp;
ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;

---------------------------------------------------------------------------
-- Phase 2 — wallet_holdings (derived from wallet_events + TzKT snapshots)
---------------------------------------------------------------------------

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

---------------------------------------------------------------------------
-- Phase 4 — collections + collection_items (trade-board mirror)
---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "collection_type" AS ENUM (
    'curation',
    'wtf_gallery',
    'trade_board_listing',
    'objkt_curation',
    'external_listing',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "collections" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" collection_type NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "slug" varchar(120),
  "is_public" boolean DEFAULT false NOT NULL,
  "cover_uri" text,
  "metadata" jsonb,
  "external_ref" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_collections_user"
  ON "collections" ("user_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_collections_user_type_slug"
  ON "collections" ("user_id", "type", "slug");
CREATE INDEX IF NOT EXISTS "idx_collections_public"
  ON "collections" ("is_public", "type");

CREATE TABLE IF NOT EXISTS "collection_items" (
  "id" serial PRIMARY KEY,
  "collection_id" integer NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "token_contract" varchar(36) NOT NULL,
  "token_id" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "note" text,
  "position" integer DEFAULT 0 NOT NULL,
  "added_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_collection_items_unique"
  ON "collection_items" ("collection_id", "token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_collection_items_collection"
  ON "collection_items" ("collection_id", "position");
CREATE INDEX IF NOT EXISTS "idx_collection_items_token"
  ON "collection_items" ("token_contract", "token_id");

---------------------------------------------------------------------------
-- Phase 6 — backfill from user_owned_tokens + drop legacy table
--
-- Guarded with to_regclass so re-running on a DB that already dropped
-- the legacy table is a no-op.
---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.user_owned_tokens') IS NOT NULL THEN
    INSERT INTO token_metadata (
      token_contract, token_id, name, symbol, thumbnail, display_uri, artifact_uri,
      mime_type, creators, tags, formats, attributes, raw, fetched_at, updated_at
    )
    SELECT DISTINCT ON (token_contract, token_id)
      token_contract,
      token_id,
      token_name,
      token_symbol,
      token_thumbnail,
      NULLIF(metadata ->> 'displayUri', ''),
      NULLIF(metadata ->> 'artifactUri', ''),
      NULLIF(metadata ->> 'mimeType', ''),
      metadata -> 'creators',
      metadata -> 'tags',
      metadata -> 'formats',
      metadata -> 'attributes',
      COALESCE(metadata, '{}'::jsonb),
      NOW(),
      NOW()
    FROM user_owned_tokens
    WHERE token_contract IS NOT NULL AND token_id IS NOT NULL
    ORDER BY token_contract, token_id, id DESC
    ON CONFLICT (token_contract, token_id) DO UPDATE SET
      name       = COALESCE(EXCLUDED.name, token_metadata.name),
      symbol     = COALESCE(EXCLUDED.symbol, token_metadata.symbol),
      thumbnail  = COALESCE(EXCLUDED.thumbnail, token_metadata.thumbnail),
      raw        = COALESCE(EXCLUDED.raw, token_metadata.raw),
      updated_at = NOW();

    INSERT INTO wallet_holdings (
      user_id, wallet_address, token_contract, token_id, balance,
      first_acquired_at, last_activity_at, derived_at, is_creator
    )
    SELECT
      user_id,
      wallet_address,
      token_contract,
      token_id,
      balance,
      last_seen_at,
      last_seen_at,
      NOW(),
      FALSE
    FROM user_owned_tokens
    ON CONFLICT (wallet_address, token_contract, token_id) DO UPDATE SET
      balance = GREATEST(
        wallet_holdings.balance::numeric,
        EXCLUDED.balance::numeric
      )::text,
      user_id = EXCLUDED.user_id;

    INSERT INTO collections (user_id, type, title, description, slug, is_public)
    SELECT DISTINCT u.user_id, 'trade_board_listing', 'Trade Board',
      'Tokens this user has listed on the WTF trade board.',
      'trade-board', TRUE
    FROM user_owned_tokens u
    WHERE u.on_trade_board = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM collections c
        WHERE c.user_id = u.user_id
          AND c.type = 'trade_board_listing'
          AND c.slug = 'trade-board'
      );

    INSERT INTO collection_items (collection_id, token_contract, token_id, quantity, position)
    SELECT
      c.id,
      u.token_contract,
      u.token_id,
      GREATEST(1, COALESCE(NULLIF(u.trade_board_quantity, 0), 1)),
      0
    FROM user_owned_tokens u
    JOIN collections c
      ON c.user_id = u.user_id
     AND c.type = 'trade_board_listing'
     AND c.slug = 'trade-board'
    WHERE u.on_trade_board = TRUE
    ON CONFLICT (collection_id, token_contract, token_id) DO UPDATE SET
      quantity = EXCLUDED.quantity;

    DROP TABLE IF EXISTS user_owned_tokens CASCADE;
  END IF;
END $$;

---------------------------------------------------------------------------
-- Phase 7 — extend auto_verify_type enum for cockpit-derived quest checks
---------------------------------------------------------------------------

ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'holds_positive_balance';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'holds_art_nft';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'has_mint_event';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'listed_on_trade_board';
