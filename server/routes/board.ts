import { Router } from "express";
import crypto from "crypto";
import { db } from "../db";
import {
  boardCategories,
  boardChannelPermissions,
  boardReactions,
  boardThreadReplies,
  boardThreads,
  boardWebhooks,
  users,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { isAuthenticated, requirePermission } from "../auth/passport";
import type { UserRole } from "@shared/types";
import { awardXp } from "../lib/xp";
import { ingestSystemEvent } from "../challenges/events/ingest";
import type { SystemEventType } from "../challenges/events/types";
import { isRole } from "../lib/roles";
import { hasPermission } from "../lib/permissions";
import { normalizePublicHttpUrl } from "../lib/network-safety";
import {
  ALL_ROLES,
  type PermRow,
  parseRoles,
  getChannelPerms,
  canViewChannel,
  canPostInChannel,
  canReactInChannel,
  canManageChannel,
  checkChannelSlowMode,
} from "../lib/board-channel-permissions";
import {
  boardWebhookRateLimit,
  boardWebhookSourceIp,
} from "../lib/board-webhook-rate-limit";
import { publishCommunicationItemBestEffort } from "../features/comms/publisher";

const router = Router();
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_MESSAGE_CONTENT_LENGTH = 10_000;
const WEBHOOK_MAX_CONTENT_LENGTH = 4_000;

type SanitizedAttachment = {
  url: string;
  name: string;
  type: "image" | "file";
  size?: number;
};

function normalizeAttachmentUrl(raw: unknown): string | null {
  return normalizePublicHttpUrl(raw);
}

function sanitizeAttachments(input: unknown): SanitizedAttachment[] {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error("TOO_MANY_ATTACHMENTS");
  }

  const sanitized: SanitizedAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") throw new Error("ATTACHMENT_INVALID");
    const row = item as Record<string, unknown>;
    const url = normalizeAttachmentUrl(row.url);
    if (!url) throw new Error("ATTACHMENT_URL_INVALID");

    const type = row.type === "image" ? "image" : "file";
    const rawName = String(row.name || "").trim();
    const name = rawName.length > 0 ? rawName.slice(0, 255) : "attachment";
    const size =
      Number.isFinite(Number(row.size)) && Number(row.size) >= 0
        ? Math.floor(Number(row.size))
        : undefined;

    sanitized.push({ url, name, type, ...(size != null ? { size } : {}) });
  }

  return sanitized;
}

