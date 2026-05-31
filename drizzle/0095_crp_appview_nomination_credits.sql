-- Anonymous CRP AppView nomination reward credits.
-- One row per anonymous submission; no nominee, category, or timestamp columns.

CREATE TABLE IF NOT EXISTS crp_appview_nomination_credits (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS crp_appview_nomination_credits_user_idx
  ON crp_appview_nomination_credits (user_id);
