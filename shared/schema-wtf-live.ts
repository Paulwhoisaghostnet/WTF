import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema-core";

export const wtfLiveRooms = pgTable(
  "wtf_live_rooms",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").default("").notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_rooms_slug_idx").on(table.slug),
    index("wtf_live_rooms_owner_idx").on(table.ownerUserId),
  ],
);

export const wtfLiveStages = pgTable(
  "wtf_live_stages",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").default("").notNull(),
    liveUrl: text("live_url"),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wtf_live_stages_slug_idx").on(table.slug),
    index("wtf_live_stages_owner_idx").on(table.ownerUserId),
  ],
);
