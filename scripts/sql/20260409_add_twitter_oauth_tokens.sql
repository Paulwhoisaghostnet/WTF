ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twitter_oauth_token text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twitter_oauth_token_secret text;
