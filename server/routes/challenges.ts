import { Router } from "express";
import { db } from "../db";
import { challenges, challengeSubmissions, users } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";

const router = Router();

router.get("/api/challenges", async (req, res) => {
  try {
    const roundId = req.query.roundId
      ? parseInt(req.query.roundId as string)
      : undefined;
    const query = roundId
      ? db
          .select()
          .from(challenges)
          .where(eq(challenges.roundId, roundId))
          .orderBy(desc(challenges.createdAt))
      : db
          .select()
          .from(challenges)
          .orderBy(desc(challenges.createdAt));
    const all = await query;
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
});

router.get("/api/challenges/:id", async (req, res) => {
  try {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, parseInt(req.params.id as string)));
    if (!challenge)
      return res.status(404).json({ error: "Challenge not found" });

    const subs = await db
      .select({
        id: challengeSubmissions.id,
        userId: challengeSubmissions.userId,
        username: users.username,
        displayName: users.displayName,
        contentText: challengeSubmissions.contentText,
        contentUrl: challengeSubmissions.contentUrl,
        submittedAt: challengeSubmissions.submittedAt,
        grade: challengeSubmissions.grade,
        feedback: challengeSubmissions.feedback,
        rewardDistributed: challengeSubmissions.rewardDistributed,
      })
      .from(challengeSubmissions)
      .leftJoin(users, eq(challengeSubmissions.userId, users.id))
      .where(eq(challengeSubmissions.challengeId, challenge.id))
      .orderBy(desc(challengeSubmissions.submittedAt));

    res.json({ ...challenge, submissions: subs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch challenge" });
  }
});

router.post(
  "/api/challenges",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const [challenge] = await db
        .insert(challenges)
        .values({ ...req.body, createdBy: user.id })
        .returning();
      res.status(201).json(challenge);
    } catch (err) {
      res.status(500).json({ error: "Failed to create challenge" });
    }
  }
);

router.put(
  "/api/challenges/:id",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(challenges)
        .set(req.body)
        .where(eq(challenges.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Challenge not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update challenge" });
    }
  }
);

// ─── Submissions ─────────────────────────────────────────

router.post(
  "/api/challenges/:id/submit",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const challengeId = parseInt(req.params.id as string);

      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, challengeId));
      if (!challenge)
        return res.status(404).json({ error: "Challenge not found" });
      if (challenge.status !== "active")
        return res
          .status(400)
          .json({ error: "Challenge is not accepting submissions" });

      const existing = await db
        .select()
        .from(challengeSubmissions)
        .where(
          and(
            eq(challengeSubmissions.challengeId, challengeId),
            eq(challengeSubmissions.userId, user.id)
          )
        );
      if (existing.length > 0) {
        return res.status(409).json({ error: "Already submitted" });
      }

      const [submission] = await db
        .insert(challengeSubmissions)
        .values({
          challengeId,
          userId: user.id,
          contentText: req.body.contentText,
          contentUrl: req.body.contentUrl,
        })
        .returning();
      res.status(201).json(submission);
    } catch (err) {
      res.status(500).json({ error: "Failed to submit" });
    }
  }
);

router.put(
  "/api/submissions/:id/grade",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const { grade, feedback } = req.body;

      const [updated] = await db
        .update(challengeSubmissions)
        .set({
          grade,
          feedback,
          gradedBy: user.id,
          gradedAt: new Date(),
        })
        .where(eq(challengeSubmissions.id, parseInt(req.params.id as string)))
        .returning();

      if (!updated)
        return res.status(404).json({ error: "Submission not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to grade submission" });
    }
  }
);

router.put(
  "/api/submissions/:id/reward",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const { opHash } = req.body;
      const [updated] = await db
        .update(challengeSubmissions)
        .set({ rewardDistributed: true, rewardOpHash: opHash })
        .where(eq(challengeSubmissions.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Submission not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to mark reward" });
    }
  }
);

export default router;
