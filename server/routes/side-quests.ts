import { Router } from "express";
import { db } from "../db";
import {
  sideQuests,
  sideQuestCompletions,
  users,
  userWallets,
  boardThreadReplies,
  rewardLedger,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { awardXp } from "../lib/xp";
import { notifyHosts } from "../lib/notify-hosts";
import { getUserGameLayerStats } from "../lib/game-layer-stats";
import { z } from "zod";

const router = Router();

const questStatuses = ["draft", "active", "completed"] as const;
const autoVerifyTypes = [
  "manual",
  "profile_avatar",
  "profile_bio",
  "wallet_connected",
  "social_twitter",
  "social_discord",
  "post_message",
  "holds_positive_balance",
  "holds_art_nft",
  "has_mint_event",
  "listed_on_trade_board",
] as const;

const optionalDateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid timestamp",
      });
      return z.NEVER;
    }
    return parsed;
  });

const sideQuestCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(20_000),
    criteria: z
      .string()
      .trim()
      .max(20_000)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    rewardAmountWtf: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
    rewardXp: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.enum(questStatuses).optional(),
    maxCompletions: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
    persistent: z.coerce.boolean().optional(),
    autoVerifyType: z.enum(autoVerifyTypes).optional(),
    deadline: optionalDateSchema,
  })
  .strict();

const sideQuestUpdateSchema = sideQuestCreateSchema.partial().strict();

/* ═══ Auto-verification logic ════════════════════════════ */

async function runAutoVerify(
  userId: number,
  verifyType: string
): Promise<{ passed: boolean; reason: string }> {
  switch (verifyType) {
    case "profile_avatar": {
      const [u] = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, userId));
      return u?.avatarUrl
        ? { passed: true, reason: "Profile avatar is set" }
        : { passed: false, reason: "No profile avatar set yet" };
    }

    case "profile_bio": {
      const [u] = await db
        .select({ bio: users.bio })
        .from(users)
        .where(eq(users.id, userId));
      return u?.bio && u.bio.trim().length > 0
        ? { passed: true, reason: "Profile bio is set" }
        : { passed: false, reason: "No profile bio set yet" };
    }

    case "wallet_connected": {
      const wallets = await db
        .select({ id: userWallets.id })
        .from(userWallets)
        .where(eq(userWallets.userId, userId))
        .limit(1);
      return wallets.length > 0
        ? { passed: true, reason: "Wallet is connected" }
        : { passed: false, reason: "No wallet connected to account" };
    }

    case "social_twitter": {
      const [u] = await db
        .select({ twitterHandle: users.twitterHandle })
        .from(users)
        .where(eq(users.id, userId));
      return u?.twitterHandle
        ? { passed: true, reason: "Twitter/X account is linked" }
        : { passed: false, reason: "No Twitter/X handle linked" };
    }

    case "social_discord": {
      const [u] = await db
        .select({ discordHandle: users.discordHandle })
        .from(users)
        .where(eq(users.id, userId));
      return u?.discordHandle
        ? { passed: true, reason: "Discord account is linked" }
        : { passed: false, reason: "No Discord handle linked" };
    }

    case "post_message": {
      const msgs = await db
        .select({ id: boardThreadReplies.id })
        .from(boardThreadReplies)
        .where(eq(boardThreadReplies.userId, userId))
        .limit(1);
      return msgs.length > 0
        ? { passed: true, reason: "Has posted in the message board" }
        : { passed: false, reason: "No message board posts yet" };
    }

    case "holds_positive_balance": {
      const s = await getUserGameLayerStats(userId);
      return s.holdingsWithBalance > 0
        ? {
            passed: true,
            reason: `Indexed holdings: ${s.holdingsWithBalance} token row(s) with balance > 0`,
          }
        : {
            passed: false,
            reason: "No positive wallet holdings indexed yet — link a wallet and wait for sync",
          };
    }

    case "holds_art_nft": {
      const s = await getUserGameLayerStats(userId);
      return s.nonWtfHoldingsWithBalance > 0
        ? {
            passed: true,
            reason: `${s.nonWtfHoldingsWithBalance} non-WTF FA2 position(s) with balance > 0`,
          }
        : {
            passed: false,
            reason: "No art/NFT holdings indexed yet (WTF token alone does not count)",
          };
    }

    case "has_mint_event": {
      const s = await getUserGameLayerStats(userId);
      return s.mintEventCount > 0
        ? {
            passed: true,
            reason: `${s.mintEventCount} mint event(s) recorded for your linked wallets`,
          }
        : {
            passed: false,
            reason: "No mint events indexed yet for your account",
          };
    }

    case "listed_on_trade_board": {
      const s = await getUserGameLayerStats(userId);
      return s.tradeBoardListedQuantity > 0
        ? {
            passed: true,
            reason: `${s.tradeBoardListedQuantity} trade-board listing slot(s) in collections`,
          }
        : {
            passed: false,
            reason: "Nothing listed on the WTF trade board yet",
          };
    }

    default:
      return { passed: false, reason: "Requires manual verification" };
  }
}

