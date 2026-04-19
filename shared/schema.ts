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

export const contractActivityStatusEnum = pgEnum("contract_activity_status", [
  "attempt",
  "success",
  "failure",
]);

// ─── Studio microapp enums ──────────────────────────────

export const studioMemberRoleEnum = pgEnum("studio_member_role", [
  "owner",
  "editor",
  "commenter",
  "viewer",
]);

export const studioStorageBackendEnum = pgEnum("studio_storage_backend", [
  "local_disk",
  "google_drive",
]);

export const studioAnnotationKindEnum = pgEnum("studio_annotation_kind", [
  "pin",
  "sticky_note",
  "draw",
  "arrow",
  "rect",
  "text",
  "highlight",
]);

export const dmConversationTypeEnum = pgEnum("dm_conversation_type", [
  "direct",
  "studio",
]);

export const dmMessageTypeEnum = pgEnum("dm_message_type", [
  "text",
  "studio_system",
  "studio_event",
]);

// ─── Users ───────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash"),
  /** Scrypt hash of the admin-issued temp password (nullable). */
  tempPasswordHash: text("temp_password_hash"),
  /** When the temp password expires. Null means no temp password is set. */
  tempPasswordExpiresAt: timestamp("temp_password_expires_at"),
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

export const usersRelations = relations(users, ({ many, one }) => ({
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
  notifications: many(userNotifications),
  notificationPreferences: one(userNotificationPreferences, {
    fields: [users.id],
    references: [userNotificationPreferences.userId],
  }),
  contractActivityLogs: many(contractActivityLogs),
  studioProjectsOwned: many(studioProjects),
  studioMemberships: many(studioProjectMembers),
  studioFilesUploaded: many(studioFiles),
  studioAnnotations: many(studioAnnotations),
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
    uniqueIndex("wallet_address_unique_idx").on(table.walletAddress),
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

// ─── Wallet Auth Nonces ──────────────────────────────────

export const walletAuthNonces = pgTable("wallet_auth_nonces", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
  nonce: varchar("nonce", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Wallet Surveillance / Dossier ──────────────────────
//
// The WTF gameshow relies on being able to detect when a user's
// wallet has performed specific on-chain actions (buying, selling,
// transferring NFTs, delegating, etc.).  We maintain a per-wallet
// event log sourced from TzKT + Objkt, plus a cursor per wallet so
// incremental syncs never miss or re-fetch events.

export const walletEventTypeEnum = pgEnum("wallet_event_type", [
  "token_transfer_in",
  "token_transfer_out",
  "token_mint",
  "token_burn",
  "xtz_transfer_in",
  "xtz_transfer_out",
  "contract_call",
  "delegation",
  "origination",
]);

export const walletSyncCursors = pgTable(
  "wallet_sync_cursors",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 36 })
      .unique()
      .notNull(),
    /** TzKT /tokens/transfers monotonic id cursor. */
    lastTransferId: bigint("last_transfer_id", { mode: "number" })
      .default(0)
      .notNull(),
    /** TzKT /accounts/:addr/operations transaction id cursor. */
    lastOperationId: bigint("last_operation_id", { mode: "number" })
      .default(0)
      .notNull(),
    /** Most recent TzKT level observed for this wallet. */
    lastLevel: bigint("last_level", { mode: "number" }).default(0).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncStatus: varchar("last_sync_status", { length: 16 }),
    lastSyncError: text("last_sync_error"),
    /** Total events ingested for this wallet (diagnostic). */
    eventsTracked: bigint("events_tracked", { mode: "number" })
      .default(0)
      .notNull(),
    /**
     * Becomes true once the initial backfill has caught up to TzKT's
     * tip.  Only backfilled wallets participate in the global 5-minute
     * incremental sweep — otherwise they would skip historical events.
     */
    backfilled: boolean("backfilled").default(false).notNull(),
    backfilledAt: timestamp("backfilled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxBackfilled: index("idx_wallet_cursors_backfilled").on(t.backfilled),
  })
);

export const walletEvents = pgTable(
  "wallet_events",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    /** Snapshot of the owning user at ingest time (nullable on later unlink). */
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: walletEventTypeEnum("event_type").notNull(),
    level: bigint("level", { mode: "number" }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    opHash: varchar("op_hash", { length: 100 }),
    /** Which TzKT source this row came from: transfer|transaction|delegation|origination */
    tzktKind: varchar("tzkt_kind", { length: 16 }).notNull(),
    /** Exactly one of tzktTransferId / tzktOperationId is set, per kind. */
    tzktTransferId: bigint("tzkt_transfer_id", { mode: "number" }),
    tzktOperationId: bigint("tzkt_operation_id", { mode: "number" }),
    // ─── Token context (FA1.2 / FA2 transfers only) ───
    tokenContract: varchar("token_contract", { length: 36 }),
    tokenId: text("token_id"),
    tokenStandard: varchar("token_standard", { length: 12 }),
    tokenAmount: text("token_amount"),
    tokenName: text("token_name"),
    tokenSymbol: text("token_symbol"),
    tokenThumbnail: text("token_thumbnail"),
    // ─── Counterparty + pricing ───
    counterpartyAddress: varchar("counterparty_address", { length: 36 }),
    /**
     * XTZ amount moved by the parent transaction (if applicable).
     * Null for pure token transfers without an XTZ leg.  Populated
     * from TzKT transaction operation `amount` field.
     */
    xtzAmountMutez: bigint("xtz_amount_mutez", { mode: "number" }),
    /**
     * Heuristic marketplace identifier (objkt, teia, fxhash, …).
     * Wired up for Phase 2 price-enrichment.  Null in Phase 1.
     */
    marketplace: varchar("marketplace", { length: 50 }),
    /** Raw upstream payload, for debugging and future extraction. */
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uqTransfer: uniqueIndex("uq_wallet_event_transfer").on(
      t.walletAddress,
      t.tzktTransferId
    ),
    uqOperation: uniqueIndex("uq_wallet_event_operation").on(
      t.walletAddress,
      t.tzktOperationId,
      t.tzktKind
    ),
    idxByWalletTime: index("idx_wallet_events_wallet_time").on(
      t.walletAddress,
      t.timestamp
    ),
    idxByUserTime: index("idx_wallet_events_user_time").on(
      t.userId,
      t.timestamp
    ),
    idxByToken: index("idx_wallet_events_token").on(
      t.tokenContract,
      t.tokenId
    ),
    idxByType: index("idx_wallet_events_type").on(t.eventType),
  })
);

export const walletEventsRelations = relations(walletEvents, ({ one }) => ({
  user: one(users, {
    fields: [walletEvents.userId],
    references: [users.id],
  }),
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
    /** Conversation flavor — plain DM or a Studio project chat. */
    conversationType: dmConversationTypeEnum("conversation_type")
      .default("direct")
      .notNull(),
    /** Populated when conversationType = studio. Lazy FK added in studio relations. */
    studioProjectId: integer("studio_project_id"),
    /** Optional display title for group/studio chats (plain DMs stay unnamed). */
    title: varchar("title", { length: 200 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("dm_conversations_last_message_idx").on(table.lastMessageAt),
    index("dm_conversations_type_idx").on(table.conversationType),
    index("dm_conversations_studio_project_idx").on(table.studioProjectId),
  ]
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
    /** Plain user text vs. Studio system or event messages. */
    messageType: dmMessageTypeEnum("message_type").default("text").notNull(),
    /**
     * Structured deep-link payload for system/event messages. e.g.
     *   { studioProjectId, studioFileId, studioAnnotationId, eventKey, ... }
     */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (table) => [
    index("dm_message_conversation_idx").on(table.conversationId),
    index("dm_message_sender_idx").on(table.senderId),
    index("dm_message_pinned_idx").on(table.conversationId, table.pinned),
    index("dm_message_type_idx").on(table.messageType),
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
    // Existing rows default to 'verified' so the historical feed stays
    // visible after drizzle-kit push adds the column.  New rows inserted
    // via the create-listing flow explicitly set 'pending_verification'
    // and the verifier reconciles them to 'verified' or 'failed'.
    onchainStatus: varchar("onchain_status", { length: 24 })
      .default("verified")
      .notNull(),
    onchainVerifiedAt: timestamp("onchain_verified_at"),
    onchainVerifiedSender: varchar("onchain_verified_sender", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("listing_seller_idx").on(table.sellerUserId),
    index("listing_onchain_status_idx").on(table.onchainStatus),
  ]
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
  onchainStatus: varchar("onchain_status", { length: 24 })
    .default("verified")
    .notNull(),
  onchainVerifiedAt: timestamp("onchain_verified_at"),
  onchainVerifiedSender: varchar("onchain_verified_sender", { length: 36 }),
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

// ─── User Notifications ─────────────────────────────────

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sourceUserId: integer("source_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventKey: varchar("event_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    body: text("body"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_notification_user_created_idx").on(table.userId, table.createdAt),
    index("user_notification_user_read_idx").on(table.userId, table.read),
    index("user_notification_event_idx").on(table.eventKey),
  ]
);

export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences")
    .$type<Record<string, boolean>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userNotificationsRelations = relations(
  userNotifications,
  ({ one }) => ({
    user: one(users, {
      fields: [userNotifications.userId],
      references: [users.id],
    }),
    sourceUser: one(users, {
      fields: [userNotifications.sourceUserId],
      references: [users.id],
    }),
  })
);

export const userNotificationPreferencesRelations = relations(
  userNotificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userNotificationPreferences.userId],
      references: [users.id],
    }),
  })
);

// ─── Contract Activity Ledger ───────────────────────────

export const contractActivityLogs = pgTable(
  "contract_activity_logs",
  {
    id: serial("id").primaryKey(),
    interactionId: varchar("interaction_id", { length: 80 }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    walletAddress: varchar("wallet_address", { length: 36 }),
    module: varchar("module", { length: 60 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    status: contractActivityStatusEnum("status").default("attempt").notNull(),
    contractAddress: varchar("contract_address", { length: 36 }),
    entrypoint: varchar("entrypoint", { length: 120 }),
    opHash: varchar("op_hash", { length: 51 }),
    network: varchar("network", { length: 24 }),
    rpcUrl: text("rpc_url"),
    params: jsonb("params"),
    error: text("error"),
    clientTimestamp: timestamp("client_timestamp"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("contract_activity_created_at_idx").on(table.createdAt),
    index("contract_activity_status_idx").on(table.status),
    index("contract_activity_wallet_idx").on(table.walletAddress),
    index("contract_activity_interaction_idx").on(table.interactionId),
  ]
);

export const contractActivityLogsRelations = relations(
  contractActivityLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [contractActivityLogs.userId],
      references: [users.id],
    }),
  })
);

// ─── Role Permissions ────────────────────────────────────

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    role: userRoleEnum("role").notNull(),
    permissionKey: varchar("permission_key", { length: 64 }).notNull(),
    granted: boolean("granted").notNull(),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("role_perm_unique_idx").on(table.role, table.permissionKey),
    index("role_perm_role_idx").on(table.role),
  ]
);

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
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    isPublic: boolean("is_public").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    // Position in the channel-list UI.  Newer channels append to the
    // end (= MAX(sort_order) + 1 for the owner), so adding a channel
    // never renumbers existing channels.  The migration backfills
    // `sort_order = id` on existing rows so the pre-existing order is
    // preserved on upgrade.
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_channel_owner_idx").on(table.ownerUserId),
    index("tv_channel_sort_idx").on(table.ownerUserId, table.sortOrder),
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
  scheduleEntries: many(tvScheduleEntries),
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
    // MTV-style metadata — kept as first-class columns so the stream
    // endpoint does not have to re-parse the token `metadata` jsonb on
    // every request.  Populated on insert / refresh; nullable because
    // older rows (before the migration) carry only jsonb metadata.
    creatorName: text("creator_name"),
    creatorAddress: varchar("creator_address", { length: 64 }),
    collectionName: text("collection_name"),
    mintedAt: timestamp("minted_at"),
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
    mediaItemId: integer("media_item_id")
      .references(() => userMediaLibrary.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    durationSeconds: integer("duration_seconds").default(30).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_playlist_item_playlist_idx").on(table.playlistId),
    index("tv_playlist_item_video_idx").on(table.videoId),
    index("tv_playlist_item_media_idx").on(table.mediaItemId),
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

export const tvBumpers = pgTable(
  "tv_bumpers",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    durationMs: integer("duration_ms").notNull(),
    data: text("data").notNull(),
    // "personal" (default) or "community".  Community bumpers from
    // every user are mixed into the global pool so any channel may
    // play them.  Enforced per-user cap: 3 community + 20 personal.
    category: varchar("category", { length: 20 }).default("personal").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_bumper_owner_idx").on(table.ownerUserId),
    index("tv_bumper_category_idx").on(table.category),
  ]
);

