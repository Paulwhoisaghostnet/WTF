-- W read-only Tezos X digest: admin-managed handles + scraped post URLs.

CREATE TABLE IF NOT EXISTS w_digest_handles (
  handle varchar(32) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  initial_scrape_completed boolean NOT NULL DEFAULT false,
  latest_post_id varchar(64),
  last_scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS w_digest_posts (
  id varchar(64) PRIMARY KEY,
  handle varchar(32) NOT NULL REFERENCES w_digest_handles(handle) ON DELETE CASCADE,
  post_url text NOT NULL,
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  atproto_outbox_id integer
);

CREATE INDEX IF NOT EXISTS w_digest_posts_handle_posted_idx
  ON w_digest_posts (handle, posted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS w_digest_posts_first_seen_idx
  ON w_digest_posts (first_seen_at DESC);

INSERT INTO w_digest_handles (handle, enabled, notes)
VALUES
  ('tezos', true, 'seed'),
  ('tezoscommons', true, 'seed'),
  ('artontezos_', true, 'seed'),
  ('thetezos', true, 'seed'),
  ('tezosartnetwork', true, 'seed'),
  ('transparentart', true, 'seed')
ON CONFLICT (handle) DO NOTHING;

COMMENT ON TABLE w_digest_handles IS 'X handles scraped for the read-only W Tezos digest timeline.';
COMMENT ON TABLE w_digest_posts IS 'Post URLs captured from profile scrapes; published to AT outbox as activity events.';
