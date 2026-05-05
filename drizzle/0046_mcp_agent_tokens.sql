CREATE TABLE IF NOT EXISTS mcp_agent_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL DEFAULT 'Paired Agent',
  token_hash varchar(64) NOT NULL UNIQUE,
  token_prefix varchar(24) NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_at timestamp,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_agent_tokens_user_idx
  ON mcp_agent_tokens (user_id, created_at);

CREATE INDEX IF NOT EXISTS mcp_agent_tokens_revoked_idx
  ON mcp_agent_tokens (revoked_at);
