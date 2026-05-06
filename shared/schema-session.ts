import {
  pgTable,
  timestamp,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});
