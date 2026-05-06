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
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

export const seasonStatusEnum = pgEnum("season_status", [
  "upcoming",
  "active",
  "completed",
]);

export const roundStatusEnum = pgEnum("round_status", [
  "upcoming",
  "active",
  "grading",
  "completed",
]);

export const challengeStatusEnum = pgEnum("challenge_status", [
  "draft",
  "active",
  "grading",
  "completed",
]);

export const gradeEnum = pgEnum("grade", ["pending", "pass", "fail", "bonus"]);

export const questStatusEnum = pgEnum("quest_status", [
  "draft",
  "active",
  "completed",
]);

export const autoVerifyTypeEnum = pgEnum("auto_verify_type", [
  "manual",
  "profile_avatar",
  "profile_bio",
  "wallet_connected",
  "social_twitter",
  "social_discord",
  "post_message",
  "holds_positive_balance",
  "holds_art_nft",
  "has_mint_event",
  "listed_on_trade_board",
  "wtf_swapped_in_buyback",
  "wtf_paid_to_operator_at_least",
  "x_space_attendance",
  "x_hashtag_post",
  "console_hiscore",
  "mint_with_tag",
  "mint_in_curation",
  "discord_voice_presence",
]);

export const contestantStatusEnum = pgEnum("contestant_status", [
  "active",
  "reserve",
  "eliminated",
  "withdrew",
  "non_participant",
]);

export const roundEliminationRuleKindEnum = pgEnum(
  "round_elimination_rule_kind",
  [
    "bottom_n_by_wtf",
    "top_n_survive",
    "did_not_hold_token",
    "submission_rank",
    "team_rank",
    "manual",
  ]
);

export const sideQuestEntryFeeStatusEnum = pgEnum(
  "side_quest_entry_fee_status",
  ["pending", "confirmed", "refunded"]
);

export const gameshowEventKindEnum = pgEnum("gameshow_event_kind", [
  "round_window",
  "challenge_window",
  "side_quest_window",
  "x_space",
  "discord_stage",
  "custom",
]);

export const gameshowEventVisibilityEnum = pgEnum(
  "gameshow_event_visibility",
  ["public", "contestants", "hosts"]
);

export const gameshowEventStatusEnum = pgEnum("gameshow_event_status", [
  "draft",
  "published",
  "cancelled",
]);

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  number: integer("number").notNull(),
  status: seasonStatusEnum("status").default("upcoming").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  anteWtfRequired: numeric("ante_wtf_required", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  mediaAssets: jsonb("media_assets").default(sql`'{}'::jsonb`).notNull(),
});

export const seasonsRelations = relations(seasons, ({ many, one }) => ({
  rounds: many(rounds),
  creator: one(users, {
    fields: [seasons.createdBy],
    references: [users.id],
  }),
}));

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").references(() => seasons.id, {
    onDelete: "set null",
  }),
  number: integer("number").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: roundStatusEnum("status").default("upcoming").notNull(),
  rewardXp: integer("reward_xp").default(0).notNull(),
  rewardEscrowSlug: varchar("reward_escrow_slug", { length: 120 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  startingContestants: integer("starting_contestants").default(0).notNull(),
  eliminatedAtEnd: integer("eliminated_at_end").default(0).notNull(),
  requiredPlatforms: jsonb("required_platforms").default(sql`'[]'::jsonb`).notNull(),
  rules: text("rules"),
  prizes: jsonb("prizes").default(sql`'[]'::jsonb`).notNull(),
  previousWinners: jsonb("previous_winners").default(sql`'[]'::jsonb`).notNull(),
  leaderboard: jsonb("leaderboard").default(sql`'[]'::jsonb`).notNull(),
  eliminatedContestants: jsonb("eliminated_contestants").default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  season: one(seasons, {
    fields: [rounds.seasonId],
    references: [seasons.id],
  }),
  challenges: many(challenges),
}));

