BEGIN;

CREATE TABLE IF NOT EXISTS public.user_video_watches (
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS user_video_watches_video_id_watched_at_idx
  ON public.user_video_watches (video_id, watched_at);

-- The Passport session API owns watch records. Supabase Data API roles have no direct access.
ALTER TABLE public.user_video_watches ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.user_video_watches FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.user_video_watches FROM authenticated;
  END IF;
END $$;

COMMIT;
