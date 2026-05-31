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
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { xpEvents } from "./schema-admin";
import { users } from "./schema-core";
import { gameshowEvents, sideQuests } from "./schema-gameshow";

export const calendarTicketStatusEnum = pgEnum("calendar_ticket_status", [
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "cancelled",
]);

export const calendarTickets = pgTable("calendar_tickets", {
  id: serial("id").primaryKey(),
  submitterUserId: integer("submitter_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  status: calendarTicketStatusEnum("status").default("submitted").notNull(),
  reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewReason: text("review_reason"),
  decidedAt: timestamp("decided_at"),
  publishedEventId: integer("published_event_id").references(
    () => gameshowEvents.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const attendanceSourceEnum = pgEnum("attendance_source", [
  "discord_voice",
  "discord_stage",
  "x_space",
  "in_app",
]);

export const attendanceStateEnum = pgEnum("attendance_state", [
  "join",
  "heartbeat",
  "leave",
]);

export const attendanceEvents = pgTable("attendance_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  eventId: integer("event_id").references(() => gameshowEvents.id, {
    onDelete: "set null",
  }),
  source: attendanceSourceEnum("source").notNull(),
  state: attendanceStateEnum("state").notNull(),
  discordUserId: varchar("discord_user_id", { length: 100 }),
  discordGuildId: varchar("discord_guild_id", { length: 100 }),
  discordChannelId: varchar("discord_channel_id", { length: 100 }),
  externalRef: varchar("external_ref", { length: 200 }),
  payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const discordActivityKindEnum = pgEnum("discord_activity_kind", [
  "message",
  "reaction",
  "voice",
  "stage",
  "event",
  "lottery",
  "auction",
  "avatar",
  "manual",
]);

export const discordActivityEvents = pgTable(
  "discord_activity_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    discordUserId: varchar("discord_user_id", { length: 100 }).notNull(),
    discordHandle: varchar("discord_handle", { length: 120 }),
    discordGuildId: varchar("discord_guild_id", { length: 100 }).notNull(),
    discordChannelId: varchar("discord_channel_id", { length: 100 }),
    kind: discordActivityKindEnum("kind").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    xpAmount: integer("xp_amount").default(0).notNull(),
    xpAwardedAt: timestamp("xp_awarded_at"),
    xpEventId: integer("xp_event_id").references(() => xpEvents.id, {
      onDelete: "set null",
    }),
    externalRef: varchar("external_ref", { length: 200 }),
    payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
    observedAt: timestamp("observed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("discord_activity_user_observed_idx").on(table.userId, table.observedAt),
    index("discord_activity_discord_user_idx").on(
      table.discordUserId,
      table.observedAt
    ),
    uniqueIndex("discord_activity_external_ref_idx").on(table.externalRef),
  ]
);

/** One row per anonymous CRP AppView nomination — user id only, for reward counting. */
export const crpAppviewNominationCredits = pgTable(
  "crp_appview_nomination_credits",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [index("crp_appview_nomination_credits_user_idx").on(table.userId)]
);

export const crpNominations = pgTable("crp_nominations", {
  id: serial("id").primaryKey(),
  sideQuestId: integer("side_quest_id")
    .references(() => sideQuests.id, { onDelete: "cascade" })
    .notNull(),
  nominatorUserId: integer("nominator_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  nominatorXId: varchar("nominator_x_id", { length: 100 }).notNull(),
  postId: varchar("post_id", { length: 100 }).notNull(),
  postUrl: text("post_url").notNull(),
  nomineeHandles: jsonb("nominee_handles")
    .default(sql`'[]'::jsonb`)
    .notNull(),
  uniqueNomineeCount: integer("unique_nominee_count").default(0).notNull(),
  rewardCount: integer("reward_count").default(0).notNull(),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const consoleVerificationModeEnum = pgEnum(
  "console_verification_mode",
  ["parent_postmessage", "server_hmac", "manual"]
);

export const consoleGames = pgTable("console_games", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").default("").notNull(),
  category: varchar("category", { length: 80 }).default("general").notNull(),
  embedPath: text("embed_path").notNull(),
  coverUri: text("cover_uri"),
  sourceUrl: text("source_url"),
  verificationMode: consoleVerificationModeEnum("verification_mode")
    .default("parent_postmessage")
    .notNull(),
  weirdVariantOf: varchar("weird_variant_of", { length: 120 }),
  hmacSecret: varchar("hmac_secret", { length: 200 }),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  builderUserId: integer("builder_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  builderName: varchar("builder_name", { length: 120 }),
  builderAddress: varchar("builder_address", { length: 80 }),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  sdkVersion: varchar("sdk_version", { length: 40 }).default("wtf-console-v1"),
  storageMode: varchar("storage_mode", { length: 40 }).default("static"),
  bundleVersion: integer("bundle_version").default(1).notNull(),
  arcadeCreditsRequired: boolean("arcade_credits_required").default(true).notNull(),
  arcadeCreditPrice: integer("arcade_credit_price").default(1).notNull(),
  playCount: integer("play_count").default(0).notNull(),
  playerCount: integer("player_count").default(0).notNull(),
  maxPossibleScore: bigint("max_possible_score", { mode: "number" }),
  maxScorePerSecond: integer("max_score_per_second"),
  moderationNote: text("moderation_note"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  removedAt: timestamp("removed_at"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const consolePlayTickets = pgTable("console_play_tickets", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .references(() => consoleGames.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  runId: varchar("run_id", { length: 80 }).notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  userAgent: text("user_agent"),
  ip: varchar("ip", { length: 64 }),
});

export const consoleScores = pgTable("console_scores", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .references(() => consoleGames.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  score: bigint("score", { mode: "number" }).notNull(),
  runId: varchar("run_id", { length: 80 }),
  ticketPayloadJson: jsonb("ticket_payload_json")
    .default(sql`'{}'::jsonb`)
    .notNull(),
  valid: boolean("valid").default(true).notNull(),
  rejectReason: text("reject_reason"),
  verificationMode: consoleVerificationModeEnum("verification_mode").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});
