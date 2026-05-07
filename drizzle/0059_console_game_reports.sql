CREATE TABLE IF NOT EXISTS console_game_reports (
  id serial PRIMARY KEY,
  game_id integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
  reporter_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  category varchar(60) NOT NULL DEFAULT 'other',
  reason text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  resolved_by integer REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);

CREATE INDEX IF NOT EXISTS console_game_reports_game_idx
  ON console_game_reports (game_id, created_at);
CREATE INDEX IF NOT EXISTS console_game_reports_reporter_idx
  ON console_game_reports (reporter_user_id, created_at);
CREATE INDEX IF NOT EXISTS console_game_reports_status_idx
  ON console_game_reports (status, created_at);
