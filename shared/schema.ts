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
import { relations, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "host",
  "cohost",
  "resident_wizard",
  "contestant",
  "witness",
]);

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

export const listingTypeEnum = pgEnum("listing_type", [
  "auction",
  "buy_now",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "sold",
  "cancelled",
  "expired",
]);

export const channelTypeEnum = pgEnum("channel_type", [
  "async",
  "sync",
  "thread",
]);

export const channelAccessEnum = pgEnum("channel_access", [
  "all",
  "contestants",
  "hosts",
  "witnesses",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "link",
  "system",
]);

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
]);

// ─── Users ───────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash"),
  displayName: varchar("display_name", { length: 100 }),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").default("witness").notNull(),
  twitterId: varchar("twitter_id", { length: 100 }),
  twitterHandle: varchar("twitter_handle", { length: 100 }),
  twitterVerified: boolean("twitter_verified").default(false).notNull(),
  twitterPublic: boolean("twitter_public").default(false).notNull(),
  twitterOauthToken: text("twitter_oauth_token"),
  twitterOauthTokenSecret: text("twitter_oauth_token_secret"),
  discordId: varchar("discord_id", { length: 100 }),
  discordHandle: varchar("discord_handle", { length: 100 }),
  discordVerified: boolean("discord_verified").default(false).notNull(),
  discordPublic: boolean("discord_public").default(false).notNull(),
  emailPublic: boolean("email_public").default(false).notNull(),
  googleId: varchar("google_id", { length: 100 }),
  githubId: varchar("github_id", { length: 100 }),
  bio: text("bio"),
  pfpTokenContract: varchar("pfp_token_contract", { length: 36 }),
  pfpTokenId: text("pfp_token_id"),
  pfpImageUrl: text("pfp_image_url"),
  experiencePoints: bigint("experience_points", { mode: "number" })
    .default(0)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(userWallets),
  ownedTokens: many(userOwnedTokens),
  submissions: many(challengeSubmissions),
  dmParticipants: many(dmConversationParticipants),
  dmSentMessages: many(dmMessages),
  boardThreads: many(boardThreads),
  boardThreadReplies: many(boardThreadReplies),
  boardReactions: many(boardReactions),
  xpEvents: many(xpEvents),
  rewardFlags: many(challengeRewardFlags),
  tvChannels: many(tvChannels),
  messages: many(messages),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// ─── User Wallets ────────────────────────────────────────

export const userWallets = pgTable(
  "user_wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    tezDomain: varchar("tez_domain", { length: 255 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    linkedAt: timestamp("linked_at").defaultNow().notNull(),
  },
  (table) => [
    index("wallet_address_idx").on(table.walletAddress),
    index("wallet_user_idx").on(table.userId),
  ]
);

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, { fields: [userWallets.userId], references: [users.id] }),
}));

export const userOwnedTokens = pgTable(
  "user_owned_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    balance: text("balance").notNull(),
    tokenName: text("token_name"),
    tokenSymbol: text("token_symbol"),
    tokenThumbnail: text("token_thumbnail"),
    metadata: jsonb("metadata"),
    creatorAddress: varchar("creator_address", { length: 36 }),
    onTradeBoard: boolean("on_trade_board").default(false).notNull(),
    tradeBoardQuantity: integer("trade_board_quantity").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("owned_tokens_user_wallet_idx").on(table.userId, table.walletAddress),
    index("owned_tokens_user_last_seen_idx").on(table.userId, table.lastSeenAt),
    index("owned_tokens_wallet_last_seen_idx").on(
      table.userId,
      table.walletAddress,
      table.lastSeenAt
    ),
    index("owned_tokens_contract_token_idx").on(table.tokenContract, table.tokenId),
    index("owned_tokens_trade_board_idx").on(table.userId, table.onTradeBoard),
    uniqueIndex("owned_tokens_unique_idx").on(
      table.userId,
      table.walletAddress,
      table.tokenContract,
      table.tokenId
    ),
  ]
);

export const userOwnedTokensRelations = relations(userOwnedTokens, ({ one }) => ({
  user: one(users, { fields: [userOwnedTokens.userId], references: [users.id] }),
}));

// ─── Sessions (connect-pg-simple) ────────────────────────

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// ─── Seasons ─────────────────────────────────────────────

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
});

