BEGIN;

ALTER TABLE wtf_live_rooms
  ADD COLUMN IF NOT EXISTS access_mode varchar(24) NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS wtf_live_rooms_access_mode_idx
  ON wtf_live_rooms(access_mode);

CREATE TABLE IF NOT EXISTS wtf_live_room_access_members (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES wtf_live_rooms(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_room_access_members_room_user_idx
  ON wtf_live_room_access_members(room_id, user_id);

CREATE INDEX IF NOT EXISTS wtf_live_room_access_members_user_idx
  ON wtf_live_room_access_members(user_id);

COMMIT;
