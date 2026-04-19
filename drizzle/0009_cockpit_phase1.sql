-- Cockpit migration — Phase 1
--
-- Adds nullable display columns to user_wallets for the cockpit
-- Overview tab.  Populated by phase 2's holdings-derive job; until
-- then they stay NULL and no existing feature reads them.
--
-- Rollback:
--   ALTER TABLE user_wallets
--     DROP COLUMN IF EXISTS first_activity_at,
--     DROP COLUMN IF EXISTS last_activity_at,
--     DROP COLUMN IF EXISTS last_synced_at;

ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "first_activity_at" timestamp;
ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
ALTER TABLE "user_wallets"
  ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;
