import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import { consoleGames } from "./schema-liveops";

export const consoleGameVersions = pgTable(
  "console_game_versions",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => consoleGames.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").default(1).notNull(),
    artifactUri: text("artifact_uri").notNull(),
    sourceUrl: text("source_url"),
    coverUri: text("cover_uri"),
    sdkVersion: varchar("sdk_version", { length: 40 }).default("wtf-console-v1"),
    submittedBy: integer("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    reviewNote: text("review_note"),
    resetLeaderboard: boolean("reset_leaderboard").default(false).notNull(),
    bundleMetadata: jsonb("bundle_metadata")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => [
    index("console_game_versions_game_idx").on(table.gameId, table.version),
    index("console_game_versions_status_idx").on(table.status, table.createdAt),
    uniqueIndex("console_game_versions_unique_idx").on(
      table.gameId,
      table.version
    ),
  ]
);

export const consolePlayerStats = pgTable(
  "console_player_stats",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => consoleGames.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    plays: integer("plays").default(0).notNull(),
    bestScore: bigint("best_score", { mode: "number" }).default(0).notNull(),
    totalScore: bigint("total_score", { mode: "number" }).default(0).notNull(),
    lastPlayedAt: timestamp("last_played_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("console_player_stats_user_idx").on(table.userId, table.updatedAt),
    index("console_player_stats_game_best_idx").on(table.gameId, table.bestScore),
    uniqueIndex("console_player_stats_unique_idx").on(table.gameId, table.userId),
  ]
);

export const consoleAuditEvents = pgTable(
  "console_audit_events",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id").references(() => consoleGames.id, {
      onDelete: "set null",
    }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    reason: text("reason"),
    payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("console_audit_events_game_idx").on(table.gameId, table.createdAt),
    index("console_audit_events_actor_idx").on(table.actorUserId, table.createdAt),
    index("console_audit_events_action_idx").on(table.action, table.createdAt),
  ]
);

export const consoleGameReports = pgTable(
  "console_game_reports",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => consoleGames.id, { onDelete: "cascade" })
      .notNull(),
    reporterUserId: integer("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    category: varchar("category", { length: 60 }).default("other").notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 32 }).default("open").notNull(),
    resolvedBy: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("console_game_reports_game_idx").on(table.gameId, table.createdAt),
    index("console_game_reports_reporter_idx").on(
      table.reporterUserId,
      table.createdAt
    ),
    index("console_game_reports_status_idx").on(table.status, table.createdAt),
  ]
);
