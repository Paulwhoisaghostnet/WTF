import { Router } from "express";
import { db } from "../db";
import { sideQuests, sideQuestCompletions, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";

const router = Router();

router.get("/api/side-quests", async (_req, res) => {
  try {
    const quests = await db
      .select()
      .from(sideQuests)
      .orderBy(desc(sideQuests.createdAt));
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch side quests" });
  }
});

router.get("/api/side-quests/:id", async (req, res) => {
  try {
    const [quest] = await db
      .select()
      .from(sideQuests)
      .where(eq(sideQuests.id, parseInt(req.params.id as string)));
    if (!quest) return res.status(404).json({ error: "Side quest not found" });

    const completions = await db
      .select({
        id: sideQuestCompletions.id,
        userId: sideQuestCompletions.userId,
        username: users.username,
        displayName: users.displayName,
        proofText: sideQuestCompletions.proofText,
        proofUrl: sideQuestCompletions.proofUrl,
        completedAt: sideQuestCompletions.completedAt,
        approved: sideQuestCompletions.approved,
      })
      .from(sideQuestCompletions)
      .leftJoin(users, eq(sideQuestCompletions.userId, users.id))
      .where(eq(sideQuestCompletions.sideQuestId, quest.id))
      .orderBy(desc(sideQuestCompletions.completedAt));

    res.json({ ...quest, completions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch side quest" });
  }
});

router.post(
  "/api/side-quests",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const [quest] = await db
        .insert(sideQuests)
        .values({ ...req.body, createdBy: user.id })
        .returning();
      res.status(201).json(quest);
    } catch (err) {
      res.status(500).json({ error: "Failed to create side quest" });
    }
  }
);

router.put(
  "/api/side-quests/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(sideQuests)
        .set(req.body)
        .where(eq(sideQuests.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Side quest not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update side quest" });
    }
  }
);

router.post(
  "/api/side-quests/:id/complete",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const questId = parseInt(req.params.id as string);

      const [completion] = await db
        .insert(sideQuestCompletions)
        .values({
          sideQuestId: questId,
          userId: user.id,
          proofText: req.body.proofText,
          proofUrl: req.body.proofUrl,
        })
        .returning();
      res.status(201).json(completion);
    } catch (err) {
      res.status(500).json({ error: "Failed to submit completion" });
    }
  }
);

router.put(
  "/api/side-quest-completions/:id/approve",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const [updated] = await db
        .update(sideQuestCompletions)
        .set({
          approved: req.body.approved,
          approvedBy: user.id,
          rewardOpHash: req.body.rewardOpHash,
        })
        .where(eq(sideQuestCompletions.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Completion not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to approve completion" });
    }
  }
);

export default router;
