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