export const seasonsRelations = relations(seasons, ({ many, one }) => ({
  rounds: many(rounds),
  creator: one(users, {
    fields: [seasons.createdBy],
    references: [users.id],
  }),
}));

// ─── Rounds ──────────────────────────────────────────────

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .references(() => seasons.id, { onDelete: "cascade" })
    .notNull(),
  number: integer("number").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: roundStatusEnum("status").default("upcoming").notNull(),
  rewardXp: integer("reward_xp").default(0).notNull(),
  rewardEscrowSlug: varchar("reward_escrow_slug", { length: 120 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  season: one(seasons, {
    fields: [rounds.seasonId],
    references: [seasons.id],
  }),
  challenges: many(challenges),
}));

// ─── Challenges ──────────────────────────────────────────

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
  rewardTokenContract: varchar("reward_token_contract", { length: 36 }),
  rewardTokenId: text("reward_token_id"),
  rewardTokenAmount: bigint("reward_token_amount", { mode: "number" }).default(0),
  rewardType: varchar("reward_type", { length: 20 }).default("wtf"),
  status: challengeStatusEnum("status").default("draft").notNull(),
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

// ─── Challenge Submissions ───────────────────────────────

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

// ─── Challenge Reward Flags ──────────────────────────────

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

// ─── Direct Messages ─────────────────────────────────────

export const dmConversations = pgTable(
  "dm_conversations",
  {
    id: serial("id").primaryKey(),
    createdBy: integer("created_by").references(() => users.id),
    active: boolean("active").default(true).notNull(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("dm_conversations_last_message_idx").on(table.lastMessageAt)]
);

export const dmConversationParticipants = pgTable(
  "dm_conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .references(() => dmConversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at"),
  },
  (table) => [
    index("dm_participant_user_idx").on(table.userId),
    index("dm_participant_conversation_idx").on(table.conversationId),
    uniqueIndex("dm_participant_conversation_user_unique_idx").on(
      table.conversationId,
      table.userId
    ),
  ]
);

export const dmMessages = pgTable(
  "dm_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .references(() => dmConversations.id, { onDelete: "cascade" })
      .notNull(),
    senderId: integer("sender_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (table) => [
    index("dm_message_conversation_idx").on(table.conversationId),
    index("dm_message_sender_idx").on(table.senderId),
  ]
);

export const dmConversationsRelations = relations(
  dmConversations,
  ({ many, one }) => ({
    creator: one(users, {
      fields: [dmConversations.createdBy],
      references: [users.id],
    }),
    participants: many(dmConversationParticipants),
    messages: many(dmMessages),
  })
);

export const dmConversationParticipantsRelations = relations(
  dmConversationParticipants,
  ({ one }) => ({
    conversation: one(dmConversations, {
      fields: [dmConversationParticipants.conversationId],
      references: [dmConversations.id],
    }),
    user: one(users, {
      fields: [dmConversationParticipants.userId],
      references: [users.id],
    }),
  })
);

export const dmMessagesRelations = relations(dmMessages, ({ one }) => ({
  conversation: one(dmConversations, {
    fields: [dmMessages.conversationId],
    references: [dmConversations.id],
  }),
  sender: one(users, {
    fields: [dmMessages.senderId],
    references: [users.id],
  }),
}));

// ─── Board Categories ────────────────────────────────────

export const boardCategories = pgTable(
  "board_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    position: integer("position").default(0).notNull(),
    collapsed: boolean("collapsed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("board_category_position_idx").on(table.position)]
);

export const boardCategoriesRelations = relations(
  boardCategories,
  ({ many }) => ({
    channels: many(boardThreads),
  })
);

// ─── Board Channels (evolved from board_threads) ────────

export const boardThreads = pgTable(
  "board_threads",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 220 }).notNull(),
    body: text("body").notNull(),
    createdBy: integer("created_by")
      .references(() => users.id)
      .notNull(),
    categoryId: integer("category_id").references(() => boardCategories.id, {
      onDelete: "set null",
    }),
    channelType: varchar("channel_type", { length: 20 })
      .default("text")
      .notNull(),
    topic: text("topic"),
    position: integer("position").default(0).notNull(),
    slowModeSeconds: integer("slow_mode_seconds").default(0).notNull(),
    viewRoles: jsonb("view_roles")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    replyRoles: jsonb("reply_roles")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    active: boolean("active").default(true).notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    locked: boolean("locked").default(false).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("board_thread_created_idx").on(table.createdAt),
    index("board_thread_creator_idx").on(table.createdBy),
    index("board_thread_active_idx").on(table.active),
    index("board_thread_category_idx").on(table.categoryId),
    index("board_thread_position_idx").on(table.categoryId, table.position),
  ]
);

