import {
  pgTable,
  serial,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  varchar,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  bigint,
  numeric,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type {
  DesktopAppearance,
  DesktopIconLayout,
  HamsterGenetics,
  HamsterState,
} from "./desktop";

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
  /** At least one `wallet_holdings` row with balance &gt; 0 (incl. WTF token). */
  "holds_positive_balance",
  /** At least one non–WTF-fungible holding with balance &gt; 0 (indexed FA2 art). */
  "holds_art_nft",
  /** At least one `wallet_events` row with `event_type = token_mint` for this user. */
  "has_mint_event",
  /** User has at least one trade-board mirror item (`collections.type = trade_board_listing`). */
  "listed_on_trade_board",
  /** Phase 10: user swapped WTF in a specific buyback contract window. */
  "wtf_swapped_in_buyback",
  /** Phase 10: user has sent at least N WTF to operator wallet since a timestamp (any source). */
  "wtf_paid_to_operator_at_least",
  /** Phase 5: user attended an X Space (in-app heartbeats across a configurable window). */
  "x_space_attendance",
  /** Phase 5: user posted a hashtag with N mentions (excluding specified handles). */
  "x_hashtag_post",
  /** Phase 6: user hit a minimum console hi-score inside a given window. */
  "console_hiscore",
  /** Phase 7: user minted at least one token whose metadata carries the challenge tag. */
  "mint_with_tag",
  /** Phase 7: user minted at least one token into a target objkt curation. */
  "mint_in_curation",
  /** Phase 4: user was present in a Discord voice/stage channel for min_minutes. */
  "discord_voice_presence",
]);

export const contractActivityStatusEnum = pgEnum("contract_activity_status", [
  "attempt",
  "success",
  "failure",
]);

// ─── Phase 2 — contestant status (boot backfill owns DDL) ───
export const contestantStatusEnum = pgEnum("contestant_status", [
  "active",
  "reserve",
  "eliminated",
  "withdrew",
  "non_participant",
]);

// ─── Phase 2 — round elimination rule kind (boot backfill owns DDL) ───
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

// ─── Phase 10 — WTF recapture enums (boot backfill owns DDL) ───
export const buybackWindowStatusEnum = pgEnum("buyback_window_status", [
  "draft",
  "funded",
  "open",
  "closed",
  "swept",
  "cancelled",
]);

export const wtfAuctionStatusEnum = pgEnum("wtf_auction_status", [
  "draft",
  "live",
  "ended",
  "settled",
  "cancelled",
]);

export const sideQuestEntryFeeStatusEnum = pgEnum(
  "side_quest_entry_fee_status",
  ["pending", "confirmed", "refunded"]
);

export const collectionContractNetworkEnum = pgEnum(
  "collection_contract_network",
  ["ghostnet", "shadownet", "mainnet"]
);

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

export const wtfSubdomainGrantStatusEnum = pgEnum("wtf_subdomain_grant_status", [
  "reserved",
  "pending",
  "provisioned",
  "revoked",
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
  twitterOauth2AccessToken: text("twitter_oauth2_access_token"),
  twitterOauth2RefreshToken: text("twitter_oauth2_refresh_token"),
  twitterOauth2Scopes: text("twitter_oauth2_scopes"),
  twitterOauth2ExpiresAt: timestamp("twitter_oauth2_expires_at"),
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
  desktopSettings: one(userDesktopSettings, {
    fields: [users.id],
    references: [userDesktopSettings.userId],
  }),
  desktopPetState: one(desktopPetStates, {
    fields: [users.id],
    references: [desktopPetStates.userId],
  }),
  desktopPetEvents: many(desktopPetEvents),
  systemEventLogs: many(systemEventLogs),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// ─── Master System Log ───────────────────────────────────

export const systemEventLogs = pgTable(
  "system_event_logs",
  {
    id: serial("id").primaryKey(),
    eventId: varchar("event_id", { length: 64 }).notNull(),
    requestId: varchar("request_id", { length: 64 }),
    source: varchar("source", { length: 80 }).notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    severity: varchar("severity", { length: 16 }).default("info").notNull(),
    message: text("message"),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    method: varchar("method", { length: 16 }),
    path: text("path"),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    ip: varchar("ip", { length: 120 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    errorName: varchar("error_name", { length: 255 }),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("system_event_logs_event_id_idx").on(table.eventId),
    index("system_event_logs_created_idx").on(table.createdAt),
    index("system_event_logs_request_idx").on(table.requestId),
    index("system_event_logs_source_created_idx").on(table.source, table.createdAt),
    index("system_event_logs_type_created_idx").on(table.eventType, table.createdAt),
    index("system_event_logs_severity_created_idx").on(table.severity, table.createdAt),
    index("system_event_logs_user_created_idx").on(table.userId, table.createdAt),
    index("system_event_logs_status_created_idx").on(table.statusCode, table.createdAt),
  ]
);

export const systemEventLogsRelations = relations(systemEventLogs, ({ one }) => ({
  user: one(users, {
    fields: [systemEventLogs.userId],
    references: [users.id],
  }),
}));

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
    /**
     * Cockpit display columns (phase 1).  Populated by phase 2's
     * holdings-derive job from `wallet_events`.  Nullable until the
     * first derive pass writes them.  Not referenced by any existing
     * feature — safe to ignore if backfill hasn't caught up.
     */
    firstActivityAt: timestamp("first_activity_at"),
    lastActivityAt: timestamp("last_activity_at"),
    lastSyncedAt: timestamp("last_synced_at"),
  },
  (table) => [
    uniqueIndex("wallet_address_unique_idx").on(table.walletAddress),
    index("wallet_user_idx").on(table.userId),
  ]
);

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, { fields: [userWallets.userId], references: [users.id] }),
}));

// ─── WTF.tez Subdomain Grants ───────────────────────────

