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
  bigint,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

export const listingTypeEnum = pgEnum("listing_type", [
  "auction",
  "buy_now",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "sold",
  "cancelled",
  "expired",
]);

// ─── Marketplace Listings ────────────────────────────────

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: serial("id").primaryKey(),
    sellerUserId: integer("seller_user_id")
      .references(() => users.id)
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    tokenName: varchar("token_name", { length: 300 }),
    tokenThumbnail: text("token_thumbnail"),
    amount: integer("amount").default(1).notNull(),
    listingType: listingTypeEnum("listing_type").default("buy_now").notNull(),
    priceWtf: bigint("price_wtf", { mode: "number" }).notNull(),
    minBidWtf: bigint("min_bid_wtf", { mode: "number" }),
    endTime: timestamp("end_time"),
    status: listingStatusEnum("status").default("active").notNull(),
    onChainId: varchar("on_chain_id", { length: 100 }),
    opHash: varchar("op_hash", { length: 51 }),
    // Existing rows default to 'verified' so the historical feed stays
    // visible after drizzle-kit push adds the column. New rows inserted
    // via the create-listing flow explicitly set 'pending_verification'
    // and the verifier reconciles them to 'verified' or 'failed'.
    onchainStatus: varchar("onchain_status", { length: 24 })
      .default("verified")
      .notNull(),
    onchainVerifiedAt: timestamp("onchain_verified_at"),
    onchainVerifiedSender: varchar("onchain_verified_sender", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("listing_seller_idx").on(table.sellerUserId),
    index("listing_onchain_status_idx").on(table.onchainStatus),
  ]
);

export const marketplaceListingsRelations = relations(
  marketplaceListings,
  ({ one, many }) => ({
    seller: one(users, {
      fields: [marketplaceListings.sellerUserId],
      references: [users.id],
    }),
    bids: many(marketplaceBids),
  })
);

// ─── Marketplace Bids ────────────────────────────────────

export const marketplaceBids = pgTable("marketplace_bids", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => marketplaceListings.id, { onDelete: "cascade" })
    .notNull(),
  bidderUserId: integer("bidder_user_id")
    .references(() => users.id)
    .notNull(),
  amountWtf: bigint("amount_wtf", { mode: "number" }).notNull(),
  opHash: varchar("op_hash", { length: 51 }),
  onchainStatus: varchar("onchain_status", { length: 24 })
    .default("verified")
    .notNull(),
  onchainVerifiedAt: timestamp("onchain_verified_at"),
  onchainVerifiedSender: varchar("onchain_verified_sender", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketplaceBidsRelations = relations(
  marketplaceBids,
  ({ one }) => ({
    listing: one(marketplaceListings, {
      fields: [marketplaceBids.listingId],
      references: [marketplaceListings.id],
    }),
    bidder: one(users, {
      fields: [marketplaceBids.bidderUserId],
      references: [users.id],
    }),
  })
);

export const inAppMarketItems = pgTable(
  "in_app_market_items",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 80 }).unique().notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 40 }).default("desktop_pet").notNull(),
    priceWtfUnits: numeric("price_wtf_units", { precision: 40, scale: 0 }).notNull(),
    priceExp: integer("price_exp").default(0).notNull(),
    contractAddress: varchar("contract_address", { length: 40 }),
    contractListingId: integer("contract_listing_id"),
    active: boolean("active").default(true).notNull(),
    stockQuantity: integer("stock_quantity").default(0).notNull(),
    rarityTier: integer("rarity_tier").default(1).notNull(),
    priceScore: integer("price_score").default(5).notNull(),
    priceWtfLocked: boolean("price_wtf_locked").default(false).notNull(),
    priceScoreLocked: boolean("price_score_locked").default(false).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_items_category_idx").on(table.category, table.active),
    uniqueIndex("in_app_market_items_contract_listing_idx").on(
      table.contractAddress,
      table.contractListingId
    ),
  ]
);

export const inAppMarketSales = pgTable(
  "in_app_market_sales",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").default(true).notNull(),
    discountPercent: integer("discount_percent").default(0).notNull(),
    category: varchar("category", { length: 40 }),
    sku: varchar("sku", { length: 80 }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_sales_active_idx").on(table.active, table.startsAt, table.endsAt),
    index("in_app_market_sales_category_idx").on(table.category),
    index("in_app_market_sales_sku_idx").on(table.sku),
  ]
);

