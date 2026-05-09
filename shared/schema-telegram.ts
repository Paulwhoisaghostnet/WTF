import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import { boardThreadReplies, boardThreads } from "./schema-board";

export const TELEGRAM_DIGEST_SOURCE_KINDS = [
  "channel",
  "group",
  "bot",
  "user_client",
] as const;
export type TelegramDigestSourceKind =
  (typeof TELEGRAM_DIGEST_SOURCE_KINDS)[number];

export const TELEGRAM_DIGEST_MESSAGE_KINDS = [
  "message",
  "announcement",
  "fart_noise",
  "system",
] as const;
export type TelegramDigestMessageKind =
  (typeof TELEGRAM_DIGEST_MESSAGE_KINDS)[number];

export const telegramDigestSources = pgTable(
  "telegram_digest_sources",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 80 }).unique().notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    telegramChatId: varchar("telegram_chat_id", { length: 120 }),
    telegramUsername: varchar("telegram_username", { length: 120 }),
    sourceKind: varchar("source_kind", { length: 24 })
      .$type<TelegramDigestSourceKind>()
      .default("channel")
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    publicVisible: boolean("public_visible").default(true).notNull(),
    digestEnabled: boolean("digest_enabled").default(true).notNull(),
    boardChannelId: integer("board_channel_id").references(() => boardThreads.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("telegram_digest_sources_enabled_idx").on(table.enabled, table.digestEnabled),
    index("telegram_digest_sources_chat_idx").on(table.telegramChatId),
    index("telegram_digest_sources_board_idx").on(table.boardChannelId),
  ]
);

export const telegramDigestMessages = pgTable(
  "telegram_digest_messages",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .references(() => telegramDigestSources.id, { onDelete: "cascade" })
      .notNull(),
    externalRef: varchar("external_ref", { length: 180 }).unique().notNull(),
    telegramChatId: varchar("telegram_chat_id", { length: 120 }).notNull(),
    telegramMessageId: varchar("telegram_message_id", { length: 80 }).notNull(),
    messageKind: varchar("message_kind", { length: 24 })
      .$type<TelegramDigestMessageKind>()
      .default("message")
      .notNull(),
    authorName: varchar("author_name", { length: 160 }),
    authorUsername: varchar("author_username", { length: 120 }),
    authorTelegramId: varchar("author_telegram_id", { length: 120 }),
    text: text("text").notNull(),
    summary: text("summary"),
    publicLink: text("public_link"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    messageDate: timestamp("message_date").notNull(),
    publicVisible: boolean("public_visible").default(true).notNull(),
    postedBoardReplyId: integer("posted_board_reply_id").references(
      () => boardThreadReplies.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telegram_digest_messages_external_ref_idx").on(table.externalRef),
    index("telegram_digest_messages_source_date_idx").on(table.sourceId, table.messageDate),
    index("telegram_digest_messages_kind_date_idx").on(table.messageKind, table.messageDate),
    index("telegram_digest_messages_public_date_idx").on(table.publicVisible, table.messageDate),
  ]
);

export const telegramDigestAnnouncements = pgTable(
  "telegram_digest_announcements",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id").references(() => telegramDigestSources.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    telegramMessageId: varchar("telegram_message_id", { length: 80 }),
    failure: text("failure"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("telegram_digest_announcements_status_idx").on(table.status, table.createdAt),
    index("telegram_digest_announcements_source_idx").on(table.sourceId),
  ]
);

export const telegramFartTracks = pgTable(
  "telegram_fart_tracks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    label: varchar("label", { length: 120 }),
    status: varchar("status", { length: 24 }).default("planned").notNull(),
    fartTokenContract: varchar("fart_token_contract", { length: 36 })
      .default("KT1F4oayJA83QQFPZz7ayfTfemEx8Z8X8mAm")
      .notNull(),
    fartTokenId: varchar("fart_token_id", { length: 40 }).default("0").notNull(),
    fartTokenBalance: varchar("fart_token_balance", { length: 80 }),
    lastCheckedAt: timestamp("last_checked_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telegram_fart_tracks_user_wallet_idx").on(table.userId, table.walletAddress),
    index("telegram_fart_tracks_wallet_idx").on(table.walletAddress),
    index("telegram_fart_tracks_status_idx").on(table.status),
  ]
);
