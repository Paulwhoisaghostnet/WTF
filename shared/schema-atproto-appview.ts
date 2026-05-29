import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * AppView read models (S3.1). Additive + standalone: these tables are only populated when
 * the AppView indexer runs (ATPROTO_SPINE_ENABLED + indexer started). Postgres remains the
 * canonical store for wtfOS's own data; this is a denormalized index of app.wtfos.* records
 * (ours, mirrored from the outbox, and external ones from the firehose) for fast reads.
 */

export const wtfosAppviewRecords = pgTable(
  "wtfos_appview_records",
  {
    id: serial("id").primaryKey(),
    /** at:// URI of the record (unique). */
    uri: text("uri").notNull(),
    /** Repo DID that authored the record. */
    did: varchar("did", { length: 255 }).notNull(),
    /** Collection NSID, e.g. app.wtfos.social.board.post. */
    collection: varchar("collection", { length: 255 }).notNull(),
    rkey: varchar("rkey", { length: 512 }).notNull(),
    cid: varchar("cid", { length: 255 }),
    /** Logical domain (social/media/...) derived from the collection. */
    domain: varchar("domain", { length: 64 }).notNull(),
    /** Full record JSON (the published mirror; canonical copy lives in the owning table). */
    json: jsonb("json").$type<Record<string, unknown>>().notNull(),
    /** Provenance: "outbox" (our own publish) or "firehose" (external/federated). */
    source: varchar("source", { length: 32 }).notNull().default("outbox"),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtfos_appview_records_uri_unique").on(table.uri),
    index("wtfos_appview_records_collection_idx").on(table.collection, table.indexedAt),
    index("wtfos_appview_records_did_idx").on(table.did),
    index("wtfos_appview_records_domain_idx").on(table.domain, table.indexedAt),
  ],
);

export const wtfosAppviewCursor = pgTable(
  "wtfos_appview_cursor",
  {
    /** Subscription key, e.g. the relay subscribeRepos URL or "outbox". */
    service: varchar("service", { length: 255 }).primaryKey(),
    cursor: bigint("cursor", { mode: "number" }).notNull().default(0),
    lastEventAt: timestamp("last_event_at"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`now()`),
  },
);
