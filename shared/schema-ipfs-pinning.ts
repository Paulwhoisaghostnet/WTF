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
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import {
  atprotoHandleClaims,
  wtfosAtprotoIdentities,
} from "./schema-social";
import { wtfUserSites } from "./schema-wtf-sites";

export const ipfsPinningScopeTypeEnum = pgEnum("ipfs_pinning_scope_type", [
  "wallet_full",
  "wallet_collection",
  "token",
  "macaroni_drop",
  "media_item",
  "project_bundle",
  "manual_upload",
]);

export const ipfsPinningProviderKindEnum = pgEnum("ipfs_pinning_provider_kind", [
  "wtfos_porcupin_hetzner",
  "pinata",
  "user_porcupin",
]);

export const ipfsPinningPolicyStatusEnum = pgEnum("ipfs_pinning_policy_status", [
  "pending_identity",
  "active",
  "paused",
  "disabled",
]);

export const ipfsPinningJobStatusEnum = pgEnum("ipfs_pinning_job_status", [
  "queued",
  "staged",
  "pinned",
  "failed",
  "skipped",
]);

export const ipfsPinningPdsStatusEnum = pgEnum("ipfs_pinning_pds_status", [
  "pending_identity",
  "queued",
  "published",
  "failed",
  "skipped",
]);

export const ipfsPinningBindingStatusEnum = pgEnum("ipfs_pinning_binding_status", [
  "pending_identity",
  "active",
  "paused",
  "suspended",
]);

export const ipfsPinningPolicies = pgTable(
  "ipfs_pinning_policies",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    scopeType: ipfsPinningScopeTypeEnum("scope_type").notNull(),
    scopeRef: text("scope_ref"),
    walletAddress: varchar("wallet_address", { length: 80 }),
    sourceChain: varchar("source_chain", { length: 32 }).default("tezos").notNull(),
    includeExisting: boolean("include_existing").default(true).notNull(),
    includeFuture: boolean("include_future").default(false).notNull(),
    publicDiscovery: boolean("public_discovery").default(false).notNull(),
    providerKey: varchar("provider_key", { length: 80 }).default("wtfos-porcupin-hetzner").notNull(),
    status: ipfsPinningPolicyStatusEnum("status").default("pending_identity").notNull(),
    exclusions: jsonb("exclusions")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    pdsPolicyRecordUri: text("pds_policy_record_uri"),
    pdsPolicyRecordCid: varchar("pds_policy_record_cid", { length: 255 }),
    sourceEventId: varchar("source_event_id", { length: 128 }),
    lastScanAt: timestamp("last_scan_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ipfs_pinning_policies_user_status_idx").on(table.userId, table.status),
    index("ipfs_pinning_policies_scope_idx").on(table.scopeType, table.scopeRef),
    index("ipfs_pinning_policies_wallet_idx").on(table.walletAddress),
  ]
);

export const ipfsPinningManifests = pgTable(
  "ipfs_pinning_manifests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    policyId: integer("policy_id").references(() => ipfsPinningPolicies.id, {
      onDelete: "set null",
    }),
    scopeType: ipfsPinningScopeTypeEnum("scope_type").notNull(),
    scopeRef: text("scope_ref"),
    walletAddress: varchar("wallet_address", { length: 80 }),
    sourceChain: varchar("source_chain", { length: 32 }).default("tezos").notNull(),
    title: varchar("title", { length: 240 }),
    itemCount: integer("item_count").default(0).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).default(0).notNull(),
    providerKey: varchar("provider_key", { length: 80 }).default("wtfos-porcupin-hetzner").notNull(),
    pdsStatus: ipfsPinningPdsStatusEnum("pds_status").default("pending_identity").notNull(),
    pdsManifestRecordUri: text("pds_manifest_record_uri"),
    pdsManifestRecordCid: varchar("pds_manifest_record_cid", { length: 255 }),
    manifestBucket: varchar("manifest_bucket", { length: 255 }),
    manifestKey: text("manifest_key"),
    storageBoxMirrorStatus: varchar("storage_box_mirror_status", { length: 32 }).default("not_configured").notNull(),
    storageBoxMirrorError: text("storage_box_mirror_error"),
    sourceEventId: varchar("source_event_id", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("ipfs_pinning_manifests_user_created_idx").on(table.userId, table.createdAt),
    index("ipfs_pinning_manifests_policy_idx").on(table.policyId),
    index("ipfs_pinning_manifests_pds_idx").on(table.pdsStatus),
  ]
);

