BEGIN;

ALTER TABLE public.horf_trader_profiles
  ADD COLUMN IF NOT EXISTS horf_username varchar(50);

COMMIT;
