ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gm_welcome_utc_day varchar(10),
  ADD COLUMN IF NOT EXISTS gm_welcome_last_seen_at timestamp;
