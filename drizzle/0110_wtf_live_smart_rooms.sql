BEGIN;

ALTER TABLE wtf_live_room_access_members
  ADD COLUMN IF NOT EXISTS role varchar(24) NOT NULL DEFAULT 'guest';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_live_room_access_members_role_check'
  ) THEN
    ALTER TABLE wtf_live_room_access_members
      ADD CONSTRAINT wtf_live_room_access_members_role_check
      CHECK (role IN ('host', 'guest'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wtf_live_room_access_members_room_role_idx
  ON wtf_live_room_access_members(room_id, role);

CREATE TABLE IF NOT EXISTS wtf_live_show_kits (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kit_id varchar(80) NOT NULL,
  name varchar(80) NOT NULL,
  description text NOT NULL DEFAULT '',
  clip_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_show_kits_owner_kit_idx
  ON wtf_live_show_kits(owner_user_id, kit_id);

CREATE INDEX IF NOT EXISTS wtf_live_show_kits_owner_idx
  ON wtf_live_show_kits(owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_show_kits_owner_default_idx
  ON wtf_live_show_kits(owner_user_id)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS wtf_live_room_settings (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_kind varchar(24) NOT NULL CHECK (room_kind IN ('room', 'stage')),
  room_id varchar(80) NOT NULL,
  allow_guest_audio boolean NOT NULL DEFAULT true,
  allow_guest_camera boolean NOT NULL DEFAULT true,
  allow_guest_screen boolean NOT NULL DEFAULT true,
  allow_guest_media boolean NOT NULL DEFAULT true,
  show_kit_enabled boolean NOT NULL DEFAULT true,
  show_kit_id integer REFERENCES wtf_live_show_kits(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_room_settings_kind_room_idx
  ON wtf_live_room_settings(room_kind, room_id);

CREATE INDEX IF NOT EXISTS wtf_live_room_settings_owner_idx
  ON wtf_live_room_settings(owner_user_id);

CREATE INDEX IF NOT EXISTS wtf_live_room_settings_show_kit_idx
  ON wtf_live_room_settings(show_kit_id);

CREATE TABLE IF NOT EXISTS wtf_live_room_invites (
  id serial PRIMARY KEY,
  room_kind varchar(24) NOT NULL CHECK (room_kind IN ('room', 'stage')),
  room_id varchar(80) NOT NULL,
  target_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'host', 'speaker')),
  invited_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  responded_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_room_invites_unique_idx
  ON wtf_live_room_invites(room_kind, room_id, target_user_id, role);

CREATE INDEX IF NOT EXISTS wtf_live_room_invites_target_idx
  ON wtf_live_room_invites(target_user_id, status);

CREATE INDEX IF NOT EXISTS wtf_live_room_invites_room_idx
  ON wtf_live_room_invites(room_kind, room_id);

CREATE TABLE IF NOT EXISTS wtf_live_room_calendar_events (
  id serial PRIMARY KEY,
  room_kind varchar(24) NOT NULL CHECK (room_kind IN ('room', 'stage')),
  room_id varchar(80) NOT NULL,
  target varchar(24) NOT NULL CHECK (target IN ('wtf', 'ttc', 'both')),
  gameshow_event_id integer,
  ttc_submit_url text,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wtf_live_room_calendar_events_room_idx
  ON wtf_live_room_calendar_events(room_kind, room_id);

CREATE INDEX IF NOT EXISTS wtf_live_room_calendar_events_event_idx
  ON wtf_live_room_calendar_events(gameshow_event_id);

COMMIT;
