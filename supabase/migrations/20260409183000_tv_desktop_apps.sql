-- WTF TV + desktop microapp visibility controls
-- Safe to run on environments where some objects may already exist.

CREATE TABLE IF NOT EXISTS public.desktop_app_settings (
  app_key varchar(50) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_by integer,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tv_channels (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL,
  slug varchar(120) NOT NULL,
  title varchar(180) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tv_channel_videos (
  id serial PRIMARY KEY,
  channel_id integer NOT NULL,
  token_contract varchar(36) NOT NULL,
  token_id text NOT NULL,
  source_uri text NOT NULL,
  title varchar(300),
  mime_type varchar(120) NOT NULL,
  thumbnail_uri text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tv_playlists (
  id serial PRIMARY KEY,
  channel_id integer NOT NULL,
  name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  transition_seconds integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tv_playlist_items (
  id serial PRIMARY KEY,
  playlist_id integer NOT NULL,
  video_id integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 30,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.desktop_app_settings
    ADD CONSTRAINT desktop_app_settings_updated_by_users_id_fk
    FOREIGN KEY (updated_by) REFERENCES public.users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tv_channels
    ADD CONSTRAINT tv_channels_owner_user_id_users_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tv_channel_videos
    ADD CONSTRAINT tv_channel_videos_channel_id_tv_channels_id_fk
    FOREIGN KEY (channel_id) REFERENCES public.tv_channels(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tv_playlists
    ADD CONSTRAINT tv_playlists_channel_id_tv_channels_id_fk
    FOREIGN KEY (channel_id) REFERENCES public.tv_channels(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tv_playlist_items
    ADD CONSTRAINT tv_playlist_items_playlist_id_tv_playlists_id_fk
    FOREIGN KEY (playlist_id) REFERENCES public.tv_playlists(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tv_playlist_items
    ADD CONSTRAINT tv_playlist_items_video_id_tv_channel_videos_id_fk
    FOREIGN KEY (video_id) REFERENCES public.tv_channel_videos(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS tv_channel_owner_idx
  ON public.tv_channels(owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS tv_channel_slug_unique_idx
  ON public.tv_channels(slug);

CREATE UNIQUE INDEX IF NOT EXISTS tv_channel_owner_slug_unique_idx
  ON public.tv_channels(owner_user_id, slug);

CREATE INDEX IF NOT EXISTS tv_video_channel_idx
  ON public.tv_channel_videos(channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS tv_video_unique_token_per_channel_idx
  ON public.tv_channel_videos(channel_id, token_contract, token_id);

CREATE INDEX IF NOT EXISTS tv_playlist_channel_idx
  ON public.tv_playlists(channel_id);

CREATE INDEX IF NOT EXISTS tv_playlist_active_idx
  ON public.tv_playlists(channel_id, is_active);

CREATE INDEX IF NOT EXISTS tv_playlist_item_playlist_idx
  ON public.tv_playlist_items(playlist_id);

CREATE INDEX IF NOT EXISTS tv_playlist_item_video_idx
  ON public.tv_playlist_items(video_id);

CREATE UNIQUE INDEX IF NOT EXISTS tv_playlist_item_unique_idx
  ON public.tv_playlist_items(playlist_id, video_id);
