BEGIN;
CREATE TABLE IF NOT EXISTS public.horf_open_range_offers (
  id bigserial PRIMARY KEY,
  owner_wallet_address text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  amount text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT horf_open_range_offers_owner_token_uq UNIQUE (owner_wallet_address, token_contract, token_id),
  CONSTRAINT horf_open_range_offers_wallet_check CHECK (owner_wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_open_range_offers_contract_check CHECK (token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_open_range_offers_token_check CHECK (token_id ~ '^[0-9]+$'),
  CONSTRAINT horf_open_range_offers_amount_check CHECK (amount ~ '^[0-9]+$' AND amount <> '0')
);
CREATE INDEX IF NOT EXISTS horf_open_range_offers_token_active_idx
  ON public.horf_open_range_offers (token_contract, token_id, active);
ALTER TABLE public.horf_open_range_offers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_open_range_offers FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_open_range_offers FROM authenticated;
  END IF;
END $$;
COMMIT;
