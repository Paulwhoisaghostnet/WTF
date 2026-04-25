-- ════════════════════════════════════════════════════════════════════════════
-- Dicksword — Discord identity, activity, avatars, and managed role sync.
--
-- This migration is intentionally additive. It does not alter existing WTF
-- role semantics, Discord OAuth fields, or XP tables.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discord_claim_status') THEN
    CREATE TYPE discord_claim_status AS ENUM (
      'pending',
      'claimed',
      'expired',
      'cancelled'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discord_activity_kind') THEN
    CREATE TYPE discord_activity_kind AS ENUM (
      'message',
      'reaction',
      'voice',
      'stage',
      'event',
      'lottery',
      'auction',
      'avatar',
      'manual'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discord_avatar_layer_type') THEN
    CREATE TYPE discord_avatar_layer_type AS ENUM ('base', 'accessory');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS discord_identity_claims (
  id                serial PRIMARY KEY,
  user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash         varchar(128) UNIQUE NOT NULL,
  status            discord_claim_status NOT NULL DEFAULT 'pending',
  discord_user_id   varchar(100),
  discord_handle    varchar(120),
  discord_guild_id  varchar(100),
  claimed_at        timestamp,
  expires_at        timestamp NOT NULL,
  created_at        timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discord_claims_user_status_idx
  ON discord_identity_claims (user_id, status);

CREATE INDEX IF NOT EXISTS discord_claims_discord_user_idx
  ON discord_identity_claims (discord_user_id);

CREATE TABLE IF NOT EXISTS discord_activity_events (
  id                  serial PRIMARY KEY,
  user_id             integer REFERENCES users(id) ON DELETE SET NULL,
  discord_user_id     varchar(100) NOT NULL,
  discord_handle      varchar(120),
  discord_guild_id    varchar(100) NOT NULL,
  discord_channel_id  varchar(100),
  kind                discord_activity_kind NOT NULL,
  action              varchar(80) NOT NULL,
  xp_amount           integer NOT NULL DEFAULT 0,
  xp_awarded_at       timestamp,
  xp_event_id         integer REFERENCES xp_events(id) ON DELETE SET NULL,
  external_ref        varchar(200),
  payload_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at         timestamp NOT NULL DEFAULT NOW(),
  created_at          timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discord_activity_user_observed_idx
  ON discord_activity_events (user_id, observed_at);

CREATE INDEX IF NOT EXISTS discord_activity_discord_user_idx
  ON discord_activity_events (discord_user_id, observed_at);

CREATE UNIQUE INDEX IF NOT EXISTS discord_activity_external_ref_idx
  ON discord_activity_events (external_ref)
  WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS discord_role_mappings (
  id          serial PRIMARY KEY,
  key         varchar(100) UNIQUE NOT NULL,
  label       varchar(140) NOT NULL,
  role_id     varchar(100) NOT NULL,
  role_kind   varchar(40) NOT NULL DEFAULT 'custom',
  protected   boolean NOT NULL DEFAULT false,
  managed     boolean NOT NULL DEFAULT true,
  notes       text,
  created_by  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamp NOT NULL DEFAULT NOW(),
  updated_at  timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discord_role_mappings_role_idx
  ON discord_role_mappings (role_id);

CREATE TABLE IF NOT EXISTS discord_avatar_layers (
  id             serial PRIMARY KEY,
  key            varchar(120) UNIQUE NOT NULL,
  label          varchar(160) NOT NULL,
  layer_type     discord_avatar_layer_type NOT NULL,
  stack_order    integer NOT NULL DEFAULT 0,
  asset_url      text NOT NULL,
  enabled        boolean NOT NULL DEFAULT true,
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     integer REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamp NOT NULL DEFAULT NOW(),
  updated_at     timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discord_avatar_layers_stack_idx
  ON discord_avatar_layers (stack_order);

CREATE TABLE IF NOT EXISTS discord_avatar_layer_conflicts (
  id                       serial PRIMARY KEY,
  layer_id                 integer NOT NULL REFERENCES discord_avatar_layers(id) ON DELETE CASCADE,
  conflicts_with_layer_id  integer NOT NULL REFERENCES discord_avatar_layers(id) ON DELETE CASCADE,
  reason                   text,
  created_at               timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_avatar_conflict_pair_idx
  ON discord_avatar_layer_conflicts (layer_id, conflicts_with_layer_id);

CREATE TABLE IF NOT EXISTS discord_avatar_selections (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layer_id    integer NOT NULL REFERENCES discord_avatar_layers(id) ON DELETE CASCADE,
  created_at  timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_avatar_selection_unique_idx
  ON discord_avatar_selections (user_id, layer_id);

CREATE INDEX IF NOT EXISTS discord_avatar_selection_user_idx
  ON discord_avatar_selections (user_id);
