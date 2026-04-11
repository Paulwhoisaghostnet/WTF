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

const router = Router();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
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
  } catch {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.put("/api/notifications/read-all", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    await db
      .update(userNotifications)
      .set({ read: true })
      .where(and(eq(userNotifications.userId, user.id), eq(userNotifications.read, false)));

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

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

export default router;