export const ipfsPinningJobs = pgTable(
  "ipfs_pinning_jobs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    policyId: integer("policy_id").references(() => ipfsPinningPolicies.id, {
      onDelete: "set null",
    }),
    manifestId: integer("manifest_id").references(() => ipfsPinningManifests.id, {
      onDelete: "set null",
    }),
    scopeType: ipfsPinningScopeTypeEnum("scope_type").notNull(),
    scopeRef: text("scope_ref"),
    source: varchar("source", { length: 80 }).default("manual").notNull(),
    sourceUri: text("source_uri"),
    fileName: text("file_name"),
    mimeType: varchar("mime_type", { length: 255 }),
    byteSize: bigint("byte_size", { mode: "number" }).default(0).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    cid: varchar("cid", { length: 255 }),
    providerKey: varchar("provider_key", { length: 80 }).default("wtfos-porcupin-hetzner").notNull(),
    providerPinId: text("provider_pin_id"),
    status: ipfsPinningJobStatusEnum("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    s3Bucket: varchar("s3_bucket", { length: 255 }),
    s3Key: text("s3_key"),
    s3Endpoint: text("s3_endpoint"),
    s3Region: varchar("s3_region", { length: 80 }),
    storageStatus: varchar("storage_status", { length: 32 }).default("not_configured").notNull(),
    porcupinStatus: varchar("porcupin_status", { length: 32 }).default("pending").notNull(),
    manifestKey: text("manifest_key"),
    pdsItemRecordUri: text("pds_item_record_uri"),
    pdsItemRecordCid: varchar("pds_item_record_cid", { length: 255 }),
    sourceEventId: varchar("source_event_id", { length: 128 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("ipfs_pinning_jobs_user_status_idx").on(table.userId, table.status),
    index("ipfs_pinning_jobs_policy_idx").on(table.policyId),
    index("ipfs_pinning_jobs_manifest_idx").on(table.manifestId),
    index("ipfs_pinning_jobs_cid_idx").on(table.cid),
  ]
);

export const ipfsPinningSubdomainBindings = pgTable(
  "ipfs_pinning_subdomain_bindings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    userSiteId: integer("user_site_id").references(() => wtfUserSites.id, {
      onDelete: "set null",
    }),
    wtfosIdentityId: integer("wtfos_identity_id").references(
      () => wtfosAtprotoIdentities.id,
      { onDelete: "set null" }
    ),
    atprotoHandleClaimId: integer("atproto_handle_claim_id").references(
      () => atprotoHandleClaims.id,
      { onDelete: "set null" }
    ),
    manifestId: integer("manifest_id").references(() => ipfsPinningManifests.id, {
      onDelete: "set null",
    }),
    host: varchar("host", { length: 255 }),
    repoDid: varchar("repo_did", { length: 255 }),
    repoHandle: varchar("repo_handle", { length: 255 }),
    pdsUrl: text("pds_url"),
    pinManifestRecordUri: text("pin_manifest_record_uri"),
    pinManifestRecordCid: varchar("pin_manifest_record_cid", { length: 255 }),
    publicDiscoveryEnabled: boolean("public_discovery_enabled").default(false).notNull(),
    status: ipfsPinningBindingStatusEnum("status").default("pending_identity").notNull(),
    lastPublishedAt: timestamp("last_published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ipfs_pinning_bindings_user_unique").on(table.userId),
    index("ipfs_pinning_bindings_host_idx").on(table.host),
    index("ipfs_pinning_bindings_site_idx").on(table.userSiteId),
    index("ipfs_pinning_bindings_identity_idx").on(table.wtfosIdentityId),
  ]
);

export const ipfsPinningProviderStatus = pgTable(
  "ipfs_pinning_provider_status",
  {
    providerKey: varchar("provider_key", { length: 80 }).primaryKey(),
    providerKind: ipfsPinningProviderKindEnum("provider_kind").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    health: varchar("health", { length: 32 }).default("unknown").notNull(),
    storageRoot: text("storage_root").default("/mnt/wtf-data/workers/porcupin").notNull(),
    s3Bucket: varchar("s3_bucket", { length: 255 }),
    s3Prefix: text("s3_prefix").default("ipfs-pinning/users").notNull(),
    lastCheckAt: timestamp("last_check_at"),
    lastError: text("last_error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("ipfs_pinning_provider_health_idx").on(table.health)]
);
