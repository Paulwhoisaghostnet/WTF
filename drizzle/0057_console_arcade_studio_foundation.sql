ALTER TABLE console_games
  ADD COLUMN IF NOT EXISTS cover_uri text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS builder_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS builder_name varchar(120),
  ADD COLUMN IF NOT EXISTS builder_address varchar(80),
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sdk_version varchar(40) DEFAULT 'wtf-console-v1',
  ADD COLUMN IF NOT EXISTS storage_mode varchar(40) DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS bundle_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_possible_score bigint,
  ADD COLUMN IF NOT EXISTS max_score_per_second integer,
  ADD COLUMN IF NOT EXISTS moderation_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamp,
  ADD COLUMN IF NOT EXISTS approved_at timestamp,
  ADD COLUMN IF NOT EXISTS removed_at timestamp;

CREATE INDEX IF NOT EXISTS console_games_status_idx
  ON console_games (status, active, is_public);
CREATE INDEX IF NOT EXISTS console_games_builder_idx
  ON console_games (builder_user_id, updated_at);
CREATE INDEX IF NOT EXISTS console_games_category_idx
  ON console_games (category, updated_at);

CREATE TABLE IF NOT EXISTS console_game_versions (
  id serial PRIMARY KEY,
  game_id integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  artifact_uri text NOT NULL,
  source_url text,
  cover_uri text,
  sdk_version varchar(40) DEFAULT 'wtf-console-v1',
  submitted_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  review_note text,
  reset_leaderboard boolean NOT NULL DEFAULT false,
  bundle_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp
);

CREATE INDEX IF NOT EXISTS console_game_versions_game_idx
  ON console_game_versions (game_id, version);
CREATE INDEX IF NOT EXISTS console_game_versions_status_idx
  ON console_game_versions (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS console_game_versions_unique_idx
  ON console_game_versions (game_id, version);

CREATE TABLE IF NOT EXISTS console_player_stats (
  id serial PRIMARY KEY,
  game_id integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plays integer NOT NULL DEFAULT 0,
  best_score bigint NOT NULL DEFAULT 0,
  total_score bigint NOT NULL DEFAULT 0,
  last_played_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS console_player_stats_user_idx
  ON console_player_stats (user_id, updated_at);
CREATE INDEX IF NOT EXISTS console_player_stats_game_best_idx
  ON console_player_stats (game_id, best_score);
CREATE UNIQUE INDEX IF NOT EXISTS console_player_stats_unique_idx
  ON console_player_stats (game_id, user_id);

CREATE TABLE IF NOT EXISTS console_audit_events (
  id serial PRIMARY KEY,
  game_id integer REFERENCES console_games(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  reason text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS console_audit_events_game_idx
  ON console_audit_events (game_id, created_at);
CREATE INDEX IF NOT EXISTS console_audit_events_actor_idx
  ON console_audit_events (actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS console_audit_events_action_idx
  ON console_audit_events (action, created_at);
