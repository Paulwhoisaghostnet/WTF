import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";

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

// ── X -> Tezos identity enrichment hints ────────────────────────────────
export const xTezosIdentityHints = pgTable(
  "x_tezos_identity_hints",
  {
    id: serial("id").primaryKey(),
    twitterHandle: varchar("twitter_handle", { length: 32 }).notNull(),
    tezosAddress: varchar("tezos_address", { length: 36 }).notNull(),
    alias: text("alias"),
    tzDomain: text("tz_domain"),
    source: varchar("source", { length: 64 }).notNull(),
    confidence: varchar("confidence", { length: 32 }).default("profile_link").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("x_tezos_identity_hint_unique_idx").on(
      table.twitterHandle,
      table.tezosAddress,
      table.source
    ),
    index("x_tezos_identity_hint_handle_idx").on(table.twitterHandle),
    index("x_tezos_identity_hint_address_idx").on(table.tezosAddress),
  ]
);

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

// ── W-owned X media uploads ─────────────────────────────────────────────
export const xWMediaUploads = pgTable(
  "x_w_media_uploads",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    xMediaId: varchar("x_media_id", { length: 64 }).notNull(),
    mediaCategory: varchar("media_category", { length: 40 }).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("x_w_media_uploads_media_unique_idx").on(table.xMediaId),
    index("x_w_media_uploads_owner_idx").on(table.ownerUserId),
    index("x_w_media_uploads_expiry_idx").on(table.expiresAt),
  ]
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

// ── Skywire / AT Protocol bridge ───────────────────────────────────────

export const atprotoHandleVerificationMethodEnum = pgEnum(
  "atproto_handle_verification_method",
  ["dns_txt", "https_well_known", "wtf_hosted_subdomain", "tezos_alias_only"]
);

export const atprotoHandleVerificationStatusEnum = pgEnum(
  "atproto_handle_verification_status",
  ["pending", "verified", "failed", "revoked"]
);

export const atprotoEventSourceEnum = pgEnum("atproto_event_source", [
  "bluesky",
  "atproto",
]);

export const atprotoPostClaimStatusEnum = pgEnum(
  "atproto_post_claim_status",
  ["pending", "verified", "rejected"]
);

export const atprotoAccounts = pgTable(
  "atproto_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    did: varchar("did", { length: 255 }).notNull(),
    handle: varchar("handle", { length: 255 }).notNull(),
    pdsUrl: text("pds_url"),
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    description: text("description"),
    indexedAt: timestamp("indexed_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    oauthIssuer: text("oauth_issuer"),
    oauthScopes: text("oauth_scopes"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    encryptedDpopKey: text("encrypted_dpop_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at"),
  },
  (table) => [
    uniqueIndex("atproto_accounts_user_active_unique")
      .on(table.userId)
      .where(sql`${table.disconnectedAt} IS NULL`),
    uniqueIndex("atproto_accounts_did_active_unique")
      .on(table.did)
      .where(sql`${table.disconnectedAt} IS NULL`),
    index("atproto_accounts_handle_idx").on(table.handle),
  ]
);

export const atprotoHandleClaims = pgTable(
  "atproto_handle_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    atprotoAccountId: integer("atproto_account_id").references(
      () => atprotoAccounts.id,
      { onDelete: "set null" }
    ),
    did: varchar("did", { length: 255 }).notNull(),
    desiredHandle: varchar("desired_handle", { length: 255 }).notNull(),
    tezosAlias: varchar("tezos_alias", { length: 255 }),
    wtfSubdomainGrantId: integer("wtf_subdomain_grant_id"),
    verificationMethod:
      atprotoHandleVerificationMethodEnum("verification_method").notNull(),
    verificationStatus: atprotoHandleVerificationStatusEnum(
      "verification_status"
    )
      .default("pending")
      .notNull(),
    proofToken: varchar("proof_token", { length: 128 }).notNull(),
    verifiedAt: timestamp("verified_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("atproto_handle_claims_user_handle_unique").on(
      table.userId,
      table.desiredHandle
    ),
    index("atproto_handle_claims_handle_status_idx").on(
      table.desiredHandle,
      table.verificationStatus
    ),
    index("atproto_handle_claims_user_idx").on(table.userId),
  ]
);

export const atprotoEvents = pgTable(
  "atproto_events",
  {
    id: serial("id").primaryKey(),
    stableEventId: varchar("stable_event_id", { length: 255 }).notNull(),
    source: atprotoEventSourceEnum("source").notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorDid: varchar("actor_did", { length: 255 }).notNull(),
    actorHandle: varchar("actor_handle", { length: 255 }),
    uri: text("uri"),
    cid: varchar("cid", { length: 255 }),
    collection: varchar("collection", { length: 255 }),
    rkey: varchar("rkey", { length: 255 }),
    text: text("text"),
    createdAtRemote: timestamp("created_at_remote"),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    processedAt: timestamp("processed_at"),
    challengeRelevant: boolean("challenge_relevant").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("atproto_events_stable_event_unique").on(table.stableEventId),
    index("atproto_events_actor_idx").on(table.actorDid),
    index("atproto_events_uri_cid_idx").on(table.uri, table.cid),
    index("atproto_events_type_idx").on(table.eventType),
  ]
);

export const atprotoPostClaims = pgTable(
  "atproto_post_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    challengeId: integer("challenge_id"),
    did: varchar("did", { length: 255 }).notNull(),
    handleAtClaimTime: varchar("handle_at_claim_time", { length: 255 }),
    postUri: text("post_uri").notNull(),
    postCid: varchar("post_cid", { length: 255 }),
    postText: text("post_text"),
    claimedFor: varchar("claimed_for", { length: 120 }).default("challenge").notNull(),
    verificationStatus: atprotoPostClaimStatusEnum("verification_status")
      .default("pending")
      .notNull(),
    rejectionReason: text("rejection_reason"),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("atproto_post_claims_user_challenge_uri_unique").on(
      table.userId,
      table.challengeId,
      table.claimedFor,
      table.postUri
    ),
    index("atproto_post_claims_user_idx").on(table.userId),
    index("atproto_post_claims_post_uri_idx").on(table.postUri),
  ]
);
