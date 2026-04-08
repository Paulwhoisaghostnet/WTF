import { Router } from "express";
import { db } from "../db";
import {
  boardThreadReplies,
  boardThreads,
  channels,
  dmConversationParticipants,
  dmConversations,
  dmMessages,
  messages,
  users,
} from "@shared/schema";
import {
  and,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";
import type { UserRole } from "@shared/types";
import { ROLE_ORDER } from "@shared/types";
import { awardXp } from "../lib/xp";
import { canModerate, isRole } from "../lib/roles";

const router = Router();

const ALL_ROLES: UserRole[] = [...ROLE_ORDER];
const MODERATION_ROLES: UserRole[] = ["admin", "host", "cohost"];

function parseRoles(input: unknown, fallback: UserRole[] = ALL_ROLES): UserRole[] {
  if (!Array.isArray(input)) return [...fallback];
  const normalized = input.filter(isRole) as UserRole[];
  if (normalized.length === 0) return [...fallback];
  return Array.from(new Set(normalized));
}

function userCanViewThread(thread: { viewRoles: unknown }, role: UserRole): boolean {
  const viewRoles = parseRoles(thread.viewRoles, ALL_ROLES);
  return viewRoles.includes(role);
}

function userCanReplyThread(thread: { replyRoles: unknown }, role: UserRole): boolean {
  const replyRoles = parseRoles(thread.replyRoles, []);
  return replyRoles.includes(role);
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

async function ensureDmParticipant(conversationId: number, userId: number) {
  const [participant] = await db
    .select()
    .from(dmConversationParticipants)
    .where(
      and(
        eq(dmConversationParticipants.conversationId, conversationId),
        eq(dmConversationParticipants.userId, userId)
      )
    )
    .limit(1);
  return participant ?? null;
}

// ───────────────────────────────────────────────────────────
// User lookup for DM composer and role targeting
// ───────────────────────────────────────────────────────────

router.get("/api/messages/users", isAuthenticated, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const role = req.query.role;
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "30"), 10), 100));

    const whereClauses: any[] = [];

    if (q) {
      const pattern = `%${q}%`;
      whereClauses.push(
        or(
          ilike(users.username, pattern),
          ilike(users.displayName, pattern),
          ilike(users.email, pattern)
        )
      );
    }

    if (isRole(role)) {
      whereClauses.push(eq(users.role, role));
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        experiencePoints: users.experiencePoints,
      })
      .from(users)
      .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
      .orderBy(users.username)
      .limit(limit);

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to search users" });
  }
});

// ───────────────────────────────────────────────────────────
// Direct messages
// ───────────────────────────────────────────────────────────

