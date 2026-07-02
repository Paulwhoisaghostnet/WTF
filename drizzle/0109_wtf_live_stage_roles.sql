BEGIN;

CREATE TABLE IF NOT EXISTS wtf_live_stage_access_members (
  id serial PRIMARY KEY,
  stage_id integer NOT NULL REFERENCES wtf_live_stages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL CHECK (role IN ('host', 'speaker')),
  added_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_stage_access_members_stage_user_idx
  ON wtf_live_stage_access_members(stage_id, user_id);

CREATE INDEX IF NOT EXISTS wtf_live_stage_access_members_user_idx
  ON wtf_live_stage_access_members(user_id);

CREATE INDEX IF NOT EXISTS wtf_live_stage_access_members_stage_role_idx
  ON wtf_live_stage_access_members(stage_id, role);

COMMIT;
