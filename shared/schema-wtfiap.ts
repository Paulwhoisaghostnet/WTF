import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One durable aggregate per game room. Intent IDs, immutable commitments,
// checkpoints and finalized-chain evidence are committed together under a row
// lock; the game seed and bearer credentials remain in the private authority.
export const wtfiapFundedRooms = pgTable("wtfiap_funded_rooms", {
  roomCode: text("room_code").primaryKey(),
  document: jsonb("document").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