export const tvBumpersRelations = relations(tvBumpers, ({ one }) => ({
  owner: one(users, {
    fields: [tvBumpers.ownerUserId],
    references: [users.id],
  }),
}));

export const tvWtfChannelConfig = pgTable("tv_wtf_channel_config", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .references(() => tvChannels.id, { onDelete: "set null" }),
  enabled: boolean("enabled").default(false).notNull(),
  sourceMode: varchar("source_mode", { length: 30 }).default("all_users").notNull(),
  sourceUserIds: jsonb("source_user_ids").default([]),
  sourceWalletAddresses: jsonb("source_wallet_addresses").default([]),
  tokensPerWalletPerHour: integer("tokens_per_wallet_per_hour").default(5).notNull(),
  defaultDurationSeconds: integer("default_duration_seconds").default(15).notNull(),
  playlistSize: integer("playlist_size").default(100).notNull(),
  refreshIntervalMinutes: integer("refresh_interval_minutes").default(30).notNull(),
  bumperMode: varchar("bumper_mode", { length: 30 }).default("community_pool").notNull(),
  selectedBumperIds: jsonb("selected_bumper_ids").default([]),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tvWtfChannelConfigRelations = relations(tvWtfChannelConfig, ({ one }) => ({
  channel: one(tvChannels, {
    fields: [tvWtfChannelConfig.channelId],
    references: [tvChannels.id],
  }),
}));

// ─── User Media Library (centralized, channel-independent) ──────

export const mediaSourceTypeEnum = pgEnum("tv_media_source_type", [
  "ipfs",
  "upload",
  "external",
]);

export const mediaStatusEnum = pgEnum("tv_media_status", [
  "draft",
  "processing",
  "ready",
  "blocked",
]);

export const userMediaLibrary = pgTable(
  "user_media_library",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    sourceType: mediaSourceTypeEnum("source_type").default("ipfs").notNull(),
    sourceUrl: text("source_url").notNull(),
    playbackUrl: text("playback_url"),
    posterUrl: text("poster_url"),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    durationSeconds: integer("duration_seconds"),
    status: mediaStatusEnum("status").default("ready").notNull(),
    metadata: jsonb("metadata"),
    tokenContract: varchar("token_contract", { length: 36 }),
    tokenId: text("token_id"),
    mediaCategory: varchar("media_category", { length: 30 }).default("other").notNull(),
    fileData: text("file_data"),
    fileSize: integer("file_size"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("uml_owner_idx").on(table.ownerUserId),
    index("uml_status_idx").on(table.status),
    index("uml_category_idx").on(table.ownerUserId, table.mediaCategory),
    uniqueIndex("uml_token_unique_idx").on(table.ownerUserId, table.tokenContract, table.tokenId),
  ]
);

export const userMediaLibraryRelations = relations(userMediaLibrary, ({ one, many }) => ({
  owner: one(users, {
    fields: [userMediaLibrary.ownerUserId],
    references: [users.id],
  }),
  scheduleEntries: many(tvScheduleEntries),
}));

// ─── TV Schedule Entries (recurring daily time-slot per channel) ────────

export const tvScheduleEntries = pgTable(
  "tv_schedule_entries",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .references(() => tvChannels.id, { onDelete: "cascade" })
      .notNull(),
    playlistId: integer("playlist_id")
      .references(() => tvPlaylists.id, { onDelete: "cascade" }),
    mediaItemId: integer("media_item_id")
      .references(() => userMediaLibrary.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }),
    startMinuteOfDay: integer("start_minute_of_day").default(0).notNull(),
    endMinuteOfDay: integer("end_minute_of_day").default(0).notNull(),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_schedule_channel_idx").on(table.channelId),
    index("tv_schedule_time_idx").on(table.channelId, table.startMinuteOfDay),
    index("tv_schedule_media_idx").on(table.mediaItemId),
    index("tv_schedule_playlist_idx").on(table.playlistId),
  ]
);

