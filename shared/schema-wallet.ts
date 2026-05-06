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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./schema-core";

export const walletEventTypeEnum = pgEnum("wallet_event_type", [
  "token_transfer_in",
  "token_transfer_out",
  "token_mint",
  "token_burn",
  "xtz_transfer_in",
  "xtz_transfer_out",
  "contract_call",
  "delegation",
  "origination",
]);

export const walletSyncCursors = pgTable(
  "wallet_sync_cursors",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 36 })
      .unique()
      .notNull(),
    /** TzKT /tokens/transfers monotonic id cursor. */
    lastTransferId: bigint("last_transfer_id", { mode: "number" })
      .default(0)
      .notNull(),
    /** TzKT /accounts/:addr/operations transaction id cursor. */
    lastOperationId: bigint("last_operation_id", { mode: "number" })
      .default(0)
      .notNull(),
    /** Most recent TzKT level observed for this wallet. */
    lastLevel: bigint("last_level", { mode: "number" }).default(0).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncStatus: varchar("last_sync_status", { length: 16 }),
    lastSyncError: text("last_sync_error"),
    /** Total events ingested for this wallet (diagnostic). */
    eventsTracked: bigint("events_tracked", { mode: "number" })
      .default(0)
      .notNull(),
    /**
     * Becomes true once the initial backfill has caught up to TzKT's
     * tip. Only backfilled wallets participate in the global 5-minute
     * incremental sweep — otherwise they would skip historical events.
     */
    backfilled: boolean("backfilled").default(false).notNull(),
    backfilledAt: timestamp("backfilled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxBackfilled: index("idx_wallet_cursors_backfilled").on(t.backfilled),
  })
);

export const walletEvents = pgTable(
  "wallet_events",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    /** Snapshot of the owning user at ingest time (nullable on later unlink). */
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: walletEventTypeEnum("event_type").notNull(),
    level: bigint("level", { mode: "number" }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    opHash: varchar("op_hash", { length: 100 }),
    /** Which TzKT source this row came from: transfer|transaction|delegation|origination */
    tzktKind: varchar("tzkt_kind", { length: 16 }).notNull(),
    /** Exactly one of tzktTransferId / tzktOperationId is set, per kind. */
    tzktTransferId: bigint("tzkt_transfer_id", { mode: "number" }),
    tzktOperationId: bigint("tzkt_operation_id", { mode: "number" }),
    // ─── Token context (FA1.2 / FA2 transfers only) ───
    tokenContract: varchar("token_contract", { length: 36 }),
    tokenId: text("token_id"),
    tokenStandard: varchar("token_standard", { length: 12 }),
    tokenAmount: text("token_amount"),
    tokenName: text("token_name"),
    tokenSymbol: text("token_symbol"),
    tokenThumbnail: text("token_thumbnail"),
    // ─── Counterparty + pricing ───
    counterpartyAddress: varchar("counterparty_address", { length: 36 }),
    /**
     * XTZ amount moved by the parent transaction (if applicable).
     * Null for pure token transfers without an XTZ leg. Populated
     * from TzKT transaction operation `amount` field.
     */
    xtzAmountMutez: bigint("xtz_amount_mutez", { mode: "number" }),
    /**
     * Heuristic marketplace identifier (objkt, teia, fxhash, ...).
     * Wired up for Phase 2 price-enrichment. Null in Phase 1.
     */
    marketplace: varchar("marketplace", { length: 50 }),
    /** Raw upstream payload, for debugging and future extraction. */
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uqTransfer: uniqueIndex("uq_wallet_event_transfer").on(
      t.walletAddress,
      t.tzktTransferId
    ),
    uqOperation: uniqueIndex("uq_wallet_event_operation").on(
      t.walletAddress,
      t.tzktOperationId,
      t.tzktKind
    ),
    idxByWalletTime: index("idx_wallet_events_wallet_time").on(
      t.walletAddress,
      t.timestamp
    ),
    idxByUserTime: index("idx_wallet_events_user_time").on(
      t.userId,
      t.timestamp
    ),
    idxByToken: index("idx_wallet_events_token").on(
      t.tokenContract,
      t.tokenId
    ),
    idxByType: index("idx_wallet_events_type").on(t.eventType),
  })
);

export const walletEventsRelations = relations(walletEvents, ({ one }) => ({
  user: one(users, {
    fields: [walletEvents.userId],
    references: [users.id],
  }),
}));

// ─── Cockpit: sync infrastructure ────────────────────────

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    jobName: varchar("job_name", { length: 64 }).notNull(),
    scope: varchar("scope", { length: 128 }),
    status: varchar("status", { length: 16 }).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    itemsIn: integer("items_in").default(0).notNull(),
    itemsOut: integer("items_out").default(0).notNull(),
    error: text("error"),
    cursorBefore: jsonb("cursor_before"),
    cursorAfter: jsonb("cursor_after"),
  },
  (t) => ({
    idxJobStarted: index("idx_sync_runs_job_started").on(t.jobName, t.startedAt),
    idxJobStatus: index("idx_sync_runs_job_status").on(t.jobName, t.status),
  })
);

