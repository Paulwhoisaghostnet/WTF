import { Router } from "express";
import { db } from "../db";
import { users, userWallets, seasons, rounds, challenges } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireRole } from "../auth/passport";

const router = Router();

router.get("/api/admin/users", requireRole("host", "cohost"), async (_req, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    res.json(allUsers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.put(
  "/api/admin/users/:id/role",
  requireRole("host"),
  async (req, res) => {
    try {
      const { role } = req.body;
      if (!["host", "cohost", "contestant", "witness"].includes(role)) {
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

router.get(
  "/api/admin/stats",
  requireRole("host", "cohost"),
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
