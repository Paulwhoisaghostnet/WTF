import { and, eq, sql } from "drizzle-orm";
import {
  challengeAutomationActionLogs,
  challengeAutomationCompletions,
  inAppInventoryItems,
  rewardLedger,
} from "@shared/schema";
import { db } from "../../db";
import { awardXp } from "../../lib/xp";
import { createNotification } from "../../lib/notifications";
import type { ChallengeRewardAction } from "../events/types";

interface ActionExecutionContext {
  challengeId: number;
  challengeTitle: string;
  userId: number;
  completionId: number;
  completionKey: string;
  actions: ChallengeRewardAction[];
  currentActionIndex?: number;
  actionIdempotencyKey?: string;
}

type ActionHandler = (
  action: ChallengeRewardAction,
  context: ActionExecutionContext
) => Promise<Record<string, unknown>>;

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback = 0
) {
  const value = Number(params[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
  fallback = ""
) {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function objectParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function challengeRewardGrantKey(
  action: ChallengeRewardAction,
  context: ActionExecutionContext
) {
  return (
    context.actionIdempotencyKey ??
    [
      "challenge",
      context.challengeId,
      "completion",
      context.completionId,
      "action",
      context.currentActionIndex ?? action.key,
      action.key,
    ].join(":")
  );
}

const actionHandlers: Record<string, ActionHandler> = {
  award_exp: async (action, context) => {
    const params = action.params ?? {};
    const amount = Math.floor(numberParam(params, "amount"));
    if (amount <= 0) throw new Error("award_exp amount must be positive");
    const reason =
      stringParam(params, "reason") ||
      `challenge_automation:${context.challengeId}`;
    const result = await awardXp({
      userId: context.userId,
      amount,
      reason,
      metadata: {
        challengeAutomationId: context.challengeId,
        challengeTitle: context.challengeTitle,
        completionId: context.completionId,
        completionKey: context.completionKey,
      },
    });
    return { xpEventId: result.eventId, totalXp: result.totalXp, amount };
  },

  queue_wtf_reward: async (action, context) => {
    const params = action.params ?? {};
    const amountWtf = Math.floor(numberParam(params, "amountWtf"));
    if (amountWtf <= 0) {
      throw new Error("queue_wtf_reward amountWtf must be positive");
    }
    const reason =
      stringParam(params, "reason") ||
      `Challenge reward: ${context.challengeTitle}`;
    const rewardSourceId = context.completionId;
    const [existingLedger] = await db
      .select({ id: rewardLedger.id })
      .from(rewardLedger)
      .where(
        and(
          eq(rewardLedger.userId, context.userId),
          eq(rewardLedger.sourceType, "challenge_automation"),
          eq(rewardLedger.sourceId, rewardSourceId)
        )
      )
      .limit(1);

    const [insertedLedger] = existingLedger
      ? [existingLedger]
      : await db
          .insert(rewardLedger)
          .values({
            userId: context.userId,
            amountWtf,
            reason,
            sourceType: "challenge_automation",
            sourceId: rewardSourceId,
            paid: false,
          })
          .returning({ id: rewardLedger.id });
    const ledger = insertedLedger;

    void import("../events/ingest")
      .then(({ ingestSystemEvent }) =>
        ingestSystemEvent({
          eventId: `wtf.awarded:challenge-automation:${ledger.id}`,
          eventType: "wtf.awarded",
          userId: context.userId,
          source: "challenge_automation",
          sourceModule: "rewards",
          rawRefType: "reward_ledger",
          rawRefId: ledger.id,
          metadata: {
            amountWtf,
            reason,
            challengeAutomationId: context.challengeId,
            completionId: context.completionId,
          },
        })
      )
      .catch((err) =>
        console.warn("[challenge-automation] failed to emit wtf.awarded", err)
      );

    return { rewardLedgerId: ledger.id, amountWtf };
  },

  create_notification: async (action, context) => {
    const params = action.params ?? {};
    const title =
      stringParam(params, "title") || `Challenge complete: ${context.challengeTitle}`;
    const body =
      stringParam(params, "body") ||
      "Your challenge reward has been processed.";
    await createNotification({
      userId: context.userId,
      eventKey: "challenge_automation_reward",
      title,
      body,
      metadata: {
        challengeAutomationId: context.challengeId,
        completionId: context.completionId,
      },
    });
    return { notification: "created" };
  },

  unlock_inventory_item: async (action, context) => {
    const params = action.params ?? {};
    const sku = stringParam(params, "sku").trim();
    if (!sku) throw new Error("unlock_inventory_item sku is required");
    const quantity = Math.max(1, Math.floor(numberParam(params, "quantity", 1)));
    const grantKey = challengeRewardGrantKey(action, context);
    const metadataGrantKey = sql`${grantKey}::text`;
    const metadata = {
      ...objectParam(params, "metadata"),
      source: "challenge_automation",
      sourceType: "challenge_automation",
      sourceId: context.completionId,
      domain: "challenge",
      ownerType: "user",
      state: "owned",
      visibility: "user_inventory",
      challengeRewardGrantKey: grantKey,
      [grantKey]: true,
      challengeAutomationId: context.challengeId,
      completionId: context.completionId,
      completionKey: context.completionKey,
      traceRule: "P6.CA3/08",
    };
    await db
      .insert(inAppInventoryItems)
      .values({
        userId: context.userId,
        sku,
        quantity,
        metadata,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
        set: {
          quantity: sql`CASE
            WHEN COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb)
              ? ${metadataGrantKey}
              THEN ${inAppInventoryItems.quantity}
            ELSE ${inAppInventoryItems.quantity} + ${quantity}
          END`,
          metadata: sql`COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
          updatedAt: new Date(),
        },
      });
    return { sku, quantity };
  },

  mark_challenge_complete: async (_action, context) => {
    void import("../events/ingest")
      .then(({ ingestSystemEvent }) =>
        ingestSystemEvent({
          eventId: `gameshow.challenge.completed:automation:${context.completionId}`,
          eventType: "gameshow.challenge.completed",
          userId: context.userId,
          source: "challenge_automation",
          sourceModule: "gameshow",
          rawRefType: "challenge_automation_completion",
          rawRefId: context.completionId,
          metadata: {
            challengeAutomationId: context.challengeId,
            challengeTitle: context.challengeTitle,
          },
        })
      )
      .catch((err) =>
        console.warn(
          "[challenge-automation] failed to emit gameshow.challenge.completed",
          err
        )
      );
    return { completionEvent: "queued" };
  },
};

async function beginActionLog(
  context: ActionExecutionContext,
  action: ChallengeRewardAction,
  actionIndex: number,
  idempotencyKey: string
) {
  const now = new Date();
  const inserted = await db
    .insert(challengeAutomationActionLogs)
    .values({
      challengeId: context.challengeId,
      userId: context.userId,
      completionId: context.completionId,
      actionKey: action.key,
      actionIndex,
      idempotencyKey,
      status: "running",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(challengeAutomationActionLogs)
    .where(eq(challengeAutomationActionLogs.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existing) return null;
  if (existing.status === "completed" || existing.status === "skipped") {
    return existing;
  }

  const [updated] = await db
    .update(challengeAutomationActionLogs)
    .set({ status: "running", error: null, updatedAt: now })
    .where(eq(challengeAutomationActionLogs.id, existing.id))
    .returning();
  return updated ?? existing;
}

export async function executeRewardActions(context: ActionExecutionContext) {
  let failed = false;

  for (let actionIndex = 0; actionIndex < context.actions.length; actionIndex += 1) {
    const action = context.actions[actionIndex]!;
    const handler = actionHandlers[action.key];
    const idempotencyKey = [
      "challenge",
      context.challengeId,
      "completion",
      context.completionId,
      "action",
      actionIndex,
      action.key,
    ].join(":");

    const log = await beginActionLog(context, action, actionIndex, idempotencyKey);
    if (!log || log.status === "completed" || log.status === "skipped") {
      continue;
    }

    try {
      if (!handler) throw new Error(`Unknown reward action: ${action.key}`);
      const result = await handler(action, {
        ...context,
        currentActionIndex: actionIndex,
        actionIdempotencyKey: idempotencyKey,
      });
      await db
        .update(challengeAutomationActionLogs)
        .set({
          status: "completed",
          resultJson: result,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(challengeAutomationActionLogs.id, log.id));
    } catch (err) {
      failed = true;
      await db
        .update(challengeAutomationActionLogs)
        .set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(challengeAutomationActionLogs.id, log.id));
    }
  }

  const rewardStatus = failed ? "failed" : "completed";
  await db
    .update(challengeAutomationCompletions)
    .set({
      rewardStatus,
      rewardedAt: failed ? null : new Date(),
    })
    .where(eq(challengeAutomationCompletions.id, context.completionId));

  return { rewardStatus };
}
