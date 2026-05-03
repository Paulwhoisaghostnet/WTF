-- Storage architecture support for Hetzner Volume + Object Storage.
-- Safe to run after the pre-migration server backup.

ALTER TYPE "tv_media_source_type" ADD VALUE IF NOT EXISTS 'objkt';
ALTER TYPE "tv_media_source_type" ADD VALUE IF NOT EXISTS 'teia';
ALTER TYPE "tv_media_source_type" ADD VALUE IF NOT EXISTS 'generated';

DO $$ BEGIN
  CREATE TYPE "tv_media_cache_status" AS ENUM (
    'cached',
    'not_cached',
    'caching',
    'failed',
    'evicted',
    'source_missing',
    'needs_repair'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "user_media_library"
  ADD COLUMN IF NOT EXISTS "owner_wallet" varchar(80),
  ADD COLUMN IF NOT EXISTS "object_storage_bucket" varchar(255),
  ADD COLUMN IF NOT EXISTS "object_storage_key" text,
  ADD COLUMN IF NOT EXISTS "object_storage_region" varchar(120),
  ADD COLUMN IF NOT EXISTS "object_storage_endpoint" text,
  ADD COLUMN IF NOT EXISTS "original_filename" text,
  ADD COLUMN IF NOT EXISTS "safe_filename" text,
  ADD COLUMN IF NOT EXISTS "width" integer,
  ADD COLUMN IF NOT EXISTS "height" integer,
  ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64),
  ADD COLUMN IF NOT EXISTS "upload_status" varchar(30) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS "cache_status" "tv_media_cache_status" NOT NULL DEFAULT 'not_cached',
  ADD COLUMN IF NOT EXISTS "hot_cache_path" text,
  ADD COLUMN IF NOT EXISTS "thumbnail_cache_path" text,
  ADD COLUMN IF NOT EXISTS "transcoded_cache_path" text,
  ADD COLUMN IF NOT EXISTS "last_cached_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_accessed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "file_size_bytes" bigint,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

UPDATE "user_media_library"
SET
  "file_size_bytes" = COALESCE("file_size_bytes", "file_size"::bigint),
  "cache_status" = CASE
    WHEN "source_url" LIKE 'disk://%' THEN 'cached'::"tv_media_cache_status"
    ELSE COALESCE("cache_status", 'not_cached'::"tv_media_cache_status")
  END,
  "last_cached_at" = CASE
    WHEN "source_url" LIKE 'disk://%' THEN COALESCE("last_cached_at", "updated_at")
    ELSE "last_cached_at"
  END
WHERE "file_size_bytes" IS NULL
   OR ("source_url" LIKE 'disk://%' AND "cache_status" <> 'cached');

CREATE INDEX IF NOT EXISTS "uml_cache_status_idx"
  ON "user_media_library" ("cache_status");

CREATE INDEX IF NOT EXISTS "uml_object_key_idx"
  ON "user_media_library" ("object_storage_bucket", "object_storage_key");

CREATE TABLE IF NOT EXISTS "object_storage_usage_checks" (
  "id" serial PRIMARY KEY,
  "bucket" varchar(255) NOT NULL,
  "endpoint" text,
  "region" varchar(120),
  "used_bytes" bigint NOT NULL DEFAULT 0,
  "limit_bytes" bigint NOT NULL DEFAULT 0,
  "percent_used" numeric(8,6) NOT NULL DEFAULT 0,
  "level" varchar(30) NOT NULL DEFAULT 'ok',
  "uploads_protected" boolean NOT NULL DEFAULT false,
  "accounting_source" varchar(30) NOT NULL DEFAULT 'database',
  "object_count" integer NOT NULL DEFAULT 0,
  "error" text,
  "checked_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "object_storage_usage_checked_idx"
  ON "object_storage_usage_checks" ("checked_at");

CREATE INDEX IF NOT EXISTS "object_storage_usage_bucket_idx"
  ON "object_storage_usage_checks" ("bucket");

