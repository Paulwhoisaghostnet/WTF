BEGIN;

CREATE TABLE IF NOT EXISTS wtf_live_rooms (
  id serial PRIMARY KEY,
  slug varchar(80) NOT NULL,
  title varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_rooms_slug_idx
  ON wtf_live_rooms(slug);

CREATE INDEX IF NOT EXISTS wtf_live_rooms_owner_idx
  ON wtf_live_rooms(owner_user_id);

CREATE TABLE IF NOT EXISTS wtf_live_stages (
  id serial PRIMARY KEY,
  slug varchar(80) NOT NULL,
  title varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  live_url text,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_stages_slug_idx
  ON wtf_live_stages(slug);

CREATE INDEX IF NOT EXISTS wtf_live_stages_owner_idx
  ON wtf_live_stages(owner_user_id);

COMMIT;
