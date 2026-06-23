CREATE TABLE IF NOT EXISTS "green_room_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL,
  "mode" varchar(24) DEFAULT 'active' NOT NULL,
  "target_departures" integer DEFAULT 50 NOT NULL,
  "departure_count" integer DEFAULT 0 NOT NULL,
  "shared_unlock_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "shared_unlocked_at" timestamp,
  "myth_mode_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_campaigns_slug_idx" ON "green_room_campaigns" ("slug");
CREATE INDEX IF NOT EXISTS "green_room_campaigns_mode_idx" ON "green_room_campaigns" ("mode");

INSERT INTO "green_room_campaigns" ("slug", "title", "mode", "target_departures", "shared_unlock_progress")
VALUES (
  'season-3-intro',
  'Search for the Green Room',
  'active',
  50,
  '{"required": ["ghost-ledger", "pond-ritual", "static-map"], "completed": []}'::jsonb
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "roles" (
  "slug",
  "label",
  "category",
  "purpose",
  "description",
  "access_level",
  "sort_order",
  "color",
  "icon",
  "default_wtf_os_access",
  "is_system",
  "is_assignable",
  "updated_at"
)
VALUES (
  'season_3_contestant',
  'Season 3 Contestant',
  'gameshow',
  'Additive badge/access role granted by departing through the Search for the Green Room intro labyrinth.',
  'Marks a user as qualified for Season 3 through the Green Room campaign without replacing broader account roles.',
  32,
  68,
  '#16a34a',
  'door-open',
  true,
  true,
  true,
  now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "purpose" = EXCLUDED."purpose",
  "description" = EXCLUDED."description",
  "access_level" = EXCLUDED."access_level",
  "sort_order" = EXCLUDED."sort_order",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "default_wtf_os_access" = EXCLUDED."default_wtf_os_access",
  "is_system" = EXCLUDED."is_system",
  "is_assignable" = EXCLUDED."is_assignable",
  "updated_at" = now();

CREATE TABLE IF NOT EXISTS "green_room_content_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(40) NOT NULL,
  "key" varchar(140) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(24) DEFAULT 'published' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_content_records_key_idx" ON "green_room_content_records" ("key");
CREATE INDEX IF NOT EXISTS "green_room_content_records_kind_idx" ON "green_room_content_records" ("kind", "status");

CREATE TABLE IF NOT EXISTS "green_room_players" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "campaign_id" integer REFERENCES "green_room_campaigns"("id") ON DELETE SET NULL,
  "location_id" varchar(120) NOT NULL,
  "status" varchar(32) DEFAULT 'exploring' NOT NULL,
  "departed_at" timestamp,
  "departure_mode" varchar(24),
  "weight_limit" integer DEFAULT 24 NOT NULL,
  "inventory_weight" integer DEFAULT 0 NOT NULL,
  "command_deck" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "skills_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "flags_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attunement_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "green_room_players_location_idx" ON "green_room_players" ("location_id", "status");
CREATE INDEX IF NOT EXISTS "green_room_players_campaign_idx" ON "green_room_players" ("campaign_id", "status");

CREATE TABLE IF NOT EXISTS "green_room_inventory_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "item_key" varchar(120) NOT NULL,
  "label" varchar(160) NOT NULL,
  "tier" integer DEFAULT 1 NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "weight" integer DEFAULT 1 NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_inventory_user_item_tier_idx" ON "green_room_inventory_items" ("user_id", "item_key", "tier");
CREATE INDEX IF NOT EXISTS "green_room_inventory_user_idx" ON "green_room_inventory_items" ("user_id");

CREATE TABLE IF NOT EXISTS "green_room_player_flags" (
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "key" varchar(140) NOT NULL,
  "value_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "key")
);

CREATE TABLE IF NOT EXISTS "green_room_world_flags" (
  "key" varchar(140) PRIMARY KEY NOT NULL,
  "value_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "green_room_npc_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "npc_key" varchar(120) NOT NULL,
  "location_id" varchar(120) NOT NULL,
  "mood" varchar(80) DEFAULT 'uncanny' NOT NULL,
  "current_script" varchar(140),
  "state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_npc_states_key_idx" ON "green_room_npc_states" ("npc_key");
CREATE INDEX IF NOT EXISTS "green_room_npc_states_location_idx" ON "green_room_npc_states" ("location_id");

CREATE TABLE IF NOT EXISTS "green_room_resource_nodes" (
  "id" serial PRIMARY KEY NOT NULL,
  "node_key" varchar(140) NOT NULL,
  "location_id" varchar(120) NOT NULL,
  "resource_key" varchar(120) NOT NULL,
  "quantity_available" integer DEFAULT 0 NOT NULL,
  "next_drop_at" timestamp,
  "state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_resource_nodes_key_idx" ON "green_room_resource_nodes" ("node_key");
CREATE INDEX IF NOT EXISTS "green_room_resource_nodes_location_idx" ON "green_room_resource_nodes" ("location_id");
CREATE INDEX IF NOT EXISTS "green_room_resource_nodes_resource_idx" ON "green_room_resource_nodes" ("resource_key");

CREATE TABLE IF NOT EXISTS "green_room_relationships" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "target_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "mark" varchar(24) DEFAULT 'neutral' NOT NULL,
  "affinity" integer DEFAULT 0 NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_relationship_pair_idx" ON "green_room_relationships" ("user_id", "target_user_id");
CREATE INDEX IF NOT EXISTS "green_room_relationship_user_idx" ON "green_room_relationships" ("user_id");

CREATE TABLE IF NOT EXISTS "green_room_alliances" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(100) NOT NULL,
  "name" varchar(120) NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "green_room_alliances_slug_idx" ON "green_room_alliances" ("slug");
CREATE INDEX IF NOT EXISTS "green_room_alliances_status_idx" ON "green_room_alliances" ("status");

CREATE TABLE IF NOT EXISTS "green_room_alliance_members" (
  "alliance_id" integer REFERENCES "green_room_alliances"("id") ON DELETE CASCADE NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
  "status" varchar(24) DEFAULT 'invited' NOT NULL,
  "role" varchar(40) DEFAULT 'member' NOT NULL,
  "joined_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("alliance_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "green_room_alliance_members_user_idx" ON "green_room_alliance_members" ("user_id");

CREATE TABLE IF NOT EXISTS "green_room_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" varchar(32) DEFAULT 'player' NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "location_id" varchar(120),
  "event_type" varchar(120) NOT NULL,
  "message" text NOT NULL,
  "visibility" varchar(24) DEFAULT 'private' NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "green_room_events_user_idx" ON "green_room_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "green_room_events_location_idx" ON "green_room_events" ("location_id", "created_at");
CREATE INDEX IF NOT EXISTS "green_room_events_type_idx" ON "green_room_events" ("event_type", "created_at");

CREATE TABLE IF NOT EXISTS "green_room_admin_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(120) NOT NULL,
  "target_kind" varchar(40) NOT NULL,
  "target_key" varchar(140),
  "success" boolean DEFAULT true NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "green_room_admin_audits_actor_idx" ON "green_room_admin_audits" ("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "green_room_admin_audits_target_idx" ON "green_room_admin_audits" ("target_kind", "target_key");
