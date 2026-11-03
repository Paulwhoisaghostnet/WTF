BEGIN;

-- Objkt exposes the manager operation hash on each transfer event. Store it
-- so a verified Horf gift can be distinguished from a reciprocal trade.
ALTER TABLE public.horf_transfer_events
  ADD COLUMN IF NOT EXISTS operation_hash text;
CREATE INDEX IF NOT EXISTS horf_transfer_events_operation_hash_idx
  ON public.horf_transfer_events (operation_hash);

CREATE TABLE IF NOT EXISTS public.horf_posse_partners (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  nickname text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_posse_partners_address_check CHECK (address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_posse_partners_user_address_uq UNIQUE (user_id, address)
);
CREATE INDEX IF NOT EXISTS horf_posse_partners_user_created_idx
  ON public.horf_posse_partners (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.horf_gift_transfers (
  id bigserial PRIMARY KEY,
  tzkt_transfer_id bigint NOT NULL UNIQUE,
  operation_hash text NOT NULL,
  sender_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  token_name text NOT NULL,
  token_image text,
  occurred_at timestamptz NOT NULL,
  returned_favor boolean NOT NULL DEFAULT false,
  returned_at timestamptz,
  returned_by_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_gift_transfers_wallets_check CHECK (from_address <> to_address)
);
CREATE INDEX IF NOT EXISTS horf_gift_transfers_recipient_time_idx
  ON public.horf_gift_transfers (to_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS horf_gift_transfers_operation_idx
  ON public.horf_gift_transfers (operation_hash);

ALTER TABLE public.horf_posse_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horf_gift_transfers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_posse_partners, public.horf_gift_transfers FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_posse_partners, public.horf_gift_transfers FROM authenticated;
  END IF;
END $$;

COMMIT;