export const wtfSubdomainGrants = pgTable(
  "wtf_subdomain_grants",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    label: varchar("label", { length: 63 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    parentDomain: varchar("parent_domain", { length: 255 }).default("wtf.tez").notNull(),
    status: wtfSubdomainGrantStatusEnum("status").default("reserved").notNull(),
    walletAddress: varchar("wallet_address", { length: 36 }),
    sourceType: varchar("source_type", { length: 40 }).default("admin").notNull(),
    sourceId: integer("source_id"),
    grantedBy: integer("granted_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    opHash: varchar("op_hash", { length: 100 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    provisionedAt: timestamp("provisioned_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("wtf_subdomain_grants_label_unique").on(table.parentDomain, table.label),
    uniqueIndex("wtf_subdomain_grants_full_name_unique").on(table.fullName),
    index("wtf_subdomain_grants_user_idx").on(table.userId),
    index("wtf_subdomain_grants_status_idx").on(table.status),
    index("wtf_subdomain_grants_source_idx").on(table.sourceType, table.sourceId),
  ]
);

export const wtfSubdomainGrantsRelations = relations(wtfSubdomainGrants, ({ one }) => ({
  user: one(users, {
    fields: [wtfSubdomainGrants.userId],
    references: [users.id],
  }),
  grantedByUser: one(users, {
    fields: [wtfSubdomainGrants.grantedBy],
    references: [users.id],
  }),
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

// ─── Cockpit: sync infrastructure ────────────────────────
//
// Added by the cockpit migration (phases 0–4).  All of the following
// tables are ADDITIVE — existing features do not read from or write
// to them.  They can be dropped to revert; see
// `_cockpit_backup/<ts>/RESTORE.sh`.

/**
 * One row per execution of a scheduled job.  Replaces ad-hoc
 * `console.log` observability with a queryable audit trail.
 */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    jobName: varchar("job_name", { length: 64 }).notNull(),
    scope: varchar("scope", { length: 128 }),
    status: varchar("status", { length: 16 }).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    itemsIn: integer("items_in").default(0).notNull(),
    itemsOut: integer("items_out").default(0).notNull(),
    error: text("error"),
    cursorBefore: jsonb("cursor_before"),
    cursorAfter: jsonb("cursor_after"),
  },
  (t) => ({
    idxJobStarted: index("idx_sync_runs_job_started").on(t.jobName, t.startedAt),
    idxJobStatus: index("idx_sync_runs_job_status").on(t.jobName, t.status),
  })
);

/**
 * Generic queue for "please index this address/contract."  Workers
 * drain by priority (lower = sooner).  Used by login handlers,
 * admin "follow this artist" flows, and counterparty discovery.
 */
export const indexingQueue = pgTable(
  "indexing_queue",
  {
    id: serial("id").primaryKey(),
    target: varchar("target", { length: 64 }).notNull(),
    targetKind: varchar("target_kind", { length: 16 }).notNull(),
    priority: integer("priority").default(5).notNull(),
    reason: varchar("reason", { length: 64 }),
    enqueuedAt: timestamp("enqueued_at").defaultNow().notNull(),
    pickedUpAt: timestamp("picked_up_at"),
    finishedAt: timestamp("finished_at"),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => ({
    idxPriority: index("idx_indexing_queue_pri").on(t.priority, t.enqueuedAt),
    idxStatus: index("idx_indexing_queue_status").on(t.status),
    uqTargetPending: uniqueIndex("uq_indexing_queue_target_pending").on(
      t.target,
      t.targetKind,
      t.status
    ),
  })
);

/**
 * Shared token metadata cache — one row per (contract, tokenId).
 * Replaces per-holding metadata duplication on `user_owned_tokens`
 * and `wallet_events`.  Populated lazily by metadata-sync.
 */
export const tokenMetadata = pgTable(
  "token_metadata",
  {
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    name: text("name"),
    symbol: text("symbol"),
    description: text("description"),
    thumbnail: text("thumbnail"),
    artifactUri: text("artifact_uri"),
    displayUri: text("display_uri"),
    mimeType: varchar("mime_type", { length: 128 }),
    creators: jsonb("creators"),
    tags: jsonb("tags"),
    formats: jsonb("formats"),
    attributes: jsonb("attributes"),
    raw: jsonb("raw"),
    /** Denormalised creator (first entry of `creators` JSON).  Populated by
     * metadata-sync & the intel CSV importer for O(1) creator filters. */
    creatorAddress: varchar("creator_address", { length: 64 }),
    /** Total editions supply, if known. */
    supply: bigint("supply", { mode: "number" }),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex("pk_token_metadata").on(t.tokenContract, t.tokenId),
    idxContract: index("idx_token_metadata_contract").on(t.tokenContract),
    idxCreator: index("idx_token_metadata_creator").on(t.creatorAddress),
  })
);

/**
 * Shared contract metadata cache — one row per address.  Used by
 * events-sync to classify marketplace/entrypoint activity.
 */
export const contractMetadata = pgTable(
  "contract_metadata",
  {
    address: varchar("address", { length: 36 }).primaryKey(),
    kind: varchar("kind", { length: 32 }),
    alias: text("alias"),
    creator: varchar("creator", { length: 36 }),
    interfaces: jsonb("interfaces"),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

/**
 * Address label book.  One row per address that we've named,
 * categorised, or resolved a Tezos Domain for.  Used by the
 * activity feed, the dossier, and quest evaluation.
 *
 * `hasEverMinted` + `lastResolvedAt` are populated by the address-
 * resolver worker and the intel CSV import (analytics phase 1).  The
 * other columns remain manual / heuristic.
 */
export const addressLabels = pgTable(
  "address_labels",
  {
    address: varchar("address", { length: 64 }).primaryKey(),
    label: text("label"),
    category: varchar("category", { length: 32 }),
    tezosDomain: text("tezos_domain"),
    notes: text("notes"),
    /** TzKT ever-saw-a-mint-op flag.  Imported from intel CSV, refreshed by worker. */
    hasEverMinted: boolean("has_ever_minted").default(false).notNull(),
    /** When the label was last reconciled against TzKT / Tezos Domains. */
    lastResolvedAt: timestamp("last_resolved_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxCategory: index("idx_address_labels_category").on(t.category),
    idxHasMinted: index("idx_address_labels_minted").on(t.hasEverMinted),
  })
);

// ─── Cockpit: collections + collection_items (Phase 4) ──
//
// First-class model for user-curated groupings of tokens.  Replaces
// the scattered boolean flags on user_owned_tokens (onTradeBoard,
// etc.) with a uniform shape the cockpit can list and the rest of
// WTF can grow into.  Trade-board writes continue to flip the
// legacy boolean column; the mirror in
// `server/lib/collections-mirror.ts` ALSO writes a matching
// collection_items row so the cockpit sees the same data.
//
// Type values:
//   - curation             — private user list, WTF-internal
//   - wtf_gallery          — public WTF gallery entry
//   - trade_board_listing  — WTF trade-board listing (mirror of
//                             user_owned_tokens.on_trade_board)
//   - objkt_curation       — linked to an objkt.com curation
//   - external_listing     — marketplace listing off-platform (teia,
//                             objkt, fxhash, etc.)
//   - custom               — user-defined

export const collectionTypeEnum = pgEnum("collection_type", [
  "curation",
  "wtf_gallery",
  "trade_board_listing",
  "objkt_curation",
  "external_listing",
  "custom",
]);

export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: collectionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 120 }),
    isPublic: boolean("is_public").default(false).notNull(),
    coverUri: text("cover_uri"),
    metadata: jsonb("metadata"),
    externalRef: varchar("external_ref", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxUser: index("idx_collections_user").on(t.userId, t.type),
    uqUserTypeSlug: uniqueIndex("uq_collections_user_type_slug").on(
      t.userId,
      t.type,
      t.slug
    ),
    idxPublic: index("idx_collections_public").on(t.isPublic, t.type),
  })
);

export const collectionItems = pgTable(
  "collection_items",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .references(() => collections.id, { onDelete: "cascade" })
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    note: text("note"),
    position: integer("position").default(0).notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => ({
    uqCollectionToken: uniqueIndex("uq_collection_items_unique").on(
      t.collectionId,
      t.tokenContract,
      t.tokenId
    ),
    idxCollection: index("idx_collection_items_collection").on(
      t.collectionId,
      t.position
    ),
    idxToken: index("idx_collection_items_token").on(
      t.tokenContract,
      t.tokenId
    ),
  })
);

// ─── Cockpit: derived wallet holdings (Phase 2) ─────────
//
// Populated by `holdings-derive` (from `wallet_events`) and
// `portfolio-sync` (TzKT FA2 snapshot + WTF balance).  Trade-board
// listing state lives in `collections` / `collection_items`.
//
// Read by `/api/cockpit/holdings`, `/api/profile/tokens`, gallery, TV,
// and marketplace trade-board queries.

export const walletHoldings = pgTable(
  "wallet_holdings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    /** Accumulated balance derived from transfer deltas. */
    balance: text("balance").notNull(),
    /** MIN(wallet_events.timestamp WHERE event_type='token_transfer_in'). */
    firstAcquiredAt: timestamp("first_acquired_at"),
    /** MAX(wallet_events.timestamp) for this (wallet,contract,tokenId). */
    lastActivityAt: timestamp("last_activity_at"),
    /** Last time holdings-derive confirmed this row from events. */
    derivedAt: timestamp("derived_at").defaultNow().notNull(),
    /** TzKT authoritative timestamps (populated in phase 3). */
    tzktFirstTime: timestamp("tzkt_first_time"),
    tzktLastTime: timestamp("tzkt_last_time"),
    /** True when counterparty of first_acquired is one of the user's own wallets OR the user minted. */
    isCreator: boolean("is_creator").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uqWalletToken: uniqueIndex("uq_holdings_wallet_token").on(
      t.walletAddress,
      t.tokenContract,
      t.tokenId
    ),
    idxUserActivity: index("idx_holdings_user_activity").on(
      t.userId,
      t.lastActivityAt
    ),
    idxUserAcquired: index("idx_holdings_user_acquired").on(
      t.userId,
      t.firstAcquiredAt
    ),
    idxContractToken: index("idx_holdings_contract_token").on(
      t.tokenContract,
      t.tokenId
    ),
  })
);

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

