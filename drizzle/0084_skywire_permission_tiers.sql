ALTER TABLE "atproto_accounts"
  ADD COLUMN IF NOT EXISTS "oauth_requested_scopes" text,
  ADD COLUMN IF NOT EXISTS "oauth_permission_tier" varchar(32),
  ADD COLUMN IF NOT EXISTS "oauth_chat_enabled" boolean DEFAULT false NOT NULL;

UPDATE "atproto_accounts"
SET
  "oauth_requested_scopes" = COALESCE("oauth_requested_scopes", "oauth_scopes"),
  "oauth_permission_tier" = COALESCE("oauth_permission_tier", 'be-bold'),
  "oauth_chat_enabled" = COALESCE("oauth_chat_enabled", false)
WHERE "disconnected_at" IS NULL;
