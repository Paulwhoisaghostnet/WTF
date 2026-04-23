/**
 * Phase 4 — Attendance + Discord mirror routes.
 *
 * Incoming voice/stage/space presence from the Discord bot and in-app
 * heartbeats land here, plus the handful of endpoints the bot polls to know
 * which events to create, cancel, or role-sync against.
 *
 *   POST /api/attendance/voice-state     (HMAC, bot)
 *     bot-posted voice state transitions (join/leave/heartbeat)
 *   POST /api/attendance/in-app          (auth or HMAC)
 *     in-app heartbeats from the WTF desktop (e.g. X Space viewer)
 *   GET  /api/attendance/mine            (auth)
 *     caller's recent attendance rollup, used by the gameshow profile tab
 *   GET  /api/attendance/event/:id       (auth, cohost+)
 *     audit trail for a given gameshow event
 *
 *   GET  /api/discord/mirrors/upcoming   (HMAC, bot)
 *     approved events in the near-future window that the bot should mirror
 *     as Discord scheduled events
 *   PATCH /api/discord/mirrors/:eventId  (HMAC, bot)
 *     store the Discord scheduled-event id back on a gameshow_event
 *   POST /api/discord/role-sync/pull     (HMAC, bot)
 *     authoritative roster the bot should reconcile against (active
 *     contestants + cohost+ staff) with their Discord user ids
 */

import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attendanceEvents,
  gameshowEvents,
  seasonContestants,
  users,
} from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { hasAtLeastRole } from "@shared/types";
import { verifyWtfWebhookSignature } from "../lib/webhook-hmac";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const voiceStateSchema = z.object({
  discordUserId: z.string().min(1).max(100),
  discordGuildId: z.string().min(1).max(100),
  discordChannelId: z.string().min(1).max(100).optional().nullable(),
  state: z.enum(["join", "leave", "heartbeat"]),
  kind: z.enum(["discord_voice", "discord_stage"]).default("discord_voice"),
  discordScheduledEventId: z.string().min(1).max(100).optional().nullable(),
  observedAt: z.string().datetime().optional(),
  externalRef: z.string().max(200).optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

const inAppSchema = z.object({
  source: z.enum(["x_space", "in_app"]).default("in_app"),
  state: z.enum(["join", "leave", "heartbeat"]),
  eventId: z.number().int().optional(),
  externalRef: z.string().max(200).optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

const mirrorPatchSchema = z.object({
  discordScheduledEventId: z.string().max(100).nullable(),
  discordGuildId: z.string().max(100).nullable().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function findUserByDiscordId(discordUserId: string) {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
    })
    .from(users)
    .where(eq(users.discordId, discordUserId))
    .limit(1);
  return rows[0] ?? null;
}

async function resolveEventIdForDiscordScheduled(
  discordScheduledEventId: string | null | undefined
): Promise<number | null> {
  if (!discordScheduledEventId) return null;
  const rows = await db
    .select({ id: gameshowEvents.id })
    .from(gameshowEvents)
    .where(eq(gameshowEvents.discordScheduledEventId, discordScheduledEventId))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.post(
  "/api/attendance/voice-state",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (req, res) => {
    const parsed = voiceStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const data = parsed.data;

    const user = await findUserByDiscordId(data.discordUserId);
    const eventId = await resolveEventIdForDiscordScheduled(
      data.discordScheduledEventId ?? null
    );
    const observedAt = data.observedAt ? new Date(data.observedAt) : new Date();

    const [row] = await db
      .insert(attendanceEvents)
      .values({
        userId: user?.id ?? null,
        eventId,
        source: data.kind,
        state: data.state,
        discordUserId: data.discordUserId,
        discordGuildId: data.discordGuildId,
        discordChannelId: data.discordChannelId ?? null,
        externalRef: data.externalRef ?? null,
        payloadJson: (data.payload ?? {}) as any,
        observedAt,
      } as any)
      .returning();

    return res.json({
      ok: true,
      attendanceEventId: row?.id ?? null,
      matchedUserId: user?.id ?? null,
      matchedEventId: eventId,
    });
  }
);

router.post("/api/attendance/in-app", async (req, res) => {
  // Allow HMAC-signed bot calls OR authenticated browser sessions.
  const sig = req.headers["x-wtf-signature"];
  if (sig) {
    return verifyWtfWebhookSignature({
      secretEnv: "WTF_BOT_WEBHOOK_SECRET",
      optional: false,
    })(req as any, res as any, async () => {
      await handleInApp(req, res, null);
    });
  }
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "unauthenticated" });
  }
  await handleInApp(req, res, (req.user as any)?.id ?? null);
});

async function handleInApp(
  req: import("express").Request,
  res: import("express").Response,
  authedUserId: number | null
) {
  const parsed = inAppSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid_body", issues: parsed.error.issues });
  }
  const data = parsed.data;
  const [row] = await db
    .insert(attendanceEvents)
    .values({
      userId: authedUserId,
      eventId: data.eventId ?? null,
      source: data.source,
      state: data.state,
      externalRef: data.externalRef ?? null,
      payloadJson: (data.payload ?? {}) as any,
      observedAt: new Date(),
    } as any)
    .returning();
  return res.json({ ok: true, attendanceEventId: row?.id ?? null });
}

router.get("/api/attendance/mine", isAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id as number | undefined;
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const rows = await db
    .select()
    .from(attendanceEvents)
    .where(eq(attendanceEvents.userId, userId))
    .orderBy(desc(attendanceEvents.observedAt))
    .limit(200);
  return res.json({ events: rows });
});

