-- Tezonians discovery table
CREATE TABLE IF NOT EXISTS tezonians (
  id SERIAL PRIMARY KEY,
  twitter_id VARCHAR(100) UNIQUE NOT NULL,
  twitter_handle VARCHAR(100),
  twitter_name VARCHAR(200),
  profile_image_url TEXT,
  discovered_via VARCHAR(40) NOT NULL DEFAULT 'mention',
  source_tweet_id VARCHAR(64),
  auto_liked BOOLEAN NOT NULL DEFAULT FALSE,
  user_id INTEGER REFERENCES users(id),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tezonians_handle_idx ON tezonians(twitter_handle);

-- User-saved group conversations
CREATE TABLE IF NOT EXISTS user_saved_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dm_conversation_id VARCHAR(120) NOT NULL,
  label VARCHAR(200),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_saved_convo_user_convo_idx
  ON user_saved_conversations(user_id, dm_conversation_id);
