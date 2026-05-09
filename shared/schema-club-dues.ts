import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

export const clubDuesContracts = pgTable(
  "club_dues_contracts",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    templateVersion: varchar("template_version", { length: 80 })
      .default("wtf-club-dues-v1")
      .notNull(),
    network: varchar("network", { length: 32 }).default("shadownet").notNull(),
    status: varchar("status", { length: 24 }).default("draft").notNull(),
    contractAddress: varchar("contract_address", { length: 40 }),
    managerWalletId: varchar("manager_wallet_id", { length: 80 })
      .default("club-dues-manager")
      .notNull(),
    treasuryAddress: varchar("treasury_address", { length: 40 }).notNull(),
    adminAddress: varchar("admin_address", { length: 40 }).notNull(),
    monthlyDuesMutez: bigint("monthly_dues_mutez", { mode: "number" }).notNull(),
    monthSeconds: integer("month_seconds").default(2_592_000).notNull(),
    utilityUnitsPerMonth: numeric("utility_units_per_month", {
      precision: 40,
      scale: 0,
    })
      .default("1")
      .notNull(),
    gracePeriodDays: integer("grace_period_days").default(7).notNull(),
    arrearsWarningDays: integer("arrears_warning_days").default(3).notNull(),
    membershipSymbol: varchar("membership_symbol", { length: 24 })
      .default("DUES")
      .notNull(),
    metadataUri: text("metadata_uri"),
    storageConfig: jsonb("storage_config")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    compileArtifact: jsonb("compile_artifact")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    deployedByUserId: integer("deployed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deployOpHash: varchar("deploy_op_hash", { length: 80 }),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    lastArrearsSweepAt: timestamp("last_arrears_sweep_at", {
      withTimezone: true,
    }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("club_dues_contracts_slug_idx").on(table.slug),
    index("club_dues_contracts_network_status_idx").on(table.network, table.status),
    index("club_dues_contracts_address_idx").on(table.contractAddress),
  ]
);

export const clubDuesDeploymentRuns = pgTable(
  "club_dues_deployment_runs",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id")
      .references(() => clubDuesContracts.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    network: varchar("network", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    walletId: varchar("wallet_id", { length: 80 }).notNull(),
    signerRequestId: varchar("signer_request_id", { length: 128 }),
    opHash: varchar("op_hash", { length: 80 }),
    contractAddress: varchar("contract_address", { length: 40 }),
    compileOutput: jsonb("compile_output")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("club_dues_deployment_runs_contract_idx").on(table.contractId, table.createdAt),
    index("club_dues_deployment_runs_status_idx").on(table.status),
  ]
);

export const clubDuesPaymentIntents = pgTable(
  "club_dues_payment_intents",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id")
      .references(() => clubDuesContracts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    paymentRef: varchar("payment_ref", { length: 128 }).notNull(),
    walletAddress: varchar("wallet_address", { length: 40 }),
    months: integer("months").notNull(),
    amountMutez: bigint("amount_mutez", { mode: "number" }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("club_dues_payment_intents_ref_idx").on(table.paymentRef),
    uniqueIndex("club_dues_payment_intents_op_hash_idx").on(table.opHash),
    index("club_dues_payment_intents_user_status_idx").on(table.userId, table.status),
    index("club_dues_payment_intents_contract_status_idx").on(table.contractId, table.status),
  ]
);

export const clubDuesMemberLedger = pgTable(
  "club_dues_member_ledger",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id")
      .references(() => clubDuesContracts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
    membershipTokenId: numeric("membership_token_id", {
      precision: 40,
      scale: 0,
    }),
    utilityUnits: numeric("utility_units", { precision: 40, scale: 0 })
      .default("0")
      .notNull(),
    paidThrough: timestamp("paid_through", { withTimezone: true }).notNull(),
    lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
    lastOpHash: varchar("last_op_hash", { length: 80 }),
    status: varchar("status", { length: 24 }).default("active").notNull(),
    arrearsSince: timestamp("arrears_since", { withTimezone: true }),
    warningsSent: integer("warnings_sent").default(0).notNull(),
    lastWarningAt: timestamp("last_warning_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("club_dues_member_contract_wallet_idx").on(
      table.contractId,
      table.walletAddress
    ),
    index("club_dues_member_user_status_idx").on(table.userId, table.status),
    index("club_dues_member_paid_through_idx").on(table.paidThrough),
    index("club_dues_member_contract_status_idx").on(table.contractId, table.status),
  ]
);

export const clubDuesContractsRelations = relations(
  clubDuesContracts,
  ({ many, one }) => ({
    deployments: many(clubDuesDeploymentRuns),
    paymentIntents: many(clubDuesPaymentIntents),
    members: many(clubDuesMemberLedger),
    deployedBy: one(users, {
      fields: [clubDuesContracts.deployedByUserId],
      references: [users.id],
    }),
  })
);

export const clubDuesDeploymentRunsRelations = relations(
  clubDuesDeploymentRuns,
  ({ one }) => ({
    contract: one(clubDuesContracts, {
      fields: [clubDuesDeploymentRuns.contractId],
      references: [clubDuesContracts.id],
    }),
    actor: one(users, {
      fields: [clubDuesDeploymentRuns.actorUserId],
      references: [users.id],
    }),
  })
);

export const clubDuesPaymentIntentsRelations = relations(
  clubDuesPaymentIntents,
  ({ one }) => ({
    contract: one(clubDuesContracts, {
      fields: [clubDuesPaymentIntents.contractId],
      references: [clubDuesContracts.id],
    }),
    user: one(users, {
      fields: [clubDuesPaymentIntents.userId],
      references: [users.id],
    }),
  })
);

export const clubDuesMemberLedgerRelations = relations(
  clubDuesMemberLedger,
  ({ one }) => ({
    contract: one(clubDuesContracts, {
      fields: [clubDuesMemberLedger.contractId],
      references: [clubDuesContracts.id],
    }),
    user: one(users, {
      fields: [clubDuesMemberLedger.userId],
      references: [users.id],
    }),
  })
);
