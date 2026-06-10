import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import {
  atprotoAccounts,
  atprotoHandleClaims,
  wtfosAtprotoIdentities,
} from "./schema-social";
import { userMediaLibrary } from "./schema-tv";

export const wtfUserSiteStatusEnum = pgEnum("wtf_user_site_status", [
  "draft",
  "published",
  "suspended",
]);

export const wtfUserSiteDidSourceEnum = pgEnum("wtf_user_site_did_source", [
  "wtf",
  "bsky",
]);

export const wtfUserSiteAuditEventEnum = pgEnum("wtf_user_site_audit_event", [
  "claimed",
  "draft_saved",
  "page_created",
  "page_updated",
  "page_deleted",
  "assets_updated",
  "published",
  "rolled_back",
  "unpublished",
  "suspended",
  "restored",
  "proof_warning",
]);

export const wtfUserSites = pgTable(
  "wtf_user_sites",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    label: varchar("label", { length: 63 }).notNull(),
    host: varchar("host", { length: 255 }).notNull(),
    status: wtfUserSiteStatusEnum("status").default("draft").notNull(),
    activeDid: varchar("active_did", { length: 255 }),
    activeDidSource: wtfUserSiteDidSourceEnum("active_did_source"),
    atprotoAccountId: integer("atproto_account_id").references(
      () => atprotoAccounts.id,
      { onDelete: "set null" }
    ),
    wtfosIdentityId: integer("wtfos_identity_id").references(
      () => wtfosAtprotoIdentities.id,
      { onDelete: "set null" }
    ),
    atprotoHandleClaimId: integer("atproto_handle_claim_id").references(
      () => atprotoHandleClaims.id,
      { onDelete: "set null" }
    ),
    publishedVersionId: integer("published_version_id"),
    proofGraceUntil: timestamp("proof_grace_until"),
    suspendedAt: timestamp("suspended_at"),
    suspendedBy: integer("suspended_by").references(() => users.id, {
      onDelete: "set null",
    }),
    suspendedReason: text("suspended_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    uniqueIndex("wtf_user_sites_user_unique").on(table.userId),
    uniqueIndex("wtf_user_sites_label_unique").on(table.label),
    uniqueIndex("wtf_user_sites_host_unique").on(table.host),
    index("wtf_user_sites_status_idx").on(table.status),
    index("wtf_user_sites_did_idx").on(table.activeDid),
  ]
);

export const wtfUserSitePages = pgTable(
  "wtf_user_site_pages",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .references(() => wtfUserSites.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    draftHtml: text("draft_html").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_user_site_pages_site_slug_unique").on(
      table.siteId,
      table.slug
    ),
    index("wtf_user_site_pages_site_sort_idx").on(table.siteId, table.sortOrder),
  ]
);

export const wtfUserSiteVersions = pgTable(
  "wtf_user_site_versions",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .references(() => wtfUserSites.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    did: varchar("did", { length: 255 }).notNull(),
    didSource: wtfUserSiteDidSourceEnum("did_source").notNull(),
    digest: varchar("digest", { length: 64 }).notNull(),
    manifest: jsonb("manifest")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    pages: jsonb("pages")
      .$type<Array<Record<string, unknown>>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    assetMediaIds: jsonb("asset_media_ids")
      .$type<number[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    publishedBy: integer("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_user_site_versions_site_number_unique").on(
      table.siteId,
      table.versionNumber
    ),
    index("wtf_user_site_versions_site_published_idx").on(
      table.siteId,
      table.publishedAt
    ),
    index("wtf_user_site_versions_digest_idx").on(table.digest),
  ]
);

export const wtfUserSiteAssetRefs = pgTable(
  "wtf_user_site_asset_refs",
  {
    siteId: integer("site_id")
      .references(() => wtfUserSites.id, { onDelete: "cascade" })
      .notNull(),
    mediaId: integer("media_id")
      .references(() => userMediaLibrary.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.mediaId] }),
    index("wtf_user_site_asset_refs_media_idx").on(table.mediaId),
  ]
);

export const wtfUserSiteAuditEvents = pgTable(
  "wtf_user_site_audit_events",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .references(() => wtfUserSites.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: wtfUserSiteAuditEventEnum("event_type").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("wtf_user_site_audit_site_created_idx").on(table.siteId, table.createdAt),
    index("wtf_user_site_audit_actor_idx").on(table.actorUserId),
    index("wtf_user_site_audit_type_idx").on(table.eventType),
  ]
);
