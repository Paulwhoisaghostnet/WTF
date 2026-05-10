import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./schema-core";

export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").default("").notNull(),
    classification: varchar("classification", { length: 80 })
      .default("general")
      .notNull(),
    tags: jsonb("tags")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    entryAt: timestamp("entry_at", { withTimezone: true }).defaultNow().notNull(),
    crossRefs: jsonb("cross_refs")
      .$type<number[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("diary_entries_user_entry_at_idx").on(table.userId, table.entryAt),
    index("diary_entries_user_classification_idx").on(
      table.userId,
      table.classification
    ),
    index("diary_entries_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

export const diaryEntriesRelations = relations(diaryEntries, ({ one }) => ({
  user: one(users, {
    fields: [diaryEntries.userId],
    references: [users.id],
  }),
}));
