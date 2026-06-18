import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema-core";

export const wtfLiveRooms = pgTable(
  "wtf_live_rooms",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").default("").notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    accessMode: varchar("access_mode", { length: 24 }).default("public").notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_rooms_slug_idx").on(table.slug),
    index("wtf_live_rooms_owner_idx").on(table.ownerUserId),
    index("wtf_live_rooms_access_mode_idx").on(table.accessMode),
  ],
);

export const wtfLiveRoomAccessMembers = pgTable(
  "wtf_live_room_access_members",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .references(() => wtfLiveRooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    addedByUserId: integer("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_room_access_members_room_user_idx").on(table.roomId, table.userId),
    index("wtf_live_room_access_members_user_idx").on(table.userId),
  ],
);

export const wtfLiveStages = pgTable(
  "wtf_live_stages",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").default("").notNull(),
    liveUrl: text("live_url"),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_stages_slug_idx").on(table.slug),
    index("wtf_live_stages_owner_idx").on(table.ownerUserId),
  ],
);

export const wtfLiveSoundboardClips = pgTable(
  "wtf_live_soundboard_clips",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    clipId: varchar("clip_id", { length: 80 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    category: varchar("category", { length: 48 }).default("General").notNull(),
    shortcut: varchar("shortcut", { length: 32 }).default("").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    dataUrl: text("data_url").notNull(),
    sizeBytes: integer("size_bytes").default(0).notNull(),
    volume: integer("volume").default(90).notNull(),
    cooldownMs: integer("cooldown_ms").default(1500).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_soundboard_owner_clip_idx").on(table.ownerUserId, table.clipId),
    index("wtf_live_soundboard_owner_order_idx").on(table.ownerUserId, table.sortOrder),
  ],
);
