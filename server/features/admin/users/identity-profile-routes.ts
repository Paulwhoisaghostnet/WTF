import type { Router } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { requirePermission } from "../../../auth/passport";
import { db as defaultDb } from "../../../db";
import { users } from "@shared/schema";
import { ROLE_ORDER } from "@shared/types";

export interface AdminUserIdentityProfileRouteDeps {
  db: typeof defaultDb;
  requirePermission: typeof requirePermission;
}

export const defaultAdminUserIdentityProfileRouteDeps: AdminUserIdentityProfileRouteDeps = {
  db: defaultDb,
  requirePermission,
};

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
        const allUsers = await db
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
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt));
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
        if (!ROLE_ORDER.includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }
        const [updated] = await db
          .update(users)
          .set({ role, updatedAt: new Date() })
          .where(eq(users.id, parseInt(req.params.id as string)))
          .returning();
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
}
