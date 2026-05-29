import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  varchar,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type {
  DesktopAppearance,
  DesktopIconLayout,
  HamsterGenetics,
  HamsterState,
} from "./desktop";
import { users } from "./schema-core";
import { xpEvents } from "./schema-admin";

// ─── Desktop App Settings ────────────────────────────────

export const desktopAppSettings = pgTable("desktop_app_settings", {
  appKey: varchar("app_key", { length: 50 }).primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  docStatus: varchar("doc_status", { length: 20 }).default("pending").notNull(),
  docRegistryVersion: varchar("doc_registry_version", { length: 20 }).default("1").notNull(),
  docsUpdatedAt: timestamp("docs_updated_at"),
  docsExpiresAt: timestamp("docs_expires_at"),
  installKeyHash: varchar("install_key_hash", { length: 64 }),
  installKeyPrefix: varchar("install_key_prefix", { length: 24 }),
  installKeyIssuedAt: timestamp("install_key_issued_at"),
  installKeyExpiresAt: timestamp("install_key_expires_at"),
  installKeyRevokedAt: timestamp("install_key_revoked_at"),
  registeredBy: integer("registered_by").references(() => users.id),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userDesktopSettings = pgTable("user_desktop_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  appearance: jsonb("appearance")
    .$type<DesktopAppearance>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  iconLayout: jsonb("icon_layout")
    .$type<DesktopIconLayout>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mcpAgentTokens = pgTable(
  "mcp_agent_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).default("Paired Agent").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).unique().notNull(),
    tokenPrefix: varchar("token_prefix", { length: 24 }).notNull(),
    scopes: jsonb("scopes")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_agent_tokens_user_idx").on(table.userId, table.createdAt),
    index("mcp_agent_tokens_revoked_idx").on(table.revokedAt),
  ]
);

export const desktopPetStates = pgTable("desktop_pet_states", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 40 }).default("Niblet").notNull(),
  colorSchemeKey: varchar("color_scheme_key", { length: 64 })
    .default("golden")
    .notNull(),
  genetics: jsonb("genetics")
    .$type<HamsterGenetics>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  alive: boolean("alive").default(true).notNull(),
  hunger: integer("hunger").default(72).notNull(),
  thirst: integer("thirst").default(72).notNull(),
  happiness: integer("happiness").default(68).notNull(),
  hygiene: integer("hygiene").default(70).notNull(),
  energy: integer("energy").default(64).notNull(),
  level: integer("level").default(1).notNull(),
  xpEarned: integer("xp_earned").default(0).notNull(),
  carePoints: integer("care_points").default(0).notNull(),
  missedCareDays: integer("missed_care_days").default(0).notNull(),
  careStreak: integer("care_streak").default(0).notNull(),
  lastCareDate: date("last_care_date"),
  lastInteractionAt: timestamp("last_interaction_at"),
  interactionCounts: jsonb("interaction_counts")
    .$type<Record<string, number>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const desktopPetEvents = pgTable(
  "desktop_pet_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    statBefore: jsonb("stat_before").$type<HamsterState>(),
    statAfter: jsonb("stat_after").$type<HamsterState>(),
    xpAmount: integer("xp_amount").default(0).notNull(),
    xpEventId: integer("xp_event_id").references(() => xpEvents.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("desktop_pet_event_user_created_idx").on(table.userId, table.createdAt),
    index("desktop_pet_event_action_idx").on(table.action),
  ]
);

export const userDesktopSettingsRelations = relations(userDesktopSettings, ({ one }) => ({
  user: one(users, {
    fields: [userDesktopSettings.userId],
    references: [users.id],
  }),
}));

export const mcpAgentTokensRelations = relations(mcpAgentTokens, ({ one }) => ({
  user: one(users, {
    fields: [mcpAgentTokens.userId],
    references: [users.id],
  }),
}));

export const desktopPetStatesRelations = relations(desktopPetStates, ({ one }) => ({
  user: one(users, {
    fields: [desktopPetStates.userId],
    references: [users.id],
  }),
}));

export const desktopPetEventsRelations = relations(desktopPetEvents, ({ one }) => ({
  user: one(users, {
    fields: [desktopPetEvents.userId],
    references: [users.id],
  }),
  xpEvent: one(xpEvents, {
    fields: [desktopPetEvents.xpEventId],
    references: [xpEvents.id],
  }),
}));