router.get("/api/messages/dms", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;

    const memberships = await db
      .select({
        conversationId: dmConversationParticipants.conversationId,
        lastReadAt: dmConversationParticipants.lastReadAt,
      })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, user.id));

    if (memberships.length === 0) {
      return res.json([]);
    }

    const conversationIds = memberships.map((m) => m.conversationId);

    const conversations = await db
      .select()
      .from(dmConversations)
      .where(
        and(
          inArray(dmConversations.id, conversationIds),
          eq(dmConversations.active, true)
        )
      )
      .orderBy(desc(dmConversations.lastMessageAt));

    const participants = await db
      .select({
        conversationId: dmConversationParticipants.conversationId,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        experiencePoints: users.experiencePoints,
      })
      .from(dmConversationParticipants)
      .leftJoin(users, eq(dmConversationParticipants.userId, users.id))
      .where(inArray(dmConversationParticipants.conversationId, conversationIds));

    const latestMessages = await db
      .select({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
      })
      .from(dmMessages)
      .where(inArray(dmMessages.conversationId, conversationIds))
      .orderBy(desc(dmMessages.createdAt));

    const unreadRows = await db
      .select({
        conversationId: dmMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(dmMessages)
      .innerJoin(
        dmConversationParticipants,
        and(
          eq(dmConversationParticipants.conversationId, dmMessages.conversationId),
          eq(dmConversationParticipants.userId, user.id)
        )
      )
      .where(
        and(
          inArray(dmMessages.conversationId, conversationIds),
          sql`${dmMessages.senderId} <> ${user.id}`,
          or(
            isNull(dmConversationParticipants.lastReadAt),
            gt(dmMessages.createdAt, dmConversationParticipants.lastReadAt)
          )
        )
      )
      .groupBy(dmMessages.conversationId);

    const membershipMap = new Map(memberships.map((m) => [m.conversationId, m]));
    const participantMap = new Map<number, any[]>();
    const latestMessageMap = new Map<number, any>();
    const unreadMap = new Map<number, number>();

    for (const participant of participants) {
      if (!participant.userId) continue;
      const list = participantMap.get(participant.conversationId) || [];
      list.push(participant);
      participantMap.set(participant.conversationId, list);
    }

    for (const row of latestMessages) {
      if (!latestMessageMap.has(row.conversationId)) {
        latestMessageMap.set(row.conversationId, row);
      }
    }

    for (const unread of unreadRows) {
      unreadMap.set(unread.conversationId, Number(unread.count || 0));
    }

    const payload = conversations.map((conversation) => {
      const peers = (participantMap.get(conversation.id) || []).filter(
        (p) => p.userId !== user.id
      );
      const latestMessage = latestMessageMap.get(conversation.id) || null;
      const unreadCount = unreadMap.get(conversation.id) || 0;
      const membership = membershipMap.get(conversation.id);

      return {
        id: conversation.id,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount,
        lastReadAt: membership?.lastReadAt ?? null,
        peers,
        latestMessage,
      };
    });

    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.post("/api/messages/dms", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const targetUserId = Number(req.body?.targetUserId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "targetUserId is required" });
    }
    if (targetUserId === user.id) {
      return res.status(400).json({ error: "Cannot start a DM with yourself" });
    }

    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found" });
    }

    const myMemberships = await db
      .select({ conversationId: dmConversationParticipants.conversationId })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, user.id));

    let existingConversationId: number | null = null;

    if (myMemberships.length > 0) {
      const myConversationIds = myMemberships.map((m) => m.conversationId);
      const candidateParticipants = await db
        .select({
          conversationId: dmConversationParticipants.conversationId,
          userId: dmConversationParticipants.userId,
        })
        .from(dmConversationParticipants)
        .where(inArray(dmConversationParticipants.conversationId, myConversationIds));

      const participantSets = new Map<number, Set<number>>();
      for (const participant of candidateParticipants) {
        const set = participantSets.get(participant.conversationId) || new Set<number>();
        set.add(participant.userId);
        participantSets.set(participant.conversationId, set);
      }

      for (const [conversationId, set] of participantSets.entries()) {
        if (set.size === 2 && set.has(user.id) && set.has(targetUserId)) {
          existingConversationId = conversationId;
          break;
        }
      }
    }

    if (existingConversationId) {
      const [conversation] = await db
        .select()
        .from(dmConversations)
        .where(eq(dmConversations.id, existingConversationId))
        .limit(1);

      return res.json({ ...conversation, existed: true });
    }

    const now = new Date();
    const [conversation] = await db
      .insert(dmConversations)
      .values({
        createdBy: user.id,
        active: true,
        lastMessageAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(dmConversationParticipants).values([
      {
        conversationId: conversation.id,
        userId: user.id,
        lastReadAt: now,
      },
      {
        conversationId: conversation.id,
        userId: targetUserId,
        lastReadAt: null,
      },
    ]);

    res.status(201).json({ ...conversation, existed: false });
  } catch {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/api/messages/dms/:id/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const conversationId = Number(req.params.id);
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "100"), 10), 200));
    const before = req.query.before ? Number(req.query.before) : null;

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const participant = await ensureDmParticipant(conversationId, user.id);
    if (!participant) {
      return res.status(403).json({ error: "Not a participant in this conversation" });
    }

    const filters: any[] = [eq(dmMessages.conversationId, conversationId)];
    if (before && Number.isInteger(before) && before > 0) {
      filters.push(sql`${dmMessages.id} < ${before}`);
    }

    const rows = await db
      .select({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        senderId: dmMessages.senderId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
        editedAt: dmMessages.editedAt,
      })
      .from(dmMessages)
      .leftJoin(users, eq(dmMessages.senderId, users.id))
      .where(and(...filters))
      .orderBy(desc(dmMessages.id))
      .limit(limit);

    await db
      .update(dmConversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, user.id)
        )
      );

    res.json(rows.reverse());
  } catch {
    res.status(500).json({ error: "Failed to fetch DM messages" });
  }
});

