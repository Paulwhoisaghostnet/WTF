ALTER TABLE "desktop_app_settings"
  ADD COLUMN IF NOT EXISTS "registration_never_expires" boolean NOT NULL DEFAULT false;
