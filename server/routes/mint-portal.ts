/**
 * Phase 7 — Mint Portal microapp routes.
 *
 *   GET  /api/mint-portal/challenges   → active + grading challenges that
 *                                        carry a mint binding (tag, contract,
 *                                        or curation) with submission status
 *                                        for the authenticated user.
 *   POST /api/mint-portal/match        → kick the mint-challenge-matcher for
 *                                        the authenticated user so newly
 *                                        observed mints propagate to
 *                                        challenge_submissions without
 *                                        waiting for the scheduled sweep.
 */

import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  challenges,
  challengeSubmissions,
  rounds,
  seasons,
  userWallets,
} from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { runMintChallengeMatcherForUser } from "../lib/mint-challenge-matcher";

const router = Router();

router.get(
  "/api/mint-portal/challenges",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const rows = await db
        .select({
          id: challenges.id,
          roundId: challenges.roundId,
          title: challenges.title,
          description: challenges.description,
          status: challenges.status,
          deadline: challenges.deadline,
          rewardAmountWtf: challenges.rewardAmountWtf,
          rewardXp: challenges.rewardXp,
          submissionContract: challenges.submissionContract,
          submissionTag: challenges.submissionTag,
          submissionCuration: challenges.submissionCuration,
          roundTitle: rounds.name,
          seasonId: rounds.seasonId,
          seasonTitle: seasons.name,
        })
        .from(challenges)
        .leftJoin(rounds, eq(rounds.id, challenges.roundId))
        .leftJoin(seasons, eq(seasons.id, rounds.seasonId))
        .where(
          and(
            inArray(challenges.status, ["active", "grading"]),
            or(
              isNotNull(challenges.submissionContract),
              isNotNull(challenges.submissionTag),
              isNotNull(challenges.submissionCuration)
            )
          )
        )
        .orderBy(desc(challenges.createdAt));

      const ids = rows.map((r) => r.id);
      const subs =
        ids.length > 0
          ? await db
              .select({
                id: challengeSubmissions.id,
                challengeId: challengeSubmissions.challengeId,
                submittedAt: challengeSubmissions.submittedAt,
                grade: challengeSubmissions.grade,
                rewardDistributed: challengeSubmissions.rewardDistributed,
                source: challengeSubmissions.source,
                mintTokenContract: challengeSubmissions.mintTokenContract,
                mintTokenId: challengeSubmissions.mintTokenId,
                mintOpHash: challengeSubmissions.mintOpHash,
                contentUrl: challengeSubmissions.contentUrl,
              })
              .from(challengeSubmissions)
              .where(
                and(
                  eq(challengeSubmissions.userId, user.id),
                  inArray(challengeSubmissions.challengeId, ids)
                )
              )
              .orderBy(desc(challengeSubmissions.submittedAt))
          : [];

      const byChallenge = new Map<
        number,
        Array<(typeof subs)[number]>
      >();
      for (const s of subs) {
        const arr = byChallenge.get(s.challengeId) ?? [];
        arr.push(s);
        byChallenge.set(s.challengeId, arr);
      }

      const wallets = await db
        .select({ walletAddress: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id));

      const walletCount = wallets.length;
      const result = rows.map((r) => ({
        ...r,
        mySubmissions: byChallenge.get(r.id) ?? [],
      }));

      res.json({
        challenges: result,
        wallet: {
          count: walletCount,
          addresses: wallets.map((w) => w.walletAddress),
        },
      });
    } catch (err) {
      console.error("[mint-portal] list failed:", err);
      res.status(500).json({ error: "Failed to load mint portal" });
    }
  }
);

const matchBodySchema = z
  .object({
    lookbackHours: z.coerce.number().int().min(1).max(168).optional(),
  })
  .strict()
  .optional();

router.post(
  "/api/mint-portal/match",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const parsed = matchBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid match payload" });
      }
      const lookback = parsed.data?.lookbackHours ?? 6;
      const stats = await runMintChallengeMatcherForUser(user.id, lookback);
      res.json({ ok: true, ...stats });
    } catch (err) {
      console.error("[mint-portal] match failed:", err);
      res.status(500).json({ error: "Failed to run mint matcher" });
    }
  }
);

export default router;