export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").references(() => rounds.id, {
    onDelete: "cascade",
  }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  criteria: text("criteria"),
  rules: text("rules"),
  rewardAmountWtf: bigint("reward_amount_wtf", { mode: "number" }).default(0),
  rewardXp: integer("reward_xp").default(0).notNull(),
  rewardEscrowSlug: varchar("reward_escrow_slug", { length: 120 }),
  rewardWtfSubdomain: boolean("reward_wtf_subdomain").default(false).notNull(),
  rewardWtfSubdomainLabelTemplate: varchar("reward_wtf_subdomain_label_template", { length: 120 }),
  rewardTokenContract: varchar("reward_token_contract", { length: 36 }),
  rewardTokenId: text("reward_token_id"),
  rewardTokenAmount: bigint("reward_token_amount", { mode: "number" }).default(0),
  rewardType: varchar("reward_type", { length: 20 }).default("wtf"),
  status: challengeStatusEnum("status").default("draft").notNull(),
  submissionContract: varchar("submission_contract", { length: 36 }),
  submissionTag: varchar("submission_tag", { length: 120 }),
  submissionCuration: varchar("submission_curation", { length: 120 }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deadline: timestamp("deadline"),
});

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  round: one(rounds, {
    fields: [challenges.roundId],
    references: [rounds.id],
  }),
  submissions: many(challengeSubmissions),
  creator: one(users, {
    fields: [challenges.createdBy],
    references: [users.id],
  }),
  rewardFlags: many(challengeRewardFlags),
}));

