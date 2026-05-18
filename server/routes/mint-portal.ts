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
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import {
  challenges,
  challengeSubmissions,
  collectionContracts,
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

const mintContractsQuerySchema = z
  .object({
    network: z.enum(["ghostnet", "shadownet", "mainnet"]).optional(),
  })
  .strict();

router.get(
  "/api/mint-portal/contracts",
  isAuthenticated,
  async (req, res) => {
    try {
      const parsed = mintContractsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid contracts query" });
      }
      const filters = [
        eq(collectionContracts.templateKind, "open_edition"),
        eq(collectionContracts.status, "live"),
      ];
      if (parsed.data.network) {
        filters.push(eq(collectionContracts.network, parsed.data.network));
      }
      const rows = await db
        .select({
          id: collectionContracts.id,
          name: collectionContracts.name,
          address: collectionContracts.address,
          network: collectionContracts.network,
          opHash: collectionContracts.opHash,
          deployedAt: collectionContracts.deployedAt,
        })
        .from(collectionContracts)
        .where(and(...filters))
        .orderBy(desc(collectionContracts.deployedAt))
        .limit(50);
      res.json({ contracts: rows.filter((row) => Boolean(row.address)) });
    } catch (err) {
      console.error("[mint-portal] contract list failed:", err);
      res.status(500).json({ error: "Failed to load mint contracts" });
    }
  }
);

const recordMintBodySchema = z
  .object({
    challengeId: z.coerce.number().int().positive(),
    tokenContract: z.string().trim().regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/),
    tokenId: z.string().trim().regex(/^[0-9]+$/).max(100),
    opHash: z.string().trim().regex(/^o[1-9A-HJ-NP-Za-km-z]{50}$/),
    contentUrl: z.string().trim().url().max(1000).optional(),
  })
  .strict();

router.post(
  "/api/mint-portal/record-mint",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const parsed = recordMintBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid mint record payload" });
      }
      const body = parsed.data;
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, body.challengeId))
        .limit(1);
      if (!challenge) return res.status(404).json({ error: "Challenge not found" });
      if (challenge.status !== "active") {
        return res.status(400).json({ error: "Challenge is not accepting submissions" });
      }
      if (
        challenge.submissionContract &&
        challenge.submissionContract.toLowerCase() !== body.tokenContract.toLowerCase()
      ) {
        return res.status(400).json({ error: "Mint contract does not match challenge binding" });
      }
      if (!challenge.submissionContract) {
        return res.status(400).json({ error: "Challenge has no direct WTF mint contract binding" });
      }

      const existing = await db
        .select()
        .from(challengeSubmissions)
        .where(
          and(
            eq(challengeSubmissions.challengeId, body.challengeId),
            eq(challengeSubmissions.userId, user.id),
            eq(challengeSubmissions.mintOpHash, body.opHash)
          )
        )
        .limit(1);
      if (existing[0]) {
        return res.json({ ok: true, submission: existing[0], duplicate: true });
      }

      const contentUrl =
        body.contentUrl || `https://objkt.com/tokens/${body.tokenContract}/${body.tokenId}`;
      const [submission] = await db
        .insert(challengeSubmissions)
        .values({
          challengeId: body.challengeId,
          userId: user.id,
          contentText: null,
          contentUrl,
          source: "wtf_mint",
          mintTokenContract: body.tokenContract,
          mintTokenId: body.tokenId,
          mintOpHash: body.opHash,
        })
        .returning();

      res.status(201).json({ ok: true, submission, duplicate: false });
    } catch (err) {
      console.error("[mint-portal] mint record failed:", err);
      res.status(500).json({ error: "Failed to record mint submission" });
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
