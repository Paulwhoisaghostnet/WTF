-- X DM event persistence: stores DM events from X API to survive restarts
-- and eliminate redundant API calls.

CREATE TABLE IF NOT EXISTS x_dm_events (
  event_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  sender_twitter_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL DEFAULT 'MessageCreate',
  text TEXT,
  media JSONB DEFAULT '[]'::jsonb,
  sender_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  fetched_by_token_owner VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_x_dm_events_conversation ON x_dm_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_x_dm_events_created ON x_dm_events(created_at DESC);

CREATE TABLE IF NOT EXISTS x_dm_conversations (
  conversation_id VARCHAR(64) PRIMARY KEY,
  conversation_type VARCHAR(16) NOT NULL DEFAULT 'direct',
  participant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_event_id VARCHAR(64),
  last_event_at TIMESTAMP,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS x_dm_participants (
  twitter_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(100),
  display_name VARCHAR(200),
  profile_image_url TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