async function distributeRewards(
  completionId: number,
  quest: { id: number; title: string; rewardXp: number; rewardAmountWtf: number | null },
  userId: number,
  approvedBy: number
): Promise<void> {
  if (quest.rewardXp > 0) {
    try {
      await awardXp({
        userId,
        amount: quest.rewardXp,
        reason: "side_quest_reward",
        awardedBy: approvedBy,
        metadata: { sideQuestId: quest.id, completionId },
      });
      await db
        .update(sideQuestCompletions)
        .set({ xpAwarded: quest.rewardXp, xpAwardedAt: new Date() })
        .where(eq(sideQuestCompletions.id, completionId));
    } catch (err) {
      console.error("[side-quests] XP award failed:", err);
    }
  }

  const wtf = quest.rewardAmountWtf ?? 0;
  if (wtf > 0) {
    try {
      // Guard against duplicate ledger rows if the completion is approved
      // more than once (e.g. toggled or re-approved). Only insert when no
      // row already exists for this user + side_quest combination.
      const [existing] = await db
        .select({ id: rewardLedger.id })
        .from(rewardLedger)
        .where(
          and(
            eq(rewardLedger.userId, userId),
            eq(rewardLedger.sourceType, "side_quest"),
            eq(rewardLedger.sourceId, quest.id)
          )
        )
        .limit(1);

      if (!existing) {
        await db.insert(rewardLedger).values({
          userId,
          amountWtf: wtf,
          reason: `Side Quest: ${quest.title}`,
          sourceType: "side_quest",
          sourceId: quest.id,
        });
      }
    } catch (err) {
      console.error("[side-quests] WTF ledger entry failed:", err);
    }
  }
}

/* ═══ Routes ═════════════════════════════════════════════ */

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
        xpAwarded: sideQuestCompletions.xpAwarded,
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

router.get("/api/side-quests/my/completions", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const rows = await db
      .select({
        id: sideQuestCompletions.id,
        sideQuestId: sideQuestCompletions.sideQuestId,
        approved: sideQuestCompletions.approved,
        completedAt: sideQuestCompletions.completedAt,
        xpAwarded: sideQuestCompletions.xpAwarded,
      })
      .from(sideQuestCompletions)
      .where(eq(sideQuestCompletions.userId, user.id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch completions" });
  }
});

router.post(
  "/api/side-quests",
  requirePermission("manage_side_quests"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const parsed = sideQuestCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid side quest payload" });
      }
      const [quest] = await db
        .insert(sideQuests)
        .values({
          title: parsed.data.title,
          description: parsed.data.description,
          criteria: parsed.data.criteria ?? null,
          rewardAmountWtf: parsed.data.rewardAmountWtf ?? 0,
          rewardXp: parsed.data.rewardXp ?? 0,
          status: parsed.data.status ?? "draft",
          maxCompletions: parsed.data.maxCompletions ?? null,
          persistent: parsed.data.persistent ?? false,
          autoVerifyType: parsed.data.autoVerifyType ?? "manual",
          deadline: parsed.data.deadline ?? null,
          createdBy: user.id,
        })
        .returning();
      res.status(201).json(quest);
    } catch (err) {
      res.status(500).json({ error: "Failed to create side quest" });
    }
  }
);

