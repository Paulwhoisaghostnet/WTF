import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";
import {
  COMMUNICATION_ITEM_KINDS,
  COMMUNICATION_SOURCE_KINDS,
  type CommunicationItemKind,
  type CommunicationSourceKind,
} from "./comms";

export const communicationSourceKindEnum = pgEnum(
  "communication_source_kind",
  COMMUNICATION_SOURCE_KINDS
);

export const communicationItemKindEnum = pgEnum(
  "communication_item_kind",
  COMMUNICATION_ITEM_KINDS
);

export const communicationSources = pgTable(
  "communication_sources",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 80 }).unique().notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    sourceKind: communicationSourceKindEnum("source_kind")
      .$type<CommunicationSourceKind>()
      .notNull(),
    adapterKey: varchar("adapter_key", { length: 80 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    readOnly: boolean("read_only").default(true).notNull(),
    routeBase: varchar("route_base", { length: 240 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("communication_sources_kind_idx").on(table.sourceKind, table.enabled),
    index("communication_sources_adapter_idx").on(table.adapterKey),
  ]
);

export const communicationIdentities = pgTable(
  "communication_identities",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    sourceId: integer("source_id")
      .references(() => communicationSources.id, { onDelete: "cascade" })
      .notNull(),
    identityKey: varchar("identity_key", { length: 240 }).notNull(),
    displayName: varchar("display_name", { length: 240 }),
    handle: varchar("handle", { length: 240 }),
    profileUrl: text("profile_url"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("communication_identity_source_key_idx").on(
      table.sourceId,
      table.identityKey
    ),
    index("communication_identity_user_idx").on(table.userId),
    index("communication_identity_handle_idx").on(table.handle),
  ]
);

export const communicationThreads = pgTable(
  "communication_threads",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .references(() => communicationSources.id, { onDelete: "cascade" })
      .notNull(),
    externalThreadRef: varchar("external_thread_ref", { length: 260 }).notNull(),
    title: varchar("title", { length: 260 }).notNull(),
    routePath: varchar("route_path", { length: 400 }),
    originUrl: text("origin_url"),
    lastItemAt: timestamp("last_item_at").defaultNow().notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("communication_threads_source_ref_idx").on(
      table.sourceId,
      table.externalThreadRef
    ),
    index("communication_threads_last_item_idx").on(table.lastItemAt),
  ]
);

export const communicationItems = pgTable(
  "communication_items",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .references(() => communicationSources.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id").references(() => communicationThreads.id, {
      onDelete: "set null",
    }),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    actorIdentityId: integer("actor_identity_id").references(
      () => communicationIdentities.id,
      { onDelete: "set null" }
    ),
    externalRef: varchar("external_ref", { length: 260 }).notNull(),
    itemKind: communicationItemKindEnum("item_kind")
      .$type<CommunicationItemKind>()
      .notNull(),
    title: varchar("title", { length: 260 }).notNull(),
    summary: text("summary"),
    body: text("body"),
    authorLabel: varchar("author_label", { length: 240 }),
    routePath: varchar("route_path", { length: 400 }),
    originUrl: text("origin_url"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("communication_items_source_ref_idx").on(
      table.sourceId,
      table.externalRef
    ),
    index("communication_items_target_time_idx").on(
      table.targetUserId,
      table.occurredAt
    ),
    index("communication_items_source_time_idx").on(
      table.sourceId,
      table.occurredAt
    ),
    index("communication_items_kind_time_idx").on(table.itemKind, table.occurredAt),
  ]
);

export const communicationReadStates = pgTable(
  "communication_read_states",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .references(() => communicationItems.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("communication_read_item_user_idx").on(table.itemId, table.userId),
    index("communication_read_user_idx").on(table.userId, table.readAt),
  ]
);

export const communicationLinks = pgTable(
  "communication_links",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .references(() => communicationItems.id, { onDelete: "cascade" })
      .notNull(),
    linkKind: varchar("link_kind", { length: 60 }).notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    routePath: varchar("route_path", { length: 400 }),
    externalUrl: text("external_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("communication_links_item_idx").on(table.itemId),
    index("communication_links_kind_idx").on(table.linkKind),
  ]
);

export const communicationSourcesRelations = relations(
  communicationSources,
  ({ many }) => ({
    identities: many(communicationIdentities),
    threads: many(communicationThreads),
    items: many(communicationItems),
  })
);

export const communicationItemsRelations = relations(
  communicationItems,
  ({ one, many }) => ({
    source: one(communicationSources, {
      fields: [communicationItems.sourceId],
      references: [communicationSources.id],
    }),
    thread: one(communicationThreads, {
      fields: [communicationItems.threadId],
      references: [communicationThreads.id],
    }),
    targetUser: one(users, {
      fields: [communicationItems.targetUserId],
      references: [users.id],
    }),
    readStates: many(communicationReadStates),
    links: many(communicationLinks),
  })
);
