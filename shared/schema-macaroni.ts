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
  uniqueIndex,
  bigint,
  boolean,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import { ipfsPinningJobs } from "./schema-ipfs-pinning";

export const macaroniPackageStatusEnum = pgEnum("macaroni_package_status", [
  "draft",
  "finalized",
  "archived",
]);

export const macaroniPackageItemStatusEnum = pgEnum("macaroni_package_item_status", [
  "uploaded",
  "ready",
  "needs_metadata",
  "failed",
]);

export const macaroniRevealNetworkEnum = pgEnum("macaroni_reveal_network", [
  "mainnet",
  "shadownet",
]);

export const macaroniRevealModeEnum = pgEnum("macaroni_reveal_mode", [
  "instant",
  "delayed",
]);

export const macaroniRevealStatusEnum = pgEnum("macaroni_reveal_status", [
  "active",
  "completed",
  "paused",
]);

/**
 * V3.5 is intentionally stored alongside, rather than in place of, the V3
 * reveal tables.  That keeps existing drops forward-compatible while the
 * private-asset fulfillment contract ABI is finalized.
 */
export const macaroniV35ProviderEnum = pgEnum("macaroni_v35_provider", [
  "wtfos_managed",
  "creator_companion",
]);

export const macaroniV35AssetStrategyEnum = pgEnum("macaroni_v35_asset_strategy", [
  "public_prepin_private_manifest",
  "pin_on_claim",
]);

export const macaroniV35FulfillmentTriggerEnum = pgEnum("macaroni_v35_fulfillment_trigger", [
  "immediate",
  "rolling_delay",
  "absolute_time",
  "sellout",
]);

export const macaroniV35DropStatusEnum = pgEnum("macaroni_v35_drop_status", [
  "setup_required",
  "ready",
  "active",
  "paused",
  "closed",
  "blocked",
  "completed",
  "cancelled",
]);

export const macaroniV35PrivateAssetKindEnum = pgEnum("macaroni_v35_private_asset_kind", [
  "artifact",
  "display",
  "thumbnail",
  "metadata",
]);

export const macaroniV35PrivateAssetStatusEnum = pgEnum("macaroni_v35_private_asset_status", [
  "staged",
  "pinned_private",
  "allocated",
  "published",
  "failed",
]);

export const macaroniV35WorkTypeEnum = pgEnum("macaroni_v35_work_type", [
  "scan_claims",
  "arm_fulfillment",
  "simulate_allocation",
  "settle_claim",
  "publish_artifact_car",
  "publish_metadata_car",
  "verify_nft_ready",
  "sweep_funds",
]);

export const macaroniV35ClaimStateEnum = pgEnum("macaroni_v35_claim_state", [
  "secured",
  "allocation_simulated",
  "settling",
  "artwork_secured",
  "publishing_ipfs",
  "nft_ready",
  "needs_reconciliation",
]);

export const macaroniV35WorkStateEnum = pgEnum("macaroni_v35_work_state", [
  "queued",
  "leased",
  "prepared",
  "submitted",
  "applied",
  "retry_wait",
  "manual_review",
  "completed",
  "cancelled",
]);

export const macaroniV35SetupStatusEnum = pgEnum("macaroni_v35_setup_status", [
  "pending",
  "in_progress",
  "submitted",
  "complete",
  "failed",
  "blocked",
]);

export const macaroniV35OperationStateEnum = pgEnum("macaroni_v35_operation_state", [
  "ready",
  "awaiting_signature",
  "wallet_prompt_started",
  "wallet_rejected",
  "submitted",
  "confirming",
  "applied",
  "failed",
  "needs_reconciliation",
]);

export const macaroniV35FundingAccountEnum = pgEnum("macaroni_v35_funding_account", [
  "contract_reserve",
  "operator_gas",
  "sales_proceeds",
]);

export const macaroniV35FundingDirectionEnum = pgEnum("macaroni_v35_funding_direction", [
  "credit",
  "debit",
]);

