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
  bigint,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, userRoleEnum, wtfSubdomainGrantStatusEnum } from "./schema-core";

export const contractActivityStatusEnum = pgEnum("contract_activity_status", [
  "attempt",
  "success",
  "failure",
]);

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
    settlementStatus: varchar("settlement_status", { length: 24 })
      .default("available")
      .notNull(),
    settlementType: varchar("settlement_type", { length: 32 }),
    settlementRef: varchar("settlement_ref", { length: 160 }),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("reward_ledger_user_idx").on(table.userId),
    index("reward_ledger_paid_idx").on(table.paid),
    index("reward_ledger_operator_wallet_run_idx").on(table.operatorWalletRunId),
    index("reward_ledger_user_settlement_idx").on(table.userId, table.settlementStatus),
    index("reward_ledger_settlement_ref_idx").on(table.settlementType, table.settlementRef),
  ]
);

export const rewardLedgerRelations = relations(rewardLedger, ({ one }) => ({
  user: one(users, {
    fields: [rewardLedger.userId],
    references: [users.id],
  }),
}));

export const rewardCashoutRequests = pgTable(
  "reward_cashout_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 80 }).notNull(),
    amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
    amountWtfRaw: numeric("amount_wtf_raw", { precision: 40, scale: 0 }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    ledgerIds: jsonb("ledger_ids")
      .$type<number[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    operatorWalletRunId: integer("operator_wallet_run_id"),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    index("reward_cashouts_user_status_idx").on(table.userId, table.status),
    index("reward_cashouts_status_requested_idx").on(table.status, table.requestedAt),
    index("reward_cashouts_op_hash_idx").on(table.opHash),
  ]
);

export const rewardCashoutRequestsRelations = relations(
  rewardCashoutRequests,
  ({ one }) => ({
    user: one(users, {
      fields: [rewardCashoutRequests.userId],
      references: [users.id],
    }),
  })
);

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

// ─── FAQ ─────────────────────────────────────────────────

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 100 }),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
