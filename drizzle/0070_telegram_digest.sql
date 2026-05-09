CREATE TABLE IF NOT EXISTS telegram_digest_sources (
  id serial PRIMARY KEY,
  key varchar(80) NOT NULL UNIQUE,
  title varchar(160) NOT NULL,
  description text,
  telegram_chat_id varchar(120),
  telegram_username varchar(120),
  source_kind varchar(24) NOT NULL DEFAULT 'channel',
  enabled boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT true,
  digest_enabled boolean NOT NULL DEFAULT true,
  board_channel_id integer REFERENCES board_threads(id) ON DELETE SET NULL,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_digest_sources_enabled_idx
  ON telegram_digest_sources(enabled, digest_enabled);

CREATE INDEX IF NOT EXISTS telegram_digest_sources_chat_idx
  ON telegram_digest_sources(telegram_chat_id);

CREATE INDEX IF NOT EXISTS telegram_digest_sources_board_idx
  ON telegram_digest_sources(board_channel_id);

CREATE TABLE IF NOT EXISTS telegram_digest_messages (
  id serial PRIMARY KEY,
  source_id integer NOT NULL REFERENCES telegram_digest_sources(id) ON DELETE CASCADE,
  external_ref varchar(180) NOT NULL UNIQUE,
  telegram_chat_id varchar(120) NOT NULL,
  telegram_message_id varchar(80) NOT NULL,
  message_kind varchar(24) NOT NULL DEFAULT 'message',
  author_name varchar(160),
  author_username varchar(120),
  author_telegram_id varchar(120),
  text text NOT NULL,
  summary text,
  public_link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_date timestamp NOT NULL,
  public_visible boolean NOT NULL DEFAULT true,
  posted_board_reply_id integer REFERENCES board_thread_replies(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_digest_messages_external_ref_idx
  ON telegram_digest_messages(external_ref);

CREATE INDEX IF NOT EXISTS telegram_digest_messages_source_date_idx
  ON telegram_digest_messages(source_id, message_date);

CREATE INDEX IF NOT EXISTS telegram_digest_messages_kind_date_idx
  ON telegram_digest_messages(message_kind, message_date);

CREATE INDEX IF NOT EXISTS telegram_digest_messages_public_date_idx
  ON telegram_digest_messages(public_visible, message_date);

CREATE TABLE IF NOT EXISTS telegram_digest_announcements (
  id serial PRIMARY KEY,
  source_id integer REFERENCES telegram_digest_sources(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  body text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'queued',
  telegram_message_id varchar(80),
  failure text,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  sent_at timestamp
);

CREATE INDEX IF NOT EXISTS telegram_digest_announcements_status_idx
  ON telegram_digest_announcements(status, created_at);

CREATE INDEX IF NOT EXISTS telegram_digest_announcements_source_idx
  ON telegram_digest_announcements(source_id);

CREATE TABLE IF NOT EXISTS telegram_fart_tracks (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  wallet_address varchar(36) NOT NULL,
  label varchar(120),
  status varchar(24) NOT NULL DEFAULT 'planned',
  fart_token_contract varchar(36) NOT NULL DEFAULT 'KT1F4oayJA83QQFPZz7ayfTfemEx8Z8X8mAm',
  fart_token_id varchar(40) NOT NULL DEFAULT '0',
  fart_token_balance varchar(80),
  last_checked_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_fart_tracks_user_wallet_idx
  ON telegram_fart_tracks(user_id, wallet_address);

CREATE INDEX IF NOT EXISTS telegram_fart_tracks_wallet_idx
  ON telegram_fart_tracks(wallet_address);

CREATE INDEX IF NOT EXISTS telegram_fart_tracks_status_idx
  ON telegram_fart_tracks(status);

INSERT INTO telegram_digest_sources
  (key, title, description, telegram_username, source_kind, enabled, public_visible, digest_enabled)
VALUES
  (
    'fart_noises',
    'FART NOISES',
    'FART NOISES Tezos wallet alerts; WTF ingests this through Telegram when a configured client can see the messages.',
    'fart_noises',
    'bot',
    true,
    true,
    true
  ),
  (
    'wtf_announcements',
    'WTF Announcements',
    'WTF-owned announcement lane that can be mirrored out to approved Telegram channels.',
    NULL,
    'channel',
    true,
    true,
    true
  )
ON CONFLICT (key) DO NOTHING;