export const tvScheduleEntriesRelations = relations(tvScheduleEntries, ({ one }) => ({
  channel: one(tvChannels, {
    fields: [tvScheduleEntries.channelId],
    references: [tvChannels.id],
  }),
  playlist: one(tvPlaylists, {
    fields: [tvScheduleEntries.playlistId],
    references: [tvPlaylists.id],
  }),
  mediaItem: one(userMediaLibrary, {
    fields: [tvScheduleEntries.mediaItemId],
    references: [userMediaLibrary.id],
  }),
}));

// ─── Token Gates ─────────────────────────────────────────

export const tokenGates = pgTable(
  "token_gates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id"),
    minBalance: text("min_balance").default("1").notNull(),
    grantedRole: userRoleEnum("granted_role"),
    grantedPermissions: jsonb("granted_permissions").$type<string[]>().default(sql`'[]'::jsonb`),
    active: boolean("active").default(true).notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("token_gate_contract_idx").on(table.tokenContract),
    index("token_gate_active_idx").on(table.active),
  ]
);

// ─── W Feed Cache ────────────────────────────────────────

export const wFeedCache = pgTable(
  "w_feed_cache",
  {
    id: serial("id").primaryKey(),
    accountId: varchar("account_id", { length: 64 }).notNull(),
    accountUsername: varchar("account_username", { length: 100 }),
    tweetId: varchar("tweet_id", { length: 64 }).notNull(),
    tweetData: jsonb("tweet_data").notNull(),
    publishedAt: timestamp("published_at").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [
    index("w_feed_cache_account_idx").on(table.accountId),
    index("w_feed_cache_published_idx").on(table.publishedAt),
    uniqueIndex("w_feed_cache_tweet_unique_idx").on(table.tweetId),
  ]
);

// ─── FAQ ─────────────────────────────────────────────────

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 100 }),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Studio — collaborative asset rooms ─────────────────
//
// Studio is a multimedia workspace where creators share files, drop
// annotations on previews, and chat in a project-scoped DM.  File
// bytes may live on the local disk, in the project owner's Google
// Drive (BYO storage), or any future driver.  The database stores
// metadata only — the storage driver URI in source_uri points at the
// actual bytes (e.g. "disk://...", "gdrive://fileId").