// ─── Board Messages (evolved from board_thread_replies) ──

export const boardThreadReplies = pgTable(
  "board_thread_replies",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .references(() => boardThreads.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    attachments: jsonb("attachments")
      .$type<Array<{ url: string; name: string; type: string; size?: number }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    parentReplyId: integer("parent_reply_id"),
    webhookId: integer("webhook_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (table) => [
    index("board_thread_reply_thread_idx").on(table.threadId),
    index("board_thread_reply_user_idx").on(table.userId),
    index("board_thread_reply_parent_idx").on(table.parentReplyId),
    index("board_thread_reply_pinned_idx").on(table.threadId, table.pinned),
  ]
);

// ─── Board Reactions ─────────────────────────────────────

export const boardReactions = pgTable(
  "board_reactions",
  {
    id: serial("id").primaryKey(),
    replyId: integer("reply_id")
      .references(() => boardThreadReplies.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("board_reaction_unique_idx").on(
      table.replyId,
      table.userId,
      table.emoji
    ),
    index("board_reaction_reply_idx").on(table.replyId),
  ]
);

// ─── Board Channel Permissions ───────────────────────────

export const boardChannelPermissions = pgTable(
  "board_channel_permissions",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => boardThreads.id, { onDelete: "cascade" })
      .notNull(),
    targetType: varchar("target_type", { length: 10 }).notNull(),
    targetRole: userRoleEnum("target_role"),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    allowView: boolean("allow_view"),
    allowPost: boolean("allow_post"),
    allowManage: boolean("allow_manage"),
    allowReact: boolean("allow_react"),
    allowAttach: boolean("allow_attach"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("board_channel_perm_channel_idx").on(table.channelId),
    index("board_channel_perm_user_idx").on(table.targetUserId),
  ]
);

// ─── Board Webhooks ──────────────────────────────────────

export const boardWebhooks = pgTable(
  "board_webhooks",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => boardThreads.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    token: varchar("token", { length: 64 }).unique().notNull(),
    avatarUrl: text("avatar_url"),
    createdBy: integer("created_by")
      .references(() => users.id)
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("board_webhook_channel_idx").on(table.channelId),
    uniqueIndex("board_webhook_token_idx").on(table.token),
  ]
);

// ─── Board Relations ─────────────────────────────────────

export const boardThreadsRelations = relations(boardThreads, ({ many, one }) => ({
  creator: one(users, {
    fields: [boardThreads.createdBy],
    references: [users.id],
  }),
  category: one(boardCategories, {
    fields: [boardThreads.categoryId],
    references: [boardCategories.id],
  }),
  replies: many(boardThreadReplies),
  permissions: many(boardChannelPermissions),
  webhooks: many(boardWebhooks),
}));

export const boardThreadRepliesRelations = relations(
  boardThreadReplies,
  ({ one, many }) => ({
    thread: one(boardThreads, {
      fields: [boardThreadReplies.threadId],
      references: [boardThreads.id],
    }),
    user: one(users, {
      fields: [boardThreadReplies.userId],
      references: [users.id],
    }),
    reactions: many(boardReactions),
  })
);

export const boardReactionsRelations = relations(boardReactions, ({ one }) => ({
  reply: one(boardThreadReplies, {
    fields: [boardReactions.replyId],
    references: [boardThreadReplies.id],
  }),
  user: one(users, {
    fields: [boardReactions.userId],
    references: [users.id],
  }),
}));

export const boardChannelPermissionsRelations = relations(
  boardChannelPermissions,
  ({ one }) => ({
    channel: one(boardThreads, {
      fields: [boardChannelPermissions.channelId],
      references: [boardThreads.id],
    }),
    user: one(users, {
      fields: [boardChannelPermissions.targetUserId],
      references: [users.id],
    }),
  })
);

