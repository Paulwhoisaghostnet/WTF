import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
} from "@shared/schema";
import { isAuthenticated } from "../../auth/passport";
import { db } from "../../db";
import { REGGIE_FINALE_STEP_KEY } from "../services/reggie-quest";

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readRewardAmounts(actions: unknown) {
  const reward = { xp: 0, wtf: 0 };
  if (!Array.isArray(actions)) return reward;
  for (const action of actions) {
    if (!isRecord(action)) continue;
    const params = isRecord(action.params) ? action.params : {};
    if (action.key === "award_exp") {
      reward.xp += Math.max(0, Math.floor(Number(params.amount ?? 0)));
    }
    if (action.key === "queue_wtf_reward") {
      reward.wtf += Math.max(0, Math.floor(Number(params.amountWtf ?? 0)));
    }
  }
  return reward;
}

/**
 * Reggie's quest state for the signed-in user.
 *
 * Steps are challenge automation definitions tagged `reggieQuest` in
 * metadata. Status is derived from automation completions plus the
 * prerequisite graph stored in each step's metadata.
 */
router.get("/api/reggie/quest", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const definitions = await db
      .select()
      .from(challengeAutomationDefinitions)
      .where(
        and(
          eq(challengeAutomationDefinitions.status, "active"),
          sql`${challengeAutomationDefinitions.metadata}->>'reggieQuest' = 'true'`
        )
      );

    const ids = definitions.map((definition) => definition.id);
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
                inArray(challengeAutomationCompletions.challengeId, ids)
              )
            );
    const completionByChallenge = new Map(
      completions.map((completion) => [completion.challengeId, completion])
    );

    const completedStepKeys = new Set<string>();
    for (const definition of definitions) {
      const metadata = isRecord(definition.metadata) ? definition.metadata : {};
      if (
        typeof metadata.stepKey === "string" &&
        completionByChallenge.has(definition.id)
      ) {
        completedStepKeys.add(metadata.stepKey);
      }
    }

    const steps = definitions
      .map((definition) => {
        const metadata = isRecord(definition.metadata) ? definition.metadata : {};
        const stepKey = typeof metadata.stepKey === "string" ? metadata.stepKey : "";
        const prereqStepKeys = Array.isArray(metadata.prereqStepKeys)
          ? metadata.prereqStepKeys.map(String)
          : [];
        const completion = completionByChallenge.get(definition.id) ?? null;
        const completed = Boolean(completion);
        const unlocked = prereqStepKeys.every((key) => completedStepKeys.has(key));
        return {
          id: definition.id,
          seedKey: typeof metadata.seedKey === "string" ? metadata.seedKey : "",
          stepKey,
          title: definition.title,
          description: definition.description,
          route: typeof metadata.route === "string" ? metadata.route : "/side-quests",
          actionLabel:
            typeof metadata.actionLabel === "string" ? metadata.actionLabel : "Open",
          anchorId: typeof metadata.anchorId === "string" ? metadata.anchorId : "",
          category: typeof metadata.category === "string" ? metadata.category : "intro",
          order: typeof metadata.order === "number" ? metadata.order : 999,
          prereqStepKeys,
          rewards: readRewardAmounts(definition.rewardActions),
          status: completed ? "completed" : unlocked ? "available" : "locked",
          completedAt: completion?.completedAt ?? null,
        };
      })
      .filter((step) => step.stepKey.length > 0)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    const finale = steps.find((step) => step.stepKey === REGGIE_FINALE_STEP_KEY) ?? null;
    const regularSteps = steps.filter((step) => step.stepKey !== REGGIE_FINALE_STEP_KEY);
    const completedCount = regularSteps.filter((step) => step.status === "completed").length;

    res.json({
      questComplete: finale?.status === "completed",
      completedCount,
      totalCount: regularSteps.length,
      steps: regularSteps,
      finale,
    });
  } catch (err) {
    console.error("[reggie] quest state failed:", err);
    res.status(500).json({ error: "Failed to fetch Reggie quest state" });
  }
});

export default router;
