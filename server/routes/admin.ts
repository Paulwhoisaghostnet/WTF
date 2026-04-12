import { Router } from "express";
import { db } from "../db";
import {
  users,
  userWallets,
  seasons,
  rounds,
  challenges,
  challengeSubmissions,
  xpEvents,
  rolePermissions,
  sideQuests,
  sideQuestCompletions,
  marketplaceListings,
  marketplaceBids,
  boardThreads,
  boardThreadReplies,
  channels,
  messages,
  dmConversations,
  links,
  faqItems,
  rewardLedger,
} from "@shared/schema";
import { and, eq, ne, desc, sql, inArray } from "drizzle-orm";
import { requirePermission } from "../auth/passport";
import { ROLE_ORDER, PERMISSION_KEYS, type UserRole } from "@shared/types";
import { awardXp } from "../lib/xp";
import {
  getAllRolePermissions,
  invalidatePermissionCache,
} from "../lib/permissions";

const router = Router();

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
          return res.status(400).json({ error: "Username must be 3-50 characters" });
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
        return res.status(400).json({ error: "XP amount must be a non-zero integer" });
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

router.delete(
  "/api/admin/users/:id",
  requirePermission("manage_users"),
  async (req, res) => {
    try {
      const actor = req.user as any;
      const targetId = parseInt(req.params.id as string);

      if (targetId === actor.id) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }

      const [target] = await db
        .select({ id: users.id, role: users.role, username: users.username })
        .from(users)
        .where(eq(users.id, targetId));

      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      if (
        (target.role === "admin" || target.role === "host") &&
        actor.role !== "admin"
      ) {
        return res
          .status(403)
          .json({ error: "Only admins can delete admin/host users" });
      }

      await db.transaction(async (tx) => {
        // Null out nullable FK references first.
        await tx
          .update(challengeSubmissions)
          .set({ gradedBy: null })
          .where(eq(challengeSubmissions.gradedBy, targetId));
        await tx.update(seasons).set({ createdBy: null }).where(eq(seasons.createdBy, targetId));
        await tx
          .update(challenges)
          .set({ createdBy: null })
          .where(eq(challenges.createdBy, targetId));
        await tx.update(channels).set({ createdBy: null }).where(eq(channels.createdBy, targetId));
        await tx
          .update(sideQuests)
          .set({ createdBy: null })
          .where(eq(sideQuests.createdBy, targetId));
        await tx
          .update(sideQuestCompletions)
          .set({ approvedBy: null })
          .where(eq(sideQuestCompletions.approvedBy, targetId));
        await tx.update(links).set({ createdBy: null }).where(eq(links.createdBy, targetId));
        await tx
          .update(dmConversations)
          .set({ createdBy: null })
          .where(eq(dmConversations.createdBy, targetId));
        await tx.update(xpEvents).set({ awardedBy: null }).where(eq(xpEvents.awardedBy, targetId));
        await tx
          .update(rewardLedger)
          .set({ paidBy: null })
          .where(eq(rewardLedger.paidBy, targetId));

        // Delete rows with non-nullable FK refs to this user.
        await tx.delete(challengeSubmissions).where(eq(challengeSubmissions.userId, targetId));
        await tx.delete(messages).where(eq(messages.userId, targetId));
        await tx.delete(marketplaceBids).where(eq(marketplaceBids.bidderUserId, targetId));
        await tx
          .delete(marketplaceListings)
          .where(eq(marketplaceListings.sellerUserId, targetId));
        await tx
          .delete(sideQuestCompletions)
          .where(eq(sideQuestCompletions.userId, targetId));
        await tx.delete(boardThreads).where(eq(boardThreads.createdBy, targetId));

        // Finally delete the user. Cascading FKs handle wallets, tokens,
        // DM participants/messages, reward flags, board replies, etc.
        const deleted = await tx
          .delete(users)
          .where(eq(users.id, targetId))
          .returning({ id: users.id });

        if (deleted.length === 0) {
          throw new Error("User already deleted");
        }
      });

      res.json({ ok: true, deleted: target.username });
    } catch (err) {
      console.error("Failed to delete user:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

router.get(
  "/api/admin/stats",
  requirePermission("access_admin_panel"),
  async (_req, res) => {
    try {
      const [[userCount], [seasonCount], [roundCount], [challengeCount], [questCount], [listingCount], [threadCount], [linkCount], [faqCount]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(seasons),
        db.select({ count: sql<number>`count(*)::int` }).from(rounds),
        db.select({ count: sql<number>`count(*)::int` }).from(challenges),
        db.select({ count: sql<number>`count(*)::int` }).from(sideQuests),
        db.select({ count: sql<number>`count(*)::int` }).from(marketplaceListings),
        db.select({ count: sql<number>`count(*)::int` }).from(boardThreads),
        db.select({ count: sql<number>`count(*)::int` }).from(links),
        db.select({ count: sql<number>`count(*)::int` }).from(faqItems),
      ]);

      res.json({
        users: userCount.count,
        seasons: seasonCount.count,
        rounds: roundCount.count,
        challenges: challengeCount.count,
        sideQuests: questCount.count,
        listings: listingCount.count,
        threads: threadCount.count,
        links: linkCount.count,
        faq: faqCount.count,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

/* ═══ Reward Ledger ══════════════════════════════════════ */

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

      if (!updated) return res.status(404).json({ error: "Ledger entry not found" });
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

      const normalizedIds = Array.from(new Set(ids.map((id: unknown) => Number(id))));
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

// ─── Role Permissions ────────────────────────────────────

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

      if (!ROLE_ORDER.includes(role as any)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      if (!PERMISSION_KEYS.includes(permissionKey)) {
        return res.status(400).json({ error: "Invalid permission key" });
      }
      if (typeof granted !== "boolean") {
        return res.status(400).json({ error: "granted must be boolean" });
      }

      if (role === "admin" || role === "host") {
        return res.status(403).json({ error: "Admin and Host roles always have all permissions" });
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
        if (!ROLE_ORDER.includes(role as any)) {
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

export default router;
