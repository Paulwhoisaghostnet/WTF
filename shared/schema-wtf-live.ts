import {
  check,
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";

export const wtfLiveRooms = pgTable(
  "wtf_live_rooms",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    roomKind: varchar("room_kind", { length: 24 }).default("room").notNull(),
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
    index("wtf_live_rooms_kind_idx").on(table.roomKind),
    check("wtf_live_rooms_kind_check", sql`${table.roomKind} IN ('room', 'game')`),
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
    role: varchar("role", { length: 24 }).default("guest").notNull(),
    addedByUserId: integer("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_room_access_members_room_user_idx").on(table.roomId, table.userId),
    index("wtf_live_room_access_members_user_idx").on(table.userId),
    index("wtf_live_room_access_members_room_role_idx").on(table.roomId, table.role),
    check("wtf_live_room_access_members_role_check", sql`${table.role} IN ('host', 'guest')`),
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

export const wtfLiveStageAccessMembers = pgTable(
  "wtf_live_stage_access_members",
  {
    id: serial("id").primaryKey(),
    stageId: integer("stage_id")
      .references(() => wtfLiveStages.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 24 }).notNull(),
    addedByUserId: integer("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_stage_access_members_stage_user_idx").on(table.stageId, table.userId),
    index("wtf_live_stage_access_members_user_idx").on(table.userId),
    index("wtf_live_stage_access_members_stage_role_idx").on(table.stageId, table.role),
    check("wtf_live_stage_access_members_role_check", sql`${table.role} IN ('host', 'speaker')`),
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

export const wtfLiveShowKits = pgTable(
  "wtf_live_show_kits",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kitId: varchar("kit_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description").default("").notNull(),
    clipIds: jsonb("clip_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_show_kits_owner_kit_idx").on(table.ownerUserId, table.kitId),
    index("wtf_live_show_kits_owner_idx").on(table.ownerUserId),
  ],
);

export const wtfLiveRoomSettings = pgTable(
  "wtf_live_room_settings",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    roomKind: varchar("room_kind", { length: 24 }).notNull(),
    roomId: varchar("room_id", { length: 80 }).notNull(),
    allowGuestAudio: boolean("allow_guest_audio").default(true).notNull(),
    allowGuestCamera: boolean("allow_guest_camera").default(true).notNull(),
    allowGuestScreen: boolean("allow_guest_screen").default(true).notNull(),
    allowGuestMedia: boolean("allow_guest_media").default(true).notNull(),
    showKitEnabled: boolean("show_kit_enabled").default(true).notNull(),
    showKitId: integer("show_kit_id").references(() => wtfLiveShowKits.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_room_settings_kind_room_idx").on(table.roomKind, table.roomId),
    index("wtf_live_room_settings_owner_idx").on(table.ownerUserId),
    index("wtf_live_room_settings_show_kit_idx").on(table.showKitId),
    check("wtf_live_room_settings_kind_check", sql`${table.roomKind} IN ('room', 'game', 'stage')`),
  ],
);

export const wtfLiveRoomInvites = pgTable(
  "wtf_live_room_invites",
  {
    id: serial("id").primaryKey(),
    roomKind: varchar("room_kind", { length: 24 }).notNull(),
    roomId: varchar("room_id", { length: 80 }).notNull(),
    targetUserId: integer("target_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 24 }).default("guest").notNull(),
    invitedByUserId: integer("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    message: text("message").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (table) => [
    uniqueIndex("wtf_live_room_invites_unique_idx").on(table.roomKind, table.roomId, table.targetUserId, table.role),
    index("wtf_live_room_invites_target_idx").on(table.targetUserId, table.status),
    index("wtf_live_room_invites_room_idx").on(table.roomKind, table.roomId),
    check("wtf_live_room_invites_kind_check", sql`${table.roomKind} IN ('room', 'game', 'stage')`),
    check("wtf_live_room_invites_role_check", sql`${table.role} IN ('guest', 'host', 'speaker')`),
    check("wtf_live_room_invites_status_check", sql`${table.status} IN ('pending', 'accepted', 'declined', 'cancelled')`),
  ],
);

export const wtfLiveRoomCalendarEvents = pgTable(
  "wtf_live_room_calendar_events",
  {
    id: serial("id").primaryKey(),
    roomKind: varchar("room_kind", { length: 24 }).notNull(),
    roomId: varchar("room_id", { length: 80 }).notNull(),
    target: varchar("target", { length: 24 }).notNull(),
    gameshowEventId: integer("gameshow_event_id"),
    ttcSubmitUrl: text("ttc_submit_url"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("wtf_live_room_calendar_events_room_idx").on(table.roomKind, table.roomId),
    index("wtf_live_room_calendar_events_event_idx").on(table.gameshowEventId),
    check("wtf_live_room_calendar_events_kind_check", sql`${table.roomKind} IN ('room', 'game', 'stage')`),
    check("wtf_live_room_calendar_events_target_check", sql`${table.target} IN ('wtf', 'ttc', 'both')`),
  ],
);