export const studioProjects = pgTable(
  "studio_projects",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    coverImageUrl: text("cover_image_url"),
    /** Storage backend used for this project's file bytes. */
    storageBackend: studioStorageBackendEnum("storage_backend")
      .default("local_disk")
      .notNull(),
    /** Driver-specific context — Drive folder id, owner tokens ref, etc. */
    storageContext: jsonb("storage_context")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    /** Per-project storage cap. Default 500MB for local; 10GB for Drive. */
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
      .default(524_288_000)
      .notNull(),
    /** Running total of bytes used (kept in sync by upload/delete paths). */
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    /** Backing DM conversation for project chat (conversationType='studio'). */
    conversationId: integer("conversation_id").references(() => dmConversations.id, {
      onDelete: "set null",
    }),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_projects_owner_idx").on(t.ownerUserId),
    index("studio_projects_archived_idx").on(t.archived),
    index("studio_projects_conversation_idx").on(t.conversationId),
  ]
);

export const studioProjectMembers = pgTable(
  "studio_project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: studioMemberRoleEnum("role").default("viewer").notNull(),
    invitedBy: integer("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastOpenedAt: timestamp("last_opened_at"),
    lastOpenedFileId: integer("last_opened_file_id"),
  },
  (t) => [
    index("studio_project_members_project_idx").on(t.projectId),
    index("studio_project_members_user_idx").on(t.userId),
    uniqueIndex("studio_project_member_unique_idx").on(t.projectId, t.userId),
  ]
);

