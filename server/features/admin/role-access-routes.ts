import type { Router } from "express";
import { eq } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { users } from "@shared/schema";
import type { UserRole } from "@shared/types";
import {
  ALL_ADMIN_SURFACES,
  type AdminSurface,
} from "../../../client/src/features/admin-os/admin-surface-registry";
import {
  getRoleSurfaceAccessMatrix,
  isKnownSurfaceId,
  resetRoleSurfaceAccess,
  setRoleSurfaceAccess,
} from "../../lib/role-surface-access";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { listRoleCatalog, roleExists, upsertRoleDefinition } from "../../lib/role-catalog";

function serializeSurface(surface: AdminSurface) {
  return {
    id: surface.id,
    label: surface.label,
    domain: surface.domain,
    subdomain: surface.subdomain,
    kind: surface.kind,
    routePatterns: surface.routePatterns,
    desktopAppKey: surface.desktopAppKey,
    adminPanelTabs: surface.adminPanelTabs,
    nativeSettings: surface.nativeSettings,
    automationHandles: surface.automationHandles,
    adminRoutes: surface.adminRoutes ?? [],
  };
}

async function canEditRoleAccess(user: unknown): Promise<boolean> {
  const actor = user as { id?: number; username?: string; role?: UserRole; roles?: UserRole[] } | null;
  if (!actor?.id) return false;
  const roles = await listRolesForUserSnapshot(actor);
  if (!roles.includes("admin")) return false;
  if (actor.username === "wtf-admin") return true;

  const [fresh] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  return fresh?.username === "wtf-admin";
}

export function registerAdminRoleAccessRoutes(router: Router) {
  router.get(
    "/api/admin/roles",
    requirePermission("manage_roles"),
    async (_req, res) => {
      try {
        res.json({ roles: await listRoleCatalog() });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch roles" });
      }
    }
  );

  router.post(
    "/api/admin/roles",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        if (!(await canEditRoleAccess(req.user))) {
          return res.status(403).json({ error: "wtf-admin admin account required" });
        }
        const role = await upsertRoleDefinition({
          slug: String(req.body?.slug || ""),
          label: String(req.body?.label || ""),
          category: String(req.body?.category || "access"),
          purpose: String(req.body?.purpose || ""),
          description: req.body?.description == null ? null : String(req.body.description),
          accessLevel: Number(req.body?.accessLevel ?? 0),
          sortOrder: Number(req.body?.sortOrder ?? 1000),
          color: req.body?.color == null ? null : String(req.body.color),
          icon: req.body?.icon == null ? null : String(req.body.icon),
          defaultWtfOsAccess: Boolean(req.body?.defaultWtfOsAccess),
          isAssignable: req.body?.isAssignable ?? true,
        });
        res.json({ role, roles: await listRoleCatalog() });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Failed to save role",
        });
      }
    }
  );

  router.get(
    "/api/admin/role-access",
    requirePermission("manage_roles"),
    async (_req, res) => {
      try {
        const roles = await listRoleCatalog();
        const matrix = await getRoleSurfaceAccessMatrix();
        res.json({
          roles,
          surfaces: ALL_ADMIN_SURFACES.map(serializeSurface),
          matrix,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch role access" });
      }
    }
  );

  router.put(
    "/api/admin/role-access",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        if (!(await canEditRoleAccess(req.user))) {
          return res.status(403).json({ error: "wtf-admin admin account required" });
        }

        const role = String(req.body?.role || "") as UserRole;
        const surfaceId = String(req.body?.surfaceId || "");
        const granted = req.body?.granted;

        if (!(await roleExists(role))) {
          return res.status(400).json({ error: "Invalid role" });
        }
        if (role === "admin") {
          return res.status(403).json({ error: "Admin role always has all WTF OS access" });
        }
        if (!isKnownSurfaceId(surfaceId)) {
          return res.status(400).json({ error: "Unknown WTF OS surface" });
        }
        if (typeof granted !== "boolean") {
          return res.status(400).json({ error: "granted must be boolean" });
        }

        await setRoleSurfaceAccess(
          role,
          surfaceId,
          granted,
          (req.user as any)?.id ?? null
        );
        const roles = await listRoleCatalog();
        const matrix = await getRoleSurfaceAccessMatrix();
        res.json({ roles, surfaces: ALL_ADMIN_SURFACES.map(serializeSurface), matrix });
      } catch (err) {
        res.status(500).json({ error: "Failed to update role access" });
      }
    }
  );

  router.post(
    "/api/admin/role-access/reset",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        if (!(await canEditRoleAccess(req.user))) {
          return res.status(403).json({ error: "wtf-admin admin account required" });
        }

        const role = req.body?.role ? String(req.body.role) as UserRole : undefined;
        if (role && !(await roleExists(role))) {
          return res.status(400).json({ error: "Invalid role" });
        }

        await resetRoleSurfaceAccess(role);
        const roles = await listRoleCatalog();
        const matrix = await getRoleSurfaceAccessMatrix();
        res.json({ roles, surfaces: ALL_ADMIN_SURFACES.map(serializeSurface), matrix });
      } catch (err) {
        res.status(500).json({ error: "Failed to reset role access" });
      }
    }
  );
}
