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
import { isAuthenticated, requireRole } from "../auth/passport";
import type { UserRole } from "@shared/types";
import { ROLE_ORDER } from "@shared/types";
import { awardXp } from "../lib/xp";
import { canModerate, isRole } from "../lib/roles";

const router = Router();

const ALL_ROLES: UserRole[] = [...ROLE_ORDER];

function parseRoles(input: unknown, fallback: UserRole[] = ALL_ROLES): UserRole[] {
  if (!Array.isArray(input)) return [...fallback];
  const normalized = input.filter(isRole) as UserRole[];
  return normalized.length === 0 ? [...fallback] : Array.from(new Set(normalized));
}

// ─── Permission helpers ──────────────────────────────────

interface PermRow {
  targetType: string;
  targetRole: string | null;
  targetUserId: number | null;
  allowView: boolean | null;
  allowPost: boolean | null;
  allowManage: boolean | null;
  allowReact: boolean | null;
  allowAttach: boolean | null;
}

function resolvePermission(
  perms: PermRow[],
  userRole: UserRole,
  userId: number | null,
  field: keyof Pick<PermRow, "allowView" | "allowPost" | "allowManage" | "allowReact" | "allowAttach">
): boolean | null {
  // User-level overrides take precedence
  if (userId) {
    const userPerm = perms.find(
      (p) => p.targetType === "user" && p.targetUserId === userId
    );
    if (userPerm && userPerm[field] !== null) return userPerm[field]!;
  }
  // Role-level
  const rolePerm = perms.find(
    (p) => p.targetType === "role" && p.targetRole === userRole
  );
  if (rolePerm && rolePerm[field] !== null) return rolePerm[field]!;
  return null;
}

async function getChannelPerms(channelId: number): Promise<PermRow[]> {
  return db
    .select()
    .from(boardChannelPermissions)
    .where(eq(boardChannelPermissions.channelId, channelId));
}

function canViewChannel(
  channel: { viewRoles: unknown },
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): boolean {
  const override = resolvePermission(perms, role, userId, "allowView");
  if (override !== null) return override;
  const viewRoles = parseRoles(channel.viewRoles, ALL_ROLES);
  return viewRoles.includes(role);
}

function canPostInChannel(
  channel: { replyRoles: unknown; locked: boolean },
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): boolean {
  if (channel.locked) return canModerate(role);
  const override = resolvePermission(perms, role, userId, "allowPost");
  if (override !== null) return override;
  const replyRoles = parseRoles(channel.replyRoles, []);
  return replyRoles.includes(role);
}

function canManageChannel(
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): boolean {
  const override = resolvePermission(perms, role, userId, "allowManage");
  if (override !== null) return override;
  return canModerate(role);
}

// ─── Slow-mode tracking (in-memory, resets on restart) ───

const slowModeMap = new Map<string, number>();

function checkSlowMode(channelId: number, userId: number, seconds: number): string | null {
  if (seconds <= 0) return null;
  const key = `${channelId}:${userId}`;
  const last = slowModeMap.get(key) ?? 0;
  const diff = Date.now() - last;
  const waitMs = seconds * 1000;
  if (diff < waitMs) {
    const remaining = Math.ceil((waitMs - diff) / 1000);
    return `Slow mode: wait ${remaining}s`;
  }
  return null;
}

function recordSlowMode(channelId: number, userId: number) {
  slowModeMap.set(`${channelId}:${userId}`, Date.now());
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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
    const isStaff = canModerate(viewerRole);

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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
      const parentReplyId = req.body?.parentReplyId ? Number(req.body.parentReplyId) : null;

      if (!content && attachments.length === 0) {
        return res.status(400).json({ error: "Message content or attachment required" });
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

      // Check slow mode (staff exempt)
      if (!canModerate(user.role)) {
        const slowErr = checkSlowMode(channelId, user.id, channel.slowModeSeconds);
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

      recordSlowMode(channelId, user.id);

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

      if (existing.userId !== user.id && !canModerate(user.role)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = { editedAt: new Date() };
      if (typeof req.body?.content === "string") updates.content = req.body.content;
      if (Array.isArray(req.body?.attachments)) updates.attachments = req.body.attachments;

      const [updated] = await db
        .update(boardThreadReplies)
        .set(updates)
        .where(eq(boardThreadReplies.id, msgId))
        .returning();

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

      if (existing.userId !== user.id && !canModerate(user.role)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db.delete(boardThreadReplies).where(eq(boardThreadReplies.id, msgId));
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
        return res.json({ action: "removed" });
      }

      await db
        .insert(boardReactions)
        .values({ replyId, userId: user.id, emoji });

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
router.post("/api/board/webhook/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const [webhook] = await db
      .select()
      .from(boardWebhooks)
      .where(and(eq(boardWebhooks.token, token), eq(boardWebhooks.active, true)))
      .limit(1);

    if (!webhook) return res.status(404).json({ error: "Invalid webhook" });

    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "Content required" });

    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

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

    res.status(201).json({ id: msg.id });
  } catch {
    res.status(500).json({ error: "Webhook delivery failed" });
  }
});

export default router;