export const indexingQueue = pgTable(
  "indexing_queue",
  {
    id: serial("id").primaryKey(),
    target: varchar("target", { length: 64 }).notNull(),
    targetKind: varchar("target_kind", { length: 16 }).notNull(),
    priority: integer("priority").default(5).notNull(),
    reason: varchar("reason", { length: 64 }),
    enqueuedAt: timestamp("enqueued_at").defaultNow().notNull(),
    pickedUpAt: timestamp("picked_up_at"),
    finishedAt: timestamp("finished_at"),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => ({
    idxPriority: index("idx_indexing_queue_pri").on(t.priority, t.enqueuedAt),
    idxStatus: index("idx_indexing_queue_status").on(t.status),
    uqTargetPending: uniqueIndex("uq_indexing_queue_target_pending").on(
      t.target,
      t.targetKind,
      t.status
    ),
  })
);

export const tokenMetadata = pgTable(
  "token_metadata",
  {
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    name: text("name"),
    symbol: text("symbol"),
    description: text("description"),
    thumbnail: text("thumbnail"),
    artifactUri: text("artifact_uri"),
    displayUri: text("display_uri"),
    mimeType: varchar("mime_type", { length: 128 }),
    creators: jsonb("creators"),
    tags: jsonb("tags"),
    formats: jsonb("formats"),
    attributes: jsonb("attributes"),
    raw: jsonb("raw"),
    /** Denormalised creator (first entry of `creators` JSON). */
    creatorAddress: varchar("creator_address", { length: 64 }),
    /** Total editions supply, if known. */
    supply: bigint("supply", { mode: "number" }),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex("pk_token_metadata").on(t.tokenContract, t.tokenId),
    idxContract: index("idx_token_metadata_contract").on(t.tokenContract),
    idxCreator: index("idx_token_metadata_creator").on(t.creatorAddress),
  })
);

export const contractMetadata = pgTable(
  "contract_metadata",
  {
    address: varchar("address", { length: 36 }).primaryKey(),
    kind: varchar("kind", { length: 32 }),
    alias: text("alias"),
    creator: varchar("creator", { length: 36 }),
    interfaces: jsonb("interfaces"),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export const addressLabels = pgTable(
  "address_labels",
  {
    address: varchar("address", { length: 64 }).primaryKey(),
    label: text("label"),
    category: varchar("category", { length: 32 }),
    tezosDomain: text("tezos_domain"),
    notes: text("notes"),
    hasEverMinted: boolean("has_ever_minted").default(false).notNull(),
    lastResolvedAt: timestamp("last_resolved_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxCategory: index("idx_address_labels_category").on(t.category),
    idxHasMinted: index("idx_address_labels_minted").on(t.hasEverMinted),
  })
);

export const collectionTypeEnum = pgEnum("collection_type", [
  "curation",
  "wtf_gallery",
  "trade_board_listing",
  "objkt_curation",
  "external_listing",
  "custom",
]);

export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: collectionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 120 }),
    isPublic: boolean("is_public").default(false).notNull(),
    coverUri: text("cover_uri"),
    metadata: jsonb("metadata"),
    externalRef: varchar("external_ref", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxUser: index("idx_collections_user").on(t.userId, t.type),
    uqUserTypeSlug: uniqueIndex("uq_collections_user_type_slug").on(
      t.userId,
      t.type,
      t.slug
    ),
    idxPublic: index("idx_collections_public").on(t.isPublic, t.type),
  })
);

export const collectionItems = pgTable(
  "collection_items",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id")
      .references(() => collections.id, { onDelete: "cascade" })
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    note: text("note"),
    position: integer("position").default(0).notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => ({
    uqCollectionToken: uniqueIndex("uq_collection_items_unique").on(
      t.collectionId,
      t.tokenContract,
      t.tokenId
    ),
    idxCollection: index("idx_collection_items_collection").on(
      t.collectionId,
      t.position
    ),
    idxToken: index("idx_collection_items_token").on(
      t.tokenContract,
      t.tokenId
    ),
  })
);

export const walletHoldings = pgTable(
  "wallet_holdings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 36 }).notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    /** Accumulated balance derived from transfer deltas. */
    balance: text("balance").notNull(),
    /** MIN(wallet_events.timestamp WHERE event_type='token_transfer_in'). */
    firstAcquiredAt: timestamp("first_acquired_at"),
    /** MAX(wallet_events.timestamp) for this (wallet,contract,tokenId). */
    lastActivityAt: timestamp("last_activity_at"),
    /** Last time holdings-derive confirmed this row from events. */
    derivedAt: timestamp("derived_at").defaultNow().notNull(),
    /** TzKT authoritative timestamps (populated in phase 3). */
    tzktFirstTime: timestamp("tzkt_first_time"),
    tzktLastTime: timestamp("tzkt_last_time"),
    /** True when counterparty of first_acquired is one of the user's own wallets OR the user minted. */
    isCreator: boolean("is_creator").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uqWalletToken: uniqueIndex("uq_holdings_wallet_token").on(
      t.walletAddress,
      t.tokenContract,
      t.tokenId
    ),
    idxUserActivity: index("idx_holdings_user_activity").on(
      t.userId,
      t.lastActivityAt
    ),
    idxUserAcquired: index("idx_holdings_user_acquired").on(
      t.userId,
      t.firstAcquiredAt
    ),
    idxContractToken: index("idx_holdings_contract_token").on(
      t.tokenContract,
      t.tokenId
    ),
  })
);
