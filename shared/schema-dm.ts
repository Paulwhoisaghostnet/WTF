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
import { users } from "./schema-core";

export const dmConversationTypeEnum = pgEnum("dm_conversation_type", [
  "direct",
  "studio",
]);

export const dmMessageTypeEnum = pgEnum("dm_message_type", [
  "text",
  "studio_system",
  "studio_event",
]);

export const dmMessageReportStatusEnum = pgEnum("dm_message_report_status", [
  "open",
  "reviewed",
  "dismissed",
]);

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

export const dmMessageReports = pgTable(
  "dm_message_reports",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .references(() => dmMessages.id, { onDelete: "cascade" })
      .notNull(),
    reporterUserId: integer("reporter_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason").notNull(),
    status: dmMessageReportStatusEnum("status").default("open").notNull(),
    reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dm_message_reports_reporter_message_unique").on(
      table.reporterUserId,
      table.messageId
    ),
    index("dm_message_reports_status_created_idx").on(
      table.status,
      table.createdAt
    ),
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

export const dmMessagesRelations = relations(dmMessages, ({ many, one }) => ({
  conversation: one(dmConversations, {
    fields: [dmMessages.conversationId],
    references: [dmConversations.id],
  }),
  sender: one(users, {
    fields: [dmMessages.senderId],
    references: [users.id],
  }),
  reports: many(dmMessageReports),
}));

export const dmMessageReportsRelations = relations(dmMessageReports, ({ one }) => ({
  message: one(dmMessages, {
    fields: [dmMessageReports.messageId],
    references: [dmMessages.id],
  }),
  reporter: one(users, {
    fields: [dmMessageReports.reporterUserId],
    references: [users.id],
    relationName: "dmMessageReportReporter",
  }),
  reviewer: one(users, {
    fields: [dmMessageReports.reviewerUserId],
    references: [users.id],
    relationName: "dmMessageReportReviewer",
  }),
}));