// ─── Rounds ──────────────────────────────────────────────

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
  rewardWtfSubdomain: boolean("reward_wtf_subdomain").default(false).notNull(),
  rewardWtfSubdomainLabelTemplate: varchar("reward_wtf_subdomain_label_template", { length: 120 }),
  rewardTokenContract: varchar("reward_token_contract", { length: 36 }),
  rewardTokenId: text("reward_token_id"),
  rewardTokenAmount: bigint("reward_token_amount", { mode: "number" }).default(0),
  rewardType: varchar("reward_type", { length: 20 }).default("wtf"),
  status: challengeStatusEnum("status").default("draft").notNull(),
  /** Phase 7: target contract for mint-portal submissions (KT1...). */
  submissionContract: varchar("submission_contract", { length: 36 }),
  /** Phase 7: required tag in token metadata for a mint to be auto-linked. */
  submissionTag: varchar("submission_tag", { length: 120 }),
  /** Phase 7: target objkt curation slug, when submissions attach post-mint. */
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
    /** Phase 7: origin of the submission row — `manual` by default, `mint_watcher` when the FA2 mint watcher auto-linked a tagged mint. */
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
    operatorWalletRunId: integer("operator_wallet_run_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("reward_ledger_user_idx").on(table.userId),
    index("reward_ledger_paid_idx").on(table.paid),
    index("reward_ledger_operator_wallet_run_idx").on(table.operatorWalletRunId),
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

export const inAppMarketItems = pgTable(
  "in_app_market_items",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 80 }).unique().notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 40 }).default("desktop_pet").notNull(),
    priceWtfUnits: numeric("price_wtf_units", { precision: 40, scale: 0 }).notNull(),
    priceExp: integer("price_exp").default(0).notNull(),
    contractAddress: varchar("contract_address", { length: 40 }),
    contractListingId: integer("contract_listing_id"),
    active: boolean("active").default(true).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_items_category_idx").on(table.category, table.active),
    uniqueIndex("in_app_market_items_contract_listing_idx").on(
      table.contractAddress,
      table.contractListingId
    ),
  ]
);

export const inAppMarketPaymentIntents = pgTable(
  "in_app_market_payment_intents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    purchaseRef: varchar("purchase_ref", { length: 128 }).unique().notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    walletAddress: varchar("wallet_address", { length: 40 }),
    items: jsonb("items").default(sql`'[]'::jsonb`).notNull(),
    subtotalWtfUnits: numeric("subtotal_wtf_units", {
      precision: 40,
      scale: 0,
    })
      .default("0")
      .notNull(),
    subtotalExp: integer("subtotal_exp").default(0).notNull(),
    estimatedFeeMutez: integer("estimated_fee_mutez").default(0).notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    contractAddress: varchar("contract_address", { length: 40 }),
    routerListingId: integer("router_listing_id").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_intents_user_status_idx").on(table.userId, table.status),
    index("in_app_market_intents_purchase_ref_idx").on(table.purchaseRef),
  ]
);

export const inAppMarketPurchases = pgTable(
  "in_app_market_purchases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    walletAddress: varchar("wallet_address", { length: 40 }),
    sku: varchar("sku", { length: 80 }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    currency: varchar("currency", { length: 8 }).default("wtf").notNull(),
    amountWtfUnits: numeric("amount_wtf_units", {
      precision: 40,
      scale: 0,
    }).notNull(),
    amountExp: integer("amount_exp").default(0).notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    tzktTransferId: bigint("tzkt_transfer_id", { mode: "number" }),
    contractAddress: varchar("contract_address", { length: 40 }),
    contractListingId: integer("contract_listing_id"),
    purchaseRef: varchar("purchase_ref", { length: 128 }),
    paymentIntentId: integer("payment_intent_id").references(
      () => inAppMarketPaymentIntents.id,
      { onDelete: "set null" }
    ),
    status: varchar("status", { length: 24 }).default("confirmed").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_purchases_user_idx").on(table.userId, table.createdAt),
    index("in_app_market_purchases_wallet_idx").on(table.walletAddress),
    index("in_app_market_purchases_op_hash_idx").on(table.opHash),
    index("in_app_market_purchases_ref_idx").on(table.purchaseRef),
    uniqueIndex("in_app_market_purchases_tzkt_sku_idx")
      .on(table.tzktTransferId, table.sku)
      .where(sql`${table.tzktTransferId} IS NOT NULL`),
  ]
);

export const inAppInventoryItems = pgTable(
  "in_app_inventory_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sku: varchar("sku", { length: 80 }).notNull(),
    quantity: integer("quantity").default(0).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    lastPurchaseId: integer("last_purchase_id").references(
      () => inAppMarketPurchases.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("in_app_inventory_user_sku_idx").on(table.userId, table.sku),
    index("in_app_inventory_user_idx").on(table.userId),
  ]
);

