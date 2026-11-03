BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_stable_claim_sync (
  contract_address text PRIMARY KEY,
  cursor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'syncing' CHECK (status IN ('ready', 'syncing', 'error')),
  as_of timestamptz,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.horf_stable_claim_events (
  contract_address text NOT NULL REFERENCES public.horf_stable_claim_sync(contract_address) ON DELETE CASCADE,
  tzkt_event_id bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  owner_address text NOT NULL,
  claimant_address text NOT NULL,
  mode smallint NOT NULL CHECK (mode IN (0, 1, 2)),
  token_contract text NOT NULL,
  token_id text NOT NULL,
  PRIMARY KEY (contract_address, tzkt_event_id)
);

CREATE INDEX IF NOT EXISTS horf_stable_claim_events_contract_time_idx
  ON public.horf_stable_claim_events (contract_address, occurred_at);

ALTER TABLE public.horf_stable_claim_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horf_stable_claim_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_stable_claim_sync, public.horf_stable_claim_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_stable_claim_sync, public.horf_stable_claim_events FROM authenticated;
  END IF;
END $$;

COMMIT;
