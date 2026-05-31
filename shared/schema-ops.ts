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
  bigint,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./schema-core";

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: text("value"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    bucketKey: varchar("bucket_key", { length: 512 }).primaryKey(),
    hitCount: integer("hit_count").default(1).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_buckets_expires_idx").on(table.expiresAt)]
);

export const objectStorageUsageChecks = pgTable(
  "object_storage_usage_checks",
  {
    id: serial("id").primaryKey(),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    endpoint: text("endpoint"),
    region: varchar("region", { length: 120 }),
    usedBytes: bigint("used_bytes", { mode: "number" }).default(0).notNull(),
    limitBytes: bigint("limit_bytes", { mode: "number" }).default(0).notNull(),
    percentUsed: numeric("percent_used", { precision: 8, scale: 6 }).default("0").notNull(),
    level: varchar("level", { length: 30 }).default("ok").notNull(),
    uploadsProtected: boolean("uploads_protected").default(false).notNull(),
    accountingSource: varchar("accounting_source", { length: 30 }).default("database").notNull(),
    objectCount: integer("object_count").default(0).notNull(),
    error: text("error"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    index("object_storage_usage_checked_idx").on(table.checkedAt),
    index("object_storage_usage_bucket_idx").on(table.bucket),
  ]
);

export const tzktResponseCache = pgTable(
  "tzkt_response_cache",
  {
    cacheKey: varchar("cache_key", { length: 240 }).primaryKey(),
    endpoint: text("endpoint").notNull(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").default(0).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tzkt_response_cache_endpoint_idx").on(table.endpoint),
    index("tzkt_response_cache_expires_idx").on(table.expiresAt),
    index("tzkt_response_cache_accessed_idx").on(table.lastAccessedAt),
  ]
);

// Status transitions: pending -> in_progress -> completed|failed|skipped
//   failed + attempts<max -> next_attempt_at scheduled -> pending on next poll
export const backfillManifest = pgTable(
  "backfill_manifest",
  {
    id: serial("id").primaryKey(),
    /** Discriminator.  See comment above for the stable set of values. */
    taskType: varchar("task_type", { length: 32 }).notNull(),
    /**
     * Stable string identifier of the thing we're filling in.  Keeps
     * the unique index small and indexable.  Examples:
     *   xtz_price_gap       -> "2021-07-05"
     *   address_label       -> "tz1abc..."
     *   sale_reconcile      -> "<op_hash>|<contract>|<token_id>|<buyer>"
     *   wallet_history      -> "tz1abc..."
     *   token_market        -> "<contract>|<token_id>"
     *   token_mint_enrich   -> "<op_hash>|<contract>|<token_id>"
     *   acquisition_resolve -> "<wallet>|<contract>|<token_id>"
     */
    target: text("target").notNull(),
    /** Optional JSON payload (any extra context the handler needs). */
    payload: jsonb("payload"),
    /** Lower = sooner.  Use 0..100. */
    priority: integer("priority").default(50).notNull(),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(6).notNull(),
    /** Last error captured from a failed handler run (stack trimmed). */
    lastError: text("last_error"),
    /** Most-recent wall time the dispatcher claimed this row. */
    lastAttemptAt: timestamp("last_attempt_at"),
    /** Earliest wall time the dispatcher may re-attempt after a failure. */
    nextAttemptAt: timestamp("next_attempt_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    /** One manifest row per (task_type, target).  Seeders upsert. */
    uniqTaskTarget: uniqueIndex("uniq_backfill_task_target").on(
      t.taskType,
      t.target
    ),
    /** Dispatcher claim index. */
    idxDispatch: index("idx_backfill_dispatch").on(
      t.status,
      t.priority,
      t.nextAttemptAt
    ),
    idxTaskType: index("idx_backfill_task_type").on(t.taskType),
  })
);
