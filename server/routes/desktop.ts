import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { awardXp } from "../lib/xp";
import {
  desktopPetEvents,
  desktopPetStates,
  userDesktopSettings,
} from "@shared/schema";
import {
  applyHamsterAction,
  dateKey,
  DEFAULT_DESKTOP_APPEARANCE,
  DEFAULT_HAMSTER_STATE,
  deriveHamsterSnapshot,
  HAMSTER_ACTIONS,
  normalizeDesktopAppearance,
  normalizeIconLayout,
  type DesktopAppearance,
  type DesktopIconLayout,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";

const router = Router();

const DESKTOP_ICON_KEYS = [
  "recycle-bin",
  "hoard",
  "w",
  "tv",
  "dicksword",
  "console",
  "studio",
  "my-gallery",
] as const;

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowToHamsterState(
  row: typeof desktopPetStates.$inferSelect | null | undefined
): HamsterState {
  if (!row) return { ...DEFAULT_HAMSTER_STATE };
  return {
    name: row.name,
    alive: row.alive,
    hunger: row.hunger,
    thirst: row.thirst,
    happiness: row.happiness,
    hygiene: row.hygiene,
    energy: row.energy,
    level: row.level,
    xpEarned: row.xpEarned,
    missedCareDays: row.missedCareDays,
    careStreak: row.careStreak,
    lastCareDate: row.lastCareDate ?? null,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    interactionCounts: row.interactionCounts ?? {},
  };
}

function hamsterValues(userId: number, state: HamsterState) {
  return {
    userId,
    name: state.name,
    alive: state.alive,
    hunger: state.hunger,
    thirst: state.thirst,
    happiness: state.happiness,
    hygiene: state.hygiene,
    energy: state.energy,
    level: state.level,
    xpEarned: state.xpEarned,
    missedCareDays: state.missedCareDays,
    careStreak: state.careStreak,
    lastCareDate: state.lastCareDate,
    lastInteractionAt: state.lastInteractionAt
      ? new Date(state.lastInteractionAt)
      : null,
    interactionCounts: state.interactionCounts,
    updatedAt: new Date(),
  };
}

async function getDesktopSettings(userId: number): Promise<{
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
}> {
  const [row] = await db
    .select()
    .from(userDesktopSettings)
    .where(eq(userDesktopSettings.userId, userId));

  return {
    appearance: normalizeDesktopAppearance({
      ...DEFAULT_DESKTOP_APPEARANCE,
      ...(row?.appearance ?? {}),
    }),
    iconLayout: normalizeIconLayout(row?.iconLayout ?? {}, DESKTOP_ICON_KEYS),
  };
}

async function persistPetState(userId: number, state: HamsterState) {
  const values = hamsterValues(userId, state);
  await db
    .insert(desktopPetStates)
    .values(values)
    .onConflictDoUpdate({
      target: desktopPetStates.userId,
      set: values,
    });
}

async function getOrCreatePetState(userId: number, now = new Date()) {
  const [row] = await db
    .select()
    .from(desktopPetStates)
    .where(eq(desktopPetStates.userId, userId));

  if (!row) {
    const initial = {
      ...DEFAULT_HAMSTER_STATE,
      lastCareDate: dateKey(now),
      lastInteractionAt: now.toISOString(),
    };
    await persistPetState(userId, initial);
    return initial;
  }

  const snapshot = deriveHamsterSnapshot(rowToHamsterState(row), now);
  if (
    snapshot.alive !== row.alive ||
    snapshot.hunger !== row.hunger ||
    snapshot.thirst !== row.thirst ||
    snapshot.missedCareDays !== row.missedCareDays
  ) {
    if (row.alive && !snapshot.alive) {
      await db.insert(desktopPetEvents).values({
        userId,
        action: "death",
        statBefore: rowToHamsterState(row),
        statAfter: snapshot,
        xpAmount: 0,
        metadata: { reason: "missed_care_days", source: "snapshot_decay" },
        createdAt: now,
      });
    }
    await persistPetState(userId, snapshot);
  }
  return snapshot;
}

router.get("/api/desktop/settings", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(await getDesktopSettings(user.id));
  } catch (err) {
    console.error("GET /api/desktop/settings error:", err);
    res.status(500).json({ error: "Failed to fetch desktop settings" });
  }
});

