import type { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db as defaultDb } from "../../../db";
import { awardXp as defaultAwardXp } from "../../../lib/xp";
import { xpEvents } from "@shared/schema";

export interface AdminUserXpRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
  awardXp: typeof defaultAwardXp;
}

export const defaultAdminUserXpRouteDeps: AdminUserXpRouteDeps = {
  db: defaultDb,
  requirePermission,
  awardXp: defaultAwardXp,
};

export function registerAdminUserXpRoutes(
  router: Router,
  deps: AdminUserXpRouteDeps = defaultAdminUserXpRouteDeps
) {
  const { db, requirePermission, awardXp } = deps;

  router.post(
    "/api/admin/users/:id/xp",
    requirePermission("award_xp"),
    async (req, res) => {
      try {
        const actor = req.user as any;
        const userId = Number(req.params.id);
        const amount = Number(req.body?.amount);
        const reason = String(req.body?.reason || "manual_admin_adjustment").trim();

        if (!Number.isInteger(userId) || userId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        if (!Number.isInteger(amount) || amount === 0) {
          return res
            .status(400)
            .json({ error: "XP amount must be a non-zero integer" });
        }

        const result = await awardXp({
          userId,
          amount,
          reason,
          awardedBy: actor.id,
          metadata: {
            source: "admin_panel",
          },
        });

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to award XP" });
      }
    }
  );

  router.get(
    "/api/admin/xp/events",
    requirePermission("award_xp"),
    async (req, res) => {
      try {
        const userId = req.query.userId ? Number(req.query.userId) : null;
        const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 300));

        const rows = await db
          .select()
          .from(xpEvents)
          .where(userId ? eq(xpEvents.userId, userId) : undefined)
          .orderBy(desc(xpEvents.createdAt))
          .limit(limit);

        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch XP events" });
      }
    }
  );
}