export const studioFolders = pgTable(
  "studio_folders",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    parentFolderId: integer("parent_folder_id"),
    name: varchar("name", { length: 200 }).notNull(),
    position: integer("position").default(0).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_folders_project_idx").on(t.projectId),
    index("studio_folders_parent_idx").on(t.parentFolderId),
  ]
);

export const studioFiles = pgTable(
  "studio_files",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    folderId: integer("folder_id").references(() => studioFolders.id, {
      onDelete: "set null",
    }),
    uploaderId: integer("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 300 }).notNull(),
    mimeType: varchar("mime_type", { length: 150 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Storage-driver-scoped URI for the archived original. */
    sourceUri: text("source_uri").notNull(),
    /** Optional preview asset URI (generated at upload for images/video/pdf). */
    previewUri: text("preview_uri"),
    /** Small thumbnail URI for tree/list views. */
    thumbnailUri: text("thumbnail_uri"),
    /** Short sha256 hex of original bytes for dedupe / integrity. */
    fileHash: varchar("file_hash", { length: 64 }),
    /**
     * Media-type-specific metadata — width, height, durationSeconds,
     * pageCount, waveformPeaks, posterTime, etc.
     */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    currentVersion: integer("current_version").default(1).notNull(),
    position: integer("position").default(0).notNull(),
    archived: boolean("archived").default(false).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_files_project_idx").on(t.projectId),
    index("studio_files_folder_idx").on(t.folderId),
    index("studio_files_uploader_idx").on(t.uploaderId),
    index("studio_files_deleted_idx").on(t.deletedAt),
    index("studio_files_archived_idx").on(t.archived),
  ]
);

export const studioFileVersions = pgTable(
  "studio_file_versions",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .references(() => studioFiles.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    uploaderId: integer("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceUri: text("source_uri").notNull(),
    previewUri: text("preview_uri"),
    thumbnailUri: text("thumbnail_uri"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_file_versions_file_idx").on(t.fileId),
    uniqueIndex("studio_file_version_unique_idx").on(t.fileId, t.version),
  ]
);

export const studioAnnotations = pgTable(
  "studio_annotations",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .references(() => studioFiles.id, { onDelete: "cascade" })
      .notNull(),
    fileVersion: integer("file_version").default(1).notNull(),
    authorId: integer("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: studioAnnotationKindEnum("kind").notNull(),
    /**
     * For video: time in seconds * 1000.  For PDFs: 1-indexed page number.
     * For multi-page / multi-frame media generally.  Null for single-asset
     * previews (plain images, audio).
     */
    pageOrFrame: integer("page_or_frame"),
    /**
     * All positional + presentation data lives here.  Coordinates are
     * normalized 0-1 relative to the preview's natural dimensions so
     * annotations stay anchored at any display size.
     *   { x, y, w, h, color, text, strokePoints: [[x,y], ...] }
     */
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    resolvedBy: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_annotations_file_idx").on(t.fileId),
    index("studio_annotations_author_idx").on(t.authorId),
    index("studio_annotations_kind_idx").on(t.kind),
    index("studio_annotations_resolved_idx").on(t.resolved),
  ]
);

export const studioAnnotationComments = pgTable(
  "studio_annotation_comments",
  {
    id: serial("id").primaryKey(),
    annotationId: integer("annotation_id")
      .references(() => studioAnnotations.id, { onDelete: "cascade" })
      .notNull(),
    authorId: integer("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [
    index("studio_annotation_comments_annotation_idx").on(t.annotationId),
    index("studio_annotation_comments_author_idx").on(t.authorId),
  ]
);

export const studioUserState = pgTable("studio_user_state", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastOpenProjectId: integer("last_open_project_id").references(
    () => studioProjects.id,
    { onDelete: "set null" }
  ),
  /**
   * Persisted UI state per user — panel widths, scroll positions, etc.
   *   { leftPanelWidth, rightPanelWidth, lastOpenFileByProject: {...} }
   */
  state: jsonb("state")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Per-user, per-project OAuth tokens for storage drivers that require
 * delegated auth (Google Drive).  Encrypted at rest via KMS key in env.
 * This table is shared across all projects the user owns that use the
 * same backend, keyed by (userId, backend).
 */
export const studioStorageAccounts = pgTable(
  "studio_storage_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    backend: studioStorageBackendEnum("backend").notNull(),
    accountEmail: varchar("account_email", { length: 320 }),
    /** Scope the OAuth token was granted at (comma-joined). */
    scopes: text("scopes"),
    /** Encrypted serialized credential envelope (JSON). */
    credentialCipher: text("credential_cipher").notNull(),
    /** IV / nonce for the credentialCipher. */
    credentialNonce: varchar("credential_nonce", { length: 64 }).notNull(),
    /** When the stored access token expires (if known). */
    expiresAt: timestamp("expires_at"),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_storage_accounts_user_idx").on(t.userId),
    uniqueIndex("studio_storage_accounts_user_backend_unique_idx").on(
      t.userId,
      t.backend
    ),
  ]
);

/**
 * Platform-owned storage connections.  One row per backend (unique on
 * `backend`).  Today only Google Drive is supported — a single Google
 * account (e.g. wtfgameshowemail@gmail.com) backs every project using the
 * `google_drive` backend, so the 2 TB pool is shared across the platform.
 *
 * `credentialCipher` + `credentialNonce` encrypt the OAuth refresh/access
 * tokens with `STUDIO_CRYPTO_KEY` (AES-256-GCM).
 */
export const studioPlatformStorage = pgTable(
  "studio_platform_storage",
  {
    id: serial("id").primaryKey(),
    backend: studioStorageBackendEnum("backend").notNull(),
    accountEmail: varchar("account_email", { length: 320 }),
    scopes: text("scopes"),
    credentialCipher: text("credential_cipher").notNull(),
    credentialNonce: varchar("credential_nonce", { length: 64 }).notNull(),
    /** Root folder id inside the provider where Studio creates project folders. */
    rootFolderId: varchar("root_folder_id", { length: 128 }),
    /** Cached provider-reported total+used quota (bytes); refreshed periodically. */
    quotaBytesLimit: bigint("quota_bytes_limit", { mode: "number" }),
    quotaBytesUsage: bigint("quota_bytes_usage", { mode: "number" }),
    quotaRefreshedAt: timestamp("quota_refreshed_at"),
    /** Admin user who kicked off the connection; informational only. */
    connectedByUserId: integer("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("studio_platform_storage_backend_unique_idx").on(t.backend),
  ]
);

// ─── Studio relations ───────────────────────────────────

export const studioProjectsRelations = relations(studioProjects, ({ one, many }) => ({
  owner: one(users, {
    fields: [studioProjects.ownerUserId],
    references: [users.id],
  }),
  conversation: one(dmConversations, {
    fields: [studioProjects.conversationId],
    references: [dmConversations.id],
  }),
  members: many(studioProjectMembers),
  folders: many(studioFolders),
  files: many(studioFiles),
}));

export const studioProjectMembersRelations = relations(
  studioProjectMembers,
  ({ one }) => ({
    project: one(studioProjects, {
      fields: [studioProjectMembers.projectId],
      references: [studioProjects.id],
    }),
    user: one(users, {
      fields: [studioProjectMembers.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [studioProjectMembers.invitedBy],
      references: [users.id],
    }),
  })
);

export const studioFoldersRelations = relations(studioFolders, ({ one, many }) => ({
  project: one(studioProjects, {
    fields: [studioFolders.projectId],
    references: [studioProjects.id],
  }),
  parent: one(studioFolders, {
    fields: [studioFolders.parentFolderId],
    references: [studioFolders.id],
    relationName: "studioFolderParent",
  }),
  children: many(studioFolders, { relationName: "studioFolderParent" }),
  creator: one(users, {
    fields: [studioFolders.createdBy],
    references: [users.id],
  }),
  files: many(studioFiles),
}));

export const studioFilesRelations = relations(studioFiles, ({ one, many }) => ({
  project: one(studioProjects, {
    fields: [studioFiles.projectId],
    references: [studioProjects.id],
  }),
  folder: one(studioFolders, {
    fields: [studioFiles.folderId],
    references: [studioFolders.id],
  }),
  uploader: one(users, {
    fields: [studioFiles.uploaderId],
    references: [users.id],
  }),
  versions: many(studioFileVersions),
  annotations: many(studioAnnotations),
}));

export const studioFileVersionsRelations = relations(
  studioFileVersions,
  ({ one }) => ({
    file: one(studioFiles, {
      fields: [studioFileVersions.fileId],
      references: [studioFiles.id],
    }),
    uploader: one(users, {
      fields: [studioFileVersions.uploaderId],
      references: [users.id],
    }),
  })
);

export const studioAnnotationsRelations = relations(
  studioAnnotations,
  ({ one, many }) => ({
    file: one(studioFiles, {
      fields: [studioAnnotations.fileId],
      references: [studioFiles.id],
    }),
    author: one(users, {
      fields: [studioAnnotations.authorId],
      references: [users.id],
    }),
    resolver: one(users, {
      fields: [studioAnnotations.resolvedBy],
      references: [users.id],
    }),
    comments: many(studioAnnotationComments),
  })
);

export const studioAnnotationCommentsRelations = relations(
  studioAnnotationComments,
  ({ one }) => ({
    annotation: one(studioAnnotations, {
      fields: [studioAnnotationComments.annotationId],
      references: [studioAnnotations.id],
    }),
    author: one(users, {
      fields: [studioAnnotationComments.authorId],
      references: [users.id],
    }),
  })
);

export const studioStorageAccountsRelations = relations(
  studioStorageAccounts,
  ({ one }) => ({
    user: one(users, {
      fields: [studioStorageAccounts.userId],
      references: [users.id],
    }),
  })
);
