import { bigserial, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./schema-core";

/** A verified wallet may back up to three distinct nominees per HAHA category. */
export const hahaCrpNominations = pgTable("haha_crp_nominations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  seasonKey: text("season_key").notNull(),
  categoryId: text("category_id").notNull(),
  nominatorAddress: text("nominator_address").notNull(),
  nominatorUserId: integer("nominator_user_id").references(() => users.id, { onDelete: "set null" }),
  nomineeAddress: text("nominee_address").notNull(),
  nomineeDisplayName: text("nominee_display_name"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("haha_crp_nominations_distinct_nominee_uq").on(table.seasonKey, table.categoryId, table.nominatorAddress, table.nomineeAddress),
  index("haha_crp_nominations_tally_idx").on(table.seasonKey, table.categoryId, table.nomineeAddress),
]);
