import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  varchar,
  pgEnum,
  bigint,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "host",
  "cohost",
  "resident_wizard",
  "trusted_creator",
  "test_subject",
  "contestant",
  "witness",
  "time_out",
]);

export const wtfSubdomainGrantStatusEnum = pgEnum("wtf_subdomain_grant_status", [
  "reserved",
  "pending",
  "provisioned",
  "revoked",
]);

// ─── Users ───────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash"),
  /** Scrypt hash of the admin-issued temp password (nullable). */
  tempPasswordHash: text("temp_password_hash"),
  /** When the temp password expires. Null means no temp password is set. */
  tempPasswordExpiresAt: timestamp("temp_password_expires_at"),
  displayName: varchar("display_name", { length: 100 }),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").default("witness").notNull(),
  twitterId: varchar("twitter_id", { length: 100 }),
  twitterHandle: varchar("twitter_handle", { length: 100 }),
  twitterVerified: boolean("twitter_verified").default(false).notNull(),
  twitterPublic: boolean("twitter_public").default(false).notNull(),
  twitterOauthToken: text("twitter_oauth_token"),
  twitterOauthTokenSecret: text("twitter_oauth_token_secret"),
  twitterOauth2AccessToken: text("twitter_oauth2_access_token"),
  twitterOauth2RefreshToken: text("twitter_oauth2_refresh_token"),
  twitterOauth2Scopes: text("twitter_oauth2_scopes"),
  twitterOauth2ExpiresAt: timestamp("twitter_oauth2_expires_at"),
  discordId: varchar("discord_id", { length: 100 }),
  discordHandle: varchar("discord_handle", { length: 100 }),
  discordVerified: boolean("discord_verified").default(false).notNull(),
  discordPublic: boolean("discord_public").default(false).notNull(),
  emailPublic: boolean("email_public").default(false).notNull(),
  googleId: varchar("google_id", { length: 100 }),
  githubId: varchar("github_id", { length: 100 }),
  bio: text("bio"),
  pfpTokenContract: varchar("pfp_token_contract", { length: 36 }),
  pfpTokenId: text("pfp_token_id"),
  pfpImageUrl: text("pfp_image_url"),
  welcomedToWtfOs: boolean("welcomed_to_wtf_os").default(false).notNull(),
  welcomedToWtfOsAt: timestamp("welcomed_to_wtf_os_at"),
  gmWelcomeUtcDay: varchar("gm_welcome_utc_day", { length: 10 }),
  gmWelcomeLastSeenAt: timestamp("gm_welcome_last_seen_at"),
  experiencePoints: bigint("experience_points", { mode: "number" })
    .default(0)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roles = pgTable(
  "roles",
  {
    slug: varchar("slug", { length: 64 }).primaryKey(),
    label: varchar("label", { length: 100 }).notNull(),
    category: varchar("category", { length: 40 }).default("access").notNull(),
    purpose: text("purpose").default("").notNull(),
    description: text("description"),
    accessLevel: integer("access_level").default(0).notNull(),
    sortOrder: integer("sort_order").default(1000).notNull(),
    color: varchar("color", { length: 24 }),
    icon: varchar("icon", { length: 64 }),
    defaultWtfOsAccess: boolean("default_wtf_os_access").default(false).notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    isAssignable: boolean("is_assignable").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("roles_category_idx").on(table.category),
    index("roles_sort_idx").on(table.sortOrder),
  ]
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 64 }).notNull(),
    assignedBy: integer("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index("user_roles_role_idx").on(table.role),
  ]
);

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