export const boardWebhooksRelations = relations(boardWebhooks, ({ one }) => ({
  channel: one(boardThreads, {
    fields: [boardWebhooks.channelId],
    references: [boardThreads.id],
  }),
  creator: one(users, {
    fields: [boardWebhooks.createdBy],
    references: [users.id],
  }),
}));

// ─── Experience Points ───────────────────────────────────

export const xpEvents = pgTable(
  "xp_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    metadata: jsonb("metadata"),
    awardedBy: integer("awarded_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("xp_event_user_idx").on(table.userId),
    index("xp_event_created_idx").on(table.createdAt),
  ]
);

export const xpEventsRelations = relations(xpEvents, ({ one }) => ({
  user: one(users, {
    fields: [xpEvents.userId],
    references: [users.id],
  }),
  awardedByUser: one(users, {
    fields: [xpEvents.awardedBy],
    references: [users.id],
  }),
}));

// ─── Channels ────────────────────────────────────────────

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type: channelTypeEnum("type").default("async").notNull(),
  accessLevel: channelAccessEnum("access_level").default("all").notNull(),
  seasonId: integer("season_id").references(() => seasons.id),
  parentMessageId: integer("parent_message_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelsRelations = relations(channels, ({ many, one }) => ({
  messages: many(messages),
  season: one(seasons, {
    fields: [channels.seasonId],
    references: [seasons.id],
  }),
}));

// ─── Messages ────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    content: text("content").notNull(),
    messageType: messageTypeEnum("message_type").default("text").notNull(),
    threadParentId: integer("thread_parent_id"),
    pinned: boolean("pinned").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (table) => [
    index("message_channel_idx").on(table.channelId),
    index("message_user_idx").on(table.userId),
    index("message_thread_idx").on(table.threadParentId),
  ]
);

export const messagesRelations = relations(messages, ({ one }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
  threadParent: one(messages, {
    fields: [messages.threadParentId],
    references: [messages.id],
  }),
}));

// ─── Marketplace Listings ────────────────────────────────

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: serial("id").primaryKey(),
    sellerUserId: integer("seller_user_id")
      .references(() => users.id)
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    tokenName: varchar("token_name", { length: 300 }),
    tokenThumbnail: text("token_thumbnail"),
    amount: integer("amount").default(1).notNull(),
    listingType: listingTypeEnum("listing_type").default("buy_now").notNull(),
    priceWtf: bigint("price_wtf", { mode: "number" }).notNull(),
    minBidWtf: bigint("min_bid_wtf", { mode: "number" }),
    endTime: timestamp("end_time"),
    status: listingStatusEnum("status").default("active").notNull(),
    onChainId: varchar("on_chain_id", { length: 100 }),
    opHash: varchar("op_hash", { length: 51 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("listing_seller_idx").on(table.sellerUserId)]
);

export const marketplaceListingsRelations = relations(
  marketplaceListings,
  ({ one, many }) => ({
    seller: one(users, {
      fields: [marketplaceListings.sellerUserId],
      references: [users.id],
    }),
    bids: many(marketplaceBids),
  })
);

// ─── Marketplace Bids ────────────────────────────────────

