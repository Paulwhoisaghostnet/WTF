import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  challengeAutomationProgress,
} from "@shared/schema";
import { isAuthenticated } from "../../auth/passport";
import { db } from "../../db";
import { executeRewardActions } from "../actions/handlers";
import type { ChallengeRewardAction } from "../events/types";

const router = Router();

function todayCompletionKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function nextUtcReset(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  ).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataFor(value: unknown) {
  return isRecord(value) ? value : {};
}

function requiresClaim(metadata: Record<string, unknown>) {
  return metadata.requiresClaim === true;
}

function activeToday(metadata: Record<string, unknown>, now = new Date()) {
  const days = Array.isArray(metadata.activeWeekdaysUtc)
    ? metadata.activeWeekdaysUtc
    : [];
  if (days.length === 0) return true;
  const weekday = now.getUTCDay();
  return days.some((day) => Number(day) === weekday);
}

function parseRewardActions(value: unknown): ChallengeRewardAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChallengeRewardAction => {
      return isRecord(item) && typeof item.key === "string" && item.key.length > 0;
    })
    .map((item) => ({
      key: item.key,
      params: isRecord(item.params) ? item.params : {},
    }));
}

function readRewardAmounts(actions: unknown) {
  const reward = { xp: 0, wtf: 0 };
  if (!Array.isArray(actions)) return reward;
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action)) continue;
    const record = action as Record<string, any>;
    const params =
      record.params && typeof record.params === "object" && !Array.isArray(record.params)
        ? record.params
        : {};
    if (record.key === "award_exp") {
      reward.xp += Math.max(0, Math.floor(Number(params.amount ?? 0)));
    }
    if (record.key === "queue_wtf_reward") {
      reward.wtf += Math.max(0, Math.floor(Number(params.amountWtf ?? 0)));
    }
  }
  return reward;
}

router.get("/api/challenge-automation/daily-loops", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const completionKey = todayCompletionKey();
    const loops = await db
      .select()
      .from(challengeAutomationDefinitions)
      .where(
        and(
          eq(challengeAutomationDefinitions.status, "active"),
          sql`${challengeAutomationDefinitions.metadata}->>'canonicalDailyLoop' = 'true'`
        )
      )
      .orderBy(desc(challengeAutomationDefinitions.updatedAt));

    const activeLoops = loops.filter((loop) => activeToday(metadataFor(loop.metadata)));
    const ids = activeLoops.map((loop) => loop.id);
    const completions =
      ids.length === 0
        ? []
        : await db
            .select({
              challengeId: challengeAutomationCompletions.challengeId,
              id: challengeAutomationCompletions.id,
              completedAt: challengeAutomationCompletions.completedAt,
              rewardedAt: challengeAutomationCompletions.rewardedAt,
              rewardStatus: challengeAutomationCompletions.rewardStatus,
            })
            .from(challengeAutomationCompletions)
            .where(
              and(
                eq(challengeAutomationCompletions.userId, user.id),
                eq(challengeAutomationCompletions.completionKey, completionKey),
                inArray(challengeAutomationCompletions.challengeId, ids)
              )
            );
    const completionByChallenge = new Map(
      completions.map((completion) => [completion.challengeId, completion])
    );
    const completionCounts =
      ids.length === 0
        ? []
        : await db
            .select({
              challengeId: challengeAutomationCompletions.challengeId,
              verifiedByCount: sql<number>`count(*)::int`,
              completedByCount: sql<number>`count(*) filter (where ${challengeAutomationCompletions.rewardStatus} = 'completed')::int`,
            })
            .from(challengeAutomationCompletions)
            .where(
              and(
                eq(challengeAutomationCompletions.completionKey, completionKey),
                inArray(challengeAutomationCompletions.challengeId, ids)
              )
            )
            .groupBy(challengeAutomationCompletions.challengeId);
    const countsByChallenge = new Map(
      completionCounts.map((row) => [
        row.challengeId,
        {
          verifiedByCount: Number(row.verifiedByCount ?? 0),
          completedByCount: Number(row.completedByCount ?? 0),
        },
      ])
    );

    res.json({
      completionKey,
      resetAtUtc: "00:00",
      nextResetAt: nextUtcReset(),
      loops: activeLoops.map((loop) => {
        const metadata = metadataFor(loop.metadata);
        const completion = completionByChallenge.get(loop.id);
        const claimRequired = requiresClaim(metadata);
        const claimedToday = completion?.rewardStatus === "completed";
        const verifiedToday = Boolean(completion);
        const completedToday = claimRequired ? claimedToday : verifiedToday;
        const countRow = countsByChallenge.get(loop.id) ?? {
          verifiedByCount: 0,
          completedByCount: 0,
        };
        return {
          id: loop.id,
          title: loop.title,
          description: loop.description,
          summary: loop.summary,
          route: typeof metadata.route === "string" ? metadata.route : "/side-quests",
          actionLabel:
            typeof metadata.actionLabel === "string" ? metadata.actionLabel : "Open",
          category: typeof metadata.category === "string" ? metadata.category : "daily",
          order: typeof metadata.order === "number" ? metadata.order : 999,
          rewards: readRewardAmounts(loop.rewardActions),
          claimRequired,
          verifiedToday,
          claimableToday:
            claimRequired &&
            verifiedToday &&
            completion?.rewardStatus !== "completed",
          claimedToday,
          completedToday,
          verifiedByCount: countRow.verifiedByCount,
          completedByCount: countRow.completedByCount,
          rewardStatus: completion?.rewardStatus ?? null,
          completionId: completion?.id ?? null,
          completedAt: completion?.completedAt ?? null,
          claimedAt: completion?.rewardedAt ?? null,
        };
      }).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    });
  } catch (err) {
    console.error("[challenge-automation] side quests failed:", err);
    res.status(500).json({ error: "Failed to fetch side quests" });
  }
});

