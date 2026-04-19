-- Cockpit migration — Phase 4
--
-- Collections + collection_items: first-class grouping model that
-- mirrors (and will eventually replace) the scattered boolean flags
-- on user_owned_tokens.
--
-- The existing user_owned_tokens.on_trade_board / trade_board_quantity
-- columns remain the primary source of truth.  The mirror module
-- (server/lib/collections-mirror.ts) writes here AFTER the legacy
-- boolean is updated; this table is strictly additive until the UI
-- has fully migrated.
--
-- Rollback:
--   DROP TABLE IF EXISTS collection_items CASCADE;
--   DROP TABLE IF EXISTS collections CASCADE;
--   DROP TYPE IF EXISTS collection_type;

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
