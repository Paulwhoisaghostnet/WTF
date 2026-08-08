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
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

/**
 * wtfOS universal App Registry (Req1–Req5).
 *
 * Generic, app-agnostic tables that govern EVERY app on wtfOS — the 20 desktop
 * apps, the static creation tools / packages / integration plugins, and any
 * user-published "installed:" app produced by the Install-New-App wizard.
 *
 * These tables are ADDITIVE and only consulted when APP_REGISTRY_ENABLED is on
 * (see server/features/app-registry/config.ts). The legacy desktop_app_settings
 * table (shared/schema-desktop.ts) keeps working unchanged for back-compat; the
 * registry never breaks the default-on launcher behaviour when its flag is off.
 *
 * `app_keys` is modelled on mcp_agent_tokens (shared/schema-desktop.ts): only a
 * sha256 hash + short prefix are persisted, never the secret itself.
 */

/** Universal app id, e.g. "desktop:arcade" / "creation-tool:particle-painter" / "installed:<slug>". */
export const appRegistrations = pgTable(
  "app_registrations",
  {
    id: serial("id").primaryKey(),
    appId: varchar("app_id", { length: 160 }).unique().notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    /** Stable launcher/slug key (e.g. "arcade", "particle-painter"). */
    appKey: varchar("app_key", { length: 80 }),
    label: varchar("label", { length: 200 }).notNull(),
    domainLabel: varchar("domain_label", { length: 120 }),
    /** Lifecycle state machine: draft → registered → alpha → published (+ needs-reregister/disabled/revoked). */
    lifecycleState: varchar("lifecycle_state", { length: 24 }).default("draft").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    /** integrityFingerprint = sha256(manifestHash ‖ bundleHash ‖ buildHash). */
    integrityFingerprint: varchar("integrity_fingerprint", { length: 64 }),
    manifestHash: varchar("manifest_hash", { length: 64 }),
    bundleHash: varchar("bundle_hash", { length: 64 }),
    buildHash: varchar("build_hash", { length: 120 }),
    fingerprintAlgo: varchar("fingerprint_algo", { length: 24 }).default("sha256").notNull(),
    /** Origin of the app: builtin | repo | upload. */
    sourceType: varchar("source_type", { length: 24 }),
    sourceRef: text("source_ref"),
    /** Optional AT Protocol DID when ATPROTO_SPINE_ENABLED binds the app to a record. */
    did: varchar("did", { length: 256 }),
    /** Snapshot of the validated manifest used to compute manifestHash. */
    manifest: jsonb("manifest").$type<Record<string, unknown>>(),
    registeredBy: integer("registered_by").references(() => users.id),
    registeredAt: timestamp("registered_at"),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("app_registrations_kind_idx").on(table.kind),
    index("app_registrations_lifecycle_idx").on(table.lifecycleState),
  ]
);

/** Per-app operating key. Authorizes the app to operate on wtfOS; bound to an integrity fingerprint. */
export const appKeys = pgTable(
  "app_keys",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id")
      .references(() => appRegistrations.id, { onDelete: "cascade" })
      .notNull(),
    appId: varchar("app_id", { length: 160 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).unique().notNull(),
    keyPrefix: varchar("key_prefix", { length: 24 }).notNull(),
    scopes: jsonb("scopes")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    /** The fingerprint this key was issued against. Key is invalid once the app's fingerprint drifts. */
    boundFingerprint: varchar("bound_fingerprint", { length: 64 }),
    did: varchar("did", { length: 256 }),
    disabledAt: timestamp("disabled_at"),
    disabledReason: varchar("disabled_reason", { length: 64 }),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    issuedBy: integer("issued_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("app_keys_registration_idx").on(table.registrationId),
    index("app_keys_app_idx").on(table.appId),
    index("app_keys_active_idx").on(table.revokedAt, table.disabledAt),
  ]
);

export const appRegistrationsRelations = relations(appRegistrations, ({ many, one }) => ({
  keys: many(appKeys),
  registeredByUser: one(users, {
    fields: [appRegistrations.registeredBy],
    references: [users.id],
  }),
}));

export const appKeysRelations = relations(appKeys, ({ one }) => ({
  registration: one(appRegistrations, {
    fields: [appKeys.registrationId],
    references: [appRegistrations.id],
  }),
}));

export type AppRegistrationRow = typeof appRegistrations.$inferSelect;
export type AppRegistrationInsert = typeof appRegistrations.$inferInsert;
export type AppKeyRow = typeof appKeys.$inferSelect;
export type AppKeyInsert = typeof appKeys.$inferInsert;
