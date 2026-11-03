BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_wallet_blacklist (
  address text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  evidence_url text,
  listed_by_user_id integer NOT NULL REFERENCES public.users(id),
  listed_at timestamptz NOT NULL DEFAULT now(),
  cleared_by_user_id integer REFERENCES public.users(id),
  cleared_at timestamptz,
  CONSTRAINT horf_wallet_blacklist_address_check CHECK (address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_wallet_blacklist_reason_check CHECK (length(btrim(reason)) > 0)
);

ALTER TABLE public.horf_wallet_blacklist ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_wallet_blacklist FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_wallet_blacklist FROM authenticated;
  END IF;
END $$;

COMMIT;
