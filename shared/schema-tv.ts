import {
  pgTable,
  serial,
  text,
  integer,
  smallint,
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
import { users } from "./schema-core";

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
    // Optional FK when a user promotes an existing media-library video
    // into their personal/community bumper bucket. Uploaded bumpers
    // keep this null and continue serving from `data`.
    mediaItemId: integer("media_item_id")
      .references(() => userMediaLibrary.id, { onDelete: "cascade" }),
    // "personal" (default) or "community".  Community bumpers from
    // every user are mixed into the global pool so any channel may
    // play them.  Enforced per-user cap: 3 community + 20 personal.
    category: varchar("category", { length: 20 }).default("personal").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tv_bumper_owner_idx").on(table.ownerUserId),
    index("tv_bumper_category_idx").on(table.category),
    index("tv_bumper_media_item_idx").on(table.mediaItemId),
    uniqueIndex("tv_bumper_owner_media_category_unique_idx")
      .on(table.ownerUserId, table.mediaItemId, table.category)
      .where(sql`${table.mediaItemId} IS NOT NULL`),
  ]
);

export const tvBumpersRelations = relations(tvBumpers, ({ one }) => ({
  owner: one(users, {
    fields: [tvBumpers.ownerUserId],
    references: [users.id],
  }),
  mediaItem: one(userMediaLibrary, {
    fields: [tvBumpers.mediaItemId],
    references: [userMediaLibrary.id],
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
