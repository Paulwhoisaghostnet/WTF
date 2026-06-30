ALTER TABLE "user_desktop_settings"
  ADD COLUMN IF NOT EXISTS "localization" jsonb DEFAULT '{}'::jsonb NOT NULL;
