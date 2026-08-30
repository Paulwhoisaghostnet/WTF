CREATE TABLE IF NOT EXISTS casino_practice_games (
  id serial PRIMARY KEY,
  slug varchar(200) UNIQUE NOT NULL,
  creator_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_name varchar(200) NOT NULL,
  title varchar(200) NOT NULL,
  summary text NOT NULL,
  instructions text NOT NULL,
  outcomes jsonb DEFAULT '[]'::jsonb NOT NULL,
  status varchar(24) DEFAULT 'submitted' NOT NULL,
  active boolean DEFAULT false NOT NULL,
  moderation_note text,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  play_count integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT casino_practice_games_status_check
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  CONSTRAINT casino_practice_games_outcomes_check
    CHECK (jsonb_typeof(outcomes) = 'array' AND jsonb_array_length(outcomes) >= 2),
  CONSTRAINT casino_practice_games_play_count_check
    CHECK (play_count >= 0)
);

CREATE INDEX IF NOT EXISTS casino_practice_games_status_idx
  ON casino_practice_games(status, updated_at);
CREATE INDEX IF NOT EXISTS casino_practice_games_creator_idx
  ON casino_practice_games(creator_user_id, updated_at);

CREATE TABLE IF NOT EXISTS casino_practice_plays (
  id serial PRIMARY KEY,
  game_id integer NOT NULL REFERENCES casino_practice_games(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome_index integer NOT NULL,
  outcome_label text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT casino_practice_plays_outcome_index_check CHECK (outcome_index >= 0)
);

CREATE INDEX IF NOT EXISTS casino_practice_plays_game_idx
  ON casino_practice_plays(game_id, created_at);
CREATE INDEX IF NOT EXISTS casino_practice_plays_user_idx
  ON casino_practice_plays(user_id, created_at);