router.put(
  "/api/side-quests/:id",
  requirePermission("manage_side_quests"),
  async (req, res) => {
    try {
      const parsed = sideQuestUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid side quest payload" });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.description !== undefined) {
        updates.description = parsed.data.description;
      }
      if (parsed.data.criteria !== undefined) updates.criteria = parsed.data.criteria;
      if (parsed.data.rewardAmountWtf !== undefined) {
        updates.rewardAmountWtf = parsed.data.rewardAmountWtf;
      }
      if (parsed.data.rewardXp !== undefined) updates.rewardXp = parsed.data.rewardXp;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.maxCompletions !== undefined) {
        updates.maxCompletions = parsed.data.maxCompletions;
      }
      if (parsed.data.persistent !== undefined) updates.persistent = parsed.data.persistent;
      if (parsed.data.autoVerifyType !== undefined) {
        updates.autoVerifyType = parsed.data.autoVerifyType;
      }
      if (parsed.data.deadline !== undefined) updates.deadline = parsed.data.deadline;

      const [updated] = await db
        .update(sideQuests)
        .set(updates)
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

      const [quest] = await db
        .select()
        .from(sideQuests)
        .where(eq(sideQuests.id, questId));
      if (!quest)
        return res.status(404).json({ error: "Side quest not found" });
      if (quest.status !== "active")
        return res.status(400).json({ error: "Quest is not active" });

      if (quest.deadline && new Date(quest.deadline) < new Date())
        return res.status(400).json({ error: "Quest deadline has passed" });

      const existing = await db
        .select({ id: sideQuestCompletions.id })
        .from(sideQuestCompletions)
        .where(
          and(
            eq(sideQuestCompletions.sideQuestId, questId),
            eq(sideQuestCompletions.userId, user.id)
          )
        );
      if (existing.length > 0)
        return res.status(409).json({ error: "You have already submitted this quest" });

      if (quest.maxCompletions) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sideQuestCompletions)
          .where(eq(sideQuestCompletions.sideQuestId, questId));
        if (count >= quest.maxCompletions)
          return res.status(400).json({ error: "Quest has reached max completions" });
      }

      let approved: boolean | null = null;
      let autoVerifyResult: { passed: boolean; reason: string } | null = null;

      if (quest.autoVerifyType !== "manual") {
        autoVerifyResult = await runAutoVerify(user.id, quest.autoVerifyType);
        if (autoVerifyResult.passed) {
          approved = true;
        } else {
          return res.status(400).json({
            error: autoVerifyResult.reason,
            autoVerifyFailed: true,
          });
        }
      }

      const [completion] = await db
        .insert(sideQuestCompletions)
        .values({
          sideQuestId: questId,
          userId: user.id,
          proofText: autoVerifyResult?.reason || req.body.proofText,
          proofUrl: req.body.proofUrl,
          approved,
          approvedBy: approved ? user.id : undefined,
        })
        .returning();

      if (approved) {
        await distributeRewards(
          completion.id,
          quest,
          user.id,
          user.id
        );
      }

      notifyHosts(
        `📋 ${user.displayName || user.username} ${approved ? "completed" : "submitted"} side quest "${quest.title}"${approved ? " (auto-verified)" : " — awaiting review"}`
      ).catch(() => {});

      res.status(201).json({
        ...completion,
        autoVerified: !!approved,
        autoVerifyReason: autoVerifyResult?.reason,
      });
    } catch (err) {
      console.error("[side-quests] completion error:", err);
      res.status(500).json({ error: "Failed to submit completion" });
    }
  }
);

router.put(
  "/api/side-quest-completions/:id/approve",
  requirePermission("manage_side_quests"),
  async (req, res) => {
    try {
      const staff = req.user as any;
      const completionId = parseInt(req.params.id as string);
      const isApproved = !!req.body.approved;

      const [comp] = await db
        .select({
          id: sideQuestCompletions.id,
          userId: sideQuestCompletions.userId,
          sideQuestId: sideQuestCompletions.sideQuestId,
          xpAwarded: sideQuestCompletions.xpAwarded,
          approved: sideQuestCompletions.approved,
        })
        .from(sideQuestCompletions)
        .where(eq(sideQuestCompletions.id, completionId));
      if (!comp)
        return res.status(404).json({ error: "Completion not found" });

      const [updated] = await db
        .update(sideQuestCompletions)
        .set({
          approved: isApproved,
          approvedBy: staff.id,
          rewardOpHash: req.body.rewardOpHash,
        })
        .where(eq(sideQuestCompletions.id, completionId))
        .returning();

      // Only distribute rewards when transitioning to approved for the first time.
      // comp.approved is null (pending) or false (rejected) for a new approval;
      // skip if already true to prevent double-paying.
      if (isApproved && !comp.approved) {
        const [quest] = await db
          .select()
          .from(sideQuests)
          .where(eq(sideQuests.id, comp.sideQuestId));
        if (quest) {
          await distributeRewards(completionId, quest, comp.userId, staff.id);
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to approve completion" });
    }
  }
);

export default router;