router.post("/api/challenge-automation/daily-loops/:id/claim", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const challengeId = Number.parseInt(req.params.id as string, 10);
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      return res.status(400).json({ error: "Invalid side quest id" });
    }

    const [loop] = await db
      .select()
      .from(challengeAutomationDefinitions)
      .where(
        and(
          eq(challengeAutomationDefinitions.id, challengeId),
          eq(challengeAutomationDefinitions.status, "active"),
          sql`${challengeAutomationDefinitions.metadata}->>'canonicalDailyLoop' = 'true'`
        )
      )
      .limit(1);

    if (!loop) return res.status(404).json({ error: "Side quest not found" });

    const metadata = metadataFor(loop.metadata);
    if (!requiresClaim(metadata)) {
      return res.status(400).json({ error: "This side quest does not require manual claim" });
    }

    const completionKey = todayCompletionKey();
    const [completion] = await db
      .select()
      .from(challengeAutomationCompletions)
      .where(
        and(
          eq(challengeAutomationCompletions.challengeId, challengeId),
          eq(challengeAutomationCompletions.userId, user.id),
          eq(challengeAutomationCompletions.completionKey, completionKey)
        )
      )
      .limit(1);

    if (!completion) {
      return res.status(409).json({
        error: "Side quest is not ready to claim yet",
        notReady: true,
      });
    }

    if (completion.rewardStatus === "completed") {
      return res.json({
        ok: true,
        alreadyClaimed: true,
        completionKey,
        completion,
      });
    }

    const actionResult = await executeRewardActions({
      challengeId: loop.id,
      challengeTitle: loop.title,
      userId: user.id,
      completionId: completion.id,
      completionKey,
      actions: parseRewardActions(loop.rewardActions),
    });
    if (completion.progressId) {
      await db
        .update(challengeAutomationProgress)
        .set({
          rewardStatus: actionResult.rewardStatus as any,
          updatedAt: new Date(),
        })
        .where(eq(challengeAutomationProgress.id, completion.progressId));
    }

    const [updatedCompletion] = await db
      .select()
      .from(challengeAutomationCompletions)
      .where(eq(challengeAutomationCompletions.id, completion.id))
      .limit(1);

    res.json({
      ok: actionResult.rewardStatus === "completed",
      claimed: actionResult.rewardStatus === "completed",
      rewardStatus: actionResult.rewardStatus,
      completionKey,
      completion: updatedCompletion ?? completion,
    });
  } catch (err) {
    console.error("[challenge-automation] side quest claim failed:", err);
    res.status(500).json({ error: "Failed to claim side quest reward" });
  }
});

export default router;
