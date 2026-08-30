import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

export const casinoMembershipIntents = pgTable(
  "casino_membership_intents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    purchaseRef: varchar("purchase_ref", { length: 128 }).unique().notNull(),
    walletAddress: varchar("wallet_address", { length: 40 }),
    contractAddress: varchar("contract_address", { length: 40 }),
    treasuryAddress: varchar("treasury_address", { length: 40 }).notNull(),
    feeMutez: bigint("fee_mutez", { mode: "number" }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("casino_membership_intents_user_status_idx").on(table.userId, table.status),
    index("casino_membership_intents_ref_idx").on(table.purchaseRef),
  ]
);

export const casinoMemberships = pgTable(
  "casino_memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
    purchaseRef: varchar("purchase_ref", { length: 128 }).notNull(),
    opHash: varchar("op_hash", { length: 80 }).notNull(),
    contractAddress: varchar("contract_address", { length: 40 }).notNull(),
    treasuryAddress: varchar("treasury_address", { length: 40 }).notNull(),
    feeMutez: bigint("fee_mutez", { mode: "number" }).notNull(),
    status: varchar("status", { length: 24 }).default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("casino_memberships_user_status_idx").on(table.userId, table.status, table.expiresAt),
    uniqueIndex("casino_memberships_op_hash_idx").on(table.opHash),
  ]
);

export const casinoWagerSessions = pgTable(
  "casino_wager_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    gameKey: varchar("game_key", { length: 80 }).notNull(),
    mode: varchar("mode", { length: 24 }).default("single_player").notNull(),
    wagerWtfUnits: numeric("wager_wtf_units", { precision: 40, scale: 0 }).notNull(),
    houseTakeBps: integer("house_take_bps").default(500).notNull(),
    status: varchar("status", { length: 24 }).default("planned").notNull(),
    raw: jsonb("raw").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("casino_wager_sessions_user_idx").on(table.userId, table.createdAt),
    index("casino_wager_sessions_game_status_idx").on(table.gameKey, table.status),
  ]
);

export const casinoPracticeGames = pgTable(
  "casino_practice_games",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 200 }).unique().notNull(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    creatorName: varchar("creator_name", { length: 200 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    summary: text("summary").notNull(),
    instructions: text("instructions").notNull(),
    outcomes: jsonb("outcomes").default(sql`'[]'::jsonb`).notNull(),
    status: varchar("status", { length: 24 }).default("submitted").notNull(),
    active: boolean("active").default(false).notNull(),
    moderationNote: text("moderation_note"),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    playCount: integer("play_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("casino_practice_games_status_idx").on(table.status, table.updatedAt),
    index("casino_practice_games_creator_idx").on(table.creatorUserId, table.updatedAt),
  ]
);

export const casinoPracticePlays = pgTable(
  "casino_practice_plays",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => casinoPracticeGames.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    outcomeIndex: integer("outcome_index").notNull(),
    outcomeLabel: text("outcome_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("casino_practice_plays_game_idx").on(table.gameId, table.createdAt),
    index("casino_practice_plays_user_idx").on(table.userId, table.createdAt),
  ]
);

export const casinoMembershipIntentsRelations = relations(
  casinoMembershipIntents,
  ({ one }) => ({
    user: one(users, {
      fields: [casinoMembershipIntents.userId],
      references: [users.id],
    }),
  })
);

export const casinoMembershipsRelations = relations(casinoMemberships, ({ one }) => ({
  user: one(users, {
    fields: [casinoMemberships.userId],
    references: [users.id],
  }),
}));

export const casinoWagerSessionsRelations = relations(
  casinoWagerSessions,
  ({ one }) => ({
    user: one(users, {
      fields: [casinoWagerSessions.userId],
      references: [users.id],
    }),
  })
);

export const casinoPracticeGamesRelations = relations(
  casinoPracticeGames,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [casinoPracticeGames.creatorUserId],
      references: [users.id],
    }),
    reviewer: one(users, {
      fields: [casinoPracticeGames.reviewedBy],
      references: [users.id],
    }),
    plays: many(casinoPracticePlays),
  })
);

export const casinoPracticePlaysRelations = relations(
  casinoPracticePlays,
  ({ one }) => ({
    game: one(casinoPracticeGames, {
      fields: [casinoPracticePlays.gameId],
      references: [casinoPracticeGames.id],
    }),
    user: one(users, {
      fields: [casinoPracticePlays.userId],
      references: [users.id],
    }),
  })
);