function emitBoardEvent(input: {
  eventType: SystemEventType;
  eventId?: string;
  userId?: number | null;
  rawRefType: string;
  rawRefId?: string | number | null;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventId: input.eventId,
    eventType: input.eventType,
    userId: input.userId ?? null,
    source: "messageboard",
    sourceModule: "board",
    rawRefType: input.rawRefType,
    rawRefId: input.rawRefId ?? null,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[board] failed to emit board event", err));
}


// ═══════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════

router.get("/api/board/categories", async (_req, res) => {
  try {
    const cats = await db
      .select()
      .from(boardCategories)
      .orderBy(asc(boardCategories.position), asc(boardCategories.id));
    res.json(cats);
  } catch {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post(
  "/api/board/categories",
  requirePermission("manage_channels"),
  async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Name required" });
      const position = Number(req.body?.position ?? 0);
      const [cat] = await db
        .insert(boardCategories)
        .values({ name, position })
        .returning();
      res.status(201).json(cat);
    } catch {
      res.status(500).json({ error: "Failed to create category" });
    }
  }
);

router.put(
  "/api/board/categories/:id",
  requirePermission("manage_channels"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates: Record<string, unknown> = {};
      if (typeof req.body?.name === "string") {
        const n = req.body.name.trim();
        if (!n) return res.status(400).json({ error: "Name cannot be empty" });
        updates.name = n;
      }
      if (typeof req.body?.position === "number") updates.position = req.body.position;
      if (typeof req.body?.collapsed === "boolean") updates.collapsed = req.body.collapsed;
      if (Object.keys(updates).length === 0)
        return res.status(400).json({ error: "Nothing to update" });
      const [cat] = await db
        .update(boardCategories)
        .set(updates)
        .where(eq(boardCategories.id, id))
        .returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json(cat);
    } catch {
      res.status(500).json({ error: "Failed to update category" });
    }
  }
);

router.delete(
  "/api/board/categories/:id",
  requirePermission("manage_channels"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db
        .update(boardThreads)
        .set({ categoryId: null })
        .where(eq(boardThreads.categoryId, id));
      await db.delete(boardCategories).where(eq(boardCategories.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete category" });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// CHANNELS (board_threads)
// ═══════════════════════════════════════════════════════════

router.get("/api/board/channels", async (req, res) => {
  try {
    const user = (req.user as any) || null;
    const viewerRole: UserRole = user?.role ?? "witness";
    const isStaff = await hasPermission(viewerRole, "manage_channels");

    const rows = isStaff
      ? await db
          .select()
          .from(boardThreads)
          .orderBy(asc(boardThreads.categoryId), asc(boardThreads.position), asc(boardThreads.id))
      : await db
          .select()
          .from(boardThreads)
          .where(eq(boardThreads.active, true))
          .orderBy(asc(boardThreads.categoryId), asc(boardThreads.position), asc(boardThreads.id));

    const channelIds = rows.map((r) => r.id);
    let permRows: any[] = [];
    if (channelIds.length > 0) {
      permRows = await db
        .select()
        .from(boardChannelPermissions)
        .where(inArray(boardChannelPermissions.channelId, channelIds));
    }

    const permMap = new Map<number, PermRow[]>();
    for (const p of permRows) {
      const list = permMap.get(p.channelId) || [];
      list.push(p);
      permMap.set(p.channelId, list);
    }

    // reply counts
    const counts = await db
      .select({
        threadId: boardThreadReplies.threadId,
        count: sql<number>`count(*)::int`,
      })
      .from(boardThreadReplies)
      .where(
        channelIds.length > 0
          ? inArray(boardThreadReplies.threadId, channelIds)
          : sql`false`
      )
      .groupBy(boardThreadReplies.threadId);

    const countMap = new Map<number, number>();
    for (const c of counts) countMap.set(c.threadId, Number(c.count || 0));

    const visible = rows
      .filter((ch) =>
        canViewChannel(ch, permMap.get(ch.id) || [], viewerRole, user?.id ?? null)
      )
      .map((ch) => ({
        ...ch,
        viewRoles: parseRoles(ch.viewRoles),
        replyRoles: parseRoles(ch.replyRoles, []),
        messageCount: countMap.get(ch.id) || 0,
      }));

    res.json(visible);
  } catch {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

router.post(
  "/api/board/channels",
  requirePermission("manage_channels"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const title = String(req.body?.title || "").trim();
      if (!title) return res.status(400).json({ error: "Title required" });

      const body = String(req.body?.body || "").trim();
      const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
      const channelType = req.body?.channelType || "text";
      const topic = req.body?.topic || null;
      const position = Number(req.body?.position ?? 0);
      const slowModeSeconds = Number(req.body?.slowModeSeconds ?? 0);
      const viewRoles = parseRoles(req.body?.viewRoles, ALL_ROLES);
      const replyRoles = parseRoles(req.body?.replyRoles, ALL_ROLES);
      const expiresAt =
        typeof req.body?.expiresAt === "string" && req.body.expiresAt.trim()
          ? new Date(req.body.expiresAt)
          : null;

      const [ch] = await db
        .insert(boardThreads)
        .values({
          title,
          body: body || title,
          createdBy: user.id,
          categoryId,
          channelType,
          topic,
          position,
          slowModeSeconds,
          viewRoles,
          replyRoles,
          expiresAt,
        })
        .returning();

      res.status(201).json(ch);
    } catch {
      res.status(500).json({ error: "Failed to create channel" });
    }
  }
);

router.put(
  "/api/board/channels/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const perms = await getChannelPerms(channelId);

      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof req.body?.title === "string") {
        const t = req.body.title.trim();
        if (!t) return res.status(400).json({ error: "Title cannot be empty" });
        updates.title = t;
      }
      if (typeof req.body?.body === "string") updates.body = req.body.body.trim();
      if (typeof req.body?.topic === "string") updates.topic = req.body.topic.trim() || null;
      if (typeof req.body?.channelType === "string") updates.channelType = req.body.channelType;
      if (req.body?.categoryId !== undefined) updates.categoryId = req.body.categoryId;
      if (typeof req.body?.position === "number") updates.position = req.body.position;
      if (typeof req.body?.slowModeSeconds === "number")
        updates.slowModeSeconds = Math.max(0, Math.floor(req.body.slowModeSeconds));
      if (typeof req.body?.locked === "boolean") updates.locked = req.body.locked;
      if (typeof req.body?.pinned === "boolean") updates.pinned = req.body.pinned;
      if (typeof req.body?.active === "boolean") updates.active = req.body.active;
      if (req.body?.viewRoles !== undefined) {
        const parsed = parseRoles(req.body.viewRoles, []);
        if (parsed.length === 0)
          return res.status(400).json({ error: "At least one view role required" });
        updates.viewRoles = parsed;
      }
      if (req.body?.replyRoles !== undefined) {
        const parsed = parseRoles(req.body.replyRoles, []);
        if (parsed.length === 0)
          return res.status(400).json({ error: "At least one reply role required" });
        updates.replyRoles = parsed;
      }
      if (req.body?.expiresAt !== undefined) {
        if (req.body.expiresAt === null || req.body.expiresAt === "")
          updates.expiresAt = null;
        else {
          const d = new Date(String(req.body.expiresAt));
          if (Number.isNaN(d.getTime()))
            return res.status(400).json({ error: "Invalid expiresAt" });
          updates.expiresAt = d;
        }
      }

      const [updated] = await db
        .update(boardThreads)
        .set(updates)
        .where(eq(boardThreads.id, channelId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Channel not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update channel" });
    }
  }
);

router.delete(
  "/api/board/channels/:id",
  requirePermission("manage_channels"),
  async (req, res) => {
    try {
      const channelId = Number(req.params.id);
      await db.delete(boardThreads).where(eq(boardThreads.id, channelId));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete channel" });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// MESSAGES (board_thread_replies)
// ═══════════════════════════════════════════════════════════

router.get("/api/board/channels/:id/messages", async (req, res) => {
  try {
    const user = (req.user as any) || null;
    const channelId = Number(req.params.id);
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 200));
    const before = req.query.before ? Number(req.query.before) : null;

    const [channel] = await db
      .select()
      .from(boardThreads)
      .where(eq(boardThreads.id, channelId))
      .limit(1);

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const perms = await getChannelPerms(channelId);
    const viewerRole: UserRole = user?.role ?? "witness";
    if (!canViewChannel(channel, perms, viewerRole, user?.id ?? null)) {
      return res.status(403).json({ error: "Not allowed to view" });
    }

    const filters: any[] = [eq(boardThreadReplies.threadId, channelId)];
    if (before && Number.isInteger(before)) {
      filters.push(sql`${boardThreadReplies.id} < ${before}`);
    }

    const rows = await db
      .select({
        id: boardThreadReplies.id,
        threadId: boardThreadReplies.threadId,
        userId: boardThreadReplies.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        content: boardThreadReplies.content,
        attachments: boardThreadReplies.attachments,
        pinned: boardThreadReplies.pinned,
        parentReplyId: boardThreadReplies.parentReplyId,
        webhookId: boardThreadReplies.webhookId,
        createdAt: boardThreadReplies.createdAt,
        editedAt: boardThreadReplies.editedAt,
      })
      .from(boardThreadReplies)
      .leftJoin(users, eq(boardThreadReplies.userId, users.id))
      .where(and(...filters))
      .orderBy(desc(boardThreadReplies.id))
      .limit(limit);

    // Gather reactions for these messages
    const msgIds = rows.map((r) => r.id);
    let reactionRows: any[] = [];
    if (msgIds.length > 0) {
      reactionRows = await db
        .select({
          replyId: boardReactions.replyId,
          emoji: boardReactions.emoji,
          userId: boardReactions.userId,
          username: users.username,
        })
        .from(boardReactions)
        .leftJoin(users, eq(boardReactions.userId, users.id))
        .where(inArray(boardReactions.replyId, msgIds));
    }

    const reactionMap = new Map<
      number,
      Array<{ emoji: string; users: Array<{ id: number; username: string | null }> }>
    >();
    for (const r of reactionRows) {
      const list = reactionMap.get(r.replyId) || [];
      const existing = list.find((e) => e.emoji === r.emoji);
      if (existing) {
        existing.users.push({ id: r.userId, username: r.username });
      } else {
        list.push({
          emoji: r.emoji,
          users: [{ id: r.userId, username: r.username }],
        });
      }
      reactionMap.set(r.replyId, list);
    }

    const result = rows.reverse().map((msg) => ({
      ...msg,
      reactions: reactionMap.get(msg.id) || [],
    }));

    res.json({
      messages: result,
      channel: {
        ...channel,
        viewRoles: parseRoles(channel.viewRoles),
        replyRoles: parseRoles(channel.replyRoles, []),
        canPost: canPostInChannel(channel, perms, viewerRole, user?.id ?? null),
        canManage: canManageChannel(perms, viewerRole, user?.id ?? null),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post(
  "/api/board/channels/:id/messages",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const content = String(req.body?.content || "").trim();
      if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return res.status(400).json({ error: "Message exceeds maximum length" });
      }
      let attachments: SanitizedAttachment[] = [];
      try {
        attachments = sanitizeAttachments(req.body?.attachments);
      } catch (err: any) {
        if (err?.message === "TOO_MANY_ATTACHMENTS") {
          return res.status(400).json({ error: "Too many attachments" });
        }
        return res.status(400).json({ error: "Invalid attachment payload" });
      }
      const parentReplyId = req.body?.parentReplyId ? Number(req.body.parentReplyId) : null;

      if (!content && attachments.length === 0) {
        return res.status(400).json({ error: "Message content or attachment required" });
      }
      if (parentReplyId !== null && (!Number.isInteger(parentReplyId) || parentReplyId <= 0)) {
        return res.status(400).json({ error: "Invalid parentReplyId" });
      }

      const [channel] = await db
        .select()
        .from(boardThreads)
        .where(eq(boardThreads.id, channelId))
        .limit(1);

      if (!channel || !channel.active) {
        return res.status(404).json({ error: "Channel not found" });
      }

      const perms = await getChannelPerms(channelId);
      if (!canPostInChannel(channel, perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not allowed to post" });
      }

      if (parentReplyId !== null) {
        const [parent] = await db
          .select({ id: boardThreadReplies.id })
          .from(boardThreadReplies)
          .where(
            and(
              eq(boardThreadReplies.id, parentReplyId),
              eq(boardThreadReplies.threadId, channelId)
            )
          )
          .limit(1);

        if (!parent) {
          return res.status(400).json({ error: "Parent message not found" });
        }
      }

      if (!(await hasPermission(user.role, "delete_any_post"))) {
        const slowErr = await checkChannelSlowMode(channelId, user.id, channel.slowModeSeconds);
        if (slowErr) return res.status(429).json({ error: slowErr });
      }

      const [msg] = await db
        .insert(boardThreadReplies)
        .values({
          threadId: channelId,
          userId: user.id,
          content: content || "",
          attachments,
          parentReplyId,
        })
        .returning();

      await db
        .update(boardThreads)
        .set({ updatedAt: new Date() })
        .where(eq(boardThreads.id, channelId));

      try {
        await awardXp({
          userId: user.id,
          amount: 1,
          reason: "board_message_sent",
          metadata: { channelId, messageId: msg.id },
        });
      } catch {
        /* non-blocking */
      }

      void Promise.all([
        ingestSystemEvent({
          eventId: `messageboard.post.created:${msg.id}`,
          eventType: "messageboard.post.created",
          userId: user.id,
          source: "messageboard",
          sourceModule: "board",
          rawRefType: "board_thread_reply",
          rawRefId: msg.id,
          metadata: {
            channelId,
            parentReplyId,
            attachmentCount: attachments.length,
          },
        }),
        ingestSystemEvent({
          eventId: `messageboard.channel.post.created:${msg.id}`,
          eventType: "messageboard.channel.post.created",
          userId: user.id,
          source: "messageboard",
          sourceModule: "board",
          rawRefType: "board_thread_reply",
          rawRefId: msg.id,
          metadata: {
            channelId,
            parentReplyId,
            attachmentCount: attachments.length,
          },
        }),
        ingestSystemEvent({
          eventId: `app.interaction.tracked:messageboard:${msg.id}`,
          eventType: "app.interaction.tracked",
          userId: user.id,
          source: "messageboard",
          sourceModule: "board",
          rawRefType: "board_thread_reply",
          rawRefId: msg.id,
          metadata: {
            interaction: "messageboard_post_created",
            channelId,
            parentReplyId,
          },
        }),
      ]).catch((err) =>
        console.warn("[board] failed to emit challenge automation events", err)
      );

      void publishCommunicationItemBestEffort({
        sourceKey: "board",
        externalRef: `board:${msg.id}`,
        itemKind: "board_post",
        title: channel.title || "Message Board post",
        summary: (content || "").slice(0, 260),
        body: content || "",
        authorLabel: user.displayName || user.username || "WTF user",
        routePath: `/messageboard?channel=${channelId}&message=${msg.id}`,
        thread: {
          externalThreadRef: `board:${channelId}`,
          title: channel.title || `Channel ${channelId}`,
          routePath: `/messageboard?channel=${channelId}`,
          metadata: { channelType: channel.channelType },
        },
        metadata: {
          channelId,
          messageId: msg.id,
          parentReplyId,
          attachmentCount: attachments.length,
        },
        occurredAt: msg.createdAt,
      });

      res.status(201).json(msg);
    } catch {
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);

router.put(
  "/api/board/messages/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const msgId = Number(req.params.id);

      const [existing] = await db
        .select()
        .from(boardThreadReplies)
        .where(eq(boardThreadReplies.id, msgId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Message not found" });

      if (existing.userId !== user.id && !(await hasPermission(user.role, "delete_any_post"))) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = { editedAt: new Date() };
      if (typeof req.body?.content === "string") {
        const nextContent = req.body.content.trim();
        if (nextContent.length > MAX_MESSAGE_CONTENT_LENGTH) {
          return res.status(400).json({ error: "Message exceeds maximum length" });
        }
        updates.content = nextContent;
      }
      if (req.body?.attachments !== undefined) {
        try {
          updates.attachments = sanitizeAttachments(req.body.attachments);
        } catch (err: any) {
          if (err?.message === "TOO_MANY_ATTACHMENTS") {
            return res.status(400).json({ error: "Too many attachments" });
          }
          return res.status(400).json({ error: "Invalid attachment payload" });
        }
      }

      const [updated] = await db
        .update(boardThreadReplies)
        .set(updates)
        .where(eq(boardThreadReplies.id, msgId))
        .returning();

      emitBoardEvent({
        eventId: `board.message.edited:${msgId}:${Date.now()}`,
        eventType: "board.message.edited",
        userId: user.id,
        rawRefType: "board_thread_reply",
        rawRefId: msgId,
        metadata: {
          channelId: existing.threadId,
          messageOwnerId: existing.userId,
          contentChanged: typeof req.body?.content === "string",
          attachmentsChanged: req.body?.attachments !== undefined,
          attachmentCount: Array.isArray(updated.attachments) ? updated.attachments.length : 0,
        },
      });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to edit message" });
    }
  }
);

router.delete(
  "/api/board/messages/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const msgId = Number(req.params.id);

      const [existing] = await db
        .select()
        .from(boardThreadReplies)
        .where(eq(boardThreadReplies.id, msgId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Message not found" });

      if (existing.userId !== user.id && !(await hasPermission(user.role, "delete_any_post"))) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db.delete(boardThreadReplies).where(eq(boardThreadReplies.id, msgId));
      emitBoardEvent({
        eventId: `board.message.deleted:${msgId}:${Date.now()}`,
        eventType: "board.message.deleted",
        userId: user.id,
        rawRefType: "board_thread_reply",
        rawRefId: msgId,
        metadata: {
          channelId: existing.threadId,
          messageOwnerId: existing.userId,
          attachmentCount: Array.isArray(existing.attachments) ? existing.attachments.length : 0,
          hadWebhook: Boolean(existing.webhookId),
        },
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete message" });
    }
  }
);

// Pin / unpin a message
router.put(
  "/api/board/messages/:id/pin",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const msgId = Number(req.params.id);
      const pinned = !!req.body?.pinned;

      const [existing] = await db
        .select()
        .from(boardThreadReplies)
        .where(eq(boardThreadReplies.id, msgId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Message not found" });

      const perms = await getChannelPerms(existing.threadId);
      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized to pin" });
      }

      const [updated] = await db
        .update(boardThreadReplies)
        .set({ pinned })
        .where(eq(boardThreadReplies.id, msgId))
        .returning();

      emitBoardEvent({
        eventId: `board.message.pinned:${msgId}:${pinned}:${Date.now()}`,
        eventType: "board.message.pinned",
        userId: user.id,
        rawRefType: "board_thread_reply",
        rawRefId: msgId,
        metadata: {
          channelId: existing.threadId,
          messageOwnerId: existing.userId,
          pinned,
        },
      });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to pin message" });
    }
  }
);

// Get pinned messages for a channel
router.get("/api/board/channels/:id/pins", async (req, res) => {
  try {
    const channelId = Number(req.params.id);
    const rows = await db
      .select({
        id: boardThreadReplies.id,
        userId: boardThreadReplies.userId,
        username: users.username,
        displayName: users.displayName,
        content: boardThreadReplies.content,
        attachments: boardThreadReplies.attachments,
        createdAt: boardThreadReplies.createdAt,
      })
      .from(boardThreadReplies)
      .leftJoin(users, eq(boardThreadReplies.userId, users.id))
      .where(
        and(
          eq(boardThreadReplies.threadId, channelId),
          eq(boardThreadReplies.pinned, true)
        )
      )
      .orderBy(desc(boardThreadReplies.createdAt));

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch pins" });
  }
});

// ═══════════════════════════════════════════════════════════
// REACTIONS
// ═══════════════════════════════════════════════════════════

router.post(
  "/api/board/messages/:id/reactions",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const replyId = Number(req.params.id);
      const emoji = String(req.body?.emoji || "").trim();
      if (!emoji) return res.status(400).json({ error: "Emoji required" });

      const [reply] = await db
        .select({
          id: boardThreadReplies.id,
          threadId: boardThreadReplies.threadId,
        })
        .from(boardThreadReplies)
        .where(eq(boardThreadReplies.id, replyId))
        .limit(1);

      if (!reply) return res.status(404).json({ error: "Message not found" });

      const [channel] = await db
        .select({
          id: boardThreads.id,
          viewRoles: boardThreads.viewRoles,
        })
        .from(boardThreads)
        .where(eq(boardThreads.id, reply.threadId))
        .limit(1);

      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const perms = await getChannelPerms(reply.threadId);
      if (!canReactInChannel(channel, perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not allowed to react" });
      }

      const [existing] = await db
        .select()
        .from(boardReactions)
        .where(
          and(
            eq(boardReactions.replyId, replyId),
            eq(boardReactions.userId, user.id),
            eq(boardReactions.emoji, emoji)
          )
        )
        .limit(1);

      if (existing) {
        // Toggle off
        await db.delete(boardReactions).where(eq(boardReactions.id, existing.id));
        void ingestSystemEvent({
          eventId: `messageboard.reaction.removed:${replyId}:${user.id}:${emoji}`,
          eventType: "messageboard.reaction.removed",
          userId: user.id,
          source: "messageboard",
          sourceModule: "board",
          rawRefType: "board_reaction",
          rawRefId: existing.id,
          metadata: {
            channelId: reply.threadId,
            replyId,
            emoji,
            action: "removed",
          },
        }).catch((err) =>
          console.warn("[board] failed to emit reaction removal event", err)
        );
        return res.json({ action: "removed" });
      }

      const [reaction] = await db
        .insert(boardReactions)
        .values({ replyId, userId: user.id, emoji })
        .returning();

      void ingestSystemEvent({
        eventId: `messageboard.reaction.added:${reaction.id}`,
        eventType: "messageboard.reaction.added",
        userId: user.id,
        source: "messageboard",
        sourceModule: "board",
        rawRefType: "board_reaction",
        rawRefId: reaction.id,
        metadata: {
          channelId: reply.threadId,
          replyId,
          emoji,
          action: "added",
        },
      }).catch((err) =>
        console.warn("[board] failed to emit reaction add event", err)
      );

      res.status(201).json({ action: "added" });
    } catch {
      res.status(500).json({ error: "Failed to toggle reaction" });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// CHANNEL PERMISSIONS
// ═══════════════════════════════════════════════════════════

router.get(
  "/api/board/channels/:id/permissions",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const perms = await getChannelPerms(channelId);

      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const rows = await db
        .select({
          id: boardChannelPermissions.id,
          channelId: boardChannelPermissions.channelId,
          targetType: boardChannelPermissions.targetType,
          targetRole: boardChannelPermissions.targetRole,
          targetUserId: boardChannelPermissions.targetUserId,
          targetUsername: users.username,
          targetDisplayName: users.displayName,
          allowView: boardChannelPermissions.allowView,
          allowPost: boardChannelPermissions.allowPost,
          allowManage: boardChannelPermissions.allowManage,
          allowReact: boardChannelPermissions.allowReact,
          allowAttach: boardChannelPermissions.allowAttach,
        })
        .from(boardChannelPermissions)
        .leftJoin(users, eq(boardChannelPermissions.targetUserId, users.id))
        .where(eq(boardChannelPermissions.channelId, channelId));

      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  }
);

router.post(
  "/api/board/channels/:id/permissions",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const perms = await getChannelPerms(channelId);

      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const targetType = String(req.body?.targetType);
      if (targetType !== "role" && targetType !== "user") {
        return res.status(400).json({ error: "targetType must be 'role' or 'user'" });
      }

      const values: any = {
        channelId,
        targetType,
        allowView: req.body?.allowView ?? null,
        allowPost: req.body?.allowPost ?? null,
        allowManage: req.body?.allowManage ?? null,
        allowReact: req.body?.allowReact ?? null,
        allowAttach: req.body?.allowAttach ?? null,
      };

      if (targetType === "role") {
        if (!isRole(req.body?.targetRole))
          return res.status(400).json({ error: "Invalid role" });
        values.targetRole = req.body.targetRole;
      } else {
        const tid = Number(req.body?.targetUserId);
        if (!Number.isInteger(tid) || tid <= 0)
          return res.status(400).json({ error: "Invalid targetUserId" });
        values.targetUserId = tid;
      }

      const [perm] = await db
        .insert(boardChannelPermissions)
        .values(values)
        .returning();

      res.status(201).json(perm);
    } catch {
      res.status(500).json({ error: "Failed to create permission" });
    }
  }
);

router.put(
  "/api/board/permissions/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const permId = Number(req.params.id);

      const [existing] = await db
        .select()
        .from(boardChannelPermissions)
        .where(eq(boardChannelPermissions.id, permId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Permission not found" });

      const channelPerms = await getChannelPerms(existing.channelId);
      if (!canManageChannel(channelPerms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = {};
      if (req.body?.allowView !== undefined) updates.allowView = req.body.allowView;
      if (req.body?.allowPost !== undefined) updates.allowPost = req.body.allowPost;
      if (req.body?.allowManage !== undefined) updates.allowManage = req.body.allowManage;
      if (req.body?.allowReact !== undefined) updates.allowReact = req.body.allowReact;
      if (req.body?.allowAttach !== undefined) updates.allowAttach = req.body.allowAttach;

      const [updated] = await db
        .update(boardChannelPermissions)
        .set(updates)
        .where(eq(boardChannelPermissions.id, permId))
        .returning();

      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update permission" });
    }
  }
);

router.delete(
  "/api/board/permissions/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const permId = Number(req.params.id);

      const [existing] = await db
        .select()
        .from(boardChannelPermissions)
        .where(eq(boardChannelPermissions.id, permId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Permission not found" });

      const channelPerms = await getChannelPerms(existing.channelId);
      if (!canManageChannel(channelPerms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db.delete(boardChannelPermissions).where(eq(boardChannelPermissions.id, permId));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete permission" });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════

router.get(
  "/api/board/channels/:id/webhooks",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const perms = await getChannelPerms(channelId);

      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const rows = await db
        .select({
          id: boardWebhooks.id,
          channelId: boardWebhooks.channelId,
          name: boardWebhooks.name,
          token: boardWebhooks.token,
          avatarUrl: boardWebhooks.avatarUrl,
          active: boardWebhooks.active,
          createdBy: boardWebhooks.createdBy,
          creatorUsername: users.username,
          createdAt: boardWebhooks.createdAt,
        })
        .from(boardWebhooks)
        .leftJoin(users, eq(boardWebhooks.createdBy, users.id))
        .where(eq(boardWebhooks.channelId, channelId));

      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  }
);

router.post(
  "/api/board/channels/:id/webhooks",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = Number(req.params.id);
      const perms = await getChannelPerms(channelId);

      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Webhook name required" });

      const token = crypto.randomBytes(32).toString("hex");

      const [webhook] = await db
        .insert(boardWebhooks)
        .values({
          channelId,
          name,
          token,
          avatarUrl: req.body?.avatarUrl || null,
          createdBy: user.id,
        })
        .returning();

      res.status(201).json(webhook);
    } catch {
      res.status(500).json({ error: "Failed to create webhook" });
    }
  }
);

router.delete(
  "/api/board/webhooks/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const webhookId = Number(req.params.id);

      const [existing] = await db
        .select()
        .from(boardWebhooks)
        .where(eq(boardWebhooks.id, webhookId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Webhook not found" });

      const perms = await getChannelPerms(existing.channelId);
      if (!canManageChannel(perms, user.role, user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db.delete(boardWebhooks).where(eq(boardWebhooks.id, webhookId));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  }
);

// Incoming webhook endpoint (no auth — token in URL)
router.post("/api/board/webhook/:token", boardWebhookRateLimit, async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const sourceIp = boardWebhookSourceIp(req);
    const [webhook] = await db
      .select()
      .from(boardWebhooks)
      .where(and(eq(boardWebhooks.token, token), eq(boardWebhooks.active, true)))
      .limit(1);

    if (!webhook) return res.status(404).json({ error: "Invalid webhook" });

    const content = String(req.body?.content || "").trim();
    if (content.length > WEBHOOK_MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: "Content exceeds maximum length" });
    }
    if (!content) return res.status(400).json({ error: "Content required" });

    let attachments: SanitizedAttachment[] = [];
    try {
      attachments = sanitizeAttachments(req.body?.attachments);
    } catch (err: any) {
      if (err?.message === "TOO_MANY_ATTACHMENTS") {
        return res.status(400).json({ error: "Too many attachments" });
      }
      return res.status(400).json({ error: "Invalid attachment payload" });
    }

    const [msg] = await db
      .insert(boardThreadReplies)
      .values({
        threadId: webhook.channelId,
        userId: webhook.createdBy,
        content: `**[${webhook.name}]** ${content}`,
        attachments,
        webhookId: webhook.id,
      })
      .returning();

    await db
      .update(boardThreads)
      .set({ updatedAt: new Date() })
      .where(eq(boardThreads.id, webhook.channelId));

    emitBoardEvent({
      eventId: `board.webhook_received:${webhook.id}:${msg.id}`,
      eventType: "board.webhook_received",
      userId: webhook.createdBy,
      rawRefType: "board_webhook_delivery",
      rawRefId: msg.id,
      metadata: {
        channelId: webhook.channelId,
        webhookId: webhook.id,
        attachmentCount: attachments.length,
        sourceIpHash: crypto.createHash("sha256").update(sourceIp).digest("hex").slice(0, 16),
      },
    });
    void publishCommunicationItemBestEffort({
      sourceKey: "board",
      externalRef: `board:webhook:${msg.id}`,
      itemKind: "board_post",
      title: webhook.name || "Board webhook",
      summary: content.slice(0, 260),
      body: content,
      authorLabel: webhook.name,
      routePath: `/messageboard?channel=${webhook.channelId}&message=${msg.id}`,
      thread: {
        externalThreadRef: `board:${webhook.channelId}`,
        title: `Channel ${webhook.channelId}`,
        routePath: `/messageboard?channel=${webhook.channelId}`,
        metadata: { webhookId: webhook.id },
      },
      metadata: {
        channelId: webhook.channelId,
        webhookId: webhook.id,
        messageId: msg.id,
        attachmentCount: attachments.length,
      },
      occurredAt: msg.createdAt,
    });
    res.status(201).json({ id: msg.id });
  } catch {
    res.status(500).json({ error: "Webhook delivery failed" });
  }
});

export default router;
