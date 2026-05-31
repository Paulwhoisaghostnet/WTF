-- Idempotent: table may already exist from a partial prior apply.
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "bucket_key" varchar(512) PRIMARY KEY NOT NULL,
  "hit_count" integer NOT NULL DEFAULT 1,
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_expires_idx"
  ON "rate_limit_buckets" ("expires_at");
