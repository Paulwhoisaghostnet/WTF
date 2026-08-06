import { index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema-core";

export const adminInboxMessages = pgTable(
  "admin_inbox_messages",
  {
    id: serial("id").primaryKey(),
    senderUserId: integer("sender_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 180 }).notNull(),
    message: text("message").notNull(),
    evidence: text("evidence"),
    reproductionSteps: text("reproduction_steps"),
    expectedOutcome: text("expected_outcome"),
    impact: text("impact"),
    routePath: text("route_path"),
    clientUrl: text("client_url"),
    attachmentMediaIds: jsonb("attachment_media_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    status: varchar("status", { length: 20 }).notNull().default("unread"),
    senderReadAt: timestamp("sender_read_at"),
    readAt: timestamp("read_at"),
    readByUserId: integer("read_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("admin_inbox_messages_created_idx").on(table.createdAt),
    index("admin_inbox_messages_status_idx").on(table.status, table.createdAt),
    index("admin_inbox_messages_sender_idx").on(table.senderUserId, table.createdAt),
  ]
);

export const adminInboxReplies = pgTable(
  "admin_inbox_replies",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .references(() => adminInboxMessages.id, { onDelete: "cascade" })
      .notNull(),
    senderUserId: integer("sender_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    senderKind: varchar("sender_kind", { length: 16 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("admin_inbox_replies_message_idx").on(table.messageId, table.createdAt),
    index("admin_inbox_replies_sender_idx").on(table.senderUserId, table.createdAt),
  ]
);
