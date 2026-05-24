import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./schema-core";

export const mastodonAccounts = pgTable(
  "mastodon_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    instanceUrl: varchar("instance_url", { length: 500 }).notNull(),
    accountId: varchar("account_id", { length: 100 }),
    handle: varchar("handle", { length: 300 }),
    displayName: varchar("display_name", { length: 200 }),
    accessTokenEnc: text("access_token_enc"),
    linkedAt: timestamp("linked_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mastodon_accounts_user_unique").on(table.userId),
    index("mastodon_accounts_handle_idx").on(table.handle),
  ]
);

export const mastodonCachedToots = pgTable(
  "mastodon_cached_toots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    tootId: varchar("toot_id", { length: 100 }).notNull(),
    content: text("content").notNull(),
    media: text("media"),
    createdAt: timestamp("created_at").notNull(),
    cachedAt: timestamp("cached_at").defaultNow().notNull(),
  },
  (table) => [
    index("mastodon_toots_user_idx").on(table.userId),
    index("mastodon_toots_toot_idx").on(table.tootId),
  ]
);

export const mastodonPreferences = pgTable("mastodon_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  showInFeed: boolean("show_in_feed").default(true).notNull(),
  autoCrosspost: boolean("auto_crosspost").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mastodonAccountsRelations = relations(mastodonAccounts, ({ one }) => ({
  user: one(users, { fields: [mastodonAccounts.userId], references: [users.id] }),
}));