router.put("/api/desktop/settings", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const current = await getDesktopSettings(user.id);
    const body = safeObject(req.body);
    const appearancePatch = safeObject(body.appearance);
    const nextAppearance = normalizeDesktopAppearance({
      ...current.appearance,
      ...appearancePatch,
    });
    const nextIconLayout =
      body.iconLayout === undefined
        ? current.iconLayout
        : normalizeIconLayout(body.iconLayout, DESKTOP_ICON_KEYS);

    const [row] = await db
      .insert(userDesktopSettings)
      .values({
        userId: user.id,
        appearance: nextAppearance,
        iconLayout: nextIconLayout,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userDesktopSettings.userId,
        set: {
          appearance: nextAppearance,
          iconLayout: nextIconLayout,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json({
      appearance: normalizeDesktopAppearance(row.appearance),
      iconLayout: normalizeIconLayout(row.iconLayout, DESKTOP_ICON_KEYS),
    });
  } catch (err) {
    console.error("PUT /api/desktop/settings error:", err);
    res.status(500).json({ error: "Failed to save desktop settings" });
  }
});

router.get("/api/desktop/pet", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const state = await getOrCreatePetState(user.id);
    const events = await db
      .select({
        id: desktopPetEvents.id,
        action: desktopPetEvents.action,
        xpAmount: desktopPetEvents.xpAmount,
        createdAt: desktopPetEvents.createdAt,
      })
      .from(desktopPetEvents)
      .where(eq(desktopPetEvents.userId, user.id))
      .orderBy(desc(desktopPetEvents.createdAt))
      .limit(12);

    res.json({ pet: state, events });
  } catch (err) {
    console.error("GET /api/desktop/pet error:", err);
    res.status(500).json({ error: "Failed to fetch desktop pet" });
  }
});

router.get("/api/desktop/pet/events", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Math.max(1, Math.min(200, Math.floor(rawLimit) || 50));
    const events = await db
      .select()
      .from(desktopPetEvents)
      .where(eq(desktopPetEvents.userId, user.id))
      .orderBy(desc(desktopPetEvents.createdAt))
      .limit(limit);
    res.json({ events });
  } catch (err) {
    console.error("GET /api/desktop/pet/events error:", err);
    res.status(500).json({ error: "Failed to fetch desktop pet events" });
  }
});

router.post("/api/desktop/pet/actions", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const action = String(req.body?.action || "") as HamsterAction;
    if (!HAMSTER_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Invalid hamster action" });
    }

    const now = new Date();
    const before = await getOrCreatePetState(user.id, now);
    const applied = applyHamsterAction(before, action, now);
    const todayStart = new Date(`${dateKey(now)}T00:00:00.000Z`);
    const [{ count: alreadyAwardedToday }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(desktopPetEvents)
      .where(
        and(
          eq(desktopPetEvents.userId, user.id),
          eq(desktopPetEvents.action, action),
          gte(desktopPetEvents.createdAt, todayStart),
          sql`${desktopPetEvents.xpAmount} > 0`
        )
      );

    const xpAmount = alreadyAwardedToday > 0 ? 0 : applied.xpAmount;
    const next = {
      ...applied.next,
      xpEarned: applied.next.xpEarned - applied.xpAmount + xpAmount,
    };
    next.level = Math.max(1, Math.floor(next.xpEarned / 100) + 1);

    let xpEventId: number | null = null;
    let totalXp: number | null = null;
    if (xpAmount > 0) {
      const awarded = await awardXp({
        userId: user.id,
        amount: xpAmount,
        reason: "desktop_pet_care",
        metadata: {
          action,
          hamsterName: next.name,
          careStreak: next.careStreak,
          source: "wtf_desktop",
        },
      });
      xpEventId = awarded.eventId;
      totalXp = awarded.totalXp;
    }

    await persistPetState(user.id, next);
    const [event] = await db
      .insert(desktopPetEvents)
      .values({
        userId: user.id,
        action,
        statBefore: before,
        statAfter: next,
        xpAmount,
        xpEventId,
        metadata: safeObject(req.body?.metadata),
        createdAt: now,
      })
      .returning();

    res.json({ pet: next, event, xpAmount, totalXp });
  } catch (err) {
    console.error("POST /api/desktop/pet/actions error:", err);
    res.status(500).json({ error: "Failed to care for desktop pet" });
  }
});

export default router;
