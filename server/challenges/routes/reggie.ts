import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  dmConversationParticipants,
  dmConversations,
  dmMessages,
  users,
} from "@shared/schema";
import { isAuthenticated } from "../../auth/passport";
import { db } from "../../db";
import { REGGIE_FINALE_STEP_KEY } from "../services/reggie-quest";
import { publishCommunicationItemBestEffort } from "../../features/comms/publisher";

const router = Router();
const REGGIE_ASSISTANT_USERNAME = "reggie-assistant";
const REGGIE_ASSISTANT_DISPLAY_NAME = "Reggie";

const reggieMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(1_200),
    source: z.string().trim().min(1).max(64).optional(),
    context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();

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

async function ensureReggieAssistantUser(): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, REGGIE_ASSISTANT_USERNAME))
    .limit(1);

  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(users)
      .values({
        username: REGGIE_ASSISTANT_USERNAME,
        displayName: REGGIE_ASSISTANT_DISPLAY_NAME,
        role: "witness",
      })
      .returning({ id: users.id });
    return created.id;
  } catch {
    const [createdByAnotherRequest] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, REGGIE_ASSISTANT_USERNAME))
      .limit(1);
    if (createdByAnotherRequest) return createdByAnotherRequest.id;
    throw new Error("Failed to create Reggie assistant user");
  }
}

async function writeReggieWimMessage(input: {
  targetUserId: number;
  content: string;
  source: string;
  context: Record<string, string | number | boolean | null>;
}) {
  const reggieUserId = await ensureReggieAssistantUser();
  const [lockA, lockB] =
    reggieUserId < input.targetUserId
      ? [reggieUserId, input.targetUserId]
      : [input.targetUserId, reggieUserId];

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockA}, ${lockB})`);

    const existingRows = await tx.execute(sql<{ conversation_id: number }>`
      SELECT c.id AS conversation_id
      FROM dm_conversations c
      JOIN dm_conversation_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = ${reggieUserId}
      JOIN dm_conversation_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = ${input.targetUserId}
      WHERE c.active = true
        AND c.conversation_type = 'direct'
        AND NOT EXISTS (
          SELECT 1
          FROM dm_conversation_participants p3
          WHERE p3.conversation_id = c.id
            AND p3.user_id NOT IN (${reggieUserId}, ${input.targetUserId})
        )
      ORDER BY c.id ASC
      LIMIT 1
    `);

    const now = new Date();
    const existingConversationId =
      existingRows.rows[0] && "conversation_id" in existingRows.rows[0]
        ? Number((existingRows.rows[0] as { conversation_id: unknown }).conversation_id)
        : null;
    let conversationId: number | null =
      typeof existingConversationId === "number" &&
      Number.isInteger(existingConversationId) &&
      existingConversationId > 0
        ? existingConversationId
        : null;

    if (conversationId) {
      await tx
        .update(dmConversations)
        .set({
          title: REGGIE_ASSISTANT_DISPLAY_NAME,
          updatedAt: now,
        })
        .where(eq(dmConversations.id, conversationId));
    } else {
      const [conversation] = await tx
        .insert(dmConversations)
        .values({
          createdBy: reggieUserId,
          active: true,
          conversationType: "direct",
          title: REGGIE_ASSISTANT_DISPLAY_NAME,
          lastMessageAt: now,
          updatedAt: now,
        })
        .returning({ id: dmConversations.id });
      conversationId = conversation.id;

      await tx.insert(dmConversationParticipants).values([
        {
          conversationId,
          userId: reggieUserId,
          lastReadAt: sql`CURRENT_TIMESTAMP`,
        },
        {
          conversationId,
          userId: input.targetUserId,
          lastReadAt: null,
        },
      ]);
    }

    const [message] = await tx
      .insert(dmMessages)
      .values({
        conversationId,
        senderId: reggieUserId,
        content: input.content,
        messageType: "text",
        metadata: {
          assistant: "reggie",
          source: "reggie-assistant",
          surface: input.source,
          context: input.context,
        },
      })
      .returning();

    await tx
      .update(dmConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(dmConversations.id, conversationId));

    await tx
      .update(dmConversationParticipants)
      .set({ lastReadAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, reggieUserId)
        )
      );

    return {
      conversationId,
      message,
      reggieUserId,
    };
  });
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

router.post("/api/reggie/messages", isAuthenticated, async (req, res) => {
  const parsed = reggieMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Reggie message" });
  }

  try {
    const user = req.user as any;
    const result = await writeReggieWimMessage({
      targetUserId: user.id,
      content: parsed.data.content,
      source: parsed.data.source ?? "desktop-assistant",
      context: parsed.data.context ?? {},
    });

    void publishCommunicationItemBestEffort({
      sourceKey: "dm",
      externalRef: `dm:${result.message.id}:user:${user.id}`,
      itemKind: "dm",
      title: REGGIE_ASSISTANT_DISPLAY_NAME,
      summary: parsed.data.content.slice(0, 260),
      body: parsed.data.content,
      authorLabel: REGGIE_ASSISTANT_DISPLAY_NAME,
      targetUserId: user.id,
      routePath: `/messages/dms/${result.conversationId}`,
      thread: {
        externalThreadRef: `dm:${result.conversationId}`,
        title: REGGIE_ASSISTANT_DISPLAY_NAME,
        routePath: `/messages/dms/${result.conversationId}`,
        metadata: {
          conversationType: "direct",
          assistant: "reggie",
        },
      },
      metadata: {
        conversationId: result.conversationId,
        messageId: result.message.id,
        senderId: result.reggieUserId,
        messageType: "text",
        conversationType: "direct",
        assistant: "reggie",
        source: parsed.data.source ?? "desktop-assistant",
      },
      occurredAt: result.message.createdAt,
    });

    res.status(201).json({
      ok: true,
      conversationId: result.conversationId,
      message: result.message,
    });
  } catch (err) {
    console.error("[reggie] message write failed:", err);
    res.status(500).json({ error: "Failed to send Reggie message" });
  }
});

export default router;
