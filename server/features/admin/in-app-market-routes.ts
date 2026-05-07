import type { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { inAppMarketItems } from "@shared/schema";
import { formatWtf } from "@shared/types";
import { itemMetadataKind } from "../../lib/pet-ball-account-cap";

const updateMarketItemPayload = z.object({
  active: z.boolean().optional(),
  stockQuantity: z.coerce.number().int().min(0).max(999_999).optional(),
});

function serializeMarketItem(item: typeof inAppMarketItems.$inferSelect) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    category: item.category,
    kind: itemMetadataKind(item.metadata),
    priceWtfUnits: String(item.priceWtfUnits),
    priceWtfFormatted: formatWtf(String(item.priceWtfUnits)),
    priceExp: item.priceExp ?? 0,
    contractAddress: item.contractAddress,
    contractListingId: item.contractListingId,
    active: item.active,
    stockQuantity: item.stockQuantity ?? 0,
    metadata: item.metadata,
    sortOrder: item.sortOrder,
    updatedAt: item.updatedAt,
  };
}

export function registerAdminInAppMarketRoutes(router: Router) {
  router.get(
    "/api/admin/in-app-market/items",
    requirePermission("manage_rewards", "manage_settings"),
    async (_req, res) => {
      try {
        const rows = await db
          .select()
          .from(inAppMarketItems)
          .orderBy(
            asc(inAppMarketItems.category),
            asc(inAppMarketItems.sortOrder),
            asc(inAppMarketItems.id)
          );
        res.json({ items: rows.map(serializeMarketItem) });
      } catch (err) {
        console.error("[admin/in-app-market] failed to fetch items:", err);
        res.status(500).json({ error: "Failed to fetch in-app market items" });
      }
    }
  );

  router.patch(
    "/api/admin/in-app-market/items/:id",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid item id" });
        }
        const parsed = updateMarketItemPayload.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid market item update" });
        }
        const updates: Partial<typeof inAppMarketItems.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (parsed.data.active !== undefined) updates.active = parsed.data.active;
        if (parsed.data.stockQuantity !== undefined) {
          updates.stockQuantity = parsed.data.stockQuantity;
        }
        if (updates.active === undefined && updates.stockQuantity === undefined) {
          return res.status(400).json({ error: "No supported fields to update" });
        }

        const [updated] = await db
          .update(inAppMarketItems)
          .set(updates)
          .where(eq(inAppMarketItems.id, id))
          .returning();
        if (!updated) {
          return res.status(404).json({ error: "In-app market item not found" });
        }
        res.json({ item: serializeMarketItem(updated) });
      } catch (err) {
        console.error("[admin/in-app-market] failed to update item:", err);
        res.status(500).json({ error: "Failed to update in-app market item" });
      }
    }
  );
}
