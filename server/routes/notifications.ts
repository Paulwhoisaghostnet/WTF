import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { userNotifications, users } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import {
  getUserNotificationPreferences,
  NOTIFICATION_PREFERENCE_DEFINITIONS,
  sanitizeNotificationPreferencePatch,
  setUserNotificationPreferences,
} from "../lib/notifications";
import { ingestSystemEvent } from "../challenges/events/ingest";
import type { SystemEventType } from "../challenges/events/types";

const router = Router();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function emitNotificationEvent(input: {
  eventType: SystemEventType;
  userId: number;
  rawRefType: string;
  rawRefId?: string | number | null;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventId: `${input.eventType}:${input.userId}:${input.rawRefId ?? "all"}:${Date.now()}`,
    eventType: input.eventType,
    userId: input.userId,
    source: "notifications",
    sourceModule: "notifications",
    rawRefType: input.rawRefType,
    rawRefId: input.rawRefId ?? null,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[notifications] failed to emit event", err));
}

router.get("/api/notifications/preferences", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const preferences = await getUserNotificationPreferences(user.id);
    res.json({
      definitions: NOTIFICATION_PREFERENCE_DEFINITIONS,
      preferences,
    });
  } catch {
    res.status(500).json({ error: "Failed to load notification preferences" });
  }
});

router.put("/api/notifications/preferences", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const patch = sanitizeNotificationPreferencePatch(
      req.body?.preferences ?? req.body
    );

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid notification preferences provided" });
    }

    const preferences = await setUserNotificationPreferences(user.id, patch);

    emitNotificationEvent({
      eventType: "notification.preference.updated",
      userId: user.id,
      rawRefType: "notification_preferences",
      rawRefId: user.id,
      metadata: {
        keys: Object.keys(patch).sort(),
        enabledCount: Object.values(preferences).filter(Boolean).length,
      },
    });
    res.json({
      definitions: NOTIFICATION_PREFERENCE_DEFINITIONS,
      preferences,
    });
  } catch {
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

router.get("/api/notifications", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";
    const limit = clamp(parseInt(String(req.query.limit || "100"), 10), 1, 500);
    const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10));

    const filters = [eq(userNotifications.userId, user.id)];
    if (unreadOnly) {
      filters.push(eq(userNotifications.read, false));
    }

    const items = await db
      .select({
        id: userNotifications.id,
        userId: userNotifications.userId,
        sourceUserId: userNotifications.sourceUserId,
        sourceUsername: users.username,
        sourceDisplayName: users.displayName,
        eventKey: userNotifications.eventKey,
        title: userNotifications.title,
        body: userNotifications.body,
        metadata: userNotifications.metadata,
        read: userNotifications.read,
        createdAt: userNotifications.createdAt,
      })
      .from(userNotifications)
      .leftJoin(users, eq(userNotifications.sourceUserId, users.id))
      .where(and(...filters))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [unread] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, user.id), eq(userNotifications.read, false)));

    res.json({
      items,
      unreadCount: Number(unread?.count || 0),
      pagination: {
        limit,
        offset,
        count: items.length,
      },
    });
    emitNotificationEvent({
      eventType: "notification.viewed",
      userId: user.id,
      rawRefType: "notification_inbox",
      rawRefId: user.id,
      metadata: {
        unreadOnly,
        limit,
        offset,
        itemCount: items.length,
        unreadCount: Number(unread?.count || 0),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.put("/api/notifications/read-all", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const updatedRows = await db
      .update(userNotifications)
      .set({ read: true })
      .where(and(eq(userNotifications.userId, user.id), eq(userNotifications.read, false)))
      .returning({ id: userNotifications.id });

    emitNotificationEvent({
      eventType: "notification.read_all",
      userId: user.id,
      rawRefType: "notification_inbox",
      rawRefId: user.id,
      metadata: {
        count: updatedRows.length,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

router.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid notification id" });
    }

    const read = req.body?.read === false ? false : true;

    const [updated] = await db
      .update(userNotifications)
      .set({ read })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, user.id)))
      .returning({
        id: userNotifications.id,
        read: userNotifications.read,
      });

    if (!updated) {
      return res.status(404).json({ error: "Notification not found" });
    }

    emitNotificationEvent({
      eventType: "notification.read",
      userId: user.id,
      rawRefType: "user_notification",
      rawRefId: updated.id,
      metadata: {
        read: updated.read,
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

router.put("/api/notifications/:id/opened", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid notification id" });
    }

    const [notification] = await db
      .select({
        id: userNotifications.id,
        eventKey: userNotifications.eventKey,
        read: userNotifications.read,
      })
      .from(userNotifications)
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, user.id)))
      .limit(1);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    emitNotificationEvent({
      eventType: "notification.opened",
      userId: user.id,
      rawRefType: "user_notification",
      rawRefId: notification.id,
      metadata: {
        eventKey: notification.eventKey,
        wasUnread: !notification.read,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to open notification" });
  }
});

export default router;
