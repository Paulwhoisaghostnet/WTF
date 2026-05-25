import type { Router } from "express";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { rolePermissions } from "@shared/schema";
import {
  PERMISSION_KEYS,
  type UserRole,
} from "@shared/types";
import {
  getAllRolePermissions,
  invalidatePermissionCache,
} from "../../lib/permissions";
import { roleExists } from "../../lib/role-catalog";

export function registerAdminPermissionRoutes(router: Router) {
  router.get(
    "/api/admin/permissions",
    requirePermission("access_admin_panel"),
    async (_req, res) => {
      try {
        const perms = await getAllRolePermissions();
        res.json(perms);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch permissions" });
      }
    }
  );

  router.put(
    "/api/admin/permissions",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const { role, permissionKey, granted } = req.body as {
          role: string;
          permissionKey: string;
          granted: boolean;
        };

        if (!(await roleExists(role))) {
          return res.status(400).json({ error: "Invalid role" });
        }
        if (!PERMISSION_KEYS.includes(permissionKey)) {
          return res.status(400).json({ error: "Invalid permission key" });
        }
        if (typeof granted !== "boolean") {
          return res.status(400).json({ error: "granted must be boolean" });
        }

        if (role === "admin") {
          return res
            .status(403)
            .json({ error: "Admin role always has all permissions" });
        }

        const userId = (req.user as any)?.id ?? null;

        await db
          .insert(rolePermissions)
          .values({
            role: role as UserRole,
            permissionKey,
            granted,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [rolePermissions.role, rolePermissions.permissionKey],
            set: {
              granted,
              updatedBy: userId,
              updatedAt: new Date(),
            },
          });

        invalidatePermissionCache();

        const perms = await getAllRolePermissions();
        res.json(perms);
      } catch (err) {
        res.status(500).json({ error: "Failed to update permission" });
      }
    }
  );

  router.post(
    "/api/admin/permissions/reset",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const { role } = req.body as { role?: string };

        if (role) {
          if (!(await roleExists(role))) {
            return res.status(400).json({ error: "Invalid role" });
          }
          await db
            .delete(rolePermissions)
            .where(eq(rolePermissions.role, role as UserRole));
        } else {
          await db.delete(rolePermissions);
        }

        invalidatePermissionCache();

        const perms = await getAllRolePermissions();
        res.json(perms);
      } catch (err) {
        res.status(500).json({ error: "Failed to reset permissions" });
      }
    }
  );
}
