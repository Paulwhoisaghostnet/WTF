import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
} from "@shared/schema";
import { isAuthenticated } from "../../auth/passport";
import { db } from "../../db";

const router = Router();

function todayCompletionKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
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

    const ids = loops.map((loop) => loop.id);
    const completions =
      ids.length === 0
        ? []
        : await db
            .select({
              challengeId: challengeAutomationCompletions.challengeId,
              completedAt: challengeAutomationCompletions.completedAt,
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

    res.json({
      completionKey,
      loops: loops.map((loop) => {
        const metadata =
          loop.metadata && typeof loop.metadata === "object" && !Array.isArray(loop.metadata)
            ? (loop.metadata as Record<string, unknown>)
            : {};
        const completion = completionByChallenge.get(loop.id);
        return {
          id: loop.id,
          title: loop.title,
          description: loop.description,
          summary: loop.summary,
          route: typeof metadata.route === "string" ? metadata.route : "/side-quests",
          actionLabel:
            typeof metadata.actionLabel === "string" ? metadata.actionLabel : "Open",
          category: typeof metadata.category === "string" ? metadata.category : "daily",
          rewards: readRewardAmounts(loop.rewardActions),
          completedToday: Boolean(completion),
          rewardStatus: completion?.rewardStatus ?? null,
          completedAt: completion?.completedAt ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[challenge-automation] daily loops failed:", err);
    res.status(500).json({ error: "Failed to fetch daily loops" });
  }
});

export default router;
