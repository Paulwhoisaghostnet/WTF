import { randomUUID } from "crypto";
import { and, count, eq, sql } from "drizzle-orm";
import {
  challengeAutomationAuditLogs,
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  challengeAutomationProgress,
  challengeSystemEvents,
} from "@shared/schema";
import { db } from "../../db";
import { executeRewardActions } from "../actions/handlers";
import type {
  ChallengeRewardAction,
  ConditionTree,
  NormalizedSystemEventInput,
} from "./types";
import { evaluateConditionTree } from "../predicates/evaluator";
import { enqueueWtfosSystemEventExports } from "../../features/tz2at/wtfos-outbox";
import { assertAtprotoBridgeCredential } from "../../features/atproto/event-bridge";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function definitionRequiresClaim(definition: {
  metadata: unknown;
}): boolean {
  return isRecord(definition.metadata) && definition.metadata.requiresClaim === true;
}

function eventTypesForTree(tree: unknown): Set<string> {
  const eventTypes = new Set<string>();
  function walk(node: unknown) {
    if (!isRecord(node)) return;
    if (node.type === "event" && Array.isArray(node.eventTypes)) {
      for (const eventType of node.eventTypes) eventTypes.add(String(eventType));
    }
    if (node.type === "group" && Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }
  walk(tree);
  return eventTypes;
}

function treeHasPredicate(tree: unknown): boolean {
  let found = false;
  function walk(node: unknown) {
    if (found || !isRecord(node)) return;
    if (node.type === "predicate") {
      found = true;
      return;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }
  walk(tree);
  return found;
}

function shouldEvaluateChallenge(definition: {
  conditionTree: unknown;
}, eventType: string) {
  const eventTypes = eventTypesForTree(definition.conditionTree);
  if (eventTypes.has(eventType)) return true;
  if (eventType === "app.interaction.tracked" && eventTypes.size > 0) return true;
  if (
    treeHasPredicate(definition.conditionTree) &&
    [
      "user.wallet.connected",
      "nft.ownership.verified",
      "token.contract.owned",
      "token.id.owned",
      "app.interaction.tracked",
    ].includes(eventType)
  ) {
    return true;
  }
  return false;
}

function completionKeyFor(
  repeatability: unknown,
  event: typeof challengeSystemEvents.$inferSelect
) {
  const mode = isRecord(repeatability) ? String(repeatability.mode ?? "once") : "once";
  if (mode === "daily") return event.occurredAt.toISOString().slice(0, 10);
  if (mode === "weekly") {
    const date = new Date(event.occurredAt);
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
    const week = Math.floor((day + start.getUTCDay()) / 7) + 1;
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  if (mode === "per_event") return event.eventId;
  return "default";
}

function completionWindowFor(
  repeatability: unknown,
  event: typeof challengeSystemEvents.$inferSelect
) {
  const mode = isRecord(repeatability) ? String(repeatability.mode ?? "once") : "once";
  const occurredAt = new Date(event.occurredAt);
  if (mode === "daily") {
    const start = new Date(
      Date.UTC(
        occurredAt.getUTCFullYear(),
        occurredAt.getUTCMonth(),
        occurredAt.getUTCDate()
      )
    );
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }
  if (mode === "weekly") {
    const day = occurredAt.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    const start = new Date(
      Date.UTC(
        occurredAt.getUTCFullYear(),
        occurredAt.getUTCMonth(),
        occurredAt.getUTCDate() - mondayOffset
      )
    );
    return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
  }
  return null;
}

async function audit(input: {
  challengeId?: number | null;
  userId?: number | null;
  systemEventId?: number | null;
  progressId?: number | null;
  action: string;
  status?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(challengeAutomationAuditLogs).values({
    challengeId: input.challengeId ?? null,
    userId: input.userId ?? null,
    systemEventId: input.systemEventId ?? null,
    progressId: input.progressId ?? null,
    action: input.action,
    status: input.status ?? "info",
    message: input.message ?? null,
    metadata: input.metadata ?? {},
  });
}

async function getCompletionCount(challengeId: number, userId: number) {
  const [row] = await db
    .select({ value: count() })
    .from(challengeAutomationCompletions)
    .where(
      and(
        eq(challengeAutomationCompletions.challengeId, challengeId),
        eq(challengeAutomationCompletions.userId, userId)
      )
    );
  return Number(row?.value ?? 0);
}

async function getGlobalCompletionCount(challengeId: number) {
  const [row] = await db
    .select({ value: count() })
    .from(challengeAutomationCompletions)
    .where(eq(challengeAutomationCompletions.challengeId, challengeId));
  return Number(row?.value ?? 0);
}

async function upsertProgress(input: {
  challengeId: number;
  userId: number;
  walletAddress?: string | null;
  event: typeof challengeSystemEvents.$inferSelect;
}) {
  const now = new Date();
  const [progress] = await db
    .insert(challengeAutomationProgress)
    .values({
      challengeId: input.challengeId,
      userId: input.userId,
      walletAddress: input.walletAddress ?? null,
      firstEventAt: input.event.occurredAt,
      lastEventAt: input.event.occurredAt,
      auditEventIds: [input.event.id],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        challengeAutomationProgress.challengeId,
        challengeAutomationProgress.userId,
      ],
      set: {
        walletAddress: input.walletAddress ?? null,
        lastEventAt: input.event.occurredAt,
        auditEventIds: sql`(
          SELECT COALESCE(jsonb_agg(DISTINCT value::int), '[]'::jsonb)
          FROM jsonb_array_elements_text(
            COALESCE(${challengeAutomationProgress.auditEventIds}, '[]'::jsonb)
            || ${JSON.stringify([input.event.id])}::jsonb
          ) AS value
        )`,
        updatedAt: now,
      },
    })
    .returning();
  return progress;
}

async function applyEvaluation(input: {
  definition: typeof challengeAutomationDefinitions.$inferSelect;
  progress: typeof challengeAutomationProgress.$inferSelect;
  event: typeof challengeSystemEvents.$inferSelect;
}) {
  const { definition, progress, event } = input;
  const completionKey = completionKeyFor(definition.repeatability, event);
  const completionWindow = completionWindowFor(definition.repeatability, event);

  if (definition.globalCompletionLimit) {
    const globalCount = await getGlobalCompletionCount(definition.id);
    if (globalCount >= definition.globalCompletionLimit) {
      await audit({
        challengeId: definition.id,
        userId: event.userId,
        systemEventId: event.id,
        progressId: progress.id,
        action: "completion_skipped",
        status: "blocked",
        message: "Global completion limit reached",
      });
      return;
    }
  }

  const repeatability = isRecord(definition.repeatability)
    ? String(definition.repeatability.mode ?? "once")
    : "once";
  if (repeatability === "once") {
    const existingCount = await getCompletionCount(definition.id, progress.userId);
    if (existingCount >= definition.perUserCompletionLimit) {
      return;
    }
  }

  const result = await evaluateConditionTree(definition.conditionTree, {
    challengeId: definition.id,
    userId: progress.userId,
    walletAddress: event.walletAddress ?? progress.walletAddress,
    challengeStartTime: definition.startTime,
    challengeEndTime: definition.endTime,
    completionWindowStart: completionWindow?.start ?? null,
    completionWindowEnd: completionWindow?.end ?? null,
    now: event.occurredAt,
    completionKey,
  });

  await db
    .update(challengeAutomationProgress)
    .set({
      state: result.satisfied ? "completed" : "in_progress",
      countedEvents: result.countedEvents,
      satisfiedConditionIds: result.satisfiedConditionIds,
      completedAt: result.satisfied ? event.occurredAt : progress.completedAt,
      metadata: {
        ...(isRecord(progress.metadata) ? progress.metadata : {}),
        lastEvaluation: {
          at: new Date().toISOString(),
          eventId: event.eventId,
          satisfied: result.satisfied,
          predicateResults: result.predicateResults,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(challengeAutomationProgress.id, progress.id));

  await audit({
    challengeId: definition.id,
    userId: progress.userId,
    systemEventId: event.id,
    progressId: progress.id,
    action: "conditions_evaluated",
    status: result.satisfied ? "satisfied" : "pending",
    metadata: {
      countedEvents: result.countedEvents,
      satisfiedConditionIds: result.satisfiedConditionIds,
    },
  });

  if (!result.satisfied) return;

  const [completion] = await db
    .insert(challengeAutomationCompletions)
    .values({
      challengeId: definition.id,
      userId: progress.userId,
      progressId: progress.id,
      completionKey,
      rewardStatus: "pending",
      metadata: {
        eventId: event.eventId,
        systemEventId: event.id,
        satisfiedConditionIds: result.satisfiedConditionIds,
      },
      completedAt: event.occurredAt,
    })
    .onConflictDoNothing()
    .returning();

  if (!completion) {
    await audit({
      challengeId: definition.id,
      userId: progress.userId,
      systemEventId: event.id,
      progressId: progress.id,
      action: "completion_deduped",
      status: "skipped",
      metadata: { completionKey },
    });
    return;
  }

  await audit({
    challengeId: definition.id,
    userId: progress.userId,
    systemEventId: event.id,
    progressId: progress.id,
    action: "challenge_completed",
    status: "completed",
    metadata: { completionId: completion.id, completionKey },
  });

  if (definitionRequiresClaim(definition)) {
    await audit({
      challengeId: definition.id,
      userId: progress.userId,
      systemEventId: event.id,
      progressId: progress.id,
      action: "reward_claim_required",
      status: "pending",
      message: "Reward is ready for user claim",
      metadata: { completionId: completion.id, completionKey },
    });
    return;
  }

  const actionResult = await executeRewardActions({
    challengeId: definition.id,
    challengeTitle: definition.title,
    userId: progress.userId,
    completionId: completion.id,
    completionKey,
    actions: parseRewardActions(definition.rewardActions),
  });

  await db
    .update(challengeAutomationProgress)
    .set({
      rewardStatus: actionResult.rewardStatus as any,
      updatedAt: new Date(),
    })
    .where(eq(challengeAutomationProgress.id, progress.id));
}

async function evaluateChallengesForEvent(event: typeof challengeSystemEvents.$inferSelect) {
  if (!event.userId) return;
  const definitions = await db
    .select()
    .from(challengeAutomationDefinitions)
    .where(
      and(
        eq(challengeAutomationDefinitions.status, "active"),
        sql`(${challengeAutomationDefinitions.startTime} IS NULL OR ${challengeAutomationDefinitions.startTime} <= ${event.occurredAt})`,
        sql`(${challengeAutomationDefinitions.endTime} IS NULL OR ${challengeAutomationDefinitions.endTime} >= ${event.occurredAt})`
      )
    );

  for (const definition of definitions) {
    if (!shouldEvaluateChallenge(definition, event.eventType)) continue;
    const progress = await upsertProgress({
      challengeId: definition.id,
      userId: event.userId,
      walletAddress: event.walletAddress,
      event,
    });
    await applyEvaluation({ definition, progress, event });
  }
}

export async function ingestSystemEvent(input: NormalizedSystemEventInput) {
  assertAtprotoBridgeCredential({
    source: input.source,
    eventType: input.eventType,
    bridge: input.atprotoBridge,
  });

  const eventId = input.eventId ?? `${input.eventType}:${randomUUID()}`;
  const [inserted] = await db
    .insert(challengeSystemEvents)
    .values({
      eventId,
      eventType: input.eventType,
      userId: input.userId ?? null,
      walletAddress: input.walletAddress ?? null,
      source: input.source,
      sourceModule: input.sourceModule ?? null,
      rawRefType: input.rawRefType ?? null,
      rawRefId:
        input.rawRefId === undefined || input.rawRefId === null
          ? null
          : String(input.rawRefId),
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning();

  const event =
    inserted ??
    (
      await db
        .select()
        .from(challengeSystemEvents)
        .where(eq(challengeSystemEvents.eventId, eventId))
        .limit(1)
    )[0];

  if (!event) {
    throw new Error("Failed to persist challenge system event");
  }

  if (!inserted) {
    await audit({
      userId: event.userId,
      systemEventId: event.id,
      action: "event_deduped",
      status: "skipped",
      metadata: { eventId },
    });
    return { event, deduped: true };
  }

  await audit({
    userId: event.userId,
    systemEventId: event.id,
    action: "event_ingested",
    status: "created",
    metadata: {
      eventType: event.eventType,
      source: event.source,
      sourceModule: event.sourceModule,
    },
  });

  await evaluateChallengesForEvent(event);

  try {
    await enqueueWtfosSystemEventExports(event);
  } catch (err) {
    await audit({
      userId: event.userId,
      systemEventId: event.id,
      action: "wtfos_atproto_export_enqueue_failed",
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
      metadata: { eventId: event.eventId, eventType: event.eventType },
    });
  }

  return { event, deduped: false };
}
