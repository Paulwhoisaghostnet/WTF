ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcomed_to_wtf_os boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS welcomed_to_wtf_os_at timestamp;

UPDATE users
SET welcomed_to_wtf_os = COALESCE(welcomed_to_wtf_os, false)
WHERE welcomed_to_wtf_os IS NULL;
