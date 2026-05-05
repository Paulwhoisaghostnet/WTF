import { Router } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { awardXp } from "../lib/xp";
import {
  recordDesktopWorldHeartbeat,
  submitDesktopWorldEscape,
  submitDesktopWorldToyEscape,
} from "../lib/desktop-world";
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
  createGeneratedHamsterState,
  deriveHamsterSnapshot,
  getHamsterColorScheme,
  HAMSTER_EMOTION_COUNT_KEYS,
  HAMSTER_ACTIONS,
  HAMSTER_HEALTH_COUNT_KEYS,
  normalizeHamsterGenetics,
  normalizeDesktopAppearance,
  normalizeIconLayout,
  resolveHamsterColorSchemeKey,
  serializeHamsterInteractionCounts,
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

function clampPetStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampPetCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(999, Math.floor(value)));
}

function clampPetLongCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function normalizeInteractionCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => [key, Math.max(0, Math.floor(Number(count)))])
  );
}

function rowToHamsterState(
  row: typeof desktopPetStates.$inferSelect | null | undefined
): HamsterState {
  if (!row) return { ...DEFAULT_HAMSTER_STATE };
  const interactionCounts = normalizeInteractionCounts(row.interactionCounts);
  return {
    name: row.name,
    genetics: normalizeHamsterGenetics(row.genetics),
    colorSchemeKey: resolveHamsterColorSchemeKey(row.colorSchemeKey, row.genetics),
    alive: row.alive,
    hunger: row.hunger,
    thirst: row.thirst,
    happiness: row.happiness,
    hygiene: row.hygiene,
    energy: row.energy,
    sick: Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.sick] ?? 0) > 0,
    sicknessRisk: clampPetStat(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.sicknessRisk] ?? 0)
    ),
    medicineDoses: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.medicineDoses] ?? 0)
    ),
    restDoses: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.restDoses] ?? 0)
    ),
    poopExposure: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.poopExposure] ?? 0)
    ),
    bondXp: clampPetLongCounter(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.bondXp] ?? 0)
    ),
    bondLevel: Math.max(
      1,
      Math.min(
        50,
        Math.floor(Math.sqrt(Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.bondXp] ?? 0) / 18)) + 1
      )
    ),
    happinessIndexScore: clampPetStat(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore] ?? row.happiness)
    ),
    happinessSampleCount: clampPetLongCounter(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.happinessSampleCount] ?? 0)
    ),
    trauma: clampPetStat(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.trauma] ?? 0)
    ),
    level: row.level,
    xpEarned: row.xpEarned,
    carePoints: row.carePoints,
    missedCareDays: row.missedCareDays,
    careStreak: row.careStreak,
    lastCareDate: row.lastCareDate ?? null,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    interactionCounts,
  };
}

