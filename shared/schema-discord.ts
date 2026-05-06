import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";

// ═══════════════════════════════════════════════════════════════
// Dicksword — Discord identity, avatars, and role sync.
// ═══════════════════════════════════════════════════════════════

export const discordClaimStatusEnum = pgEnum("discord_claim_status", [
  "pending",
  "claimed",
  "expired",
  "cancelled",
]);

export const discordAvatarLayerTypeEnum = pgEnum("discord_avatar_layer_type", [
  "base",
  "accessory",
]);

export const discordIdentityClaims = pgTable(
  "discord_identity_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    codeHash: varchar("code_hash", { length: 128 }).unique().notNull(),
    status: discordClaimStatusEnum("status").default("pending").notNull(),
    discordUserId: varchar("discord_user_id", { length: 100 }),
    discordHandle: varchar("discord_handle", { length: 120 }),
    discordGuildId: varchar("discord_guild_id", { length: 100 }),
    claimedAt: timestamp("claimed_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("discord_claims_user_status_idx").on(table.userId, table.status),
    index("discord_claims_discord_user_idx").on(table.discordUserId),
  ]
);

export const discordRoleMappings = pgTable(
  "discord_role_mappings",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).unique().notNull(),
    label: varchar("label", { length: 140 }).notNull(),
    roleId: varchar("role_id", { length: 100 }).notNull(),
    roleKind: varchar("role_kind", { length: 40 }).default("custom").notNull(),
    protected: boolean("protected").default(false).notNull(),
    managed: boolean("managed").default(true).notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("discord_role_mappings_role_idx").on(table.roleId)]
);

export const discordAvatarLayers = pgTable(
  "discord_avatar_layers",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 120 }).unique().notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    layerType: discordAvatarLayerTypeEnum("layer_type").notNull(),
    stackOrder: integer("stack_order").default(0).notNull(),
    assetUrl: text("asset_url").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("discord_avatar_layers_stack_idx").on(table.stackOrder)]
);

export const discordAvatarLayerConflicts = pgTable(
  "discord_avatar_layer_conflicts",
  {
    id: serial("id").primaryKey(),
    layerId: integer("layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    conflictsWithLayerId: integer("conflicts_with_layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discord_avatar_conflict_pair_idx").on(
      table.layerId,
      table.conflictsWithLayerId
    ),
  ]
);

export const discordAvatarSelections = pgTable(
  "discord_avatar_selections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    layerId: integer("layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discord_avatar_selection_unique_idx").on(
      table.userId,
      table.layerId
    ),
    index("discord_avatar_selection_user_idx").on(table.userId),
  ]
);
