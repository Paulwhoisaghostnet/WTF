BEGIN;

CREATE TABLE IF NOT EXISTS public.haha_crp_nominations (
  id bigserial PRIMARY KEY,
  season_key text NOT NULL,
  category_id text NOT NULL,
  nominator_address text NOT NULL CHECK (nominator_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  nominator_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  nominee_address text NOT NULL CHECK (nominee_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  nominee_display_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT haha_crp_nominations_other_trader_check CHECK (nominator_address <> nominee_address),
  CONSTRAINT haha_crp_nominations_distinct_nominee_uq UNIQUE (season_key, category_id, nominator_address, nominee_address)
);

CREATE INDEX IF NOT EXISTS haha_crp_nominations_tally_idx
  ON public.haha_crp_nominations (season_key, category_id, nominee_address);

ALTER TABLE public.haha_crp_nominations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.haha_crp_nominations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.haha_crp_nominations FROM authenticated;
  END IF;
END $$;

COMMIT;
