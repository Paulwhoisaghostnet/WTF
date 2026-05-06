import type { Router } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { rewardLedger, users } from "@shared/schema";

export function registerAdminRewardRoutes(router: Router) {
  router.get(
    "/api/admin/reward-ledger",
    requirePermission("manage_rewards"),
    async (req, res) => {
      try {
        const paidFilter = req.query.paid;
        const filters: any[] = [];
        if (paidFilter === "true") filters.push(eq(rewardLedger.paid, true));
        if (paidFilter === "false") filters.push(eq(rewardLedger.paid, false));

        const rows = await db
          .select({
            id: rewardLedger.id,
            userId: rewardLedger.userId,
            username: users.username,
            displayName: users.displayName,
            walletAddress: sql<string>`(SELECT wallet_address FROM user_wallets WHERE user_id = ${rewardLedger.userId} AND is_primary = true LIMIT 1)`,
            amountWtf: rewardLedger.amountWtf,
            reason: rewardLedger.reason,
            sourceType: rewardLedger.sourceType,
            sourceId: rewardLedger.sourceId,
            paid: rewardLedger.paid,
            opHash: rewardLedger.opHash,
            paidAt: rewardLedger.paidAt,
            createdAt: rewardLedger.createdAt,
          })
          .from(rewardLedger)
          .leftJoin(users, eq(rewardLedger.userId, users.id))
          .where(filters.length > 0 ? filters[0] : undefined)
          .orderBy(desc(rewardLedger.createdAt));

        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch reward ledger" });
      }
    }
  );

  router.put(
    "/api/admin/reward-ledger/:id/pay",
    requirePermission("manage_rewards"),
    async (req, res) => {
      try {
        const staff = req.user as any;
        const ledgerId = parseInt(req.params.id as string);
        const { opHash } = req.body;

        const [updated] = await db
          .update(rewardLedger)
          .set({
            paid: true,
            opHash: opHash || null,
            paidAt: new Date(),
            paidBy: staff.id,
          })
          .where(eq(rewardLedger.id, ledgerId))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Ledger entry not found" });
        }
        res.json(updated);
      } catch (err) {
        res.status(500).json({ error: "Failed to mark as paid" });
      }
    }
  );

  router.put(
    "/api/admin/reward-ledger/batch-pay",
    requirePermission("manage_rewards"),
    async (req, res) => {
      try {
        const staff = req.user as any;
        const { ids, opHash } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: "No ids provided" });
        }

        const normalizedIds = Array.from(
          new Set(ids.map((id: unknown) => Number(id)))
        );
        if (
          normalizedIds.length === 0 ||
          normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)
        ) {
          return res.status(400).json({ error: "ids must be positive integers" });
        }

        const now = new Date();
        const updated = await db.transaction(async (tx) => {
          const rows = await tx
            .update(rewardLedger)
            .set({
              paid: true,
              opHash: opHash || null,
              paidAt: now,
              paidBy: staff.id,
            })
            .where(inArray(rewardLedger.id, normalizedIds))
            .returning({ id: rewardLedger.id });

          if (rows.length !== normalizedIds.length) {
            throw new Error("One or more reward ledger ids were not found");
          }

          return rows;
        });

        res.json({ success: true, count: updated.length });
      } catch (err) {
        res.status(500).json({ error: "Failed to batch pay" });
      }
    }
  );
}
