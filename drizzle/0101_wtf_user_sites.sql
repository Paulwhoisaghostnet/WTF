DO $$ BEGIN
  CREATE TYPE "wtf_user_site_status" AS ENUM ('draft', 'published', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "wtf_user_site_did_source" AS ENUM ('wtf', 'bsky');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "wtf_user_site_audit_event" AS ENUM (
    'claimed',
    'draft_saved',
    'page_created',
    'page_updated',
    'page_deleted',
    'assets_updated',
    'published',
    'rolled_back',
    'unpublished',
    'suspended',
    'restored',
    'proof_warning'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "wtf_user_sites" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "label" varchar(63) NOT NULL,
  "host" varchar(255) NOT NULL,
  "status" "wtf_user_site_status" DEFAULT 'draft' NOT NULL,
  "active_did" varchar(255),
  "active_did_source" "wtf_user_site_did_source",
  "atproto_account_id" integer REFERENCES "atproto_accounts"("id") ON DELETE set null,
  "wtfos_identity_id" integer REFERENCES "wtfos_atproto_identities"("id") ON DELETE set null,
  "atproto_handle_claim_id" integer REFERENCES "atproto_handle_claims"("id") ON DELETE set null,
  "published_version_id" integer,
  "proof_grace_until" timestamp,
  "suspended_at" timestamp,
  "suspended_by" integer REFERENCES "users"("id") ON DELETE set null,
  "suspended_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "wtf_user_sites_user_unique" ON "wtf_user_sites" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wtf_user_sites_label_unique" ON "wtf_user_sites" ("label");
CREATE UNIQUE INDEX IF NOT EXISTS "wtf_user_sites_host_unique" ON "wtf_user_sites" ("host");
CREATE INDEX IF NOT EXISTS "wtf_user_sites_status_idx" ON "wtf_user_sites" ("status");
CREATE INDEX IF NOT EXISTS "wtf_user_sites_did_idx" ON "wtf_user_sites" ("active_did");

CREATE TABLE IF NOT EXISTS "wtf_user_site_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL REFERENCES "wtf_user_sites"("id") ON DELETE cascade,
  "slug" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL,
  "draft_html" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wtf_user_site_pages_site_slug_unique" ON "wtf_user_site_pages" ("site_id", "slug");
CREATE INDEX IF NOT EXISTS "wtf_user_site_pages_site_sort_idx" ON "wtf_user_site_pages" ("site_id", "sort_order");

CREATE TABLE IF NOT EXISTS "wtf_user_site_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL REFERENCES "wtf_user_sites"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "did" varchar(255) NOT NULL,
  "did_source" "wtf_user_site_did_source" NOT NULL,
  "digest" varchar(64) NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "asset_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "published_by" integer REFERENCES "users"("id") ON DELETE set null,
  "published_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wtf_user_site_versions_site_number_unique" ON "wtf_user_site_versions" ("site_id", "version_number");
CREATE INDEX IF NOT EXISTS "wtf_user_site_versions_site_published_idx" ON "wtf_user_site_versions" ("site_id", "published_at");
CREATE INDEX IF NOT EXISTS "wtf_user_site_versions_digest_idx" ON "wtf_user_site_versions" ("digest");

DO $$ BEGIN
  ALTER TABLE "wtf_user_sites"
    ADD CONSTRAINT "wtf_user_sites_published_version_fk"
    FOREIGN KEY ("published_version_id") REFERENCES "wtf_user_site_versions"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "wtf_user_site_asset_refs" (
  "site_id" integer NOT NULL REFERENCES "wtf_user_sites"("id") ON DELETE cascade,
  "media_id" integer NOT NULL REFERENCES "user_media_library"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wtf_user_site_asset_refs_pk" PRIMARY KEY ("site_id", "media_id")
);

CREATE INDEX IF NOT EXISTS "wtf_user_site_asset_refs_media_idx" ON "wtf_user_site_asset_refs" ("media_id");

CREATE TABLE IF NOT EXISTS "wtf_user_site_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL REFERENCES "wtf_user_sites"("id") ON DELETE cascade,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "event_type" "wtf_user_site_audit_event" NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "wtf_user_site_audit_site_created_idx" ON "wtf_user_site_audit_events" ("site_id", "created_at");
CREATE INDEX IF NOT EXISTS "wtf_user_site_audit_actor_idx" ON "wtf_user_site_audit_events" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "wtf_user_site_audit_type_idx" ON "wtf_user_site_audit_events" ("event_type");
