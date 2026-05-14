CREATE TABLE IF NOT EXISTS tzkt_response_cache (
  cache_key varchar(240) PRIMARY KEY,
  endpoint text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tzkt_response_cache_endpoint_idx
  ON tzkt_response_cache (endpoint);

CREATE INDEX IF NOT EXISTS tzkt_response_cache_expires_idx
  ON tzkt_response_cache (expires_at);

CREATE INDEX IF NOT EXISTS tzkt_response_cache_accessed_idx
  ON tzkt_response_cache (last_accessed_at);