router.post("/api/messages/dms/:id/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const conversationId = Number(req.params.id);
    const content = String(req.body?.content || "").trim();

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }
    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const participant = await ensureDmParticipant(conversationId, user.id);
    if (!participant) {
      return res.status(403).json({ error: "Not a participant in this conversation" });
    }

    const now = new Date();
    const [message] = await db
      .insert(dmMessages)
      .values({
        conversationId,
        senderId: user.id,
        content,
      })
      .returning();

    await db
      .update(dmConversations)
      .set({
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(dmConversations.id, conversationId));

    await db
      .update(dmConversationParticipants)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, user.id)
        )
      );

    try {
      await awardXp({
        userId: user.id,
        amount: 1,
        reason: "dm_message_sent",
        metadata: { conversationId, messageId: message.id },
      });
    } catch {
      // XP should not block messaging.
    }

    res.status(201).json(message);
  } catch {
    res.status(500).json({ error: "Failed to send DM" });
  }
});

router.put("/api/messages/dms/:id/read", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const conversationId = Number(req.params.id);

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const participant = await ensureDmParticipant(conversationId, user.id);
    if (!participant) {
      return res.status(403).json({ error: "Not a participant in this conversation" });
    }

    await db
      .update(dmConversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, user.id)
        )
      );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark DM as read" });
  }
});

// ───────────────────────────────────────────────────────────
// Public role-gated threads
// ───────────────────────────────────────────────────────────

router.get("/api/messages/threads", async (req, res) => {
  try {
    const user = (req.user as any) || null;
    const viewerRole: UserRole = user?.role ?? "witness";
    const isStaff = ["admin", "host", "cohost"].includes(viewerRole);

    const baseQuery = db
      .select({
        id: boardThreads.id,
        title: boardThreads.title,
        body: boardThreads.body,
        createdBy: boardThreads.createdBy,
        creatorUsername: users.username,
        creatorDisplayName: users.displayName,
        creatorAvatarUrl: users.avatarUrl,
        viewRoles: boardThreads.viewRoles,
        replyRoles: boardThreads.replyRoles,
        active: boardThreads.active,
        pinned: boardThreads.pinned,
        locked: boardThreads.locked,
        expiresAt: boardThreads.expiresAt,
        createdAt: boardThreads.createdAt,
        updatedAt: boardThreads.updatedAt,
      })
      .from(boardThreads)
      .leftJoin(users, eq(boardThreads.createdBy, users.id));

    const threads = isStaff
      ? await baseQuery.orderBy(desc(boardThreads.pinned), desc(boardThreads.createdAt))
      : await baseQuery
          .where(eq(boardThreads.active, true))
          .orderBy(desc(boardThreads.pinned), desc(boardThreads.createdAt));

    const counts = await db
      .select({
        threadId: boardThreadReplies.threadId,
        count: sql<number>`count(*)::int`,
      })
      .from(boardThreadReplies)
      .groupBy(boardThreadReplies.threadId);

    const countMap = new Map<number, number>();
    for (const c of counts) {
      countMap.set(c.threadId, Number(c.count || 0));
    }

    const visibleThreads = threads
      .filter((thread) => userCanViewThread(thread, viewerRole))
      .map((thread) => ({
        ...thread,
        viewRoles: parseRoles(thread.viewRoles),
        replyRoles: parseRoles(thread.replyRoles, []),
        replyCount: countMap.get(thread.id) || 0,
        expired: isExpired(thread.expiresAt),
        canReply:
          !thread.locked &&
          !isExpired(thread.expiresAt) &&
          userCanReplyThread(thread, viewerRole),
      }));

    res.json(visibleThreads);
  } catch {
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

router.post(
  "/api/messages/threads",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const title = String(req.body?.title || "").trim();
      const body = String(req.body?.body || "").trim();
      const expiresAtRaw = req.body?.expiresAt;

      if (!title) {
        return res.status(400).json({ error: "Thread title is required" });
      }
      if (!body) {
        return res.status(400).json({ error: "Thread body is required" });
      }

      const viewRoles = parseRoles(req.body?.viewRoles, ALL_ROLES);
      const replyRoles = parseRoles(req.body?.replyRoles, ALL_ROLES);

      if (viewRoles.length === 0) {
        return res.status(400).json({ error: "At least one view role is required" });
      }
      if (replyRoles.length === 0) {
        return res.status(400).json({ error: "At least one reply role is required" });
      }

      const expiresAt =
        typeof expiresAtRaw === "string" && expiresAtRaw.trim().length > 0
          ? new Date(expiresAtRaw)
          : null;

      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ error: "Invalid expiresAt" });
      }

      const [thread] = await db
        .insert(boardThreads)
        .values({
          title,
          body,
          createdBy: user.id,
          viewRoles,
          replyRoles,
          expiresAt,
        })
        .returning();

      try {
        await awardXp({
          userId: user.id,
          amount: 2,
          reason: "thread_created",
          metadata: { threadId: thread.id },
        });
      } catch {
        // XP should not block thread creation.
      }

      res.status(201).json(thread);
    } catch {
      res.status(500).json({ error: "Failed to create thread" });
    }
  }
);

