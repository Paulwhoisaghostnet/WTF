BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_stable_selections (
  id bigserial PRIMARY KEY,
  owner_wallet_address text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_stable_selections_wallet_token_uq UNIQUE (owner_wallet_address, token_contract, token_id),
  CONSTRAINT horf_stable_selections_wallet_check CHECK (owner_wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_stable_selections_contract_check CHECK (token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_stable_selections_token_check CHECK (token_id ~ '^[0-9]+$')
);

CREATE TABLE IF NOT EXISTS public.horf_inspectors (
  wallet_address text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  deputized_by_user_id integer NOT NULL REFERENCES public.users(id),
  deputized_at timestamptz NOT NULL DEFAULT now(),
  revoked_by_user_id integer REFERENCES public.users(id),
  revoked_at timestamptz,
  CONSTRAINT horf_inspectors_wallet_check CHECK (wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$')
);

CREATE TABLE IF NOT EXISTS public.horf_inspection_requests (
  id bigserial PRIMARY KEY,
  submitter_address text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  objkt_metadata jsonb NOT NULL,
  chain_evidence jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_wallet_address text,
  reviewed_at timestamptz,
  review_reason text,
  CONSTRAINT horf_inspection_requests_submitter_check CHECK (submitter_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_inspection_requests_contract_check CHECK (token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_inspection_requests_token_check CHECK (token_id ~ '^[0-9]+$')
);
CREATE INDEX IF NOT EXISTS horf_inspection_requests_status_time_idx
  ON public.horf_inspection_requests (status, submitted_at);
CREATE INDEX IF NOT EXISTS horf_inspection_requests_token_time_idx
  ON public.horf_inspection_requests (token_contract, token_id, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS horf_inspection_requests_one_pending_token_uq
  ON public.horf_inspection_requests (token_contract, token_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.horf_inspection_approvals (
  token_contract text NOT NULL,
  token_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  inspection_id bigint NOT NULL REFERENCES public.horf_inspection_requests(id),
  inspector_wallet_address text NOT NULL,
  approved_at timestamptz NOT NULL,
  creator_address text NOT NULL,
  code_hash integer NOT NULL,
  code_sha256 text NOT NULL,
  revoked_by_user_id integer REFERENCES public.users(id),
  revoked_at timestamptz,
  revocation_reason text,
  PRIMARY KEY (token_contract, token_id),
  CONSTRAINT horf_inspection_approvals_sha_check CHECK (code_sha256 ~ '^[0-9a-f]{64}$')
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['horf_stable_selections','horf_inspectors','horf_inspection_requests','horf_inspection_approvals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
