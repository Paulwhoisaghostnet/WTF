import { and, eq, sql } from "drizzle-orm";
import {
  dmConversationParticipants,
  dmConversations,
  dmMessages,
  userDesktopSettings,
  users,
} from "@shared/schema";
import { db } from "../db";
import { publishCommunicationItemBestEffort } from "../features/comms/publisher";
import {
  isStarterDesktopAppearance,
  starterWelcomeMessage,
  STARTER_WELCOME_DM_SOURCE,
} from "./welcome-dm-policy";

const ADMIN_USERNAME = "wtf-admin";
const ADMIN_LABEL = "WTF Admin";

type WelcomeDmResult =
  | { created: false }
  | {
      created: true;
      conversationId: number;
      messageId: number;
      createdAt: Date;
    };

/**
 * A new account receives one admin-authored DM. The desktop setting is the
 * account-creation marker: legacy accounts default to classic and are skipped.
 * The advisory lock and metadata lookup keep concurrent login paths idempotent.
 */
export async function ensureStarterWelcomeDm(targetUserId: number): Promise<boolean> {
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) return false;

  const [settings] = await db
    .select({ appearance: userDesktopSettings.appearance })
    .from(userDesktopSettings)
    .where(eq(userDesktopSettings.userId, targetUserId))
    .limit(1);
  if (!isStarterDesktopAppearance(settings?.appearance)) return false;

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, ADMIN_USERNAME))
    .limit(1);
  // Some local environments have not provisioned the canonical admin yet.
  // The next login retries without creating an impersonating sender account.
  if (!admin || admin.id === targetUserId) return false;
  const [smallerUserId, largerUserId] = admin.id < targetUserId
    ? [admin.id, targetUserId]
    : [targetUserId, admin.id];

  const result = await db.transaction(async (tx): Promise<WelcomeDmResult> => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${smallerUserId}, ${largerUserId})`
    );

    const [existing] = await tx
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .innerJoin(
        dmConversationParticipants,
        eq(dmConversationParticipants.conversationId, dmMessages.conversationId)
      )
      .where(
        and(
          eq(dmConversationParticipants.userId, targetUserId),
          eq(dmMessages.senderId, admin.id),
          sql`${dmMessages.metadata}->>'source' = ${STARTER_WELCOME_DM_SOURCE}`
        )
      )
      .limit(1);
    if (existing) return { created: false };

    const conversationRows = await tx.execute(sql<{ conversation_id: number }>`
      SELECT c.id AS conversation_id
      FROM dm_conversations c
      JOIN dm_conversation_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = ${admin.id}
      JOIN dm_conversation_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = ${targetUserId}
      WHERE c.active = true
        AND c.conversation_type = 'direct'
        AND NOT EXISTS (
          SELECT 1
          FROM dm_conversation_participants p3
          WHERE p3.conversation_id = c.id
            AND p3.user_id NOT IN (${admin.id}, ${targetUserId})
        )
      ORDER BY c.id ASC
      LIMIT 1
    `);
    const existingConversationId = Number(conversationRows.rows[0]?.conversation_id);
    let conversationId =
      Number.isSafeInteger(existingConversationId) && existingConversationId > 0
        ? existingConversationId
        : null;
    const now = new Date();

    if (!conversationId) {
      const [conversation] = await tx
        .insert(dmConversations)
        .values({
          createdBy: admin.id,
          active: true,
          conversationType: "direct",
          title: ADMIN_LABEL,
          lastMessageAt: now,
          updatedAt: now,
        })
        .returning({ id: dmConversations.id });
      conversationId = conversation.id;
      await tx.insert(dmConversationParticipants).values([
        {
          conversationId,
          userId: admin.id,
          lastReadAt: now,
        },
        {
          conversationId,
          userId: targetUserId,
          lastReadAt: null,
        },
      ]);
    }

    const [message] = await tx
      .insert(dmMessages)
      .values({
        conversationId,
        senderId: admin.id,
        content: starterWelcomeMessage(),
        messageType: "text",
        metadata: {
          source: STARTER_WELCOME_DM_SOURCE,
          system: true,
          firstSteps: ["/profile", "/mission-control", "/dedrooms"],
        },
      })
      .returning({ id: dmMessages.id, createdAt: dmMessages.createdAt });

    await tx
      .update(dmConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(dmConversations.id, conversationId));
    await tx
      .update(dmConversationParticipants)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, admin.id)
        )
      );

    return {
      created: true,
      conversationId,
      messageId: message.id,
      createdAt: message.createdAt,
    };
  });

  if (!result.created) return false;

  await publishCommunicationItemBestEffort({
    sourceKey: "dm",
    externalRef: `dm:${result.messageId}:user:${targetUserId}`,
    itemKind: "dm",
    title: "Welcome to wtfOS",
    summary: "Set up your Profile, verify your identity, and find your first steps.",
    body: starterWelcomeMessage(),
    authorLabel: ADMIN_LABEL,
    targetUserId,
    routePath: `/messages/dms/${result.conversationId}`,
    thread: {
      externalThreadRef: `dm:${result.conversationId}`,
      title: ADMIN_LABEL,
      routePath: `/messages/dms/${result.conversationId}`,
      metadata: { conversationType: "direct", system: true },
    },
    metadata: {
      conversationId: result.conversationId,
      messageId: result.messageId,
      senderId: admin.id,
      messageType: "text",
      conversationType: "direct",
      source: STARTER_WELCOME_DM_SOURCE,
      system: true,
    },
    occurredAt: result.createdAt,
  });

  return true;
}