function hamsterValues(userId: number, state: HamsterState) {
  const genetics = normalizeHamsterGenetics(state.genetics);
  return {
    userId,
    name: state.name,
    colorSchemeKey: resolveHamsterColorSchemeKey(state.colorSchemeKey, genetics),
    genetics,
    alive: state.alive,
    hunger: state.hunger,
    thirst: state.thirst,
    happiness: state.happiness,
    hygiene: state.hygiene,
    energy: state.energy,
    level: state.level,
    xpEarned: state.xpEarned,
    carePoints: state.carePoints,
    missedCareDays: state.missedCareDays,
    careStreak: state.careStreak,
    lastCareDate: state.lastCareDate,
    lastInteractionAt: state.lastInteractionAt
      ? new Date(state.lastInteractionAt)
      : null,
    interactionCounts: serializeHamsterInteractionCounts(state),
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
    const initial = createGeneratedHamsterState({
      seed: `founder:${userId}:${now.toISOString()}:${randomUUID()}`,
      now,
    });
    await persistPetState(userId, initial);
    await db.insert(desktopPetEvents).values({
      userId,
      action: "generated",
      statBefore: null,
      statAfter: initial,
      xpAmount: 0,
      metadata: {
        source: "founder_generation",
        geneticsVersion: initial.genetics.version,
        seed: initial.genetics.seed,
        rarityTier: initial.genetics.rarityTier,
        attributes: initial.genetics.attributes.map((attribute) => attribute.key),
      },
      createdAt: now,
    });
    return initial;
  }

  const persisted = rowToHamsterState(row);
  const snapshot = deriveHamsterSnapshot(persisted, now);
  if (
    snapshot.alive !== row.alive ||
    snapshot.hunger !== row.hunger ||
    snapshot.thirst !== row.thirst ||
    snapshot.happiness !== row.happiness ||
    snapshot.hygiene !== row.hygiene ||
    snapshot.energy !== row.energy ||
    snapshot.sick !== persisted.sick ||
    snapshot.sicknessRisk !== persisted.sicknessRisk ||
    snapshot.poopExposure !== persisted.poopExposure ||
    snapshot.medicineDoses !== persisted.medicineDoses ||
    snapshot.restDoses !== persisted.restDoses ||
    snapshot.bondXp !== persisted.bondXp ||
    snapshot.happinessIndexScore !== persisted.happinessIndexScore ||
    snapshot.happinessSampleCount !== persisted.happinessSampleCount ||
    snapshot.trauma !== persisted.trauma ||
    snapshot.missedCareDays !== row.missedCareDays
  ) {
    if (row.alive && !snapshot.alive) {
      await db.insert(desktopPetEvents).values({
        userId,
        action: "death",
        statBefore: persisted,
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

router.post("/api/desktop/world/heartbeat", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(recordDesktopWorldHeartbeat(user.id, req.body));
  } catch (err) {
    console.error("POST /api/desktop/world/heartbeat error:", err);
    res.status(500).json({ error: "Failed to update desktop world" });
  }
});

router.post("/api/desktop/world/escape", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(submitDesktopWorldEscape(user.id, req.body));
  } catch (err) {
    console.error("POST /api/desktop/world/escape error:", err);
    res.status(500).json({ error: "Failed to move through desktop world" });
  }
});

router.post("/api/desktop/world/toy-escape", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(submitDesktopWorldToyEscape(user.id, req.body));
  } catch (err) {
    console.error("POST /api/desktop/world/toy-escape error:", err);
    res.status(500).json({ error: "Failed to move desktop toy" });
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

router.patch("/api/desktop/pet", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const now = new Date();
    const before = await getOrCreatePetState(user.id, now);
    const body = safeObject(req.body);

    const next: HamsterState = {
      ...before,
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 40)
          : before.name,
      genetics: before.genetics,
      colorSchemeKey: resolveHamsterColorSchemeKey(
        getHamsterColorScheme(body.colorSchemeKey ?? before.colorSchemeKey).key,
        before.genetics
      ),
      lastInteractionAt: now.toISOString(),
    };

    await persistPetState(user.id, next);
    const [event] = await db
      .insert(desktopPetEvents)
      .values({
        userId: user.id,
        action: "customize",
        statBefore: before,
        statAfter: next,
        xpAmount: 0,
        metadata: {
          ...safeObject(body.metadata),
          surface: String(body.metadata && safeObject(body.metadata).surface || "desktop_pet"),
        },
        createdAt: now,
      })
      .returning();

    res.json({ pet: next, event });
  } catch (err) {
    console.error("PATCH /api/desktop/pet error:", err);
    res.status(500).json({ error: "Failed to update desktop pet" });
  }
});

router.post("/api/desktop/pet/actions", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const body = safeObject(req.body);
    const metadata = safeObject(body.metadata);
    const action = String(body.action || "") as HamsterAction;
    if (!HAMSTER_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Invalid hamster action" });
    }

    const now = new Date();
    const before = await getOrCreatePetState(user.id, now);
    const applied = applyHamsterAction(before, action, now);
    let actionNext = applied.next;
    let actionXpAmount = applied.xpAmount;
    const sleepQuality = String(metadata.sleepQuality || "");
    if (before.alive && action === "nap" && sleepQuality === "floor") {
      actionNext = {
        ...applied.next,
        energy: clampPetStat(before.energy + 12),
        hunger: clampPetStat(before.hunger - 2),
        thirst: clampPetStat(before.thirst - 2),
      };
      actionXpAmount = 0;
    } else if (before.alive && action === "nap" && sleepQuality === "pillow") {
      actionNext = {
        ...applied.next,
        energy: clampPetStat(Math.max(applied.next.energy, before.energy + 45)),
      };
    }
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

    const xpAmount = alreadyAwardedToday > 0 ? 0 : actionXpAmount;
    const next = {
      ...actionNext,
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
        metadata,
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
