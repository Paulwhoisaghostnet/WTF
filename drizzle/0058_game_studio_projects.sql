CREATE TABLE IF NOT EXISTS game_studio_projects (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug varchar(140) NOT NULL,
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  template_id varchar(120) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  selected_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  files jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_submitted_game_id integer REFERENCES console_games(id) ON DELETE SET NULL,
  last_built_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_studio_projects_owner_idx
  ON game_studio_projects (owner_user_id, updated_at);
CREATE INDEX IF NOT EXISTS game_studio_projects_template_idx
  ON game_studio_projects (template_id);
CREATE INDEX IF NOT EXISTS game_studio_projects_status_idx
  ON game_studio_projects (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS game_studio_projects_owner_slug_idx
  ON game_studio_projects (owner_user_id, slug);
