import { db } from "../db";
import {
  users,
  dmConversations,
  dmConversationParticipants,
  dmMessages,
} from "@shared/schema";
import { eq, inArray, and, sql } from "drizzle-orm";

const SYSTEM_USER_ID = 1;

const HOST_ROLES = ["admin", "host", "cohost"] as const;

/**
 * Send a DM notification to all hosts/admins from the system user.
 * Creates a conversation between the system user and each host if needed.
 */
export async function notifyHosts(message: string): Promise<void> {
  try {
    const hosts = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, [...HOST_ROLES]));

    if (hosts.length === 0) return;

    const now = new Date();

    for (const host of hosts) {
      if (host.id === SYSTEM_USER_ID) continue;

      const existing = await db.execute(sql`
        SELECT cp1.conversation_id FROM dm_conversation_participants cp1
        INNER JOIN dm_conversation_participants cp2
          ON cp1.conversation_id = cp2.conversation_id
        WHERE cp1.user_id = ${SYSTEM_USER_ID}
          AND cp2.user_id = ${host.id}
        LIMIT 1
      `);

      let conversationId: number;

      if (existing.rows.length > 0) {
        conversationId = (existing.rows[0] as any).conversation_id;
      } else {
        const [conv] = await db
          .insert(dmConversations)
          .values({ createdBy: SYSTEM_USER_ID, active: true })
          .returning();
        conversationId = conv.id;

        await db.insert(dmConversationParticipants).values([
          { conversationId, userId: SYSTEM_USER_ID },
          { conversationId, userId: host.id },
        ]);
      }

      await db.insert(dmMessages).values({
        conversationId,
        senderId: SYSTEM_USER_ID,
        content: message,
      });

      await db
        .update(dmConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(dmConversations.id, conversationId));
    }
  } catch (err) {
    console.error("[notify-hosts] Failed to send notification:", err);
  }
}
