import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./schema-core";
import type {
  ObjktOperatorCreator,
  ObjktOperatorEvent,
  ObjktOperatorScan,
  ObjktOperatorSession,
  ObjktOperatorSettings,
  ObjktQueueItem,
} from "./objkt-operator";

export const objktOperatorStates = pgTable("objkt_operator_states", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  walletAddress: varchar("wallet_address", { length: 36 }),
  settings: jsonb("settings").$type<ObjktOperatorSettings>().notNull(),
  creators: jsonb("creators").$type<ObjktOperatorCreator[]>().notNull(),
  scan: jsonb("scan").$type<ObjktOperatorScan | null>(),
  queue: jsonb("queue").$type<ObjktQueueItem[]>().notNull(),
  session: jsonb("session").$type<ObjktOperatorSession>().notNull(),
  events: jsonb("events").$type<ObjktOperatorEvent[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