export const inAppMarketSyncState = pgTable("in_app_market_sync_state", {
  key: varchar("key", { length: 80 }).primaryKey(),
  lastTransferId: bigint("last_transfer_id", { mode: "number" })
    .default(0)
    .notNull(),
  lastStatus: varchar("last_status", { length: 24 }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

export const inAppMarketPurchasesRelations = relations(
  inAppMarketPurchases,
  ({ one }) => ({
    user: one(users, {
      fields: [inAppMarketPurchases.userId],
      references: [users.id],
    }),
    paymentIntent: one(inAppMarketPaymentIntents, {
      fields: [inAppMarketPurchases.paymentIntentId],
      references: [inAppMarketPaymentIntents.id],
    }),
  })
);

export const inAppInventoryItemsRelations = relations(
  inAppInventoryItems,
  ({ one }) => ({
    user: one(users, {
      fields: [inAppInventoryItems.userId],
      references: [users.id],
    }),
    lastPurchase: one(inAppMarketPurchases, {
      fields: [inAppInventoryItems.lastPurchaseId],
      references: [inAppMarketPurchases.id],
    }),
  })
);

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: text("value"),
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
    // Stable "TV dial" number shown to viewers and used in embed URLs.
    // Unique across the platform (partial unique index in DDL).  A
    // boot-time seeder pins dial 1=opeculiar, dial 2=yoeshi, dial 3=WTF TV,
    // dial 69=platform admin channel; everything else auto-fills from 4.
    dialNumber: integer("dial_number"),
    // Server-authoritative bumper cadence — one bumper is inserted into
    // the stream queue every N playlist items.  0 disables bumpers for
    // the channel.  Range is clamped to [0, 20] by the DDL migration.
    videosPerBumper: integer("videos_per_bumper").default(4).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_channel_owner_idx").on(table.ownerUserId),
    index("tv_channel_sort_idx").on(table.ownerUserId, table.sortOrder),
    uniqueIndex("tv_channel_slug_unique_idx").on(table.slug),
    uniqueIndex("tv_channel_owner_slug_unique_idx").on(table.ownerUserId, table.slug),
    uniqueIndex("tv_channel_dial_number_unique_idx").on(table.dialNumber),
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

// Single-row monotonic dial allocator used by tv boot backfill + channel creation.
// Keep this in schema so drizzle push treats it as managed and does not drop it.
export const tvDialCounter = pgTable("tv_dial_counter", {
  id: smallint("id").primaryKey().default(1),
  nextDial: integer("next_dial").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    // FK back to user_media_library when the channel-video was sourced
    // from a user's personal media library.  ON DELETE CASCADE so
    // removing a media-library item sweeps the channel-video and its
    // playlist items, killing "shell videos" at the root.
    mediaItemId: integer("media_item_id")
      .references(() => userMediaLibrary.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_video_channel_idx").on(table.channelId),
    index("tv_channel_videos_media_item_idx").on(table.mediaItemId),
    uniqueIndex("tv_video_unique_token_per_channel_idx").on(
      table.channelId,
      table.tokenContract,
      table.tokenId
    ),
    uniqueIndex("tv_channel_videos_channel_media_unique_idx").on(
      table.channelId,
      table.mediaItemId
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
    uniqueIndex("tv_playlist_one_active_per_channel_idx")
      .on(table.channelId)
      .where(sql`${table.isActive} = true`),
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
  "upload",
  "ipfs",
  "objkt",
  "teia",
  "external",
  "generated",
]);

export const mediaStatusEnum = pgEnum("tv_media_status", [
  "draft",
  "processing",
  "ready",
  "blocked",
]);

export const mediaCacheStatusEnum = pgEnum("tv_media_cache_status", [
  "cached",
  "not_cached",
  "caching",
  "failed",
  "evicted",
  "source_missing",
  "needs_repair",
]);

export const userMediaLibrary = pgTable(
  "user_media_library",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    ownerWallet: varchar("owner_wallet", { length: 80 }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    sourceType: mediaSourceTypeEnum("source_type").default("ipfs").notNull(),
    sourceUrl: text("source_url").notNull(),
    playbackUrl: text("playback_url"),
    posterUrl: text("poster_url"),
    objectStorageBucket: varchar("object_storage_bucket", { length: 255 }),
    objectStorageKey: text("object_storage_key"),
    objectStorageRegion: varchar("object_storage_region", { length: 120 }),
    objectStorageEndpoint: text("object_storage_endpoint"),
    originalFilename: text("original_filename"),
    safeFilename: text("safe_filename"),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    uploadStatus: varchar("upload_status", { length: 30 }).default("ready").notNull(),
    cacheStatus: mediaCacheStatusEnum("cache_status").default("not_cached").notNull(),
    hotCachePath: text("hot_cache_path"),
    thumbnailCachePath: text("thumbnail_cache_path"),
    transcodedCachePath: text("transcoded_cache_path"),
    lastCachedAt: timestamp("last_cached_at"),
    lastAccessedAt: timestamp("last_accessed_at"),
    status: mediaStatusEnum("status").default("ready").notNull(),
    metadata: jsonb("metadata"),
    tokenContract: varchar("token_contract", { length: 36 }),
    tokenId: text("token_id"),
    mediaCategory: varchar("media_category", { length: 30 }).default("other").notNull(),
    fileData: text("file_data"),
    fileSize: integer("file_size"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("uml_owner_idx").on(table.ownerUserId),
    index("uml_status_idx").on(table.status),
    index("uml_cache_status_idx").on(table.cacheStatus),
    index("uml_object_key_idx").on(table.objectStorageBucket, table.objectStorageKey),
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

export const objectStorageUsageChecks = pgTable(
  "object_storage_usage_checks",
  {
    id: serial("id").primaryKey(),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    endpoint: text("endpoint"),
    region: varchar("region", { length: 120 }),
    usedBytes: bigint("used_bytes", { mode: "number" }).default(0).notNull(),
    limitBytes: bigint("limit_bytes", { mode: "number" }).default(0).notNull(),
    percentUsed: numeric("percent_used", { precision: 8, scale: 6 }).default("0").notNull(),
    level: varchar("level", { length: 30 }).default("ok").notNull(),
    uploadsProtected: boolean("uploads_protected").default(false).notNull(),
    accountingSource: varchar("accounting_source", { length: 30 }).default("database").notNull(),
    objectCount: integer("object_count").default(0).notNull(),
    error: text("error"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    index("object_storage_usage_checked_idx").on(table.checkedAt),
    index("object_storage_usage_bucket_idx").on(table.bucket),
  ]
);

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

// ─── Analytics Phase 1 — honest cost/sale/market tracking ────────────
//
// These tables back the per-token P&L view, the portfolio cockpit, and
// the market-summary feed.  They are additive: gallery, cockpit, and
// the legacy walletHoldings pipeline keep working unchanged.
//
// Import path (initial load):
//   1) `objkt-advisor-db-2026-02-26/*.csv`  → frozen Tezos-Intel export
//      lands in `tokenSales`, `tokenMintEvents`, `xtzUsdDaily`, plus
//      market-summary extracts.
//   2) TzKT gap-fill worker covers Feb 26 2026 → now, plus any 0-XTZ
//      sales Tezos-Intel filtered out, plus royalty/platform-fee rows
//      enriched from operation metadata.
//   3) Objkt GraphQL provides current listings + floor → `tokenListings`
//      and `tokenMarketSummary`.
//
// All monetary columns use mutez (bigint) for XTZ so we never lose
// precision on rounding trips.  `numeric` columns are USD quotes kept
// at 6-decimal precision to match tzkt_quotes shape.

/**
 * Daily XTZ → USD close (chosen source: `tzkt_quotes`).
 *
 * One row per UTC day.  Used to stamp USD equivalents onto lots, sales,
 * and portfolio P&L calculations without re-querying the quote feed at
 * render time.  `price_usd` uses 6 decimals to preserve sub-cent
 * precision for mutez-level math.
 */
export const xtzUsdDaily = pgTable(
  "xtz_usd_daily",
  {
    day: date("day").primaryKey(),
    priceUsd: numeric("price_usd", { precision: 18, scale: 6 }).notNull(),
    /** Which feed supplied the price — tzkt_quotes | coingecko | manual */
    source: varchar("source", { length: 64 }).notNull().default("tzkt_quotes"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    idxSource: index("idx_xtz_usd_daily_source").on(t.source),
  })
);

/**
 * Canonical mint events for each edition of each token.
 *
 * Sourced from Tezos-Intel's `mint_events.csv` (ledger-derived) plus
 * ongoing TzKT token_transfers filters.  We keep this separate from
 * `tokenMetadata` so that re-mints, editions, and burn/remint cycles
 * all survive.  Used to compute "unique owners over time" and the
 * primary-market price per token edition.
 */
export const tokenMintEvents = pgTable(
  "token_mint_events",
  {
    id: serial("id").primaryKey(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    /** Editions minted in this single op.  Usually 1, can be N for batch mints. */
    editions: integer("editions").default(1).notNull(),
    minterAddress: varchar("minter_address", { length: 64 }),
    /** Address that first received the edition (may equal minter for self-mints). */
    firstOwner: varchar("first_owner", { length: 64 }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    mintedAt: timestamp("minted_at", { withTimezone: true }).notNull(),
    /** Marketplace / primary-sale platform, when mint came via one. */
    platform: varchar("platform", { length: 64 }),
    /** Objkt-style event id, if we know it. */
    objktEventId: text("objkt_event_id"),
    /** Mint fee paid to the protocol, in mutez. */
    mintFeeMutez: bigint("mint_fee_mutez", { mode: "bigint" }),
    source: varchar("source", { length: 64 }).notNull().default("intel_csv"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOp: uniqueIndex("uniq_mint_op").on(
      t.tokenContract,
      t.tokenId,
      t.opHash
    ),
    idxToken: index("idx_mint_events_token").on(t.tokenContract, t.tokenId),
    idxMinter: index("idx_mint_events_minter").on(t.minterAddress),
    idxMintedAt: index("idx_mint_events_minted_at").on(t.mintedAt),
  })
);

/**
 * Every non-zero and zero-XTZ sale we know about for every token.
 *
 * Transfer-only (no consideration, no marketplace) rows are **excluded**
 * per spec — zero-XTZ sales that went through a marketplace contract
 * are **included** because the user asked for them explicitly.
 *
 * Columns line up with `objkt-advisor-db-2026-02-26/sales.csv` so we
 * can COPY FROM STDIN into a staging table and INSERT...SELECT with
 * very little transformation.
 */
export const tokenSales = pgTable(
  "token_sales",
  {
    id: serial("id").primaryKey(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    /** Upstream event id (intel had its own PK).  Nullable for TzKT rows. */
    legacyId: bigint("legacy_id", { mode: "number" }),
    /** TzKT internal `id` (from `/v1/operations/...`).  Nullable until enriched. */
    tzktOpId: bigint("tzkt_op_id", { mode: "number" }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    /**
     * Nullable — historic Objkt-GraphQL rows (2021-2023) consistently
     * fill buyer but leave seller blank.  We keep them because they
     * give us the buyer's acquisition cost-basis, which is the side
     * of the trade that matters for per-wallet analytics.
     */
    sellerAddress: varchar("seller_address", { length: 64 }),
    buyerAddress: varchar("buyer_address", { length: 64 }).notNull(),
    /** Mutez, always >=0. 0 means "marketplace sale with no consideration". */
    priceMutez: bigint("price_mutez", { mode: "bigint" }).notNull(),
    /** Snapshot of day-level USD equivalent at the time of the sale. */
    priceUsd: numeric("price_usd", { precision: 24, scale: 6 }),
    royaltiesMutez: bigint("royalties_mutez", { mode: "bigint" }).default(sql`0`),
    platformFeeMutez: bigint("platform_fee_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    marketplace: varchar("marketplace", { length: 64 }),
    /** Objkt-style event id, if we know it. */
    objktEventId: text("objkt_event_id"),
    /** TRUE if seller is the minter (and the edition had no prior sale). */
    isPrimary: boolean("is_primary").default(false).notNull(),
    editionsSold: integer("editions_sold").default(1).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 64 }).notNull().default("intel_csv"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOp: uniqueIndex("uniq_sales_ophash").on(
      t.opHash,
      t.tokenContract,
      t.tokenId,
      t.sellerAddress,
      t.buyerAddress
    ),
    idxToken: index("idx_sales_token").on(t.tokenContract, t.tokenId),
    idxSeller: index("idx_sales_seller").on(t.sellerAddress),
    idxBuyer: index("idx_sales_buyer").on(t.buyerAddress),
    idxSoldAt: index("idx_sales_sold_at").on(t.soldAt),
    idxIsPrimary: index("idx_sales_primary").on(t.isPrimary),
    idxMarketplace: index("idx_sales_marketplace").on(t.marketplace),
  })
);

/**
 * Per-acquisition lots — one row per edition acquired by a wallet.
 *
 * This is the honest cost-basis store.  The gallery + cockpit derive
 * "average price paid", "realized P&L", and "unrealised P&L" by joining
 * this table with the current balance and latest market summary.
 *
 * We keep per-lot rows (not aggregated) so the user's spec choice of
 * "store per-lot, derive at query time" holds: a single wallet that
 * bought 3 editions at 3 different prices has 3 rows here.  A sale
 * later closes one of them (`disposedAt`, `saleId`).
 */
export const acquisitionLots = pgTable(
  "acquisition_lots",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    /** Editions acquired in this lot.  Almost always 1; batches bump it. */
    editions: integer("editions").default(1).notNull(),
    acquisitionType: varchar("acquisition_type", { length: 24 })
      .notNull()
      .default("purchase"), // purchase | mint | airdrop | transfer_in | swap
    costMutez: bigint("cost_mutez", { mode: "bigint" }).notNull(),
    costUsd: numeric("cost_usd", { precision: 24, scale: 6 }),
    royaltiesMutez: bigint("royalties_mutez", { mode: "bigint" }).default(sql`0`),
    platformFeeMutez: bigint("platform_fee_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    marketplace: varchar("marketplace", { length: 64 }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull(),
    /** If the lot has been disposed of, when & which sale closed it. */
    disposedAt: timestamp("disposed_at", { withTimezone: true }),
    saleId: integer("sale_id"),
    source: varchar("source", { length: 64 }).notNull().default("derived"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqLot: uniqueIndex("uniq_acq_lot").on(
      t.walletAddress,
      t.tokenContract,
      t.tokenId,
      t.opHash
    ),
    idxWallet: index("idx_acq_lots_wallet").on(t.walletAddress),
    idxToken: index("idx_acq_lots_token").on(t.tokenContract, t.tokenId),
    idxOpen: index("idx_acq_lots_open").on(t.disposedAt),
    idxAcquiredAt: index("idx_acq_lots_acquired_at").on(t.acquiredAt),
  })
);

/**
 * Live / historic listings per token.  Populated by the listings
 * refresh worker (Objkt GraphQL + fallback TzKT bigmap reads).
 *
 * We keep a single row per listing (objkt listing id) with an
 * `active` flag + `cancelledAt` / `soldAt` so we can reconstruct the
 * listing timeline and compute "highest listing ever" / "average
 * listing price" metrics without fighting the current-state feed.
 */
export const tokenListings = pgTable(
  "token_listings",
  {
    id: serial("id").primaryKey(),
    /** Marketplace-native listing id (objkt listing #, fxhash offer id…). */
    listingId: text("listing_id").notNull(),
    marketplace: varchar("marketplace", { length: 64 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    sellerAddress: varchar("seller_address", { length: 64 }).notNull(),
    priceMutez: bigint("price_mutez", { mode: "bigint" }).notNull(),
    priceUsd: numeric("price_usd", { precision: 24, scale: 6 }),
    royaltyBps: integer("royalty_bps"),
    editions: integer("editions").default(1).notNull(),
    active: boolean("active").default(true).notNull(),
    listedAt: timestamp("listed_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    source: varchar("source", { length: 64 }).notNull().default("objkt_gql"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqListing: uniqueIndex("uniq_token_listing").on(
      t.marketplace,
      t.listingId
    ),
    idxToken: index("idx_listings_token").on(t.tokenContract, t.tokenId),
    idxActive: index("idx_listings_active").on(t.active),
    idxSeller: index("idx_listings_seller").on(t.sellerAddress),
    idxListedAt: index("idx_listings_listed_at").on(t.listedAt),
  })
);

/**
 * Materialised per-token market summary.  One row per token — it is
 * the denormalised cache the gallery/dossier reads from.
 *
 * Refreshed by `workers/market-summary.ts` every N minutes, and
 * inline after an import run so the UI never serves a cold row.
 * Treat this as derived state: safe to drop + rebuild from
 * `tokenSales` + `tokenListings`.
 */
export const tokenMarketSummary = pgTable(
  "token_market_summary",
  {
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    // Sale metrics (all sales incl. 0-XTZ marketplace rows).
    lastSaleMutez: bigint("last_sale_mutez", { mode: "bigint" }),
    lastSaleAt: timestamp("last_sale_at", { withTimezone: true }),
    highestSaleMutez: bigint("highest_sale_mutez", { mode: "bigint" }),
    lowestSaleMutez: bigint("lowest_sale_mutez", { mode: "bigint" }),
    averageSaleMutez: bigint("average_sale_mutez", { mode: "bigint" }),
    totalVolumeMutez: bigint("total_volume_mutez", { mode: "bigint" }).default(
      sql`0`
    ),
    saleCount: integer("sale_count").default(0).notNull(),
    primarySaleCount: integer("primary_sale_count").default(0).notNull(),
    secondarySaleCount: integer("secondary_sale_count").default(0).notNull(),
    // Listing metrics (active only).
    currentFloorMutez: bigint("current_floor_mutez", { mode: "bigint" }),
    currentHighestListingMutez: bigint("current_highest_listing_mutez", {
      mode: "bigint",
    }),
    averageActiveListingMutez: bigint("average_active_listing_mutez", {
      mode: "bigint",
    }),
    activeListingCount: integer("active_listing_count").default(0).notNull(),
    // Owner metrics.
    uniqueOwnersCount: integer("unique_owners_count").default(0).notNull(),
    // Fees / royalties lifetime.
    totalRoyaltiesMutez: bigint("total_royalties_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    totalPlatformFeesMutez: bigint("total_platform_fees_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    refreshedAt: timestamp("refreshed_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({
      name: "pk_token_market_summary",
      columns: [t.tokenContract, t.tokenId],
    }),
    idxFloor: index("idx_market_floor").on(t.currentFloorMutez),
    idxLastSaleAt: index("idx_market_last_sale_at").on(t.lastSaleAt),
  })
);

// ─── Relations for analytics tables ───────────────────────────────────
//
// We only model relations that drizzle query-builders need.  The big
// per-wallet joins stay in raw SQL for speed; these relations let the
// token-detail view pull `sales + listings + mints + market_summary`
// in a single `db.query.tokenMetadata.findFirst({ with: ... })` call.

export const tokenSalesRelations = relations(tokenSales, ({ one }) => ({
  seller: one(addressLabels, {
    fields: [tokenSales.sellerAddress],
    references: [addressLabels.address],
  }),
  buyer: one(addressLabels, {
    fields: [tokenSales.buyerAddress],
    references: [addressLabels.address],
  }),
}));

export const acquisitionLotsRelations = relations(
  acquisitionLots,
  ({ one }) => ({
    wallet: one(addressLabels, {
      fields: [acquisitionLots.walletAddress],
      references: [addressLabels.address],
    }),
    closingSale: one(tokenSales, {
      fields: [acquisitionLots.saleId],
      references: [tokenSales.id],
    }),
  })
);

export const tokenListingsRelations = relations(tokenListings, ({ one }) => ({
  seller: one(addressLabels, {
    fields: [tokenListings.sellerAddress],
    references: [addressLabels.address],
  }),
}));

// ─── Backfill manifest ────────────────────────────────────────────────
//
// Central queue of "things we know we're missing".  Seeders enumerate
// gaps (missing sellers on historic sales, wallets without full TzKT
// history, unlabeled addresses, xtz-price-date-gaps, tokens without
// market data, …) and upsert rows here.  A dispatcher worker claims
// batches, runs per-task-type handlers, respects rate limits, and
// marks rows done or retries on failure with exponential backoff.
//
// This gives us an answer to "what's still missing" without asking
// an operator to run manual backfill scripts — the system drains the
// manifest in the background for as long as there's work to do.
//
// Task types (keep strings short, stable — used as a discriminator):
//   • xtz_price_gap      → fetch 1 missing day of XTZ/USD from TzKT Quotes
//   • address_label      → enrich a single address (Tezos Domains + Objkt alias + TzKT contract)
//   • sale_reconcile     → replace synthetic ophash / missing seller on a token_sales row
//   • wallet_history     → paginate TzKT activity for a wallet from last_synced → now
//   • token_market       → refresh active listings / floor / last-sale for a token
//   • token_mint_enrich  → fill mint fee / platform from TzKT for a mint_event row
//   • acquisition_resolve→ resolve the real mint/sale row for a held token whose only
//                          evidence is a wallet_events row (fills cost basis in bulk)
//
// Priority: lower number = sooner.  Seeders default priority:
//   0  user-connected-wallet tasks (explicit user care)
//   10 tokens actively held by user wallets
//   20 1-degree neighbours
//   50 bulk historic reconciliation
//   90 everything else
//
// Status transitions: pending → in_progress → completed|failed|skipped
//   failed + attempts<max → next_attempt_at scheduled → pending on next poll
export const backfillManifest = pgTable(
  "backfill_manifest",
  {
    id: serial("id").primaryKey(),
    /** Discriminator.  See comment above for the stable set of values. */
    taskType: varchar("task_type", { length: 32 }).notNull(),
    /**
     * Stable string identifier of the thing we're filling in.  Keeps
     * the unique index small and indexable.  Examples:
     *   xtz_price_gap       → "2021-07-05"
     *   address_label       → "tz1abc…"
     *   sale_reconcile      → "<op_hash>|<contract>|<token_id>|<buyer>"
     *   wallet_history      → "tz1abc…"
     *   token_market        → "<contract>|<token_id>"
     *   token_mint_enrich   → "<op_hash>|<contract>|<token_id>"
     *   acquisition_resolve → "<wallet>|<contract>|<token_id>"
     */
    target: text("target").notNull(),
    /** Optional JSON payload (any extra context the handler needs). */
    payload: jsonb("payload"),
    /** Lower = sooner.  Use 0..100. */
    priority: integer("priority").default(50).notNull(),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(6).notNull(),
    /** Last error captured from a failed handler run (stack trimmed). */
    lastError: text("last_error"),
    /** Most-recent wall time the dispatcher claimed this row. */
    lastAttemptAt: timestamp("last_attempt_at"),
    /** Earliest wall time the dispatcher may re-attempt after a failure. */
    nextAttemptAt: timestamp("next_attempt_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    /** One manifest row per (task_type, target).  Seeders upsert. */
    uniqTaskTarget: uniqueIndex("uniq_backfill_task_target").on(
      t.taskType,
      t.target
    ),
    /** Dispatcher claim index. */
    idxDispatch: index("idx_backfill_dispatch").on(
      t.status,
      t.priority,
      t.nextAttemptAt
    ),
    idxTaskType: index("idx_backfill_task_type").on(t.taskType),
  })
);

// ═══════════════════════════════════════════════════════════════
// Phase 2 — Gameshow contestant roster + operator audit log
// ═══════════════════════════════════════════════════════════════

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

export const operatorActions = pgTable(
  "operator_actions",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actionKind: varchar("action_kind", { length: 80 }).notNull(),
    targetKind: varchar("target_kind", { length: 40 }).notNull(),
    targetId: integer("target_id"),
    payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    ip: varchar("ip", { length: 64 }),
  },
  (t) => ({
    idxActorCreated: index("operator_actions_actor_created_idx").on(
      t.actorUserId,
      t.createdAt
    ),
    idxTarget: index("operator_actions_target_idx").on(t.targetKind, t.targetId),
  })
);

// ═══════════════════════════════════════════════════════════════
// Phase 10 — WTF recapture (closed buyback + auctions + attestations)
// ═══════════════════════════════════════════════════════════════

export const buybackWindows = pgTable("buyback_windows", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  contractAddress: varchar("contract_address", { length: 40 }).notNull(),
  network: collectionContractNetworkEnum("network").default("ghostnet").notNull(),
  status: buybackWindowStatusEnum("status").default("draft").notNull(),
  rateMutezPerWtf: numeric("rate_mutez_per_wtf", { precision: 40, scale: 0 }).notNull(),
  perSellerCapWtf: numeric("per_seller_cap_wtf", { precision: 40, scale: 0 }).notNull(),
  totalXtzBudgetMutez: numeric("total_xtz_budget_mutez", {
    precision: 40,
    scale: 0,
  }).notNull(),
  opensAt: timestamp("opens_at").notNull(),
  closesAt: timestamp("closes_at").notNull(),
  merkleRoot: varchar("merkle_root", { length: 80 }),
  snapshotMinBalanceWtf: numeric("snapshot_min_balance_wtf", {
    precision: 40,
    scale: 0,
  })
    .default("0")
    .notNull(),
  snapshotBlockLevel: integer("snapshot_block_level"),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  operatorFundRunId: integer("operator_fund_run_id"),
  operatorWithdrawXtzRunId: integer("operator_withdraw_xtz_run_id"),
  operatorWithdrawWtfRunId: integer("operator_withdraw_wtf_run_id"),
  swapsObserved: integer("swaps_observed").default(0).notNull(),
  wtfRecaptured: numeric("wtf_recaptured", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  xtzDispensedMutez: numeric("xtz_dispensed_mutez", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const buybackAllowlist = pgTable("buyback_allowlist", {
  id: serial("id").primaryKey(),
  windowId: integer("window_id")
    .references(() => buybackWindows.id, { onDelete: "cascade" })
    .notNull(),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  maxWtf: numeric("max_wtf", { precision: 40, scale: 0 }).notNull(),
  snapshotBalanceWtf: numeric("snapshot_balance_wtf", {
    precision: 40,
    scale: 0,
  }).notNull(),
  merkleProof: jsonb("merkle_proof").notNull(),
  eligibilityReason: varchar("eligibility_reason", { length: 40 }).notNull(),
  swappedWtf: numeric("swapped_wtf", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  swappedAt: timestamp("swapped_at"),
  swapOpHash: varchar("swap_op_hash", { length: 80 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wtfAuctions = pgTable("wtf_auctions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  perkKind: varchar("perk_kind", { length: 60 }).notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  minBidWtf: numeric("min_bid_wtf", { precision: 40, scale: 0 })
    .default("1")
    .notNull(),
  bidIncrementWtf: numeric("bid_increment_wtf", { precision: 40, scale: 0 })
    .default("1")
    .notNull(),
  status: wtfAuctionStatusEnum("status").default("draft").notNull(),
  winningBidId: integer("winning_bid_id"),
  settlementOpHash: varchar("settlement_op_hash", { length: 80 }),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wtfAuctionBids = pgTable("wtf_auction_bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id")
    .references(() => wtfAuctions.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const wtfRecaptureEvents = pgTable("wtf_recapture_events", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  source: varchar("source", { length: 40 }).notNull(),
  sourceRefId: integer("source_ref_id"),
  amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
  opHash: varchar("op_hash", { length: 80 }),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Phase 9 — operator wallet runs + cached balances. DDL lives in
// gameshow-boot-backfill.ts; this block just mirrors it in Drizzle
// so the TypeScript routes can reference columns type-safely.
// ═══════════════════════════════════════════════════════════════

export const operatorWalletIntentEnum = pgEnum("operator_wallet_intent", [
  "disburse_wtf",
  "fund_buyback",
  "withdraw_buyback_xtz",
  "withdraw_buyback_wtf",
  "pause_buyback",
  "unpause_buyback",
  "custom",
]);

export const operatorWalletAssetKindEnum = pgEnum(
  "operator_wallet_asset_kind",
  ["fa2", "xtz"]
);

export const operatorWalletRunStatusEnum = pgEnum(
  "operator_wallet_run_status",
  ["prepared", "broadcasting", "confirmed", "failed", "cancelled"]
);

export const operatorWalletRuns = pgTable("operator_wallet_runs", {
  id: serial("id").primaryKey(),
  preparedBy: integer("prepared_by").references(() => users.id, {
    onDelete: "set null",
  }),
  signedBy: varchar("signed_by", { length: 80 }),
  opHash: varchar("op_hash", { length: 80 }),
  intent: operatorWalletIntentEnum("intent").notNull(),
  assetKind: operatorWalletAssetKindEnum("asset_kind").notNull(),
  assetContract: varchar("asset_contract", { length: 40 }),
  assetTokenId: varchar("asset_token_id", { length: 40 }),
  totalRecipients: integer("total_recipients").default(0).notNull(),
  totalAmount: numeric("total_amount", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  counterpartyContract: varchar("counterparty_contract", { length: 40 }),
  payload: jsonb("payload"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: operatorWalletRunStatusEnum("status").default("prepared").notNull(),
  errorMessage: text("error_message"),
  notes: text("notes"),
});

export const operatorWalletBalances = pgTable("operator_wallet_balances", {
  id: serial("id").primaryKey(),
  assetKind: operatorWalletAssetKindEnum("asset_kind").notNull(),
  assetContract: varchar("asset_contract", { length: 40 }),
  assetTokenId: varchar("asset_token_id", { length: 40 }),
  balance: numeric("balance", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  lowThreshold: numeric("low_threshold", { precision: 40, scale: 0 }),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Phase 8 — Collection factory (templates + per-origination rows).
// ═══════════════════════════════════════════════════════════════

export const collectionTemplateKindEnum = pgEnum(
  "collection_template_kind",
  [
    "teia_one_of_one",
    "open_edition",
    "bonding_curve",
    "blind_mint",
    "buyback",
  ]
);

export const collectionContractStatusEnum = pgEnum(
  "collection_contract_status",
  ["pending", "originating", "live", "failed", "retired"]
);

export const collectionTemplates = pgTable("collection_templates", {
  id: serial("id").primaryKey(),
  kind: collectionTemplateKindEnum("kind").notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  summary: text("summary"),
  sourcePath: varchar("source_path", { length: 400 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionContracts = pgTable("collection_contracts", {
  id: serial("id").primaryKey(),
  templateKind: collectionTemplateKindEnum("template_kind").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  address: varchar("address", { length: 40 }),
  network: collectionContractNetworkEnum("network").notNull(),
  status: collectionContractStatusEnum("status").default("pending").notNull(),
  collectionMeta: jsonb("collection_meta"),
  originationParams: jsonb("origination_params"),
  opHash: varchar("op_hash", { length: 80 }),
  deployedByUserId: integer("deployed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  operatorRunId: integer("operator_run_id"),
  errorMessage: text("error_message"),
  deployedAt: timestamp("deployed_at"),
  retiredAt: timestamp("retired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Phase 3 — Calendar + tickets.
// ═══════════════════════════════════════════════════════════════

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

export const calendarTicketStatusEnum = pgEnum("calendar_ticket_status", [
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "cancelled",
]);

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

// ═══════════════════════════════════════════════════════════════
// Phase 4 — Attendance (Discord voice + stage, X Space in-app).
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Dicksword — Discord identity, activity, avatars, and role sync.
// ═══════════════════════════════════════════════════════════════

export const discordClaimStatusEnum = pgEnum("discord_claim_status", [
  "pending",
  "claimed",
  "expired",
  "cancelled",
]);

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

export const discordAvatarLayerTypeEnum = pgEnum("discord_avatar_layer_type", [
  "base",
  "accessory",
]);

export const discordIdentityClaims = pgTable(
  "discord_identity_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    codeHash: varchar("code_hash", { length: 128 }).unique().notNull(),
    status: discordClaimStatusEnum("status").default("pending").notNull(),
    discordUserId: varchar("discord_user_id", { length: 100 }),
    discordHandle: varchar("discord_handle", { length: 120 }),
    discordGuildId: varchar("discord_guild_id", { length: 100 }),
    claimedAt: timestamp("claimed_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("discord_claims_user_status_idx").on(table.userId, table.status),
    index("discord_claims_discord_user_idx").on(table.discordUserId),
  ]
);

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

export const discordRoleMappings = pgTable(
  "discord_role_mappings",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).unique().notNull(),
    label: varchar("label", { length: 140 }).notNull(),
    roleId: varchar("role_id", { length: 100 }).notNull(),
    roleKind: varchar("role_kind", { length: 40 }).default("custom").notNull(),
    protected: boolean("protected").default(false).notNull(),
    managed: boolean("managed").default(true).notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("discord_role_mappings_role_idx").on(table.roleId)]
);

export const discordAvatarLayers = pgTable(
  "discord_avatar_layers",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 120 }).unique().notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    layerType: discordAvatarLayerTypeEnum("layer_type").notNull(),
    stackOrder: integer("stack_order").default(0).notNull(),
    assetUrl: text("asset_url").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    metadataJson: jsonb("metadata_json").default(sql`'{}'::jsonb`).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("discord_avatar_layers_stack_idx").on(table.stackOrder)]
);

export const discordAvatarLayerConflicts = pgTable(
  "discord_avatar_layer_conflicts",
  {
    id: serial("id").primaryKey(),
    layerId: integer("layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    conflictsWithLayerId: integer("conflicts_with_layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discord_avatar_conflict_pair_idx").on(
      table.layerId,
      table.conflictsWithLayerId
    ),
  ]
);

export const discordAvatarSelections = pgTable(
  "discord_avatar_selections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    layerId: integer("layer_id")
      .references(() => discordAvatarLayers.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discord_avatar_selection_unique_idx").on(
      table.userId,
      table.layerId
    ),
    index("discord_avatar_selection_user_idx").on(table.userId),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Phase 5 — CRP nominations watcher storage.
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Phase 6 — Console hi-score infrastructure.
// ═══════════════════════════════════════════════════════════════

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
  verificationMode: consoleVerificationModeEnum("verification_mode")
    .default("parent_postmessage")
    .notNull(),
  weirdVariantOf: varchar("weird_variant_of", { length: 120 }),
  hmacSecret: varchar("hmac_secret", { length: 200 }),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
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

// ── Tezonians discovery ─────────────────────────────────────────────────
export const tezonians = pgTable("tezonians", {
  id: serial("id").primaryKey(),
  twitterId: varchar("twitter_id", { length: 100 }).unique().notNull(),
  twitterHandle: varchar("twitter_handle", { length: 100 }),
  twitterName: varchar("twitter_name", { length: 200 }),
  profileImageUrl: text("profile_image_url"),
  discoveredVia: varchar("discovered_via", { length: 40 }).default("mention").notNull(),
  sourceTweetId: varchar("source_tweet_id", { length: 64 }),
  autoLiked: boolean("auto_liked").default(false).notNull(),
  userId: integer("user_id").references(() => users.id),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── User-saved group conversations ──────────────────────────────────────
export const userSavedConversations = pgTable(
  "user_saved_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    dmConversationId: varchar("dm_conversation_id", { length: 120 }).notNull(),
    label: varchar("label", { length: 200 }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    userConvoIdx: uniqueIndex("user_saved_convo_user_convo_idx").on(
      table.userId,
      table.dmConversationId,
    ),
  }),
);

// ── X DM Persistence (mirrors X API dm_events for cold-cache resilience) ──

export const xDmEvents = pgTable("x_dm_events", {
  eventId: varchar("event_id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversation_id", { length: 64 }).notNull(),
  senderTwitterId: varchar("sender_twitter_id", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull().default("MessageCreate"),
  text: text("text"),
  media: jsonb("media").$type<Array<Record<string, unknown>>>().default(sql`'[]'::jsonb`),
  senderData: jsonb("sender_data").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  fetchedByTokenOwner: varchar("fetched_by_token_owner", { length: 64 }),
});

export const xDmConversations = pgTable("x_dm_conversations", {
  conversationId: varchar("conversation_id", { length: 64 }).primaryKey(),
  conversationType: varchar("conversation_type", { length: 16 }).notNull().default("direct"),
  participantIds: jsonb("participant_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  lastEventId: varchar("last_event_id", { length: 64 }),
  lastEventAt: timestamp("last_event_at"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const xDmParticipants = pgTable("x_dm_participants", {
  twitterId: varchar("twitter_id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 100 }),
  displayName: varchar("display_name", { length: 200 }),
  profileImageUrl: text("profile_image_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── X Timeline Persistence (credit-efficient cache for /api/w/timeline) ──
export const xTimelinePosts = pgTable("x_timeline_posts", {
  id: varchar("id", { length: 64 }).primaryKey(), // tweet id
  authorTwitterId: varchar("author_twitter_id", { length: 64 }).notNull(),
  authorHandle: varchar("author_handle", { length: 32 }).notNull(),
  text: text("text"),
  displayText: text("display_text"),
  createdAt: timestamp("created_at").notNull(),
  rawJson: jsonb("raw_json").notNull().default(sql`'{}'::jsonb`),
  media: jsonb("media").$type<Array<any>>().default(sql`'[]'::jsonb`),
  links: jsonb("links").$type<Array<any>>().default(sql`'[]'::jsonb`),
  metrics: jsonb("metrics").$type<{
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }>().default(sql`'{"likes":0,"replies":0,"reposts":0,"quotes":0}'::jsonb`),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // e.g. createdAt + 7 days
}, (table) => ({
  authorIdx: index("x_timeline_author_idx").on(table.authorTwitterId),
  authorHandleIdx: index("x_timeline_author_handle_idx").on(table.authorHandle),
  createdIdx: index("x_timeline_created_idx").on(table.createdAt),
  expiresIdx: index("x_timeline_expires_idx").on(table.expiresAt),
}));

/** High-water marks for W timeline search worker (minimal X API credit path). */
export const xTimelineCursors = pgTable("x_timeline_cursors", {
  scopeKey: varchar("scope_key", { length: 128 }).primaryKey(),
  sinceId: varchar("since_id", { length: 64 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
