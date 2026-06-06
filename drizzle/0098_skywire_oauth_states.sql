CREATE TABLE IF NOT EXISTS atproto_oauth_states (
  state_key varchar(128) PRIMARY KEY,
  state_kind varchar(16) NOT NULL,
  app_state_key varchar(128),
  encrypted_payload text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atproto_oauth_states_app_state_idx
  ON atproto_oauth_states(app_state_key);

CREATE INDEX IF NOT EXISTS atproto_oauth_states_expires_idx
  ON atproto_oauth_states(expires_at);
