DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_scope_type" AS ENUM (
    'wallet_full',
    'wallet_collection',
    'token',
    'macaroni_drop',
    'media_item',
    'project_bundle',
    'manual_upload'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_provider_kind" AS ENUM (
    'wtfos_porcupin_hetzner',
    'pinata',
    'user_porcupin'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_policy_status" AS ENUM (
    'pending_identity',
    'active',
    'paused',
    'disabled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_job_status" AS ENUM (
    'queued',
    'staged',
    'pinned',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_pds_status" AS ENUM (
    'pending_identity',
    'queued',
    'published',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ipfs_pinning_binding_status" AS ENUM (
    'pending_identity',
    'active',
    'paused',
    'suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ipfs_pinning_policies" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "scope_type" "ipfs_pinning_scope_type" NOT NULL,
  "scope_ref" text,
  "wallet_address" varchar(80),
  "source_chain" varchar(32) DEFAULT 'tezos' NOT NULL,
  "include_existing" boolean DEFAULT true NOT NULL,
  "include_future" boolean DEFAULT false NOT NULL,
  "public_discovery" boolean DEFAULT false NOT NULL,
  "provider_key" varchar(80) DEFAULT 'wtfos-porcupin-hetzner' NOT NULL,
  "status" "ipfs_pinning_policy_status" DEFAULT 'pending_identity' NOT NULL,
  "exclusions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pds_policy_record_uri" text,
  "pds_policy_record_cid" varchar(255),
  "source_event_id" varchar(128),
  "last_scan_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ipfs_pinning_policies_user_status_idx"
  ON "ipfs_pinning_policies" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_policies_scope_idx"
  ON "ipfs_pinning_policies" ("scope_type", "scope_ref");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_policies_wallet_idx"
  ON "ipfs_pinning_policies" ("wallet_address");

CREATE TABLE IF NOT EXISTS "ipfs_pinning_manifests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "policy_id" integer REFERENCES "ipfs_pinning_policies"("id") ON DELETE set null,
  "scope_type" "ipfs_pinning_scope_type" NOT NULL,
  "scope_ref" text,
  "wallet_address" varchar(80),
  "source_chain" varchar(32) DEFAULT 'tezos' NOT NULL,
  "title" varchar(240),
  "item_count" integer DEFAULT 0 NOT NULL,
  "byte_size" bigint DEFAULT 0 NOT NULL,
  "provider_key" varchar(80) DEFAULT 'wtfos-porcupin-hetzner' NOT NULL,
  "pds_status" "ipfs_pinning_pds_status" DEFAULT 'pending_identity' NOT NULL,
  "pds_manifest_record_uri" text,
  "pds_manifest_record_cid" varchar(255),
  "manifest_bucket" varchar(255),
  "manifest_key" text,
  "storage_box_mirror_status" varchar(32) DEFAULT 'not_configured' NOT NULL,
  "storage_box_mirror_error" text,
  "source_event_id" varchar(128),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp
);

CREATE INDEX IF NOT EXISTS "ipfs_pinning_manifests_user_created_idx"
  ON "ipfs_pinning_manifests" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_manifests_policy_idx"
  ON "ipfs_pinning_manifests" ("policy_id");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_manifests_pds_idx"
  ON "ipfs_pinning_manifests" ("pds_status");

CREATE TABLE IF NOT EXISTS "ipfs_pinning_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "policy_id" integer REFERENCES "ipfs_pinning_policies"("id") ON DELETE set null,
  "manifest_id" integer REFERENCES "ipfs_pinning_manifests"("id") ON DELETE set null,
  "scope_type" "ipfs_pinning_scope_type" NOT NULL,
  "scope_ref" text,
  "source" varchar(80) DEFAULT 'manual' NOT NULL,
  "source_uri" text,
  "file_name" text,
  "mime_type" varchar(255),
  "byte_size" bigint DEFAULT 0 NOT NULL,
  "checksum_sha256" varchar(64),
  "cid" varchar(255),
  "provider_key" varchar(80) DEFAULT 'wtfos-porcupin-hetzner' NOT NULL,
  "provider_pin_id" text,
  "status" "ipfs_pinning_job_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "s3_bucket" varchar(255),
  "s3_key" text,
  "s3_endpoint" text,
  "s3_region" varchar(80),
  "storage_status" varchar(32) DEFAULT 'not_configured' NOT NULL,
  "porcupin_status" varchar(32) DEFAULT 'pending' NOT NULL,
  "manifest_key" text,
  "pds_item_record_uri" text,
  "pds_item_record_cid" varchar(255),
  "source_event_id" varchar(128),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "ipfs_pinning_jobs_user_status_idx"
  ON "ipfs_pinning_jobs" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_jobs_policy_idx"
  ON "ipfs_pinning_jobs" ("policy_id");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_jobs_manifest_idx"
  ON "ipfs_pinning_jobs" ("manifest_id");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_jobs_cid_idx"
  ON "ipfs_pinning_jobs" ("cid");

CREATE TABLE IF NOT EXISTS "ipfs_pinning_subdomain_bindings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "user_site_id" integer REFERENCES "wtf_user_sites"("id") ON DELETE set null,
  "wtfos_identity_id" integer REFERENCES "wtfos_atproto_identities"("id") ON DELETE set null,
  "atproto_handle_claim_id" integer REFERENCES "atproto_handle_claims"("id") ON DELETE set null,
  "manifest_id" integer REFERENCES "ipfs_pinning_manifests"("id") ON DELETE set null,
  "host" varchar(255),
  "repo_did" varchar(255),
  "repo_handle" varchar(255),
  "pds_url" text,
  "pin_manifest_record_uri" text,
  "pin_manifest_record_cid" varchar(255),
  "public_discovery_enabled" boolean DEFAULT false NOT NULL,
  "status" "ipfs_pinning_binding_status" DEFAULT 'pending_identity' NOT NULL,
  "last_published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ipfs_pinning_bindings_user_unique"
  ON "ipfs_pinning_subdomain_bindings" ("user_id");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_bindings_host_idx"
  ON "ipfs_pinning_subdomain_bindings" ("host");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_bindings_site_idx"
  ON "ipfs_pinning_subdomain_bindings" ("user_site_id");