export const challengeSubmissions = pgTable(
  "challenge_submissions",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .references(() => challenges.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    contentText: text("content_text"),
    contentUrl: text("content_url"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    grade: gradeEnum("grade").default("pending").notNull(),
    rewardDistributed: boolean("reward_distributed").default(false).notNull(),
    rewardOpHash: varchar("reward_op_hash", { length: 51 }),
    xpAwarded: integer("xp_awarded").default(0).notNull(),
    xpAwardedAt: timestamp("xp_awarded_at"),
    gradedBy: integer("graded_by").references(() => users.id),
    gradedAt: timestamp("graded_at"),
    feedback: text("feedback"),
    source: varchar("source", { length: 40 }).default("manual").notNull(),
    mintTokenContract: varchar("mint_token_contract", { length: 36 }),
    mintTokenId: varchar("mint_token_id", { length: 100 }),
    mintOpHash: varchar("mint_op_hash", { length: 80 }),
  },
  (table) => [
    index("submission_challenge_idx").on(table.challengeId),
    index("submission_user_idx").on(table.userId),
  ]
);

export const challengeSubmissionsRelations = relations(
  challengeSubmissions,
  ({ one }) => ({
    challenge: one(challenges, {
      fields: [challengeSubmissions.challengeId],
      references: [challenges.id],
    }),
    user: one(users, {
      fields: [challengeSubmissions.userId],
      references: [users.id],
    }),
    grader: one(users, {
      fields: [challengeSubmissions.gradedBy],
      references: [users.id],
    }),
    rewardFlag: one(challengeRewardFlags, {
      fields: [challengeSubmissions.id],
      references: [challengeRewardFlags.submissionId],
    }),
  })
);

export const challengeRewardFlags = pgTable(
  "challenge_reward_flags",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .references(() => challenges.id, { onDelete: "cascade" })
      .notNull(),
    submissionId: integer("submission_id")
      .references(() => challengeSubmissions.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    claimable: boolean("claimable").default(true).notNull(),
    claimed: boolean("claimed").default(false).notNull(),
    flagSlug: varchar("flag_slug", { length: 200 }).notNull(),
    rewardEscrowSlug: varchar("reward_escrow_slug", { length: 120 }),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("reward_flag_user_idx").on(table.userId),
    index("reward_flag_challenge_idx").on(table.challengeId),
    uniqueIndex("reward_flag_submission_unique_idx").on(table.submissionId),
    uniqueIndex("reward_flag_user_challenge_unique_idx").on(
      table.userId,
      table.challengeId
    ),
  ]
);

export const challengeRewardFlagsRelations = relations(
  challengeRewardFlags,
  ({ one }) => ({
    challenge: one(challenges, {
      fields: [challengeRewardFlags.challengeId],
      references: [challenges.id],
    }),
    submission: one(challengeSubmissions, {
      fields: [challengeRewardFlags.submissionId],
      references: [challengeSubmissions.id],
    }),
    user: one(users, {
      fields: [challengeRewardFlags.userId],
      references: [users.id],
    }),
  })
);

export const sideQuests = pgTable("side_quests", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  criteria: text("criteria"),
  rewardAmountWtf: bigint("reward_amount_wtf", { mode: "number" }).default(0),
  rewardXp: integer("reward_xp").default(0).notNull(),
  rewardWtfSubdomain: boolean("reward_wtf_subdomain").default(false).notNull(),
  rewardWtfSubdomainLabelTemplate: varchar("reward_wtf_subdomain_label_template", { length: 120 }),
  status: questStatusEnum("status").default("draft").notNull(),
  maxCompletions: integer("max_completions"),
  persistent: boolean("persistent").default(false).notNull(),
  autoVerifyType: autoVerifyTypeEnum("auto_verify_type").default("manual").notNull(),
  autoVerifyConfig: jsonb("auto_verify_config").default(sql`'{}'::jsonb`).notNull(),
  entryFeeWtf: numeric("entry_fee_wtf", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deadline: timestamp("deadline"),
});

export const sideQuestsRelations = relations(sideQuests, ({ many, one }) => ({
  completions: many(sideQuestCompletions),
  creator: one(users, {
    fields: [sideQuests.createdBy],
    references: [users.id],
  }),
}));

export const sideQuestCompletions = pgTable("side_quest_completions", {
  id: serial("id").primaryKey(),
  sideQuestId: integer("side_quest_id")
    .references(() => sideQuests.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  proofText: text("proof_text"),
  proofUrl: text("proof_url"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  approved: boolean("approved"),
  approvedBy: integer("approved_by").references(() => users.id),
  rewardOpHash: varchar("reward_op_hash", { length: 51 }),
  xpAwarded: integer("xp_awarded").default(0).notNull(),
  xpAwardedAt: timestamp("xp_awarded_at"),
});

export const sideQuestCompletionsRelations = relations(
  sideQuestCompletions,
  ({ one }) => ({
    sideQuest: one(sideQuests, {
      fields: [sideQuestCompletions.sideQuestId],
      references: [sideQuests.id],
    }),
    user: one(users, {
      fields: [sideQuestCompletions.userId],
      references: [users.id],
    }),
  })
);

export const seasonContestants = pgTable("season_contestants", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .references(() => seasons.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  status: contestantStatusEnum("status").default("active").notNull(),
  rankAtLock: integer("rank_at_lock"),
  teamIdHistory: jsonb("team_id_history").default(sql`'[]'::jsonb`).notNull(),
  eliminatedAt: timestamp("eliminated_at"),
  eliminatedRoundId: integer("eliminated_round_id"),
  eliminationReason: text("elimination_reason"),
  withdrewAt: timestamp("withdrew_at"),
  notes: text("notes"),
  antePaidWtf: numeric("ante_paid_wtf", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  anteOpHash: varchar("ante_op_hash", { length: 80 }),
  antePaidAt: timestamp("ante_paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roundEliminationRules = pgTable("round_elimination_rules", {
  roundId: integer("round_id")
    .primaryKey()
    .references(() => rounds.id, { onDelete: "cascade" }),
  kind: roundEliminationRuleKindEnum("kind").notNull(),
  paramsJson: jsonb("params_json").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roundEliminations = pgTable(
  "round_eliminations",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .references(() => rounds.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    decidedBy: integer("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    reason: text("reason"),
    wasDraftedByRule: boolean("was_drafted_by_rule").default(false).notNull(),
    draftRuleKind: roundEliminationRuleKindEnum("draft_rule_kind"),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqRoundUser: uniqueIndex("round_eliminations_round_user_unique_idx").on(
      t.roundId,
      t.userId
    ),
    idxRound: index("round_eliminations_round_idx").on(t.roundId),
  })
);

export const sideQuestEntryFees = pgTable("side_quest_entry_fees", {
  id: serial("id").primaryKey(),
  sideQuestId: integer("side_quest_id")
    .references(() => sideQuests.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
  status: sideQuestEntryFeeStatusEnum("status").default("pending").notNull(),
  opHash: varchar("op_hash", { length: 80 }),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameshowEvents = pgTable("gameshow_events", {
  id: serial("id").primaryKey(),
  kind: gameshowEventKindEnum("kind").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  allDay: boolean("all_day").default(false).notNull(),
  sourceKind: varchar("source_kind", { length: 40 }).default("manual").notNull(),
  sourceId: integer("source_id"),
  visibility: gameshowEventVisibilityEnum("visibility")
    .default("public")
    .notNull(),
  status: gameshowEventStatusEnum("status").default("draft").notNull(),
  linksJson: jsonb("links_json").default(sql`'[]'::jsonb`).notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedBy: integer("approved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at"),
  discordScheduledEventId: varchar("discord_scheduled_event_id", { length: 100 }),
  discordGuildId: varchar("discord_guild_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
