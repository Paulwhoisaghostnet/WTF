import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";

export const greenRoomCampaigns = pgTable(
  "green_room_campaigns",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    mode: varchar("mode", { length: 24 }).default("active").notNull(),
    targetDepartures: integer("target_departures").default(50).notNull(),
    departureCount: integer("departure_count").default(0).notNull(),
    sharedUnlockProgress: jsonb("shared_unlock_progress").default(sql`'{}'::jsonb`).notNull(),
    sharedUnlockedAt: timestamp("shared_unlocked_at"),
    mythModeAt: timestamp("myth_mode_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_campaigns_slug_idx").on(table.slug),
    index("green_room_campaigns_mode_idx").on(table.mode),
  ]
);

export const greenRoomContentRecords = pgTable(
  "green_room_content_records",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 40 }).notNull(),
    key: varchar("key", { length: 140 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").default("").notNull(),
    dataJson: jsonb("data_json").default(sql`'{}'::jsonb`).notNull(),
    status: varchar("status", { length: 24 }).default("published").notNull(),
    version: integer("version").default(1).notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_content_records_key_idx").on(table.key),
    index("green_room_content_records_kind_idx").on(table.kind, table.status),
  ]
);

export const greenRoomPlayers = pgTable(
  "green_room_players",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id").references(() => greenRoomCampaigns.id, { onDelete: "set null" }),
    locationId: varchar("location_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 32 }).default("exploring").notNull(),
    departedAt: timestamp("departed_at"),
    departureMode: varchar("departure_mode", { length: 24 }),
    weightLimit: integer("weight_limit").default(24).notNull(),
    inventoryWeight: integer("inventory_weight").default(0).notNull(),
    commandDeck: jsonb("command_deck").default(sql`'{}'::jsonb`).notNull(),
    skillsJson: jsonb("skills_json").default(sql`'{}'::jsonb`).notNull(),
    flagsJson: jsonb("flags_json").default(sql`'{}'::jsonb`).notNull(),
    attunementJson: jsonb("attunement_json").default(sql`'{}'::jsonb`).notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("green_room_players_location_idx").on(table.locationId, table.status),
    index("green_room_players_campaign_idx").on(table.campaignId, table.status),
  ]
);

export const greenRoomInventoryItems = pgTable(
  "green_room_inventory_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    itemKey: varchar("item_key", { length: 120 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    tier: integer("tier").default(1).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    weight: integer("weight").default(1).notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_inventory_user_item_tier_idx").on(table.userId, table.itemKey, table.tier),
    index("green_room_inventory_user_idx").on(table.userId),
  ]
);

export const greenRoomPlayerFlags = pgTable(
  "green_room_player_flags",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    key: varchar("key", { length: 140 }).notNull(),
    valueJson: jsonb("value_json").default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })]
);

export const greenRoomWorldFlags = pgTable("green_room_world_flags", {
  key: varchar("key", { length: 140 }).primaryKey(),
  valueJson: jsonb("value_json").default(sql`'{}'::jsonb`).notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const greenRoomNpcStates = pgTable(
  "green_room_npc_states",
  {
    id: serial("id").primaryKey(),
    npcKey: varchar("npc_key", { length: 120 }).notNull(),
    locationId: varchar("location_id", { length: 120 }).notNull(),
    mood: varchar("mood", { length: 80 }).default("uncanny").notNull(),
    currentScript: varchar("current_script", { length: 140 }),
    stateJson: jsonb("state_json").default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_npc_states_key_idx").on(table.npcKey),
    index("green_room_npc_states_location_idx").on(table.locationId),
  ]
);

export const greenRoomResourceNodes = pgTable(
  "green_room_resource_nodes",
  {
    id: serial("id").primaryKey(),
    nodeKey: varchar("node_key", { length: 140 }).notNull(),
    locationId: varchar("location_id", { length: 120 }).notNull(),
    resourceKey: varchar("resource_key", { length: 120 }).notNull(),
    quantityAvailable: integer("quantity_available").default(0).notNull(),
    nextDropAt: timestamp("next_drop_at"),
    stateJson: jsonb("state_json").default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_resource_nodes_key_idx").on(table.nodeKey),
    index("green_room_resource_nodes_location_idx").on(table.locationId),
    index("green_room_resource_nodes_resource_idx").on(table.resourceKey),
  ]
);

export const greenRoomRelationships = pgTable(
  "green_room_relationships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetUserId: integer("target_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    mark: varchar("mark", { length: 24 }).default("neutral").notNull(),
    affinity: integer("affinity").default(0).notNull(),
    notes: text("notes").default("").notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_relationship_pair_idx").on(table.userId, table.targetUserId),
    index("green_room_relationship_user_idx").on(table.userId),
  ]
);

export const greenRoomAlliances = pgTable(
  "green_room_alliances",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 24 }).default("active").notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("green_room_alliances_slug_idx").on(table.slug),
    index("green_room_alliances_status_idx").on(table.status),
  ]
);

export const greenRoomAllianceMembers = pgTable(
  "green_room_alliance_members",
  {
    allianceId: integer("alliance_id")
      .references(() => greenRoomAlliances.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 24 }).default("invited").notNull(),
    role: varchar("role", { length: 40 }).default("member").notNull(),
    joinedAt: timestamp("joined_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.allianceId, table.userId] }),
    index("green_room_alliance_members_user_idx").on(table.userId),
  ]
);

export const greenRoomEvents = pgTable(
  "green_room_events",
  {
    id: serial("id").primaryKey(),
    scope: varchar("scope", { length: 32 }).default("player").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    locationId: varchar("location_id", { length: 120 }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    message: text("message").notNull(),
    visibility: varchar("visibility", { length: 24 }).default("private").notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("green_room_events_user_idx").on(table.userId, table.createdAt),
    index("green_room_events_location_idx").on(table.locationId, table.createdAt),
    index("green_room_events_type_idx").on(table.eventType, table.createdAt),
  ]
);

export const greenRoomAdminAudits = pgTable(
  "green_room_admin_audits",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    targetKind: varchar("target_kind", { length: 40 }).notNull(),
    targetKey: varchar("target_key", { length: 140 }),
    success: boolean("success").default(true).notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("green_room_admin_audits_actor_idx").on(table.actorUserId, table.createdAt),
    index("green_room_admin_audits_target_idx").on(table.targetKind, table.targetKey),
  ]
);