export const marketplaceBids = pgTable("marketplace_bids", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => marketplaceListings.id, { onDelete: "cascade" })
    .notNull(),
  bidderUserId: integer("bidder_user_id")
    .references(() => users.id)
    .notNull(),
  amountWtf: bigint("amount_wtf", { mode: "number" }).notNull(),
  opHash: varchar("op_hash", { length: 51 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketplaceBidsRelations = relations(
  marketplaceBids,
  ({ one }) => ({
    listing: one(marketplaceListings, {
      fields: [marketplaceBids.listingId],
      references: [marketplaceListings.id],
    }),
    bidder: one(users, {
      fields: [marketplaceBids.bidderUserId],
      references: [users.id],
    }),
  })
);

// ─── Side Quests ─────────────────────────────────────────

export const sideQuests = pgTable("side_quests", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  criteria: text("criteria"),
  rewardAmountWtf: bigint("reward_amount_wtf", { mode: "number" }).default(0),
  rewardXp: integer("reward_xp").default(0).notNull(),
  status: questStatusEnum("status").default("draft").notNull(),
  maxCompletions: integer("max_completions"),
  persistent: boolean("persistent").default(false).notNull(),
  autoVerifyType: autoVerifyTypeEnum("auto_verify_type").default("manual").notNull(),
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

// ─── Side Quest Completions ──────────────────────────────

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

// ─── Links ───────────────────────────────────────────────

export const links = pgTable("links", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  displayOrder: integer("display_order").default(0).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Reward Ledger ───────────────────────────────────────

export const rewardLedger = pgTable(
  "reward_ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    amountWtf: bigint("amount_wtf", { mode: "number" }).notNull(),
    reason: varchar("reason", { length: 200 }).notNull(),
    sourceType: varchar("source_type", { length: 30 }).notNull(),
    sourceId: integer("source_id"),
    paid: boolean("paid").default(false).notNull(),
    opHash: varchar("op_hash", { length: 51 }),
    paidAt: timestamp("paid_at"),
    paidBy: integer("paid_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("reward_ledger_user_idx").on(table.userId),
    index("reward_ledger_paid_idx").on(table.paid),
  ]
);

export const rewardLedgerRelations = relations(rewardLedger, ({ one }) => ({
  user: one(users, {
    fields: [rewardLedger.userId],
    references: [users.id],
  }),
}));

// ─── Desktop App Settings ────────────────────────────────

export const desktopAppSettings = pgTable("desktop_app_settings", {
  appKey: varchar("app_key", { length: 50 }).primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── WTF TV Channels ─────────────────────────────────────

export const tvChannels = pgTable(
  "tv_channels",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_channel_owner_idx").on(table.ownerUserId),
    uniqueIndex("tv_channel_slug_unique_idx").on(table.slug),
    uniqueIndex("tv_channel_owner_slug_unique_idx").on(table.ownerUserId, table.slug),
  ]
);

export const tvChannelsRelations = relations(tvChannels, ({ one, many }) => ({
  owner: one(users, {
    fields: [tvChannels.ownerUserId],
    references: [users.id],
  }),
  videos: many(tvChannelVideos),
  playlists: many(tvPlaylists),
}));

export const tvChannelVideos = pgTable(
  "tv_channel_videos",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => tvChannels.id, { onDelete: "cascade" })
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    sourceUri: text("source_uri").notNull(),
    title: varchar("title", { length: 300 }),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    thumbnailUri: text("thumbnail_uri"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_video_channel_idx").on(table.channelId),
    uniqueIndex("tv_video_unique_token_per_channel_idx").on(
      table.channelId,
      table.tokenContract,
      table.tokenId
    ),
  ]
);

export const tvChannelVideosRelations = relations(tvChannelVideos, ({ one, many }) => ({
  channel: one(tvChannels, {
    fields: [tvChannelVideos.channelId],
    references: [tvChannels.id],
  }),
  playlistItems: many(tvPlaylistItems),
}));

export const tvPlaylists = pgTable(
  "tv_playlists",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => tvChannels.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    transitionSeconds: integer("transition_seconds").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_playlist_channel_idx").on(table.channelId),
    index("tv_playlist_active_idx").on(table.channelId, table.isActive),
  ]
);

export const tvPlaylistsRelations = relations(tvPlaylists, ({ one, many }) => ({
  channel: one(tvChannels, {
    fields: [tvPlaylists.channelId],
    references: [tvChannels.id],
  }),
  items: many(tvPlaylistItems),
}));

export const tvPlaylistItems = pgTable(
  "tv_playlist_items",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .references(() => tvPlaylists.id, { onDelete: "cascade" })
      .notNull(),
    videoId: integer("video_id")
      .references(() => tvChannelVideos.id, { onDelete: "cascade" })
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    durationSeconds: integer("duration_seconds").default(30).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_playlist_item_playlist_idx").on(table.playlistId),
    index("tv_playlist_item_video_idx").on(table.videoId),
    uniqueIndex("tv_playlist_item_unique_idx").on(table.playlistId, table.videoId),
  ]
);

export const tvPlaylistItemsRelations = relations(tvPlaylistItems, ({ one }) => ({
  playlist: one(tvPlaylists, {
    fields: [tvPlaylistItems.playlistId],
    references: [tvPlaylists.id],
  }),
  video: one(tvChannelVideos, {
    fields: [tvPlaylistItems.videoId],
    references: [tvChannelVideos.id],
  }),
}));

// ─── FAQ ─────────────────────────────────────────────────

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 100 }),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
