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
import { eq, desc, sql } from "drizzle-orm";
import { requireRole } from "../auth/passport";
import { ROLE_ORDER } from "@shared/types";
import { awardXp } from "../lib/xp";

const router = Router();

router.get(
  "/api/admin/users",
  requireRole("admin", "host", "cohost"),
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
  "/api/admin/users/:id/role",
  requireRole("admin", "host", "cohost"),
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
      const { passwordHash: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

router.post(
  "/api/admin/users/:id/xp",
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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

      // Null out nullable FK references
      await db.update(challengeSubmissions).set({ gradedBy: null }).where(eq(challengeSubmissions.gradedBy, targetId));
      await db.update(seasons).set({ createdBy: null }).where(eq(seasons.createdBy, targetId));
      await db.update(challenges).set({ createdBy: null }).where(eq(challenges.createdBy, targetId));
      await db.update(channels).set({ createdBy: null }).where(eq(channels.createdBy, targetId));
      await db.update(sideQuests).set({ createdBy: null }).where(eq(sideQuests.createdBy, targetId));
      await db.update(sideQuestCompletions).set({ approvedBy: null }).where(eq(sideQuestCompletions.approvedBy, targetId));
      await db.update(links).set({ createdBy: null }).where(eq(links.createdBy, targetId));
      await db.update(dmConversations).set({ createdBy: null }).where(eq(dmConversations.createdBy, targetId));
      await db.update(xpEvents).set({ awardedBy: null }).where(eq(xpEvents.awardedBy, targetId));

      // Delete rows with non-nullable FK refs to this user
      await db.delete(challengeSubmissions).where(eq(challengeSubmissions.userId, targetId));
      await db.delete(messages).where(eq(messages.userId, targetId));
      await db.delete(marketplaceBids).where(eq(marketplaceBids.bidderUserId, targetId));
      await db.delete(marketplaceListings).where(eq(marketplaceListings.sellerUserId, targetId));
      await db.delete(sideQuestCompletions).where(eq(sideQuestCompletions.userId, targetId));
      await db.delete(boardThreads).where(eq(boardThreads.createdBy, targetId));

      // Finally delete the user — cascading FKs handle wallets, tokens, DM participants, DM messages, XP events, reward flags, board replies
      await db.delete(users).where(eq(users.id, targetId));

      res.json({ ok: true, deleted: target.username });
    } catch (err) {
      console.error("Failed to delete user:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

router.get(
  "/api/admin/stats",
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host"),
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
  requireRole("admin", "host"),
  async (req, res) => {
    try {
      const staff = req.user as any;
      const { ids, opHash } = req.body;
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ error: "No ids provided" });

      const now = new Date();
      for (const id of ids) {
        await db
          .update(rewardLedger)
          .set({
            paid: true,
            opHash: opHash || null,
            paidAt: now,
            paidBy: staff.id,
          })
          .where(eq(rewardLedger.id, id));
      }

      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to batch pay" });
    }
  }
);

export default router;
