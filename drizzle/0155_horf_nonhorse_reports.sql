BEGIN;

-- Public reports use the existing one-pending-inspection-per-token queue.
ALTER TABLE public.horf_inspection_requests
  DROP CONSTRAINT horf_inspection_requests_source_check;
ALTER TABLE public.horf_inspection_requests
  ADD CONSTRAINT horf_inspection_requests_source_check
  CHECK (source IN ('owner_submission', 'open_range', 'community_report'));
ALTER TABLE public.horf_inspection_requests
  DROP CONSTRAINT horf_inspection_requests_source_submitter_check;
ALTER TABLE public.horf_inspection_requests
  ADD CONSTRAINT horf_inspection_requests_source_submitter_check
  CHECK ((source = 'owner_submission' AND submitter_address IS NOT NULL)
    OR (source IN ('open_range', 'community_report') AND submitter_address IS NULL));

-- Ordinary inspection rejection means no escrow approval. This separate
-- exact-token judgment is the only durable “not a horse” override.
CREATE TABLE public.horf_token_nonhorse_decisions (
  token_contract text NOT NULL,
  token_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  inspection_id bigint NOT NULL REFERENCES public.horf_inspection_requests(id),
  marshal_user_id integer NOT NULL REFERENCES public.users(id),
  reason text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_contract, token_id),
  CONSTRAINT horf_token_nonhorse_decisions_contract_check
    CHECK (token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_token_nonhorse_decisions_token_check
    CHECK (token_id ~ '^[0-9]+$'),
  CONSTRAINT horf_token_nonhorse_decisions_reason_check
    CHECK (length(btrim(reason)) > 0)
);
ALTER TABLE public.horf_token_nonhorse_decisions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_token_nonhorse_decisions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_token_nonhorse_decisions FROM authenticated;
  END IF;
END $$;

COMMIT;
