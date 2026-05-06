import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  varchar,
  jsonb,
  index,
  uniqueIndex,
  bigint,
  numeric,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { addressLabels } from "./schema-wallet";

export const xtzUsdDaily = pgTable(
  "xtz_usd_daily",
  {
    day: date("day").primaryKey(),
    priceUsd: numeric("price_usd", { precision: 18, scale: 6 }).notNull(),
    source: varchar("source", { length: 64 }).notNull().default("tzkt_quotes"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    idxSource: index("idx_xtz_usd_daily_source").on(t.source),
  })
);

export const tokenMintEvents = pgTable(
  "token_mint_events",
  {
    id: serial("id").primaryKey(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    editions: integer("editions").default(1).notNull(),
    minterAddress: varchar("minter_address", { length: 64 }),
    firstOwner: varchar("first_owner", { length: 64 }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    mintedAt: timestamp("minted_at", { withTimezone: true }).notNull(),
    platform: varchar("platform", { length: 64 }),
    objktEventId: text("objkt_event_id"),
    mintFeeMutez: bigint("mint_fee_mutez", { mode: "bigint" }),
    source: varchar("source", { length: 64 }).notNull().default("intel_csv"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOp: uniqueIndex("uniq_mint_op").on(
      t.tokenContract,
      t.tokenId,
      t.opHash
    ),
    idxToken: index("idx_mint_events_token").on(t.tokenContract, t.tokenId),
    idxMinter: index("idx_mint_events_minter").on(t.minterAddress),
    idxMintedAt: index("idx_mint_events_minted_at").on(t.mintedAt),
  })
);

export const tokenSales = pgTable(
  "token_sales",
  {
    id: serial("id").primaryKey(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    tzktOpId: bigint("tzkt_op_id", { mode: "number" }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    sellerAddress: varchar("seller_address", { length: 64 }),
    buyerAddress: varchar("buyer_address", { length: 64 }).notNull(),
    priceMutez: bigint("price_mutez", { mode: "bigint" }).notNull(),
    priceUsd: numeric("price_usd", { precision: 24, scale: 6 }),
    royaltiesMutez: bigint("royalties_mutez", { mode: "bigint" }).default(sql`0`),
    platformFeeMutez: bigint("platform_fee_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    marketplace: varchar("marketplace", { length: 64 }),
    objktEventId: text("objkt_event_id"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    editionsSold: integer("editions_sold").default(1).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 64 }).notNull().default("intel_csv"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOp: uniqueIndex("uniq_sales_ophash").on(
      t.opHash,
      t.tokenContract,
      t.tokenId,
      t.sellerAddress,
      t.buyerAddress
    ),
    idxToken: index("idx_sales_token").on(t.tokenContract, t.tokenId),
    idxSeller: index("idx_sales_seller").on(t.sellerAddress),
    idxBuyer: index("idx_sales_buyer").on(t.buyerAddress),
    idxSoldAt: index("idx_sales_sold_at").on(t.soldAt),
    idxIsPrimary: index("idx_sales_primary").on(t.isPrimary),
    idxMarketplace: index("idx_sales_marketplace").on(t.marketplace),
  })
);

export const acquisitionLots = pgTable(
  "acquisition_lots",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    editions: integer("editions").default(1).notNull(),
    acquisitionType: varchar("acquisition_type", { length: 24 })
      .notNull()
      .default("purchase"),
    costMutez: bigint("cost_mutez", { mode: "bigint" }).notNull(),
    costUsd: numeric("cost_usd", { precision: 24, scale: 6 }),
    royaltiesMutez: bigint("royalties_mutez", { mode: "bigint" }).default(sql`0`),
    platformFeeMutez: bigint("platform_fee_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    marketplace: varchar("marketplace", { length: 64 }),
    opHash: varchar("op_hash", { length: 72 }).notNull(),
    blockLevel: bigint("block_level", { mode: "number" }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull(),
    disposedAt: timestamp("disposed_at", { withTimezone: true }),
    saleId: integer("sale_id"),
    source: varchar("source", { length: 64 }).notNull().default("derived"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqLot: uniqueIndex("uniq_acq_lot").on(
      t.walletAddress,
      t.tokenContract,
      t.tokenId,
      t.opHash
    ),
    idxWallet: index("idx_acq_lots_wallet").on(t.walletAddress),
    idxToken: index("idx_acq_lots_token").on(t.tokenContract, t.tokenId),
    idxOpen: index("idx_acq_lots_open").on(t.disposedAt),
    idxAcquiredAt: index("idx_acq_lots_acquired_at").on(t.acquiredAt),
  })
);

export const tokenListings = pgTable(
  "token_listings",
  {
    id: serial("id").primaryKey(),
    listingId: text("listing_id").notNull(),
    marketplace: varchar("marketplace", { length: 64 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    sellerAddress: varchar("seller_address", { length: 64 }).notNull(),
    priceMutez: bigint("price_mutez", { mode: "bigint" }).notNull(),
    priceUsd: numeric("price_usd", { precision: 24, scale: 6 }),
    royaltyBps: integer("royalty_bps"),
    editions: integer("editions").default(1).notNull(),
    active: boolean("active").default(true).notNull(),
    listedAt: timestamp("listed_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    source: varchar("source", { length: 64 }).notNull().default("objkt_gql"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqListing: uniqueIndex("uniq_token_listing").on(
      t.marketplace,
      t.listingId
    ),
    idxToken: index("idx_listings_token").on(t.tokenContract, t.tokenId),
    idxActive: index("idx_listings_active").on(t.active),
    idxSeller: index("idx_listings_seller").on(t.sellerAddress),
    idxListedAt: index("idx_listings_listed_at").on(t.listedAt),
  })
);

export const tokenMarketSummary = pgTable(
  "token_market_summary",
  {
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    lastSaleMutez: bigint("last_sale_mutez", { mode: "bigint" }),
    lastSaleAt: timestamp("last_sale_at", { withTimezone: true }),
    highestSaleMutez: bigint("highest_sale_mutez", { mode: "bigint" }),
    lowestSaleMutez: bigint("lowest_sale_mutez", { mode: "bigint" }),
    averageSaleMutez: bigint("average_sale_mutez", { mode: "bigint" }),
    totalVolumeMutez: bigint("total_volume_mutez", { mode: "bigint" }).default(
      sql`0`
    ),
    saleCount: integer("sale_count").default(0).notNull(),
    primarySaleCount: integer("primary_sale_count").default(0).notNull(),
    secondarySaleCount: integer("secondary_sale_count").default(0).notNull(),
    currentFloorMutez: bigint("current_floor_mutez", { mode: "bigint" }),
    currentHighestListingMutez: bigint("current_highest_listing_mutez", {
      mode: "bigint",
    }),
    averageActiveListingMutez: bigint("average_active_listing_mutez", {
      mode: "bigint",
    }),
    activeListingCount: integer("active_listing_count").default(0).notNull(),
    uniqueOwnersCount: integer("unique_owners_count").default(0).notNull(),
    totalRoyaltiesMutez: bigint("total_royalties_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    totalPlatformFeesMutez: bigint("total_platform_fees_mutez", {
      mode: "bigint",
    }).default(sql`0`),
    refreshedAt: timestamp("refreshed_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({
      name: "pk_token_market_summary",
      columns: [t.tokenContract, t.tokenId],
    }),
    idxFloor: index("idx_market_floor").on(t.currentFloorMutez),
    idxLastSaleAt: index("idx_market_last_sale_at").on(t.lastSaleAt),
  })
);

export const tokenSalesRelations = relations(tokenSales, ({ one }) => ({
  seller: one(addressLabels, {
    fields: [tokenSales.sellerAddress],
    references: [addressLabels.address],
  }),
  buyer: one(addressLabels, {
    fields: [tokenSales.buyerAddress],
    references: [addressLabels.address],
  }),
}));

export const acquisitionLotsRelations = relations(
  acquisitionLots,
  ({ one }) => ({
    wallet: one(addressLabels, {
      fields: [acquisitionLots.walletAddress],
      references: [addressLabels.address],
    }),
    closingSale: one(tokenSales, {
      fields: [acquisitionLots.saleId],
      references: [tokenSales.id],
    }),
  })
);

export const tokenListingsRelations = relations(tokenListings, ({ one }) => ({
  seller: one(addressLabels, {
    fields: [tokenListings.sellerAddress],
    references: [addressLabels.address],
  }),
}));

