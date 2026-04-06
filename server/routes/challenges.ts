import { Router } from "express";
import { db } from "../db";
import {
  challenges,
  challengeSubmissions,
  challengeRewardFlags,
  users,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";
import { awardXp } from "../lib/xp";

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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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

      try {
        await awardXp({
          userId: user.id,
          amount: 5,
          reason: "challenge_submission",
          metadata: { challengeId, submissionId: submission.id },
        });
      } catch {
        // XP should not block submissions.
      }

      res.status(201).json(submission);
    } catch (err) {
      res.status(500).json({ error: "Failed to submit" });
    }
  }
);

router.put(
  "/api/submissions/:id/grade",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const submissionId = parseInt(req.params.id as string);
      const { grade, feedback } = req.body;

      if (!["pending", "pass", "fail", "bonus"].includes(grade)) {
        return res.status(400).json({ error: "Invalid grade" });
      }

      const [submissionRow] = await db
        .select({
          id: challengeSubmissions.id,
          userId: challengeSubmissions.userId,
          challengeId: challengeSubmissions.challengeId,
          xpAwarded: challengeSubmissions.xpAwarded,
          rewardXp: challenges.rewardXp,
          rewardEscrowSlug: challenges.rewardEscrowSlug,
        })
        .from(challengeSubmissions)
        .leftJoin(challenges, eq(challengeSubmissions.challengeId, challenges.id))
        .where(eq(challengeSubmissions.id, submissionId))
        .limit(1);

      if (!submissionRow) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const [updated] = await db
        .update(challengeSubmissions)
        .set({
          grade,
          feedback,
          gradedBy: user.id,
          gradedAt: new Date(),
        })
        .where(eq(challengeSubmissions.id, submissionId))
        .returning();

      const shouldBeClaimable = grade === "pass" || grade === "bonus";

      if (shouldBeClaimable) {
        const flagSlug = `challenge-${submissionRow.challengeId}-user-${submissionRow.userId}`;
        await db
          .insert(challengeRewardFlags)
          .values({
            challengeId: submissionRow.challengeId,
            submissionId: submissionRow.id,
            userId: submissionRow.userId,
            claimable: true,
            claimed: false,
            flagSlug,
            rewardEscrowSlug: submissionRow.rewardEscrowSlug ?? null,
          })
          .onConflictDoUpdate({
            target: challengeRewardFlags.submissionId,
            set: {
              claimable: true,
              claimed: false,
              rewardEscrowSlug: submissionRow.rewardEscrowSlug ?? null,
              flagSlug,
            },
          });
      } else {
        await db
          .update(challengeRewardFlags)
          .set({ claimable: false })
          .where(eq(challengeRewardFlags.submissionId, submissionRow.id));
      }

      const rewardXp = submissionRow.rewardXp ?? 0;

      if (shouldBeClaimable && submissionRow.xpAwarded === 0 && rewardXp > 0) {
        try {
          await awardXp({
            userId: submissionRow.userId,
            amount: rewardXp,
            reason: "challenge_grade_reward",
            awardedBy: user.id,
            metadata: {
              challengeId: submissionRow.challengeId,
              submissionId: submissionRow.id,
              grade,
            },
          });

          await db
            .update(challengeSubmissions)
            .set({
              xpAwarded: rewardXp,
              xpAwardedAt: new Date(),
            })
            .where(eq(challengeSubmissions.id, submissionRow.id));
        } catch {
          // XP should not block grading.
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to grade submission" });
    }
  }
);

router.put(
  "/api/submissions/:id/reward",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const { opHash } = req.body;
      const submissionId = parseInt(req.params.id as string);

      const [submission] = await db
        .select({
          id: challengeSubmissions.id,
          challengeId: challengeSubmissions.challengeId,
          userId: challengeSubmissions.userId,
          grade: challengeSubmissions.grade,
          rewardEscrowSlug: challenges.rewardEscrowSlug,
        })
        .from(challengeSubmissions)
        .leftJoin(challenges, eq(challengeSubmissions.challengeId, challenges.id))
        .where(eq(challengeSubmissions.id, submissionId))
        .limit(1);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const [updated] = await db
        .update(challengeSubmissions)
        .set({ rewardDistributed: true, rewardOpHash: opHash })
        .where(eq(challengeSubmissions.id, submissionId))
        .returning();

      if (submission.grade === "pass" || submission.grade === "bonus") {
        const flagSlug = `challenge-${submission.challengeId}-user-${submission.userId}`;
        await db
          .insert(challengeRewardFlags)
          .values({
            challengeId: submission.challengeId,
            submissionId: submission.id,
            userId: submission.userId,
            claimable: true,
            claimed: false,
            flagSlug,
            rewardEscrowSlug: submission.rewardEscrowSlug ?? null,
          })
          .onConflictDoUpdate({
            target: challengeRewardFlags.submissionId,
            set: {
              claimable: true,
              rewardEscrowSlug: submission.rewardEscrowSlug ?? null,
            },
          });
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to mark reward" });
    }
  }
);

router.get("/api/reward-flags/challenges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const rows = await db
      .select({
        id: challengeRewardFlags.id,
        challengeId: challengeRewardFlags.challengeId,
        submissionId: challengeRewardFlags.submissionId,
        claimable: challengeRewardFlags.claimable,
        claimed: challengeRewardFlags.claimed,
        flagSlug: challengeRewardFlags.flagSlug,
        rewardEscrowSlug: challengeRewardFlags.rewardEscrowSlug,
        claimedAt: challengeRewardFlags.claimedAt,
        createdAt: challengeRewardFlags.createdAt,
        challengeTitle: challenges.title,
        rewardType: challenges.rewardType,
        rewardAmountWtf: challenges.rewardAmountWtf,
        rewardTokenContract: challenges.rewardTokenContract,
        rewardTokenId: challenges.rewardTokenId,
        rewardTokenAmount: challenges.rewardTokenAmount,
      })
      .from(challengeRewardFlags)
      .leftJoin(challenges, eq(challengeRewardFlags.challengeId, challenges.id))
      .where(eq(challengeRewardFlags.userId, user.id))
      .orderBy(desc(challengeRewardFlags.createdAt));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reward flags" });
  }
});

router.put(
  ["/api/challenges/reward-flags/:id/claim", "/api/reward-flags/challenges/:id/claim"],
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const flagId = parseInt(req.params.id as string);

      const [flag] = await db
        .select()
        .from(challengeRewardFlags)
        .where(eq(challengeRewardFlags.id, flagId))
        .limit(1);

      if (!flag) {
        return res.status(404).json({ error: "Reward flag not found" });
      }
      if (flag.userId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      if (!flag.claimable) {
        return res.status(400).json({ error: "Reward is not claimable" });
      }
      if (flag.claimed) {
        return res.status(400).json({ error: "Reward already claimed" });
      }

      const [updated] = await db
        .update(challengeRewardFlags)
        .set({
          claimed: true,
          claimedAt: new Date(),
          claimable: false,
        })
        .where(eq(challengeRewardFlags.id, flagId))
        .returning();

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to claim reward flag" });
    }
  }
);

export default router;
