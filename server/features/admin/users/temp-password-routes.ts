import type { Router } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { hashPassword, requirePermission } from "../../../auth/passport";
import {
  clearUserTempPassword,
  updateUserTempPassword,
} from "../../../auth/storage";
import { db as defaultDb } from "../../../db";
import { users } from "@shared/schema";

export interface AdminUserTempPasswordRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
  hashPassword: typeof hashPassword;
  updateUserTempPassword: typeof updateUserTempPassword;
  clearUserTempPassword: typeof clearUserTempPassword;
}

export const defaultAdminUserTempPasswordRouteDeps: AdminUserTempPasswordRouteDeps = {
  db: defaultDb,
  requirePermission,
  hashPassword,
  updateUserTempPassword,
  clearUserTempPassword,
};

export function registerAdminUserTempPasswordRoutes(
  router: Router,
  deps: AdminUserTempPasswordRouteDeps = defaultAdminUserTempPasswordRouteDeps
) {
  const {
    db,
    requirePermission,
    hashPassword,
    updateUserTempPassword,
    clearUserTempPassword,
  } = deps;

  router.post(
    "/api/admin/users/:id/temp-password",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }

        const [target] = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);

        if (!target) return res.status(404).json({ error: "User not found" });

        const rawHours = Number(req.body?.expiryHours);
        const expiryHours =
          Number.isFinite(rawHours) && rawHours > 0
            ? Math.min(rawHours, 168)
            : 24;

        let plainPassword: string;
        if (typeof req.body?.password === "string" && req.body.password.length >= 8) {
          plainPassword = req.body.password;
        } else if (typeof req.body?.password === "string" && req.body.password.length > 0) {
          return res
            .status(400)
            .json({ error: "Provided password must be at least 8 characters" });
        } else {
          plainPassword = randomBytes(9).toString("base64url").slice(0, 12);
        }

        const tempHash = await hashPassword(plainPassword);
        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        await updateUserTempPassword(targetId, tempHash, expiresAt);

        console.info(
          `[auth] admin set temp password for user ${targetId} (${target.username}), ` +
            `expires ${expiresAt.toISOString()}`
        );

        res.status(201).json({
          ok: true,
          password: plainPassword,
          expiresAt: expiresAt.toISOString(),
          expiryHours,
        });
      } catch (err) {
        console.error("[admin] set-temp-password error:", err);
        res.status(500).json({ error: "Failed to set temporary password" });
      }
    }
  );

  router.delete(
    "/api/admin/users/:id/temp-password",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        await clearUserTempPassword(targetId);
        res.json({ ok: true });
      } catch (err) {
        console.error("[admin] clear-temp-password error:", err);
        res.status(500).json({ error: "Failed to clear temporary password" });
      }
    }
  );
}
