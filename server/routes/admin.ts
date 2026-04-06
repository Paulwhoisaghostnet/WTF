import { Router } from "express";
import { db } from "../db";
import {
  users,
  userWallets,
  seasons,
  rounds,
  challenges,
  xpEvents,
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

router.get(
  "/api/admin/stats",
  requireRole("admin", "host", "cohost"),
  async (_req, res) => {
    try {
      const [userCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      const [seasonCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(seasons);
      const [roundCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(rounds);
      const [challengeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(challenges);

      res.json({
        users: userCount.count,
        seasons: seasonCount.count,
        rounds: roundCount.count,
        challenges: challengeCount.count,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

export default router;
