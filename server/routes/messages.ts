import { Router } from "express";
import { db } from "../db";
import { channels, messages, users } from "@shared/schema";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";

const router = Router();

router.get("/api/channels", isAuthenticated, async (_req, res) => {
  try {
    const allChannels = await db
      .select()
      .from(channels)
      .where(isNull(channels.parentMessageId))
      .orderBy(channels.createdAt);
    res.json(allChannels);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

router.post(
  "/api/channels",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const [channel] = await db
        .insert(channels)
        .values({ ...req.body, createdBy: user.id })
        .returning();
      res.status(201).json(channel);
    } catch (err) {
      res.status(500).json({ error: "Failed to create channel" });
    }
  }
);

router.get("/api/channels/:id/messages", isAuthenticated, async (req, res) => {
  try {
    const channelId = parseInt(req.params.id as string);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before
      ? parseInt(req.query.before as string)
      : undefined;

    let query = db
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
          ? and(
              eq(messages.channelId, channelId),
              sql`${messages.id} < ${before}`
            )
          : eq(messages.channelId, channelId)
      )
      .orderBy(desc(messages.id))
      .limit(limit);

    const msgs = await query;
    res.json(msgs.reverse());
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post(
  "/api/channels/:id/messages",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const channelId = parseInt(req.params.id as string);

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

      res.status(201).json(message);
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);

router.put("/api/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messageId = parseInt(req.params.id as string);

    const [existing] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!existing) return res.status(404).json({ error: "Message not found" });
    if (existing.userId !== user.id && !["host", "cohost"].includes(user.role))
      return res.status(403).json({ error: "Cannot edit this message" });

    const [updated] = await db
      .update(messages)
      .set({ content: req.body.content, editedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to edit message" });
  }
});

router.delete("/api/messages/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const messageId = parseInt(req.params.id as string);

    const [existing] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!existing) return res.status(404).json({ error: "Message not found" });
    if (existing.userId !== user.id && !["host", "cohost"].includes(user.role))
      return res.status(403).json({ error: "Cannot delete this message" });

    await db.delete(messages).where(eq(messages.id, messageId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

router.put(
  "/api/messages/:id/pin",
  requireRole("host", "cohost"),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(messages)
        .set({ pinned: req.body.pinned })
        .where(eq(messages.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated)
        return res.status(404).json({ error: "Message not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to pin message" });
    }
  }
);

export default router;
