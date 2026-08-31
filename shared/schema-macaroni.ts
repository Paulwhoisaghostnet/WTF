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
      .references(() => users.id, { onDelete: "cascade" }),
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