router.get("/api/messages/threads/:id", async (req, res) => {
  try {
    const user = (req.user as any) || null;
    const viewerRole: UserRole = user?.role ?? "witness";
    const threadId = Number(req.params.id);

    if (!Number.isInteger(threadId) || threadId <= 0) {
      return res.status(400).json({ error: "Invalid thread id" });
    }

    const [thread] = await db
      .select({
        id: boardThreads.id,
        title: boardThreads.title,
        body: boardThreads.body,
        createdBy: boardThreads.createdBy,
        creatorUsername: users.username,
        creatorDisplayName: users.displayName,
        creatorAvatarUrl: users.avatarUrl,
        viewRoles: boardThreads.viewRoles,
        replyRoles: boardThreads.replyRoles,
        active: boardThreads.active,
        pinned: boardThreads.pinned,
        locked: boardThreads.locked,
        expiresAt: boardThreads.expiresAt,
        createdAt: boardThreads.createdAt,
        updatedAt: boardThreads.updatedAt,
      })
      .from(boardThreads)
      .leftJoin(users, eq(boardThreads.createdBy, users.id))
      .where(eq(boardThreads.id, threadId))
      .limit(1);

    const isStaff = ["admin", "host", "cohost"].includes(viewerRole);
    if (!thread || (!thread.active && !isStaff)) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (!userCanViewThread(thread, viewerRole)) {
      return res.status(403).json({ error: "Not allowed to view this thread" });
    }

    const replies = await db
      .select({
        id: boardThreadReplies.id,
        threadId: boardThreadReplies.threadId,
        userId: boardThreadReplies.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        content: boardThreadReplies.content,
        createdAt: boardThreadReplies.createdAt,
        editedAt: boardThreadReplies.editedAt,
      })
      .from(boardThreadReplies)
      .leftJoin(users, eq(boardThreadReplies.userId, users.id))
      .where(eq(boardThreadReplies.threadId, threadId))
      .orderBy(boardThreadReplies.createdAt);

    const expired = isExpired(thread.expiresAt);

    res.json({
      ...thread,
      viewRoles: parseRoles(thread.viewRoles),
      replyRoles: parseRoles(thread.replyRoles, []),
      canReply: !thread.locked && !expired && userCanReplyThread(thread, viewerRole),
      expired,
      replies,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

router.post(
  "/api/messages/threads/:id/replies",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const threadId = Number(req.params.id);
      const content = String(req.body?.content || "").trim();

      if (!Number.isInteger(threadId) || threadId <= 0) {
        return res.status(400).json({ error: "Invalid thread id" });
      }
      if (!content) {
        return res.status(400).json({ error: "Reply content is required" });
      }

      const [thread] = await db
        .select()
        .from(boardThreads)
        .where(eq(boardThreads.id, threadId))
        .limit(1);

      if (!thread || !thread.active) {
        return res.status(404).json({ error: "Thread not found" });
      }
      if (!userCanViewThread(thread, user.role)) {
        return res.status(403).json({ error: "Not allowed to view this thread" });
      }
      if (thread.locked) {
        return res.status(400).json({ error: "Thread is locked" });
      }
      if (isExpired(thread.expiresAt)) {
        return res.status(400).json({ error: "Thread has expired" });
      }
      if (!userCanReplyThread(thread, user.role)) {
        return res.status(403).json({ error: "Role cannot reply in this thread" });
      }

      const [reply] = await db
        .insert(boardThreadReplies)
        .values({
          threadId,
          userId: user.id,
          content,
        })
        .returning();

      await db
        .update(boardThreads)
        .set({ updatedAt: new Date() })
        .where(eq(boardThreads.id, threadId));

      try {
        await awardXp({
          userId: user.id,
          amount: 1,
          reason: "thread_reply",
          metadata: { threadId, replyId: reply.id },
        });
      } catch {
        // XP should not block replies.
      }

      res.status(201).json(reply);
    } catch {
      res.status(500).json({ error: "Failed to reply to thread" });
    }
  }
);

router.delete(
  "/api/messages/threads/:threadId/replies/:replyId",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const threadId = Number(req.params.threadId);
      const replyId = Number(req.params.replyId);

      if (!Number.isInteger(replyId) || replyId <= 0) {
        return res.status(400).json({ error: "Invalid reply id" });
      }

      const [reply] = await db
        .select()
        .from(boardThreadReplies)
        .where(
          and(
            eq(boardThreadReplies.id, replyId),
            eq(boardThreadReplies.threadId, threadId)
          )
        )
        .limit(1);

      if (!reply) {
        return res.status(404).json({ error: "Reply not found" });
      }

      if (reply.userId !== user.id && !canModerate(user.role)) {
        return res.status(403).json({ error: "Not authorized to delete this reply" });
      }

      await db.delete(boardThreadReplies).where(eq(boardThreadReplies.id, replyId));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete reply" });
    }
  }
);

router.put(
  "/api/messages/threads/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const threadId = Number(req.params.id);

      if (!Number.isInteger(threadId) || threadId <= 0) {
        return res.status(400).json({ error: "Invalid thread id" });
      }

      const [existing] = await db
        .select()
        .from(boardThreads)
        .where(eq(boardThreads.id, threadId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Thread not found" });
      }

      if (existing.createdBy !== user.id && !canModerate(user.role)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (typeof req.body?.title === "string") {
        const trimmed = req.body.title.trim();
        if (!trimmed) {
          return res.status(400).json({ error: "Title cannot be empty" });
        }
        updates.title = trimmed;
      }

      if (typeof req.body?.body === "string") {
        const trimmed = req.body.body.trim();
        if (!trimmed) {
          return res.status(400).json({ error: "Body cannot be empty" });
        }
        updates.body = trimmed;
      }

      if (typeof req.body?.locked === "boolean") {
        updates.locked = req.body.locked;
      }

      if (typeof req.body?.pinned === "boolean") {
        updates.pinned = req.body.pinned;
      }

      if (typeof req.body?.active === "boolean") {
        updates.active = req.body.active;
      }

      if (req.body?.viewRoles !== undefined) {
        const parsed = parseRoles(req.body.viewRoles, []);
        if (parsed.length === 0) {
          return res.status(400).json({ error: "At least one view role is required" });
        }
        updates.viewRoles = parsed;
      }

      if (req.body?.replyRoles !== undefined) {
        const parsed = parseRoles(req.body.replyRoles, []);
        if (parsed.length === 0) {
          return res.status(400).json({ error: "At least one reply role is required" });
        }
        updates.replyRoles = parsed;
      }

      if (req.body?.expiresAt !== undefined) {
        if (req.body.expiresAt === null || req.body.expiresAt === "") {
          updates.expiresAt = null;
        } else {
          const parsed = new Date(String(req.body.expiresAt));
          if (Number.isNaN(parsed.getTime())) {
            return res.status(400).json({ error: "Invalid expiresAt" });
          }
          updates.expiresAt = parsed;
        }
      }

      const [updated] = await db
        .update(boardThreads)
        .set(updates)
        .where(eq(boardThreads.id, threadId))
        .returning();

      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update thread" });
    }
  }
);

router.delete(
  "/api/messages/threads/:id",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const threadId = Number(req.params.id);

      if (!Number.isInteger(threadId) || threadId <= 0) {
        return res.status(400).json({ error: "Invalid thread id" });
      }

      const [existing] = await db
        .select()
        .from(boardThreads)
        .where(eq(boardThreads.id, threadId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Thread not found" });
      }

      if (existing.createdBy !== user.id && !canModerate(user.role)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db
        .update(boardThreads)
        .set({ active: false, locked: true, updatedAt: new Date() })
        .where(eq(boardThreads.id, threadId));

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to remove thread" });
    }
  }
);

// ───────────────────────────────────────────────────────────
// Legacy channel endpoints (kept for compatibility)
// ───────────────────────────────────────────────────────────

router.get("/api/channels", isAuthenticated, async (_req, res) => {
  try {
    const allChannels = await db
      .select()
      .from(channels)
      .where(isNull(channels.parentMessageId))
      .orderBy(channels.createdAt);
    res.json(allChannels);
  } catch {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

router.post(
  "/api/channels",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const [channel] = await db
        .insert(channels)
        .values({ ...req.body, createdBy: user.id })
        .returning();
      res.status(201).json(channel);
    } catch {
      res.status(500).json({ error: "Failed to create channel" });
    }
  }
);

router.get("/api/channels/:id/messages", isAuthenticated, async (req, res) => {
  try {
    const channelId = parseInt(req.params.id as string, 10);
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 100);
    const before = req.query.before ? parseInt(String(req.query.before), 10) : undefined;

    const rows = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        userId: messages.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        content: messages.content,
        messageType: messages.messageType,
        threadParentId: messages.threadParentId,
        pinned: messages.pinned,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(
        before
          ? and(eq(messages.channelId, channelId), sql`${messages.id} < ${before}`)
          : eq(messages.channelId, channelId)
      )
      .orderBy(desc(messages.id))
      .limit(limit);

    res.json(rows.reverse());
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/api/channels/:id/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const channelId = parseInt(req.params.id as string, 10);

    const [message] = await db
      .insert(messages)
      .values({
        channelId,
        userId: user.id,
        content: req.body.content,
        messageType: req.body.messageType || "text",
        threadParentId: req.body.threadParentId || null,
      })
      .returning();

    try {
      await awardXp({
        userId: user.id,
        amount: 1,
        reason: "channel_message_sent",
        metadata: { channelId, messageId: message.id },
      });
    } catch {
      // XP should not block posting.
    }

    res.status(201).json(message);
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.put("/api/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messageId = parseInt(req.params.id as string, 10);

    const [existing] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (existing.userId !== user.id && !MODERATION_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "Cannot edit this message" });
    }

    const [updated] = await db
      .update(messages)
      .set({ content: req.body.content, editedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to edit message" });
  }
});

router.delete("/api/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messageId = parseInt(req.params.id as string, 10);

    const [existing] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (existing.userId !== user.id && !MODERATION_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "Cannot delete this message" });
    }

    await db.delete(messages).where(eq(messages.id, messageId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

router.put(
  "/api/messages/:id/pin",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(messages)
        .set({ pinned: !!req.body?.pinned })
        .where(eq(messages.id, parseInt(req.params.id as string, 10)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Message not found" });
      }

      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to pin message" });
    }
  }
);

export default router;