router.get(
  "/api/attendance/event/:id",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    const eventId = parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ error: "bad_event_id" });
    }
    const rows = await db
      .select({
        id: attendanceEvents.id,
        userId: attendanceEvents.userId,
        username: users.username,
        displayName: users.displayName,
        source: attendanceEvents.source,
        state: attendanceEvents.state,
        discordUserId: attendanceEvents.discordUserId,
        discordGuildId: attendanceEvents.discordGuildId,
        discordChannelId: attendanceEvents.discordChannelId,
        externalRef: attendanceEvents.externalRef,
        payloadJson: attendanceEvents.payloadJson,
        observedAt: attendanceEvents.observedAt,
      })
      .from(attendanceEvents)
      .leftJoin(users, eq(users.id, attendanceEvents.userId))
      .where(eq(attendanceEvents.eventId, eventId))
      .orderBy(desc(attendanceEvents.observedAt))
      .limit(1000);
    return res.json({ eventId, events: rows });
  }
);

// ── Discord mirror control plane ──────────────────────────────────────────

router.get(
  "/api/discord/mirrors/upcoming",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (_req, res) => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: gameshowEvents.id,
        kind: gameshowEvents.kind,
        title: gameshowEvents.title,
        description: gameshowEvents.description,
        startsAt: gameshowEvents.startsAt,
        endsAt: gameshowEvents.endsAt,
        visibility: gameshowEvents.visibility,
        status: gameshowEvents.status,
        linksJson: gameshowEvents.linksJson,
        discordScheduledEventId: gameshowEvents.discordScheduledEventId,
        discordGuildId: gameshowEvents.discordGuildId,
      })
      .from(gameshowEvents)
      .where(
        and(
          gte(gameshowEvents.startsAt, now),
          lte(gameshowEvents.startsAt, horizon),
          or(
            eq(gameshowEvents.status, "published"),
            eq(gameshowEvents.status, "cancelled")
          )
        )
      )
      .orderBy(gameshowEvents.startsAt)
      .limit(200);
    return res.json({ now: now.toISOString(), events: rows });
  }
);

router.patch(
  "/api/discord/mirrors/:eventId",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (req, res) => {
    const eventId = parseInt(String(req.params.eventId ?? ""), 10);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ error: "bad_event_id" });
    }
    const parsed = mirrorPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const { discordScheduledEventId, discordGuildId } = parsed.data;
    const sets: Record<string, unknown> = {
      discordScheduledEventId,
      updatedAt: new Date(),
    };
    if (typeof discordGuildId !== "undefined") {
      sets.discordGuildId = discordGuildId;
    }
    const [row] = await db
      .update(gameshowEvents)
      .set(sets as any)
      .where(eq(gameshowEvents.id, eventId))
      .returning();
    return res.json({ ok: true, event: row });
  }
);

router.post(
  "/api/discord/role-sync/pull",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (_req, res) => {
    // Active contestants
    const contestants = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        discordId: users.discordId,
        role: users.role,
        contestantStatus: seasonContestants.status,
        seasonId: seasonContestants.seasonId,
      })
      .from(users)
      .innerJoin(seasonContestants, eq(seasonContestants.userId, users.id))
      .where(
        and(
          isNotNull(users.discordId),
          eq(seasonContestants.status, "active")
        )
      )
      .limit(500);

    // Cohost+ staff
    const staff = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        discordId: users.discordId,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.discordId),
          or(
            eq(users.role, "cohost"),
            eq(users.role, "host"),
            eq(users.role, "admin"),
            eq(users.role, "resident_wizard")
          )
        )
      )
      .limit(200);

    return res.json({
      generatedAt: new Date().toISOString(),
      contestants: contestants.map((c) => ({
        userId: c.userId,
        username: c.username,
        displayName: c.displayName,
        discordId: c.discordId,
        status: c.contestantStatus,
        seasonId: c.seasonId,
      })),
      staff: staff
        .filter((s) => hasAtLeastRole(s.role, "cohost"))
        .map((s) => ({
          userId: s.userId,
          username: s.username,
          displayName: s.displayName,
          discordId: s.discordId,
          role: s.role,
        })),
    });
  }
);

export { router as attendanceRoutes };
