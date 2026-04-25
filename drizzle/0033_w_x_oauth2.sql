ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "twitter_oauth2_access_token" text,
  ADD COLUMN IF NOT EXISTS "twitter_oauth2_refresh_token" text,
  ADD COLUMN IF NOT EXISTS "twitter_oauth2_scopes" text,
  ADD COLUMN IF NOT EXISTS "twitter_oauth2_expires_at" timestamp;
