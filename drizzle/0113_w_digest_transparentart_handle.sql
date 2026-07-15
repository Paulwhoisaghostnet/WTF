BEGIN;

INSERT INTO w_digest_handles (
  handle,
  enabled,
  notes,
  initial_scrape_completed,
  latest_post_id,
  last_scraped_at,
  created_at,
  updated_at
)
SELECT
  '_transparentart',
  enabled,
  notes,
  initial_scrape_completed,
  latest_post_id,
  last_scraped_at,
  created_at,
  now()
FROM w_digest_handles
WHERE handle = 'transparentart'
ON CONFLICT (handle) DO NOTHING;

INSERT INTO w_digest_handles (handle, enabled, notes)
VALUES ('_transparentart', true, 'seed')
ON CONFLICT (handle) DO NOTHING;

UPDATE w_digest_posts
SET handle = '_transparentart'
WHERE handle = 'transparentart';

DELETE FROM w_digest_handles
WHERE handle = 'transparentart';

COMMIT;
