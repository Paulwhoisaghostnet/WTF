BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_season_sync (
  season_start timestamptz PRIMARY KEY,
  season_end timestamptz,
  cursor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'syncing' CHECK (status IN ('ready', 'syncing', 'error')),
  as_of timestamptz,
  error text,
  approved_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_id text,
  rescan boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL DEFAULT '0',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Also upgrades a locally applied draft of this forward migration.
ALTER TABLE public.horf_season_sync
  ADD COLUMN IF NOT EXISTS policy_version text NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS public.horf_transfer_events (
  event_id bigint PRIMARY KEY,
  season_start timestamptz NOT NULL REFERENCES public.horf_season_sync(season_start) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  token_contract text NOT NULL,
  token_id text NOT NULL,
  token_name text NOT NULL,
  token_image text,
  last_seen_run text
);

CREATE INDEX IF NOT EXISTS horf_transfer_events_season_from_idx
  ON public.horf_transfer_events (season_start, from_address);
CREATE INDEX IF NOT EXISTS horf_transfer_events_season_to_idx
  ON public.horf_transfer_events (season_start, to_address);
CREATE INDEX IF NOT EXISTS horf_transfer_events_season_recent_idx
  ON public.horf_transfer_events (season_start, occurred_at DESC);

-- The API serves this public chain-derived ledger; browser Data API roles have no direct table access.
ALTER TABLE public.horf_season_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horf_transfer_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_season_sync, public.horf_transfer_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_season_sync, public.horf_transfer_events FROM authenticated;
  END IF;
END $$;

COMMIT;