export const macaroniV35FundingKindEnum = pgEnum("macaroni_v35_funding_kind", [
  "initial_reserve",
  "sale_subsidy",
  "finalizer_reimbursement",
  "automatic_final_sweep",
  "operator_gas_funding",
  "adjustment",
]);

export type MacaroniPackageAttribute = {
  name: string;
  value: string;
};

export type MacaroniPackageReadiness = {
  hasMedia: boolean;
  hasMetadata: boolean;
  hasName: boolean;
  readyForMint: boolean;
  warnings: string[];
};

export const macaroniPackages = pgTable(
  "macaroni_packages",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").default("").notNull(),
    schemaVersion: varchar("schema_version", { length: 80 })
      .default("wtfos.macaroni-package.v1")
      .notNull(),
    status: macaroniPackageStatusEnum("status").default("draft").notNull(),
    itemCount: integer("item_count").default(0).notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).default(0).notNull(),
    averageBytes: bigint("average_bytes", { mode: "number" }).default(0).notNull(),
    csvText: text("csv_text"),
    csvCid: varchar("csv_cid", { length: 255 }),
    csvJobId: integer("csv_job_id").references(() => ipfsPinningJobs.id, {
      onDelete: "set null",
    }),
    manifestJson: jsonb("manifest_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    manifestCid: varchar("manifest_cid", { length: 255 }),
    manifestJobId: integer("manifest_job_id").references(() => ipfsPinningJobs.id, {
      onDelete: "set null",
    }),
    dropConfig: jsonb("drop_config")
      .$type<Record<string, unknown>>()
      .default(sql`'{"exportTarget":"macaroni","layout":"single-page","theme":"gallery-white","headline":"Untitled drop","intro":"A wtfOS-staged collection package.","callToAction":"View collection","modules":{"dropStory":true,"mintPanel":true,"tokenGrid":true,"recentMints":false,"mintGallery":true,"leaderboard":false,"collectionCompletion":false}}'::jsonb`)
      .notNull(),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("macaroni_packages_owner_status_idx").on(table.ownerUserId, table.status),
    index("macaroni_packages_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  ]
);

export const macaroniPackageItems = pgTable(
  "macaroni_package_items",
  {
    id: serial("id").primaryKey(),
    packageId: integer("package_id")
      .references(() => macaroniPackages.id, { onDelete: "cascade" })
      .notNull(),
    tokenId: integer("token_id").notNull(),
    originalFilename: varchar("original_filename", { length: 512 }).notNull(),
    originalTitle: varchar("original_title", { length: 300 }).notNull(),
    normalizedFilename: varchar("normalized_filename", { length: 120 }).notNull(),
    tokenName: varchar("token_name", { length: 300 }).notNull(),
    tokenDescription: text("token_description").default("").notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    mediaCid: varchar("media_cid", { length: 255 }).notNull(),
    mediaJobId: integer("media_job_id").references(() => ipfsPinningJobs.id, {
      onDelete: "set null",
    }),
    metadataCid: varchar("metadata_cid", { length: 255 }),
    metadataJobId: integer("metadata_job_id").references(() => ipfsPinningJobs.id, {
      onDelete: "set null",
    }),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    attributes: jsonb("attributes")
      .$type<MacaroniPackageAttribute[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    readiness: jsonb("readiness")
      .$type<MacaroniPackageReadiness>()
      .default(sql`'{"hasMedia":false,"hasMetadata":false,"hasName":false,"readyForMint":false,"warnings":[]}'::jsonb`)
      .notNull(),
    status: macaroniPackageItemStatusEnum("status").default("uploaded").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_package_items_token_unique_idx").on(table.packageId, table.tokenId),
    index("macaroni_package_items_package_idx").on(table.packageId),
    index("macaroni_package_items_media_cid_idx").on(table.mediaCid),
  ]
);

export const macaroniRevealJobs = pgTable(
  "macaroni_reveal_jobs",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" }),
    network: macaroniRevealNetworkEnum("network").notNull(),
    contract: varchar("contract", { length: 36 }).notNull(),
    administrator: varchar("administrator", { length: 36 }).notNull(),
    revealOperator: varchar("reveal_operator", { length: 36 }).notNull(),
    mode: macaroniRevealModeEnum("mode").notNull(),
    revealDelaySeconds: integer("reveal_delay_seconds").default(0).notNull(),
    encryptedManifest: text("encrypted_manifest").notNull(),
    status: macaroniRevealStatusEnum("status").default("active").notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastOperationHash: varchar("last_operation_hash", { length: 51 }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_reveal_jobs_network_contract_unique_idx").on(table.network, table.contract),
    index("macaroni_reveal_jobs_due_idx").on(table.status, table.nextAttemptAt),
    index("macaroni_reveal_jobs_owner_idx").on(table.ownerUserId, table.updatedAt),
  ]
);

export type MacaroniV35PublicStatus = {
  state: "setup_required" | "ready" | "active" | "paused" | "closed" | "blocked" | "completed" | "cancelled";
  message: string;
  fulfilledClaims: number;
  pendingClaims: number;
};

export const macaroniV35Drops = pgTable(
  "macaroni_v35_drops",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    clientSetupId: varchar("client_setup_id", { length: 100 }).notNull(),
    registrationDigest: varchar("registration_digest", { length: 64 }).notNull(),
    network: macaroniRevealNetworkEnum("network").notNull(),
    contract: varchar("contract", { length: 36 }),
    administrator: varchar("administrator", { length: 36 }).notNull(),
    administratorPublicKey: varchar("administrator_public_key", { length: 128 }).notNull(),
    provider: macaroniV35ProviderEnum("provider").notNull(),
    assetStrategy: macaroniV35AssetStrategyEnum("asset_strategy").notNull(),
    fulfillmentTrigger: macaroniV35FulfillmentTriggerEnum("fulfillment_trigger").notNull(),
    claimDelaySeconds: integer("claim_delay_seconds").default(0).notNull(),
    claimIntervalSeconds: integer("claim_interval_seconds").default(0).notNull(),
    fulfillmentScheduledAt: timestamp("fulfillment_scheduled_at", { withTimezone: true }),
    salesProceedsAddress: varchar("sales_proceeds_address", { length: 36 }).notNull(),
    operatorAddress: varchar("operator_address", { length: 36 }),
    operatorWalletRef: text("operator_wallet_ref"),
    abiVersion: varchar("abi_version", { length: 120 }),
    abiValidatedAt: timestamp("abi_validated_at", { withTimezone: true }),
    serviceReady: boolean("service_ready").default(false).notNull(),
    status: macaroniV35DropStatusEnum("status").default("setup_required").notNull(),
    publicStatus: jsonb("public_status")
      .$type<MacaroniV35PublicStatus>()
      .default(sql`'{"state":"setup_required","message":"Creator setup is incomplete.","fulfilledClaims":0,"pendingClaims":0}'::jsonb`)
      .notNull(),
    physicalSupply: integer("physical_supply"),
    supplyFixedAt: timestamp("supply_fixed_at", { withTimezone: true }),
    encryptedEntropyManifestRef: text("encrypted_entropy_manifest_ref"),
    encryptedEntropyRecoveryRef: text("encrypted_entropy_recovery_ref"),
    entropyHead: varchar("entropy_head", { length: 64 }),
    entropyChainLength: integer("entropy_chain_length"),
    entropyKeyVersion: varchar("entropy_key_version", { length: 80 }),
    entropyRecoveryKeyVersion: varchar("entropy_recovery_key_version", { length: 80 }),
    entropyRecoveryVersion: varchar("entropy_recovery_version", { length: 80 }),
    entropyGeneratedAt: timestamp("entropy_generated_at", { withTimezone: true }),
    reserveEstimateVersion: varchar("reserve_estimate_version", { length: 80 }),
    fulfillmentSubsidyMutez: bigint("fulfillment_subsidy_mutez", { mode: "number" }).default(0).notNull(),
    contractReserveRequiredMutez: bigint("contract_reserve_required_mutez", { mode: "number" }).default(0).notNull(),
    contractReserveObservedMutez: bigint("contract_reserve_observed_mutez", { mode: "number" }).default(0).notNull(),
    operatorGasObservedMutez: bigint("operator_gas_observed_mutez", { mode: "number" }).default(0).notNull(),
    operatorGasReady: boolean("operator_gas_ready").default(false).notNull(),
    indexedPurchaseClaims: integer("indexed_purchase_claims").default(0).notNull(),
    lastScannedPurchaseEventId: bigint("last_scanned_purchase_event_id", { mode: "number" }).default(0).notNull(),
    salePermanentlyClosedAt: timestamp("sale_permanently_closed_at", { withTimezone: true }),
    finalFulfillmentAt: timestamp("final_fulfillment_at", { withTimezone: true }),
    finalSweepOperationHash: varchar("final_sweep_operation_hash", { length: 51 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_v35_drops_network_contract_unique_idx").on(table.network, table.contract),
    uniqueIndex("macaroni_v35_drops_owner_setup_unique_idx").on(table.ownerUserId, table.clientSetupId),
    index("macaroni_v35_drops_owner_idx").on(table.ownerUserId, table.updatedAt),
    index("macaroni_v35_drops_status_idx").on(table.status, table.updatedAt),
  ]
);

export const macaroniV35ClaimFulfillments = pgTable(
  "macaroni_v35_claim_fulfillments",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    claimId: varchar("claim_id", { length: 160 }).notNull(),
    purchaseOperationHash: varchar("purchase_operation_hash", { length: 51 }).notNull(),
    purchaseTransactionId: bigint("purchase_transaction_id", { mode: "number" }).notNull(),
    purchaseEventId: bigint("purchase_event_id", { mode: "number" }).notNull(),
    purchaseEventIndex: integer("purchase_event_index").notNull(),
    buyer: varchar("buyer", { length: 36 }).notNull(),
    recipient: varchar("recipient", { length: 36 }).notNull(),
    unit: integer("unit").notNull(),
    purchaseLevel: integer("purchase_level").notNull(),
    purchaseTime: timestamp("purchase_time", { withTimezone: true }).notNull(),
    stageId: integer("stage_id").notNull(),
    claimPosition: integer("claim_position").notNull(),
    allocatedTokenSlot: integer("allocated_token_slot"),
    allocationDigest: varchar("allocation_digest", { length: 64 }),
    metadataCommitment: varchar("metadata_commitment", { length: 64 }),
    state: macaroniV35ClaimStateEnum("state").default("secured").notNull(),
    settlementOperationHash: varchar("settlement_operation_hash", { length: 51 }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_v35_claim_drop_claim_unique_idx").on(table.dropId, table.claimId),
    uniqueIndex("macaroni_v35_claim_drop_position_unique_idx").on(table.dropId, table.claimPosition),
    uniqueIndex("macaroni_v35_claim_purchase_event_unique_idx").on(
      table.dropId,
      table.purchaseEventId
    ),
    index("macaroni_v35_claim_purchase_operation_idx").on(table.purchaseOperationHash),
    index("macaroni_v35_claim_drop_state_idx").on(table.dropId, table.state),
  ]
);

export const macaroniV35PrivateAssets = pgTable(
  "macaroni_v35_private_assets",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    tokenSlot: integer("token_slot").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    kind: macaroniV35PrivateAssetKindEnum("kind").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    encryptedStorageRef: text("encrypted_storage_ref").notNull(),
    encryptionKeyVersion: varchar("encryption_key_version", { length: 80 }).notNull(),
    commitment: varchar("commitment", { length: 64 }).notNull(),
    encryptedCidPayload: text("encrypted_cid_payload"),
    publishedCid: varchar("published_cid", { length: 255 }),
    status: macaroniV35PrivateAssetStatusEnum("status").default("staged").notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_v35_private_assets_slot_kind_unique_idx").on(
      table.dropId,
      table.tokenSlot,
      table.kind
    ),
    uniqueIndex("macaroni_v35_private_assets_digest_unique_idx").on(
      table.dropId,
      table.kind,
      table.checksumSha256
    ).where(sql`${table.kind} in ('artifact', 'metadata')`),
    uniqueIndex("macaroni_v35_private_assets_commitment_unique_idx").on(
      table.dropId,
      table.kind,
      table.commitment
    ).where(sql`${table.kind} in ('artifact', 'metadata')`),
    index("macaroni_v35_private_assets_drop_status_idx").on(table.dropId, table.status),
  ]
);

export const macaroniV35WorkItems = pgTable(
  "macaroni_v35_work_items",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    claimFulfillmentId: integer("claim_fulfillment_id").references(
      () => macaroniV35ClaimFulfillments.id,
      { onDelete: "cascade" }
    ),
    dependsOnWorkItemId: integer("depends_on_work_item_id"),
    workType: macaroniV35WorkTypeEnum("work_type").notNull(),
    semanticKey: varchar("semantic_key", { length: 255 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    state: macaroniV35WorkStateEnum("state").default("queued").notNull(),
    eligibleAt: timestamp("eligible_at", { withTimezone: true }).defaultNow().notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseOwner: varchar("lease_owner", { length: 160 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    operationHash: varchar("operation_hash", { length: 51 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    lastError: text("last_error"),
    errorClass: varchar("error_class", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.dependsOnWorkItemId],
      foreignColumns: [table.id],
      name: "macaroni_v35_work_dependency_fk",
    }).onDelete("restrict"),
    uniqueIndex("macaroni_v35_work_semantic_unique_idx").on(table.dropId, table.workType, table.semanticKey),
    index("macaroni_v35_work_due_idx").on(table.state, table.nextAttemptAt, table.eligibleAt),
    index("macaroni_v35_work_lease_idx").on(table.state, table.leaseExpiresAt),
    index("macaroni_v35_work_dependency_idx").on(table.dependsOnWorkItemId, table.state),
  ]
);

export const macaroniV35FundingLedger = pgTable(
  "macaroni_v35_funding_ledger",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    direction: macaroniV35FundingDirectionEnum("direction").notNull(),
    account: macaroniV35FundingAccountEnum("account").notNull(),
    kind: macaroniV35FundingKindEnum("kind").notNull(),
    amountMutez: bigint("amount_mutez", { mode: "number" }).notNull(),
    balanceAfterMutez: bigint("balance_after_mutez", { mode: "number" }),
    semanticEventKey: varchar("semantic_event_key", { length: 255 }).notNull(),
    operationHash: varchar("operation_hash", { length: 51 }),
    sourceRef: varchar("source_ref", { length: 255 }),
    details: jsonb("details").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_v35_funding_event_unique_idx").on(table.dropId, table.semanticEventKey),
    index("macaroni_v35_funding_operation_idx").on(table.dropId, table.operationHash),
    index("macaroni_v35_funding_drop_time_idx").on(table.dropId, table.occurredAt),
  ]
);

export const macaroniV35SetupSteps = pgTable(
  "macaroni_v35_setup_steps",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    stepKey: varchar("step_key", { length: 100 }).notNull(),
    status: macaroniV35SetupStatusEnum("status").default("pending").notNull(),
    intentDigest: varchar("intent_digest", { length: 64 }).notNull(),
    expectedPostcondition: jsonb("expected_postcondition")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    parameters: jsonb("parameters")
      .$type<Record<string, unknown> | unknown[] | null>()
      .default(sql`'null'::jsonb`),
    network: macaroniRevealNetworkEnum("network").notNull(),
    signer: varchar("signer", { length: 36 }),
    target: varchar("target", { length: 36 }),
    entrypoint: varchar("entrypoint", { length: 100 }).notNull(),
    amountMutez: bigint("amount_mutez", { mode: "number" }).default(0).notNull(),
    operationHash: varchar("operation_hash", { length: 51 }),
    details: jsonb("details").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("macaroni_v35_setup_drop_step_unique_idx").on(table.dropId, table.stepKey),
    index("macaroni_v35_setup_drop_status_idx").on(table.dropId, table.status),
  ]
);

export const macaroniV35OperationAttempts = pgTable(
  "macaroni_v35_operation_attempts",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .references(() => macaroniV35Drops.id, { onDelete: "cascade" })
      .notNull(),
    workItemId: integer("work_item_id").references(() => macaroniV35WorkItems.id, {
      onDelete: "set null",
    }),
    setupStepId: integer("setup_step_id").references(() => macaroniV35SetupSteps.id, {
      onDelete: "set null",
    }),
    retryOfAttemptId: integer("retry_of_attempt_id"),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    intent: varchar("intent", { length: 100 }).notNull(),
    intentDigest: varchar("intent_digest", { length: 64 }).notNull(),
    expectedPostcondition: jsonb("expected_postcondition")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    parameters: jsonb("parameters")
      .$type<Record<string, unknown> | unknown[] | null>()
      .default(sql`'null'::jsonb`),
    network: macaroniRevealNetworkEnum("network").notNull(),
    signer: varchar("signer", { length: 36 }),
    target: varchar("target", { length: 36 }),
    entrypoint: varchar("entrypoint", { length: 100 }).notNull(),
    amountMutez: bigint("amount_mutez", { mode: "number" }).default(0).notNull(),
    state: macaroniV35OperationStateEnum("state").default("ready").notNull(),
    operationHash: varchar("operation_hash", { length: 51 }),
    walletResponseId: varchar("wallet_response_id", { length: 80 }),
    walletSenderId: varchar("wallet_sender_id", { length: 80 }),
    encryptedSignedBytes: text("encrypted_signed_bytes"),
    signedBytesKeyVersion: varchar("signed_bytes_key_version", { length: 80 }),
    signedOperationBranch: varchar("signed_operation_branch", { length: 51 }),
    signedBranchLevel: integer("signed_branch_level"),
    signerCounter: bigint("signer_counter", { mode: "number" }),
    submissionHeadHash: varchar("submission_head_hash", { length: 51 }),
    submissionHeadLevel: integer("submission_head_level"),
    submissionHeadObservedAt: timestamp("submission_head_observed_at", { withTimezone: true }),
    originatedContract: varchar("originated_contract", { length: 36 }),
    error: text("error"),
    reconciliation: jsonb("reconciliation").$type<Record<string, unknown> | null>(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.retryOfAttemptId],
      foreignColumns: [table.id],
      name: "macaroni_v35_operation_retry_fk",
    }).onDelete("set null"),
    uniqueIndex("macaroni_v35_operation_request_unique_idx").on(table.requestId),
    uniqueIndex("macaroni_v35_wallet_abort_response_unique_idx")
      .on(table.walletResponseId)
      .where(sql`${table.walletResponseId} is not null`),
    uniqueIndex("macaroni_v35_operator_inflight_unique_idx")
      .on(table.network, table.signer)
      .where(sql`${table.workItemId} is not null and ${table.signer} is not null and ${table.state} in ('ready', 'submitted', 'confirming', 'needs_reconciliation')`),
    index("macaroni_v35_operation_work_idx").on(table.workItemId, table.state),
    index("macaroni_v35_operation_hash_idx").on(table.operationHash),
  ]
);