export const inAppMarketPaymentIntents = pgTable(
  "in_app_market_payment_intents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    purchaseRef: varchar("purchase_ref", { length: 128 }).unique().notNull(),
    currency: varchar("currency", { length: 16 }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    walletAddress: varchar("wallet_address", { length: 40 }),
    items: jsonb("items").default(sql`'[]'::jsonb`).notNull(),
    subtotalWtfUnits: numeric("subtotal_wtf_units", {
      precision: 40,
      scale: 0,
    })
      .default("0")
      .notNull(),
    subtotalExp: integer("subtotal_exp").default(0).notNull(),
    estimatedFeeMutez: integer("estimated_fee_mutez").default(0).notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    contractAddress: varchar("contract_address", { length: 40 }),
    routerListingId: integer("router_listing_id").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_intents_user_status_idx").on(table.userId, table.status),
    index("in_app_market_intents_purchase_ref_idx").on(table.purchaseRef),
  ]
);

export const inAppMarketPurchases = pgTable(
  "in_app_market_purchases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    walletAddress: varchar("wallet_address", { length: 40 }),
    sku: varchar("sku", { length: 80 }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    currency: varchar("currency", { length: 16 }).default("wtf").notNull(),
    amountWtfUnits: numeric("amount_wtf_units", {
      precision: 40,
      scale: 0,
    }).notNull(),
    amountExp: integer("amount_exp").default(0).notNull(),
    opHash: varchar("op_hash", { length: 80 }),
    tzktTransferId: bigint("tzkt_transfer_id", { mode: "number" }),
    contractAddress: varchar("contract_address", { length: 40 }),
    contractListingId: integer("contract_listing_id"),
    purchaseRef: varchar("purchase_ref", { length: 128 }),
    paymentIntentId: integer("payment_intent_id").references(
      () => inAppMarketPaymentIntents.id,
      { onDelete: "set null" }
    ),
    status: varchar("status", { length: 24 }).default("confirmed").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_market_purchases_user_idx").on(table.userId, table.createdAt),
    index("in_app_market_purchases_wallet_idx").on(table.walletAddress),
    index("in_app_market_purchases_op_hash_idx").on(table.opHash),
    index("in_app_market_purchases_ref_idx").on(table.purchaseRef),
    uniqueIndex("in_app_market_purchases_tzkt_sku_idx")
      .on(table.tzktTransferId, table.sku)
      .where(sql`${table.tzktTransferId} IS NOT NULL`),
  ]
);

export const inAppInventoryItems = pgTable(
  "in_app_inventory_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sku: varchar("sku", { length: 80 }).notNull(),
    quantity: integer("quantity").default(0).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    lastPurchaseId: integer("last_purchase_id").references(
      () => inAppMarketPurchases.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("in_app_inventory_user_sku_idx").on(table.userId, table.sku),
    index("in_app_inventory_user_idx").on(table.userId),
  ]
);

export const inAppInventoryTransfers = pgTable(
  "in_app_inventory_transfers",
  {
    id: serial("id").primaryKey(),
    senderUserId: integer("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    receiverUserId: integer("receiver_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sku: varchar("sku", { length: 80 }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    source: varchar("source", { length: 40 }).default("wtf_live_tip").notNull(),
    sourceRoomId: varchar("source_room_id", { length: 80 }),
    note: text("note"),
    status: varchar("status", { length: 24 }).default("completed").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    rewardLedgerId: integer("reward_ledger_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("in_app_inventory_transfers_receiver_idx").on(
      table.receiverUserId,
      table.createdAt
    ),
    index("in_app_inventory_transfers_sender_idx").on(
      table.senderUserId,
      table.createdAt
    ),
    index("in_app_inventory_transfers_redeem_idx").on(
      table.receiverUserId,
      table.status,
      table.redeemedAt
    ),
    index("in_app_inventory_transfers_sku_idx").on(table.sku),
  ]
);

export const inAppMarketSyncState = pgTable("in_app_market_sync_state", {
  key: varchar("key", { length: 80 }).primaryKey(),
  lastTransferId: bigint("last_transfer_id", { mode: "number" })
    .default(0)
    .notNull(),
  lastStatus: varchar("last_status", { length: 24 }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inAppMarketPurchasesRelations = relations(
  inAppMarketPurchases,
  ({ one }) => ({
    user: one(users, {
      fields: [inAppMarketPurchases.userId],
      references: [users.id],
    }),
    paymentIntent: one(inAppMarketPaymentIntents, {
      fields: [inAppMarketPurchases.paymentIntentId],
      references: [inAppMarketPaymentIntents.id],
    }),
  })
);

export const inAppInventoryItemsRelations = relations(
  inAppInventoryItems,
  ({ one }) => ({
    user: one(users, {
      fields: [inAppInventoryItems.userId],
      references: [users.id],
    }),
    lastPurchase: one(inAppMarketPurchases, {
      fields: [inAppInventoryItems.lastPurchaseId],
      references: [inAppMarketPurchases.id],
    }),
  })
);
