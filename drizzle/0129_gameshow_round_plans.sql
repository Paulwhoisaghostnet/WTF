-- Production associations only. Existing rounds/challenges remain the rules, task and result owners.
CREATE TABLE IF NOT EXISTS gameshow_round_plans (
  round_id integer PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  configuration jsonb NOT NULL CHECK (configuration->>'version' = '1' AND jsonb_typeof(configuration->'tasks') = 'array'),
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
