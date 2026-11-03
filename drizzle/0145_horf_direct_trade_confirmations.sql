BEGIN;
ALTER TABLE public.horf_gift_transfers
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'gift';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horf_gift_transfers_kind_check') THEN
    ALTER TABLE public.horf_gift_transfers
      ADD CONSTRAINT horf_gift_transfers_kind_check CHECK (kind IN ('gift', 'trade'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS horf_gift_transfers_kind_token_idx
  ON public.horf_gift_transfers (kind, token_contract, token_id);
COMMIT;
