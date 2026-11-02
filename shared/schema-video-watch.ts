import { relations } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./schema-core";

/** One durable completion per player and instructional video. */
export const userVideoWatches = pgTable(
  "user_video_watches",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    watchedAt: timestamp("watched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.videoId] }),
    index("user_video_watches_video_id_watched_at_idx").on(table.videoId, table.watchedAt),
  ],
);

export const userVideoWatchesRelations = relations(userVideoWatches, ({ one }) => ({
  user: one(users, { fields: [userVideoWatches.userId], references: [users.id] }),
}));
