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

export const porcupinConnections = pgTable(
  "porcupin_connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    remoteUrl: varchar("remote_url", { length: 500 }).notNull(),
    authTokenEnc: text("auth_token_enc").notNull(),
    status: varchar("status", { length: 40 }).default("connected").notNull(),
    lastCheckAt: timestamp("last_check_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("porcupin_connections_user_unique").on(table.userId)]
);

export const porcupinPremiumEligibility = pgTable(
  "porcupin_premium_eligibility",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id),
    wtfBalanceOk: boolean("wtf_balance_ok").default(false).notNull(),
    membershipCardOk: boolean("membership_card_ok").default(false).notNull(),
    duesActiveOk: boolean("dues_active_ok").default(false).notNull(),
    eligible: boolean("eligible").default(false).notNull(),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    notes: text("notes"),
  }
);

export const porcupinConnectionsRelations = relations(porcupinConnections, ({ one }) => ({
  user: one(users, { fields: [porcupinConnections.userId], references: [users.id] }),
}));
