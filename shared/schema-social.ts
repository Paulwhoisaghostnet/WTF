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
