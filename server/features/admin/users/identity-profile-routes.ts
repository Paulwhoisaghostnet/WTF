import type { Router } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db as defaultDb } from "../../../db";
import { users } from "@shared/schema";
import {
  getXpTierForTotal,
  isSystemUserRole,
  type UserRole,
} from "@shared/types";
import {
  ensureUserRole,
  listUserRoles,
  listUserRolesForUsers,
  removeUserRole,
  setUserRoles,
} from "../../../lib/user-roles";
import { listActiveUserCursesForUsers, setUserCurse } from "../../../lib/user-curses";
import { assignableRoleExists, listRoleCatalog } from "../../../lib/role-catalog";
import { isWtfCurseKey } from "@shared/curses";
import { logSystemEvent } from "../../../lib/system-log";

export interface AdminUserIdentityProfileRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
}

export const defaultAdminUserIdentityProfileRouteDeps: AdminUserIdentityProfileRouteDeps = {
  db: defaultDb,
  requirePermission,
};

function legacyRoleShadow(roles: readonly UserRole[]) {
  return (roles.find(isSystemUserRole) ?? "witness") as (typeof users.$inferSelect)["role"];
}

export function registerAdminUserIdentityProfileRoutes(
  router: Router,
  deps: AdminUserIdentityProfileRouteDeps = defaultAdminUserIdentityProfileRouteDeps
) {
  const { db, requirePermission } = deps;

  router.get(
    "/api/admin/users",
    requirePermission("manage_users"),
    async (_req, res) => {
      try {
        const rows = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            experiencePoints: users.experiencePoints,
            twitterHandle: users.twitterHandle,
            twitterVerified: users.twitterVerified,
            discordHandle: users.discordHandle,
            discordVerified: users.discordVerified,
            avatarUrl: users.avatarUrl,
            welcomedToWtfOs: users.welcomedToWtfOs,
            tempPasswordExpiresAt: users.tempPasswordExpiresAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt));
        const roleCatalog = await listRoleCatalog(db);
        const [rolesByUser, cursesByUser] = await Promise.all([
          listUserRolesForUsers(
            rows.map((user) => ({ id: user.id, role: user.role as UserRole })),
            db
          ),
          listActiveUserCursesForUsers(rows.map((user) => user.id), db),
        ]);
        const allUsers = rows.map((user) => {
            const roles = rolesByUser.get(user.id) ?? [user.role as UserRole];
            const curses = cursesByUser.get(user.id) ?? [];
            const highestRole = roles
              .map((role) => roleCatalog.find((definition) => definition.slug === role))
              .filter((definition) => Boolean(definition))
              .sort(
                (a, b) =>
                  (b?.accessLevel ?? 0) - (a?.accessLevel ?? 0) ||
                  (a?.sortOrder ?? 10_000) - (b?.sortOrder ?? 10_000)
              )[0] ?? null;
            return {
              ...user,
              role: roles[0] ?? user.role,
              roles,
              curses,
              highestRole,
              xpTier: getXpTierForTotal(user.experiencePoints),
              hasTemporaryPassword: Boolean(
                user.tempPasswordExpiresAt && user.tempPasswordExpiresAt > new Date()
              ),
            };
          });
        res.json(allUsers);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    }
  );

  router.put(
    "/api/admin/users/:id/profile",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }

        const hasUsername = typeof req.body?.username === "string";
        const hasDisplayName = typeof req.body?.displayName === "string";
        if (!hasUsername && !hasDisplayName) {
          return res.status(400).json({ error: "No profile fields provided" });
        }

        const update: Record<string, unknown> = { updatedAt: new Date() };

        if (hasUsername) {
          const username = String(req.body.username || "")
            .trim()
            .toLowerCase();

          if (!username) {
            return res.status(400).json({ error: "Username is required" });
          }
          if (username.length < 3 || username.length > 50) {
            return res
              .status(400)
              .json({ error: "Username must be 3-50 characters" });
          }

          const [existing] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.username, username), ne(users.id, targetId)))
            .limit(1);
          if (existing) {
            return res.status(409).json({ error: "Username already taken" });
          }

          update.username = username;
        }

        if (hasDisplayName) {
          const displayName = String(req.body.displayName || "").trim();
          if (displayName.length > 100) {
            return res
              .status(400)
              .json({ error: "Display name must be 100 characters or less" });
          }
          update.displayName = displayName || null;
        }

        const [updated] = await db
          .update(users)
          .set(update)
          .where(eq(users.id, targetId))
          .returning({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            role: users.role,
            experiencePoints: users.experiencePoints,
            twitterHandle: users.twitterHandle,
            twitterVerified: users.twitterVerified,
            discordHandle: users.discordHandle,
            discordVerified: users.discordVerified,
            createdAt: users.createdAt,
          });

        if (!updated) return res.status(404).json({ error: "User not found" });
        res.json(updated);
      } catch (err) {
        res.status(500).json({ error: "Failed to update user profile" });
      }
    }
  );

  router.delete(
    "/api/admin/users/:id/social/:provider",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }

        const provider = String(req.params.provider || "").toLowerCase();
        const update: Record<string, unknown> = { updatedAt: new Date() };

        if (provider === "twitter") {
          update.twitterId = null;
          update.twitterHandle = null;
          update.twitterVerified = false;
          update.twitterPublic = false;
          update.twitterOauthToken = null;
          update.twitterOauthTokenSecret = null;
          update.twitterOauth2AccessToken = null;
          update.twitterOauth2RefreshToken = null;
          update.twitterOauth2Scopes = null;
          update.twitterOauth2ExpiresAt = null;
        } else if (provider === "discord") {
          update.discordId = null;
          update.discordHandle = null;
          update.discordVerified = false;
          update.discordPublic = false;
        } else {
          return res.status(400).json({ error: "Unsupported provider" });
        }

        const [updated] = await db
          .update(users)
          .set(update)
          .where(eq(users.id, targetId))
          .returning({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            twitterHandle: users.twitterHandle,
            twitterVerified: users.twitterVerified,
            twitterPublic: users.twitterPublic,
            discordHandle: users.discordHandle,
            discordVerified: users.discordVerified,
            discordPublic: users.discordPublic,
            updatedAt: users.updatedAt,
          });

        if (!updated) return res.status(404).json({ error: "User not found" });
        res.json(updated);
      } catch (err) {
        res.status(500).json({ error: "Failed to clear social account" });
      }
    }
  );

  router.put(
    "/api/admin/users/:id/role",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const { role } = req.body;
        if (!(await assignableRoleExists(String(role)))) {
          return res.status(400).json({ error: "Invalid role" });
        }
        const updated = await setUserRoles(
          parseInt(req.params.id as string),
          [role],
          (req.user as any)?.id ?? null,
          db
        );
        if (!updated) return res.status(404).json({ error: "User not found" });
        const {
          passwordHash: _passwordHash,
          twitterOauthToken: _twitterOauthToken,
          twitterOauthTokenSecret: _twitterOauthTokenSecret,
          ...safeUser
        } = updated as any;
        res.json(safeUser);
      } catch (err) {
        res.status(500).json({ error: "Failed to update role" });
      }
    }
  );

  router.post(
    "/api/admin/users/:id/roles",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        const role = String(req.body?.role || "") as UserRole;
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        if (!(await assignableRoleExists(role, db))) {
          return res.status(400).json({ error: "Invalid role" });
        }

        const [target] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!target) return res.status(404).json({ error: "User not found" });

        await ensureUserRole(targetId, role, (req.user as any)?.id ?? null, db);
        const roles = await listUserRoles(targetId, target.role as UserRole, db);
        const [updated] = await db
          .update(users)
          .set({ role: legacyRoleShadow(roles), updatedAt: new Date() })
          .where(eq(users.id, targetId))
          .returning();
        res.json({ ...updated, roles });
      } catch (err) {
        res.status(500).json({ error: "Failed to assign role" });
      }
    }
  );

  router.delete(
    "/api/admin/users/:id/roles/:role",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        const role = String(req.params.role || "") as UserRole;
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        if (!(await assignableRoleExists(role, db))) {
          return res.status(400).json({ error: "Invalid role" });
        }

        const [target] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!target) return res.status(404).json({ error: "User not found" });

        const existingRoles = await listUserRoles(targetId, target.role as UserRole, db);
        const remainingRoles = existingRoles.filter((candidate) => candidate !== role);
        if (remainingRoles.length === 0) {
          return res.status(400).json({ error: "User must keep at least one role" });
        }

        await removeUserRole(targetId, role, db);
        const roles = await listUserRoles(targetId, remainingRoles[0], db);
        const [updated] = await db
          .update(users)
          .set({ role: legacyRoleShadow(roles), updatedAt: new Date() })
          .where(eq(users.id, targetId))
          .returning();
        res.json({ ...updated, roles });
      } catch (err) {
        res.status(500).json({ error: "Failed to remove role" });
      }
    }
  );

  router.put(
    "/api/admin/users/:id/curses/:curseKey",
    requirePermission("manage_roles"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        const curseKey = String(req.params.curseKey || "");
        const active = req.body?.active !== false;
        const reason =
          typeof req.body?.reason === "string"
            ? String(req.body.reason).trim().slice(0, 500)
            : null;
        const actorId = Number((req.user as any)?.id);

        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        if (!isWtfCurseKey(curseKey)) {
          return res.status(400).json({ error: "Invalid curse key" });
        }

        const [target] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!target) return res.status(404).json({ error: "User not found" });

        const curses = await setUserCurse({
          userId: targetId,
          curseKey,
          active,
          reason,
          actorUserId: Number.isInteger(actorId) ? actorId : null,
          database: db,
        });

        logSystemEvent({
          source: "admin",
          eventType: active ? "admin.user.curse_assigned" : "admin.user.curse_lifted",
          severity: "warn",
          userId: targetId,
          message: `${active ? "Assigned" : "Lifted"} WTF OS curse ${curseKey}`,
          metadata: {
            curseKey,
            reason,
            actorUserId: Number.isInteger(actorId) ? actorId : null,
          },
        });

        res.json({ userId: targetId, curses });
      } catch (err) {
        res.status(500).json({ error: "Failed to update user curse" });
      }
    }
  );
}
