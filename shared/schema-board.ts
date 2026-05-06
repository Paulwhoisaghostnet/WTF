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
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, userRoleEnum } from "./schema-core";
import { seasons } from "./schema-gameshow";

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
