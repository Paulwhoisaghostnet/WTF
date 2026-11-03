BEGIN;

ALTER TABLE public.horf_open_range_offers
  ADD COLUMN IF NOT EXISTS accepted_token_policy text NOT NULL DEFAULT 'any_qualifying';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
      WHERE conname = 'horf_open_range_offers_accepted_policy_check'
        AND conrelid = 'public.horf_open_range_offers'::regclass
  ) THEN
    ALTER TABLE public.horf_open_range_offers
      ADD CONSTRAINT horf_open_range_offers_accepted_policy_check
      CHECK (accepted_token_policy IN ('marshal_only', 'any_qualifying'));
  END IF;
END $$;

COMMIT;
