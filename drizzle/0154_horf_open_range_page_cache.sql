BEGIN;

-- Objkt discovery pages are retained across app restarts. Status flags from
-- Horf offers, inspections, and trades are deliberately computed at read time.
CREATE TABLE IF NOT EXISTS public.horf_open_range_page_cache (
  mode text NOT NULL,
  cursor text NOT NULL,
  page jsonb NOT NULL CHECK (jsonb_typeof(page) = 'object'),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, cursor)
);

ALTER TABLE public.horf_open_range_page_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_open_range_page_cache FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_open_range_page_cache FROM authenticated;
  END IF;
END $$;

COMMIT;
