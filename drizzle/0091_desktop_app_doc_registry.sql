ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "doc_status" varchar(20) NOT NULL DEFAULT 'pending';

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "doc_registry_version" varchar(20) NOT NULL DEFAULT '1';

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "docs_updated_at" timestamp;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "docs_expires_at" timestamp;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "install_key_hash" varchar(64);

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "install_key_prefix" varchar(24);

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "install_key_issued_at" timestamp;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "install_key_expires_at" timestamp;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "install_key_revoked_at" timestamp;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "registered_by" integer REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "registered_at" timestamp NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "desktop_app_settings_docs_updated_idx"
  ON "desktop_app_settings" ("docs_updated_at");

