import type { Router } from "express";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db as defaultDb } from "../../../db";
import { scheduleBackfill as defaultScheduleBackfill } from "../../../lib/wallet-events";
import { userWallets } from "@shared/schema";

export interface AdminUserResyncRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
  scheduleBackfill: typeof defaultScheduleBackfill;
}

export const defaultAdminUserResyncRouteDeps: AdminUserResyncRouteDeps = {
  db: defaultDb,
  requirePermission,
  scheduleBackfill: defaultScheduleBackfill,
};

export function registerAdminUserResyncRoutes(
  router: Router,
  deps: AdminUserResyncRouteDeps = defaultAdminUserResyncRouteDeps
) {
  const { db, requirePermission, scheduleBackfill } = deps;

  router.post(
    "/api/admin/users/:id/resync",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        const addrs = await db
          .select({ addr: userWallets.walletAddress })
          .from(userWallets)
          .where(eq(userWallets.userId, targetId));
        for (const a of addrs) scheduleBackfill(a.addr, "admin-resync");
        res.status(202).json({ ok: true, queued: addrs.length });
      } catch (err) {
        console.error("[admin] user resync failed:", err);
        res.status(500).json({ error: "Failed to queue resync" });
      }
    }
  );

  router.post(
    "/api/admin/wallets/:address/resync",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const address = String(req.params.address || "");
        if (!address.startsWith("tz")) {
          return res.status(400).json({ error: "Invalid wallet address" });
        }
        scheduleBackfill(address, "admin-resync");
        res.status(202).json({ ok: true, walletAddress: address });
      } catch (err) {
        console.error("[admin] wallet resync failed:", err);
        res.status(500).json({ error: "Failed to queue resync" });
      }
    }
  );
}