CREATE INDEX IF NOT EXISTS "ipfs_pinning_bindings_identity_idx"
  ON "ipfs_pinning_subdomain_bindings" ("wtfos_identity_id");

CREATE TABLE IF NOT EXISTS "ipfs_pinning_provider_status" (
  "provider_key" varchar(80) PRIMARY KEY NOT NULL,
  "provider_kind" "ipfs_pinning_provider_kind" NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "health" varchar(32) DEFAULT 'unknown' NOT NULL,
  "storage_root" text DEFAULT '/mnt/wtf-data/workers/porcupin' NOT NULL,
  "s3_bucket" varchar(255),
  "s3_prefix" text DEFAULT 'ipfs-pinning/users' NOT NULL,
  "last_check_at" timestamp,
  "last_error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ipfs_pinning_provider_health_idx"
  ON "ipfs_pinning_provider_status" ("health");

INSERT INTO "ipfs_pinning_provider_status" (
  "provider_key",
  "provider_kind",
  "enabled",
  "health",
  "storage_root",
  "s3_prefix",
  "metadata",
  "updated_at"
) VALUES (
  'wtfos-porcupin-hetzner',
  'wtfos_porcupin_hetzner',
  true,
  'unknown',
  '/mnt/wtf-data/workers/porcupin',
  'ipfs-pinning/users',
  '{"storageBoxMirrorScope":"critical-manifest-proof-bundles","coreBoundary":"control-plane-only"}'::jsonb,
  now()
) ON CONFLICT ("provider_key") DO UPDATE SET
  "provider_kind" = EXCLUDED."provider_kind",
  "enabled" = EXCLUDED."enabled",
  "storage_root" = EXCLUDED."storage_root",
  "s3_prefix" = EXCLUDED."s3_prefix",
  "metadata" = COALESCE("ipfs_pinning_provider_status"."metadata", '{}'::jsonb) || EXCLUDED."metadata",
  "updated_at" = now();

INSERT INTO "roles" (
  "slug",
  "label",
  "category",
  "purpose",
  "description",
  "access_level",
  "sort_order",
  "color",
  "icon",
  "default_wtf_os_access",
  "is_system",
  "is_assignable",
  "updated_at"
) VALUES (
  'wtf_pin_collector',
  'WTF Pin Collector',
  'builder',
  'Additive role that unlocks hosted wtfOS IPFS pinning, wallet backup policy, and PDS pin manifests.',
  'Grants pinning access only; does not grant broader creator, social posting, or admin authority.',
  25,
  65,
  '#1f7a5b',
  'archive',
  true,
  true,
  true,
  now()
) ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "purpose" = EXCLUDED."purpose",
  "description" = EXCLUDED."description",
  "access_level" = EXCLUDED."access_level",
  "sort_order" = EXCLUDED."sort_order",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "default_wtf_os_access" = EXCLUDED."default_wtf_os_access",
  "is_system" = EXCLUDED."is_system",
  "is_assignable" = EXCLUDED."is_assignable",
  "updated_at" = now();

INSERT INTO "role_permissions" ("role", "permission_key", "granted", "updated_at")
VALUES ('wtf_pin_collector', 'use_wtfos_pinning', true, now())
ON CONFLICT ("role", "permission_key") DO UPDATE SET
  "granted" = EXCLUDED."granted",
  "updated_at" = now();

INSERT INTO "in_app_market_items" (
  "sku",
  "name",
  "description",
  "category",
  "price_wtf_units",
  "price_exp",
  "active",
  "stock_quantity",
  "rarity_tier",
  "price_score",
  "metadata",
  "sort_order",
  "updated_at"
) VALUES (
  'wtf-pin-collector-pass',
  'WTF Pin Collector Pass',
  'Unlock hosted wtfOS IPFS pinning, whole-wallet backup policy, and portable PDS pin manifests.',
  'preservation',
  '25000000000',
  2500,
  true,
  999999,
  2,
  5,
  '{"kind":"role-grant","role":"wtf_pin_collector","permission":"use_wtfos_pinning","opens":"/ipfs-pinning","legacyAlias":"wtf-autopin-membership"}'::jsonb,
  42,
  now()
) ON CONFLICT ("sku") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "active" = EXCLUDED."active",
  "stock_quantity" = EXCLUDED."stock_quantity",
  "metadata" = EXCLUDED."metadata",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();

INSERT INTO "in_app_market_items" (
  "sku",
  "name",
  "description",
  "category",
  "price_wtf_units",
  "price_exp",
  "active",
  "stock_quantity",
  "rarity_tier",
  "price_score",
  "metadata",
  "sort_order",
  "updated_at"
) VALUES (
  'wtf-autopin-membership',
  'WTF AutoPin Membership',
  'Legacy alias for the WTF Pin Collector Pass.',
  'preservation',
  '25000000000',
  2500,
  true,
  999999,
  2,
  5,
  '{"kind":"role-grant","role":"wtf_pin_collector","permission":"use_wtfos_pinning","opens":"/ipfs-pinning","canonicalSku":"wtf-pin-collector-pass","legacyAlias":true}'::jsonb,
  43,
  now()
) ON CONFLICT ("sku") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "active" = EXCLUDED."active",
  "stock_quantity" = EXCLUDED."stock_quantity",
  "metadata" = EXCLUDED."metadata",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();
