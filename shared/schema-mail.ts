import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";
import { wtfSubdomainGrants } from "./schema-admin";
import { communicationItems } from "./schema-comms";

export const mailMailboxStatusEnum = pgEnum("mail_mailbox_status", [
  "reserved",
  "active",
  "suspended",
  "revoked",
]);

export const mailMessageDirectionEnum = pgEnum("mail_message_direction", [
  "inbound",
  "outbound",
]);

export const mailMessageStatusEnum = pgEnum("mail_message_status", [
  "received",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
]);

export const mailMailboxes = pgTable(
  "mail_mailboxes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    localPart: varchar("local_part", { length: 63 }).notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    address: varchar("address", { length: 320 }).unique().notNull(),
    status: mailMailboxStatusEnum("status").default("reserved").notNull(),
    wtfSubdomainGrantId: integer("wtf_subdomain_grant_id").references(
      () => wtfSubdomainGrants.id,
      { onDelete: "set null" }
    ),
    provisionedAt: timestamp("provisioned_at"),
    revokedAt: timestamp("revoked_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mail_mailboxes_local_domain_idx").on(table.localPart, table.domain),
    index("mail_mailboxes_user_idx").on(table.userId),
    index("mail_mailboxes_status_idx").on(table.status),
  ]
);

export const mailMessages = pgTable(
  "mail_messages",
  {
    id: serial("id").primaryKey(),
    mailboxId: integer("mailbox_id")
      .references(() => mailMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    direction: mailMessageDirectionEnum("direction").notNull(),
    status: mailMessageStatusEnum("status").notNull(),
    provider: varchar("provider", { length: 40 }).default("resend").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 240 }),
    messageIdHeader: varchar("message_id_header", { length: 320 }),
    fromAddress: varchar("from_address", { length: 320 }).notNull(),
    fromName: varchar("from_name", { length: 240 }),
    toAddresses: jsonb("to_addresses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ccAddresses: jsonb("cc_addresses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bccAddresses: jsonb("bcc_addresses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    subject: varchar("subject", { length: 500 }).notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    commsItemId: integer("comms_item_id").references(() => communicationItems.id, {
      onDelete: "set null",
    }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mail_messages_user_created_idx").on(table.userId, table.createdAt),
    index("mail_messages_mailbox_created_idx").on(table.mailboxId, table.createdAt),
    index("mail_messages_provider_idx").on(table.provider, table.providerMessageId),
    index("mail_messages_status_idx").on(table.status),
  ]
);

export const mailAttachments = pgTable(
  "mail_attachments",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .references(() => mailMessages.id, { onDelete: "cascade" })
      .notNull(),
    filename: varchar("filename", { length: 260 }).notNull(),
    contentType: varchar("content_type", { length: 160 }),
    byteSize: integer("byte_size"),
    providerAttachmentId: varchar("provider_attachment_id", { length: 240 }),
    storageKey: text("storage_key"),
    safeToPreview: boolean("safe_to_preview").default(false).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("mail_attachments_message_idx").on(table.messageId),
    index("mail_attachments_provider_idx").on(table.providerAttachmentId),
  ]
);

export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: serial("id").primaryKey(),
    mailboxId: integer("mailbox_id")
      .references(() => mailMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    mailMessageId: integer("mail_message_id").references(() => mailMessages.id, {
      onDelete: "set null",
    }),
    status: mailMessageStatusEnum("status").default("queued").notNull(),
    provider: varchar("provider", { length: 40 }).default("resend").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 240 }),
    lastError: text("last_error"),
    attempts: integer("attempts").default(0).notNull(),
    queuedAt: timestamp("queued_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mail_outbox_user_status_idx").on(table.userId, table.status),
    index("mail_outbox_status_idx").on(table.status, table.queuedAt),
  ]
);

export const mailDeliveryEvents = pgTable(
  "mail_delivery_events",
  {
    id: serial("id").primaryKey(),
    mailMessageId: integer("mail_message_id").references(() => mailMessages.id, {
      onDelete: "set null",
    }),
    mailboxId: integer("mailbox_id").references(() => mailMailboxes.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    provider: varchar("provider", { length: 40 }).default("resend").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 240 }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("mail_delivery_events_message_idx").on(table.mailMessageId),
    index("mail_delivery_events_type_idx").on(table.eventType, table.createdAt),
    index("mail_delivery_events_provider_idx").on(
      table.provider,
      table.providerMessageId
    ),
  ]
);

export const mailMailboxesRelations = relations(mailMailboxes, ({ one, many }) => ({
  user: one(users, { fields: [mailMailboxes.userId], references: [users.id] }),
  wtfSubdomainGrant: one(wtfSubdomainGrants, {
    fields: [mailMailboxes.wtfSubdomainGrantId],
    references: [wtfSubdomainGrants.id],
  }),
  messages: many(mailMessages),
}));

export const mailMessagesRelations = relations(mailMessages, ({ one, many }) => ({
  mailbox: one(mailMailboxes, {
    fields: [mailMessages.mailboxId],
    references: [mailMailboxes.id],
  }),
  user: one(users, { fields: [mailMessages.userId], references: [users.id] }),
  commsItem: one(communicationItems, {
    fields: [mailMessages.commsItemId],
    references: [communicationItems.id],
  }),
  attachments: many(mailAttachments),
}));
