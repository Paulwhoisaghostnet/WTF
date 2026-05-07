CREATE TABLE IF NOT EXISTS game_studio_project_builds (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES game_studio_projects(id) ON DELETE CASCADE,
  build_number integer NOT NULL DEFAULT 1,
  filename text NOT NULL,
  mime_type varchar(120) NOT NULL DEFAULT 'application/zip',
  size_bytes integer NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,
  manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_studio_project_builds_project_idx
  ON game_studio_project_builds (project_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS game_studio_project_builds_number_idx
  ON game_studio_project_builds (project_id, build_number);
