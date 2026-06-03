-- WTF LIVE: user-owned rooms/stages registry + separate desktop app gate.

CREATE TABLE IF NOT EXISTS public.wtf_live_rooms (
  id serial PRIMARY KEY,
  slug varchar(80) NOT NULL,
  title varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_rooms_slug_idx ON public.wtf_live_rooms (slug);
CREATE INDEX IF NOT EXISTS wtf_live_rooms_owner_idx ON public.wtf_live_rooms (owner_user_id);

CREATE TABLE IF NOT EXISTS public.wtf_live_stages (
  id serial PRIMARY KEY,
  slug varchar(80) NOT NULL,
  title varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  live_url text,
  owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_stages_slug_idx ON public.wtf_live_stages (slug);
CREATE INDEX IF NOT EXISTS wtf_live_stages_owner_idx ON public.wtf_live_stages (owner_user_id);

INSERT INTO public.desktop_app_settings (
  app_key,
  enabled,
  doc_status,
  doc_registry_version,
  docs_updated_at,
  registered_at,
  updated_at
)
VALUES (
  'wtf-live',
  true,
  'registered',
  '1',
  now(),
  now(),
  now()
)
ON CONFLICT (app_key) DO UPDATE
SET
  enabled = true,
  doc_status = 'registered',
  doc_registry_version = EXCLUDED.doc_registry_version,
  docs_updated_at = COALESCE(public.desktop_app_settings.docs_updated_at, EXCLUDED.docs_updated_at),
  updated_at = now();
