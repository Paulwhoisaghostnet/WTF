import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, customType, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema-core";

/** Objkt transfer events admitted to Horf's Tezos mainnet seasonal ledger. */
export const horfTransferEvents = pgTable(
  "horf_transfer_events",
  {
    eventId: bigint("event_id", { mode: "number" }).primaryKey(),
    seasonStart: timestamp("season_start", { withTimezone: true }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    tokenContract: text("token_contract").notNull(),
    tokenId: text("token_id").notNull(),
    tokenName: text("token_name").notNull(),
    tokenImage: text("token_image"),
    operationHash: text("operation_hash"),
    lastSeenRun: text("last_seen_run"),
  },
  (table) => [
    index("horf_transfer_events_season_from_idx").on(table.seasonStart, table.fromAddress),
    index("horf_transfer_events_season_to_idx").on(table.seasonStart, table.toAddress),
    index("horf_transfer_events_season_recent_idx").on(table.seasonStart, table.occurredAt),
  ],
);

/** Durable cursor and completeness state for an evidence-backed season window. */
export const horfSeasonSync = pgTable("horf_season_sync", {
  seasonStart: timestamp("season_start", { withTimezone: true }).primaryKey(),
  seasonEnd: timestamp("season_end", { withTimezone: true }),
  cursor: bigint("cursor", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("syncing"),
  asOf: timestamp("as_of", { withTimezone: true }),
  error: text("error"),
  approvedTags: jsonb("approved_tags").$type<string[]>().notNull().default([]),
  runId: text("run_id"),
  rescan: boolean("rescan").notNull().default(false),
  policyVersion: text("policy_version").notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** TzKT claim events represent escrowed horse receipts between the owner and claimant. */
export const horfStableClaimEvents = pgTable(
  "horf_stable_claim_events",
  {
    contractAddress: text("contract_address").notNull(),
    tzktEventId: bigint("tzkt_event_id", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ownerAddress: text("owner_address").notNull(),
    claimantAddress: text("claimant_address").notNull(),
    mode: smallint("mode").notNull(),
    tokenContract: text("token_contract").notNull(),
    tokenId: text("token_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contractAddress, table.tzktEventId] }),
    index("horf_stable_claim_events_contract_time_idx").on(table.contractAddress, table.occurredAt),
  ],
);

/** Durable TzKT cursor, separate from Objkt's direct-wallet season cursor. */
export const horfStableClaimSync = pgTable("horf_stable_claim_sync", {
  contractAddress: text("contract_address").primaryKey(),
  cursor: bigint("cursor", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("syncing"),
  asOf: timestamp("as_of", { withTimezone: true }),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Confirmed V3 claim and swap events; escrow deposits are not settlements. */
export const horfRoomSettlementEvents = pgTable("horf_room_settlement_events", {
  contractAddress: text("contract_address").notNull(),
  tzktEventId: bigint("tzkt_event_id", { mode: "number" }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  operationHash: text("operation_hash").notNull(),
  mode: smallint("mode").notNull(),
  ownerAddress: text("owner_address").notNull(),
  claimantAddress: text("claimant_address").notNull(),
  outputContract: text("output_contract").notNull(),
  outputTokenId: text("output_token_id").notNull(),
  inputContract: text("input_contract"),
  inputTokenId: text("input_token_id"),
}, (table) => [
  primaryKey({ columns: [table.contractAddress, table.tzktEventId] }),
  index("horf_room_settlement_contract_time_idx").on(table.contractAddress, table.occurredAt),
  index("horf_room_settlement_operation_idx").on(table.operationHash),
]);

export const horfRoomSettlementSync = pgTable("horf_room_settlement_sync", {
  contractAddress: text("contract_address").primaryKey(),
  cursor: bigint("cursor", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("syncing"),
  asOf: timestamp("as_of", { withTimezone: true }),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Saved Tezos wallet contacts for choosing recipients in Horf. */
export const horfPossePartners = pgTable("horf_posse_partners", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  ownerWalletAddress: text("owner_wallet_address"),
  address: text("address").notNull(),
  nickname: text("nickname"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("horf_posse_partners_wallet_address_uq").on(table.ownerWalletAddress, table.address),
  index("horf_posse_partners_user_created_idx").on(table.userId, table.createdAt),
]);

/** A Mainnet Horf wallet appears here only after guest proof or account linkage. */
export const horfVerifiedWallets = pgTable("horf_verified_wallets", {
  address: text("address").primaryKey(),
  firstVerifiedAt: timestamp("first_verified_at", { withTimezone: true }).notNull().defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
  proofSource: text("proof_source").notNull(),
  linkedUserId: integer("linked_user_id").references(() => users.id, { onDelete: "set null" }),
});

const pgBytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** A trader's public horse portrait belongs to the wallet, across seasons. */
export const horfTraderProfiles = pgTable("horf_trader_profiles", {
  address: text("address").primaryKey(),
  horfUsername: varchar("horf_username", { length: 50 }),
  imageUrl: text("image_url"),
  imageBytes: pgBytea("image_bytes"),
  imageMime: text("image_mime"),
  imageSha256: text("image_sha256"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stable commentary is saved for an individual named horse-trading season. */
export const horfTraderSeasonProfiles = pgTable("horf_trader_season_profiles", {
  address: text("address").notNull().references(() => horfTraderProfiles.address, { onDelete: "cascade" }),
  seasonKey: text("season_key").notNull(),
  description: text("description").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.address, table.seasonKey] }),
]);

/** Admin-governed Horf participation restriction; chain history remains public. */
export const horfWalletBlacklist = pgTable("horf_wallet_blacklist", {
  address: text("address").primaryKey(),
  active: boolean("active").notNull().default(true),
  reason: text("reason").notNull(),
  evidenceUrl: text("evidence_url"),
  listedByUserId: integer("listed_by_user_id").notNull().references(() => users.id),
  listedAt: timestamp("listed_at", { withTimezone: true }).notNull().defaultNow(),
  clearedByUserId: integer("cleared_by_user_id").references(() => users.id),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
});

/** Wallet-owned shortlist for tokens the trader wants to bring to Stables. */
export const horfStableSelections = pgTable("horf_stable_selections", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerWalletAddress: text("owner_wallet_address").notNull(),
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  tokenName: text("token_name"),
  tokenImage: text("token_image"),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("horf_stable_selections_wallet_token_uq").on(table.ownerWalletAddress, table.tokenContract, table.tokenId),
]);

/** Human review evidence is a dated snapshot, not proof of FA2 semantics. */
export const horfInspectionRequests = pgTable("horf_inspection_requests", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  submitterAddress: text("submitter_address"),
  source: text("source").notNull().default("owner_submission"),
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  status: text("status").notNull().default("pending"),
  objktMetadata: jsonb("objkt_metadata").$type<Record<string, unknown>>().notNull(),
  chainEvidence: jsonb("chain_evidence").$type<Record<string, unknown>>().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedByWalletAddress: text("reviewed_by_wallet_address"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
}, (table) => [
  index("horf_inspection_requests_status_time_idx").on(table.status, table.submittedAt),
  index("horf_inspection_requests_token_time_idx").on(table.tokenContract, table.tokenId, table.submittedAt),
]);

/** Global token approval, bound to immutable FA2 identity and exact script. */
export const horfInspectionApprovals = pgTable("horf_inspection_approvals", {
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  active: boolean("active").notNull().default(true),
  inspectionId: bigint("inspection_id", { mode: "number" }).notNull().references(() => horfInspectionRequests.id),
  inspectorWalletAddress: text("inspector_wallet_address"),
  inspectorUserId: integer("inspector_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  creatorAddress: text("creator_address").notNull(),
  codeHash: integer("code_hash").notNull(),
  codeSha256: text("code_sha256").notNull(),
  revokedByUserId: integer("revoked_by_user_id").references(() => users.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
}, (table) => [
  primaryKey({ columns: [table.tokenContract, table.tokenId] }),
]);

/** A Marshal's explicit judgment that an exact token is not a horse. */
export const horfTokenNonhorseDecisions = pgTable("horf_token_nonhorse_decisions", {
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  active: boolean("active").notNull().default(true),
  inspectionId: bigint("inspection_id", { mode: "number" }).notNull().references(() => horfInspectionRequests.id),
  marshalUserId: integer("marshal_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tokenContract, table.tokenId] }),
]);

/** Non-escrow owner signals for direct Open Range horse trades. */
export const horfOpenRangeOffers = pgTable("horf_open_range_offers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerWalletAddress: text("owner_wallet_address").notNull(),
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  amount: text("amount").notNull(),
  acceptedTokenPolicy: text("accepted_token_policy").notNull().default("any_qualifying"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("horf_open_range_offers_owner_token_uq").on(table.ownerWalletAddress, table.tokenContract, table.tokenId),
  index("horf_open_range_offers_token_active_idx").on(table.tokenContract, table.tokenId, table.active),
]);

/** Wallet-held availability-sign proposals; escrow states require Mainnet proof. */
export const horfTradeOfferMessages = pgTable("horf_trade_offer_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  signId: bigint("sign_id", { mode: "number" }).notNull().references(() => horfOpenRangeOffers.id),
  offererWalletAddress: text("offerer_wallet_address").notNull(),
  ownerWalletAddress: text("owner_wallet_address").notNull(),
  requestedTokenContract: text("requested_token_contract").notNull(),
  requestedTokenId: text("requested_token_id").notNull(),
  offeredTokenContract: text("offered_token_contract").notNull(),
  offeredTokenId: text("offered_token_id").notNull(),
  message: text("message"),
  status: text("status").notNull().default("proposed"),
  declineReason: text("decline_reason"),
  cancelledByWalletAddress: text("cancelled_by_wallet_address"),
  privateListingId: text("private_listing_id"),
  acceptOperationHash: text("accept_operation_hash"),
  fulfillOperationHash: text("fulfill_operation_hash"),
  cancelOperationHash: text("cancel_operation_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("horf_trade_offer_messages_incoming_idx").on(table.ownerWalletAddress, table.createdAt),
  index("horf_trade_offer_messages_outgoing_idx").on(table.offererWalletAddress, table.createdAt),
  uniqueIndex("horf_trade_offer_messages_active_uq")
    .on(table.signId, table.offererWalletAddress, table.offeredTokenContract, table.offeredTokenId)
    .where(sql`${table.status} IN ('proposed', 'accepted')`),
  uniqueIndex("horf_trade_offer_messages_private_listing_uq")
    .on(table.privateListingId).where(sql`${table.privateListingId} IS NOT NULL`),
]);

/** One current-season HORSE entitlement per canonical outbound event and sender. */
export const horfRewardEntitlements = pgTable("horf_reward_entitlements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  seasonStart: timestamp("season_start", { withTimezone: true }).notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceKey: text("source_key").notNull(),
  traderAddress: text("trader_address").notNull(),
  counterpartyAddress: text("counterparty_address").notNull(),
  units: text("units").notNull(),
  amountRaw: text("amount_raw").notNull(),
  sourceActive: boolean("source_active").notNull().default(true),
  status: text("status").notNull().default("pending"),
  lastSeenRun: text("last_seen_run"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("horf_reward_entitlements_event_trader_uq").on(table.sourceKind, table.sourceKey, table.traderAddress),
  index("horf_reward_entitlements_trader_status_idx").on(table.traderAddress, table.status),
]);

/** A sender-declared horse gift, accepted only after TzKT proves the FA2 transfer. */
export const horfGiftTransfers = pgTable("horf_gift_transfers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tzktTransferId: bigint("tzkt_transfer_id", { mode: "number" }).notNull().unique(),
  operationHash: text("operation_hash").notNull(),
  kind: text("kind").notNull().default("gift"),
  senderUserId: integer("sender_user_id").references(() => users.id, { onDelete: "set null" }),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  tokenContract: text("token_contract").notNull(),
  tokenId: text("token_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  tokenName: text("token_name").notNull(),
  tokenImage: text("token_image"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  returnedFavor: boolean("returned_favor").notNull().default(false),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnedByUserId: integer("returned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("horf_gift_transfers_recipient_time_idx").on(table.toAddress, table.occurredAt),
  index("horf_gift_transfers_operation_idx").on(table.operationHash),
]);
