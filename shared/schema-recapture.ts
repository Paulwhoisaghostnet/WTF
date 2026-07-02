import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  pgEnum,
  jsonb,
  index,
  bigint,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";

export const buybackWindowStatusEnum = pgEnum("buyback_window_status", [
  "draft",
  "funded",
  "open",
  "closed",
  "swept",
  "cancelled",
]);

export const wtfAuctionStatusEnum = pgEnum("wtf_auction_status", [
  "draft",
  "live",
  "ended",
  "settled",
  "cancelled",
]);

export const collectionContractNetworkEnum = pgEnum(
  "collection_contract_network",
  ["ghostnet", "shadownet", "mainnet"]
);

export const operatorActions = pgTable(
  "operator_actions",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actionKind: varchar("action_kind", { length: 80 }).notNull(),
    targetKind: varchar("target_kind", { length: 40 }).notNull(),
    targetId: integer("target_id"),
    payloadJson: jsonb("payload_json").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    ip: varchar("ip", { length: 64 }),
  },
  (t) => ({
    idxActorCreated: index("operator_actions_actor_created_idx").on(
      t.actorUserId,
      t.createdAt
    ),
    idxTarget: index("operator_actions_target_idx").on(t.targetKind, t.targetId),
  })
);

export const buybackWindows = pgTable("buyback_windows", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  contractAddress: varchar("contract_address", { length: 40 }).notNull(),
  network: collectionContractNetworkEnum("network").default("shadownet").notNull(),
  status: buybackWindowStatusEnum("status").default("draft").notNull(),
  rateMutezPerWtf: numeric("rate_mutez_per_wtf", { precision: 40, scale: 0 }).notNull(),
  perSellerCapWtf: numeric("per_seller_cap_wtf", { precision: 40, scale: 0 }).notNull(),
  totalXtzBudgetMutez: numeric("total_xtz_budget_mutez", {
    precision: 40,
    scale: 0,
  }).notNull(),
  opensAt: timestamp("opens_at").notNull(),
  closesAt: timestamp("closes_at").notNull(),
  merkleRoot: varchar("merkle_root", { length: 80 }),
  snapshotMinBalanceWtf: numeric("snapshot_min_balance_wtf", {
    precision: 40,
    scale: 0,
  })
    .default("0")
    .notNull(),
  snapshotBlockLevel: integer("snapshot_block_level"),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  operatorFundRunId: integer("operator_fund_run_id"),
  operatorWithdrawXtzRunId: integer("operator_withdraw_xtz_run_id"),
  operatorWithdrawWtfRunId: integer("operator_withdraw_wtf_run_id"),
  swapsObserved: integer("swaps_observed").default(0).notNull(),
  wtfRecaptured: numeric("wtf_recaptured", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  xtzDispensedMutez: numeric("xtz_dispensed_mutez", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const buybackAllowlist = pgTable("buyback_allowlist", {
  id: serial("id").primaryKey(),
  windowId: integer("window_id")
    .references(() => buybackWindows.id, { onDelete: "cascade" })
    .notNull(),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  maxWtf: numeric("max_wtf", { precision: 40, scale: 0 }).notNull(),
  snapshotBalanceWtf: numeric("snapshot_balance_wtf", {
    precision: 40,
    scale: 0,
  }).notNull(),
  merkleProof: jsonb("merkle_proof").notNull(),
  eligibilityReason: varchar("eligibility_reason", { length: 40 }).notNull(),
  swappedWtf: numeric("swapped_wtf", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  swappedAt: timestamp("swapped_at"),
  swapOpHash: varchar("swap_op_hash", { length: 80 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wtfAuctions = pgTable("wtf_auctions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  perkKind: varchar("perk_kind", { length: 60 }).notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  minBidWtf: numeric("min_bid_wtf", { precision: 40, scale: 0 })
    .default("1")
    .notNull(),
  bidIncrementWtf: numeric("bid_increment_wtf", { precision: 40, scale: 0 })
    .default("1")
    .notNull(),
  status: wtfAuctionStatusEnum("status").default("draft").notNull(),
  winningBidId: integer("winning_bid_id"),
  settlementOpHash: varchar("settlement_op_hash", { length: 80 }),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wtfAuctionBids = pgTable("wtf_auction_bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id")
    .references(() => wtfAuctions.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wtfRecaptureEvents = pgTable("wtf_recapture_events", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  walletAddress: varchar("wallet_address", { length: 40 }).notNull(),
  source: varchar("source", { length: 40 }).notNull(),
  sourceRefId: integer("source_ref_id"),
  amountWtf: numeric("amount_wtf", { precision: 40, scale: 0 }).notNull(),
  opHash: varchar("op_hash", { length: 80 }),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
});

export const operatorWalletIntentEnum = pgEnum("operator_wallet_intent", [
  "disburse_wtf",
  "fund_buyback",
  "withdraw_buyback_xtz",
  "withdraw_buyback_wtf",
  "pause_buyback",
  "unpause_buyback",
  "custom",
]);

export const operatorWalletAssetKindEnum = pgEnum(
  "operator_wallet_asset_kind",
  ["fa2", "xtz"]
);

export const operatorWalletRunStatusEnum = pgEnum(
  "operator_wallet_run_status",
  ["prepared", "broadcasting", "confirmed", "failed", "cancelled"]
);

export const operatorWalletRuns = pgTable("operator_wallet_runs", {
  id: serial("id").primaryKey(),
  preparedBy: integer("prepared_by").references(() => users.id, {
    onDelete: "set null",
  }),
  signedBy: varchar("signed_by", { length: 80 }),
  opHash: varchar("op_hash", { length: 80 }),
  intent: operatorWalletIntentEnum("intent").notNull(),
  assetKind: operatorWalletAssetKindEnum("asset_kind").notNull(),
  assetContract: varchar("asset_contract", { length: 40 }),
  assetTokenId: varchar("asset_token_id", { length: 40 }),
  totalRecipients: integer("total_recipients").default(0).notNull(),
  totalAmount: numeric("total_amount", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  counterpartyContract: varchar("counterparty_contract", { length: 40 }),
  payload: jsonb("payload"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: operatorWalletRunStatusEnum("status").default("prepared").notNull(),
  errorMessage: text("error_message"),
  notes: text("notes"),
});

export const operatorWalletBalances = pgTable("operator_wallet_balances", {
  id: serial("id").primaryKey(),
  assetKind: operatorWalletAssetKindEnum("asset_kind").notNull(),
  assetContract: varchar("asset_contract", { length: 40 }),
  assetTokenId: varchar("asset_token_id", { length: 40 }),
  balance: numeric("balance", { precision: 40, scale: 0 })
    .default("0")
    .notNull(),
  lowThreshold: numeric("low_threshold", { precision: 40, scale: 0 }),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export const collectionTemplateKindEnum = pgEnum(
  "collection_template_kind",
  [
    "teia_one_of_one",
    "open_edition",
    "bonding_curve",
    "blind_mint",
    "buyback",
  ]
);

export const collectionContractStatusEnum = pgEnum(
  "collection_contract_status",
  ["pending", "originating", "live", "failed", "retired"]
);

export const collectionTemplates = pgTable("collection_templates", {
  id: serial("id").primaryKey(),
  kind: collectionTemplateKindEnum("kind").notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  summary: text("summary"),
  sourcePath: varchar("source_path", { length: 400 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionContracts = pgTable("collection_contracts", {
  id: serial("id").primaryKey(),
  templateKind: collectionTemplateKindEnum("template_kind").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  address: varchar("address", { length: 40 }),
  network: collectionContractNetworkEnum("network").notNull(),
  status: collectionContractStatusEnum("status").default("pending").notNull(),
  collectionMeta: jsonb("collection_meta"),
  originationParams: jsonb("origination_params"),
  opHash: varchar("op_hash", { length: 80 }),
  deployedByUserId: integer("deployed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  operatorRunId: integer("operator_run_id"),
  errorMessage: text("error_message"),
  deployedAt: timestamp("deployed_at"),
  retiredAt: timestamp("retired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
