import { Router } from "express";
import { z } from "zod";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import type { CommunicationItemKind } from "@shared/comms";
import { isAdmin } from "@shared/types";
import {
  adminInboxMessages,
  adminInboxReplies,
  communicationItems,
  communicationReadStates,
  communicationSources,
  dmConversationParticipants,
  dmMessages,
  userNotifications,
} from "@shared/schema";
import {
  ensureDefaultCommunicationSources,
  listCommunicationCards,
  markCommunicationItemRead,
} from "../features/comms/publisher";
import { resolveCommunicationRouteTarget } from "../features/comms/route-resolver";
import { resolveBrowserUrlPolicy } from "../features/browser/policy";

const router = Router();

const itemQuerySchema = z.object({
  source: z.string().trim().max(80).optional(),
  kind: z.string().trim().max(80).optional(),
  unread: z.coerce.boolean().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(120).optional(),
});

router.get("/api/comms/sources", isAuthenticated, async (_req, res) => {
  try {
    const sources = await ensureDefaultCommunicationSources();
    res.json({ sources });
  } catch (err) {
    console.error("[comms] sources failed:", err);
    res.status(500).json({ error: "Failed to list communication sources" });
  }
});

router.get("/api/comms/items", isAuthenticated, async (req, res) => {
  try {
    const parsed = itemQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid comms query" });
    }
    const user = req.user as any;
    const items = await listCommunicationCards({
      userId: user.id,
      sourceKey: parsed.data.source || null,
      itemKind: (parsed.data.kind as CommunicationItemKind | undefined) || null,
      unreadOnly: parsed.data.unread,
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 80,
    });
    res.json({ items });
  } catch (err) {
    console.error("[comms] items failed:", err);
    res.status(500).json({ error: "Failed to list communication items" });
  }
});

router.get("/api/comms/unread-count", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const userId = Number(user.id);

    const adminAccount = isAdmin(user.roles ?? user.role);
    const [[notificationUnread], [dmUnread], [mailUnread], [adminInboxUnread]] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, userId),
            eq(userNotifications.read, false)
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(dmMessages)
        .innerJoin(
          dmConversationParticipants,
          and(
            eq(dmConversationParticipants.conversationId, dmMessages.conversationId),
            eq(dmConversationParticipants.userId, userId)
          )
        )
        .where(
          and(
            sql`${dmMessages.senderId} <> ${userId}`,
            or(
              isNull(dmConversationParticipants.lastReadAt),
              gt(dmMessages.createdAt, dmConversationParticipants.lastReadAt)
            )
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(communicationItems)
        .innerJoin(
          communicationSources,
          eq(communicationItems.sourceId, communicationSources.id)
        )
        .leftJoin(
          communicationReadStates,
          and(
            eq(communicationReadStates.itemId, communicationItems.id),
            eq(communicationReadStates.userId, userId)
          )
        )
        .where(
          and(
            eq(communicationSources.key, "mail"),
            eq(communicationItems.targetUserId, userId),
            isNull(communicationReadStates.id),
            sql`coalesce(${communicationItems.metadata}->>'direction', 'inbound') = 'inbound'`
          )
        ),
      adminAccount
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(adminInboxMessages)
            .where(eq(adminInboxMessages.status, "unread"))
        : db
            .select({ count: sql<number>`count(distinct ${adminInboxMessages.id})::int` })
            .from(adminInboxMessages)
            .innerJoin(adminInboxReplies, eq(adminInboxReplies.messageId, adminInboxMessages.id))
            .where(
              and(
                eq(adminInboxMessages.senderUserId, userId),
                eq(adminInboxReplies.senderKind, "admin"),
                or(
                  isNull(adminInboxMessages.senderReadAt),
                  gt(adminInboxReplies.createdAt, adminInboxMessages.senderReadAt)
                )
              )
            ),
    ]);

    const notifications = Number(notificationUnread?.count || 0);
    const dms = Number(dmUnread?.count || 0);
    const mail = Number(mailUnread?.count || 0);
    const adminInbox = Number(adminInboxUnread?.count || 0);
    res.json({
      total: notifications + dms + mail + adminInbox,
      notifications,
      dms,
      mail,
      adminInbox,
    });
  } catch (err) {
    console.error("[comms] unread count failed:", err);
    res.status(500).json({ error: "Failed to count unread communications" });
  }
});

router.post("/api/comms/items/:id/read", isAuthenticated, async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: "Invalid item id" });
    }
    const user = req.user as any;
    const readState = await markCommunicationItemRead({ itemId, userId: user.id });
    res.json({ readState });
  } catch (err) {
    console.error("[comms] mark read failed:", err);
    res.status(500).json({ error: "Failed to mark communication item read" });
  }
});

router.get("/api/comms/route-target", isAuthenticated, async (req, res) => {
  try {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (url) {
      const policy = resolveBrowserUrlPolicy(url);
      if (policy.allowed) {
        return res.json({
          itemId: 0,
          mode: "approved_external",
          label: policy.host ?? policy.url,
          routePath: `/browser?url=${encodeURIComponent(policy.url)}`,
          externalUrl: policy.url,
        });
      }
      return res.json({
        itemId: 0,
        mode: "blocked",
        label: policy.host ?? policy.url,
        routePath: null,
        externalUrl: null,
        reason: policy.reason,
      });
    }
    const itemId = Number(req.query.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: "Invalid item id" });
    }
    res.json(await resolveCommunicationRouteTarget(itemId));
  } catch (err) {
    console.error("[comms] route target failed:", err);
    res.status(500).json({ error: "Failed to resolve communication route" });
  }
});

export default router;
