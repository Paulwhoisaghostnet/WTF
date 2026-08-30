/**
 * Phase 3 — Calendar + tickets routes.
 *
 *   POST /api/calendar/tickets                   contestant+ submit event request
 *   GET  /api/calendar/tickets/mine              caller's own tickets
 *   GET  /api/calendar/tickets/queue             cohost+ review queue
 *   POST /api/calendar/tickets/:id/decide        cohost+ approve / reject / request-changes
 *   GET  /api/calendar/events                    JSON events in a window
 *   POST /api/calendar/events                    cohost+ create a manual event
 *   PATCH /api/calendar/events/:id               cohost+ edit / cancel a manual event
 *   POST /api/calendar/sync                      cohost+ force re-materialization
 *   GET  /api/calendar/feed.ics                  public iCal; visibility-gated
 */

import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db";
import {
  calendarParticipations,
  calendarTickets,
  gameshowEvents,
  users,
} from "@shared/schema";
import {
  isAuthenticated,
  requirePermission,
} from "../auth/passport";
import { hasAtLeastRole, type UserRole } from "@shared/types";
import { runCalendarMaterialization } from "../lib/calendar-sync";
import { loadTtcCalendarEvents } from "../lib/ttc-calendar";
import { ingestSystemEvent } from "../challenges/events/ingest";

const router = Router();

const submitTicketSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  kind: z
    .enum([
      "round_window",
      "challenge_window",
      "side_quest_window",
      "x_space",
      "discord_stage",
      "custom",
    ])
    .default("custom"),
  visibility: z
    .enum(["public", "contestants", "hosts"])
    .default("public"),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        url: z.string().url(),
      })
    )
    .max(8)
    .optional(),
});

router.post(
  "/api/calendar/tickets",
  isAuthenticated,
  async (req, res) => {
    try {
      const actor = req.user as { id: number; role: UserRole };
      if (!hasAtLeastRole(actor.role, "contestant")) {
        return res.status(403).json({
          error: "Contestant role or higher required to submit calendar events",
        });
      }

      const parsed = submitTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const [row] = await db
        .insert(calendarTickets)
        .values({
          submitterUserId: actor.id,
          payloadJson: parsed.data as Record<string, unknown>,
          status: "submitted",
        })
        .returning();

      res.status(201).json(row);
    } catch (err) {
      console.error("[calendar] submit ticket failed:", err);
      res.status(500).json({ error: "Failed to submit ticket" });
    }
  }
);

router.get(
  "/api/calendar/tickets/mine",
  isAuthenticated,
  async (req, res) => {
    try {
      const actor = req.user as { id: number };
      const rows = await db
        .select()
        .from(calendarTickets)
        .where(eq(calendarTickets.submitterUserId, actor.id))
        .orderBy(desc(calendarTickets.createdAt))
        .limit(200);
      res.json(rows);
    } catch (err) {
      console.error("[calendar] mine tickets failed:", err);
      res.status(500).json({ error: "Failed to load your tickets" });
    }
  }
);

const participationSchema = z.object({
  eventKey: z.string().min(1).max(500),
  sourceProvider: z.enum(["wtf", "ttc"]),
  sourceEventId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(300),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  status: z.enum(["interested", "going", "none"]),
  reminderEnabled: z.boolean().default(true),
});

router.get(
  "/api/calendar/participations/mine",
  isAuthenticated,
  async (req, res) => {
    try {
      const actor = req.user as { id: number };
      const remindersOnly = String(req.query.reminders ?? "0") === "1";
      const rows = await db
        .select()
        .from(calendarParticipations)
        .where(
          remindersOnly
            ? and(
                eq(calendarParticipations.userId, actor.id),
                eq(calendarParticipations.reminderEnabled, true)
              )
            : eq(calendarParticipations.userId, actor.id)
        )
        .orderBy(asc(calendarParticipations.startsAt));
      res.json(rows);
    } catch (err) {
      console.error("[calendar] participation list failed:", err);
      res.status(500).json({ error: "Failed to load your calendar plans" });
    }
  }
);

router.put(
  "/api/calendar/participations",
  isAuthenticated,
  async (req, res) => {
    try {
      const parsed = participationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Choose Interested or Going and provide a valid calendar event.",
          details: parsed.error.issues,
        });
      }

      const actor = req.user as { id: number; role: UserRole };
      const input = parsed.data;
      const existing = await db
        .select()
        .from(calendarParticipations)
        .where(
          and(
            eq(calendarParticipations.userId, actor.id),
            eq(calendarParticipations.eventKey, input.eventKey)
          )
        )
        .limit(1);

      if (input.status === "none") {
        if (existing[0]) {
          await db
            .delete(calendarParticipations)
            .where(eq(calendarParticipations.id, existing[0].id));
          await ingestSystemEvent({
            eventId: `calendar.participation.cleared:${existing[0].id}:${Date.now()}`,
            eventType: "calendar.participation.cleared",
            userId: actor.id,
            source: "calendar",
            sourceModule: "calendar-participation",
            rawRefType: "calendar_event",
            rawRefId: input.eventKey,
            metadata: { sourceProvider: input.sourceProvider },
          });
        }
        return res.json({ ok: true, participation: null });
      }

      let snapshot = {
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        allDay: input.allDay ?? false,
        sourceEventId: input.sourceEventId ?? null,
      };

      if (input.sourceProvider === "wtf") {
        if (!input.sourceEventId) {
          return res.status(400).json({ error: "WTF event id is required." });
        }
        const { allowed } = visibilityFilterForRole(actor.role);
        const [event] = await db
          .select()
          .from(gameshowEvents)
          .where(
            and(
              eq(gameshowEvents.id, input.sourceEventId),
              eq(gameshowEvents.status, "published"),
              inArray(gameshowEvents.visibility, allowed)
            )
          )
          .limit(1);
        if (!event) {
          return res.status(404).json({ error: "That WTF event is not available to your account." });
        }
        snapshot = {
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          sourceEventId: event.id,
        };
      }

      const now = new Date();
      const [participation] = await db
        .insert(calendarParticipations)
        .values({
          userId: actor.id,
          eventKey: input.eventKey,
          sourceProvider: input.sourceProvider,
          sourceEventId: snapshot.sourceEventId,
          title: snapshot.title,
          startsAt: snapshot.startsAt,
          endsAt: snapshot.endsAt,
          allDay: snapshot.allDay,
          status: input.status,
          reminderEnabled: input.reminderEnabled,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [calendarParticipations.userId, calendarParticipations.eventKey],
          set: {
            sourceProvider: input.sourceProvider,
            sourceEventId: snapshot.sourceEventId,
            title: snapshot.title,
            startsAt: snapshot.startsAt,
            endsAt: snapshot.endsAt,
            allDay: snapshot.allDay,
            status: input.status,
            reminderEnabled: input.reminderEnabled,
            updatedAt: now,
          },
        })
        .returning();

      await ingestSystemEvent({
        eventId: `calendar.participation.updated:${participation.id}:${now.toISOString()}`,
        eventType: "calendar.participation.updated",
        userId: actor.id,
        source: "calendar",
        sourceModule: "calendar-participation",
        rawRefType: "calendar_participation",
        rawRefId: participation.id,
        metadata: {
          eventKey: participation.eventKey,
          sourceProvider: participation.sourceProvider,
          status: participation.status,
          reminderEnabled: participation.reminderEnabled,
        },
      });
      res.json({ ok: true, participation });
    } catch (err) {
      console.error("[calendar] participation update failed:", err);
      res.status(500).json({ error: "Failed to save your calendar plan" });
    }
  }
);

router.get(
  "/api/calendar/tickets/queue",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const status = String(req.query.status ?? "submitted");
      const allowed = new Set([
        "submitted",
        "under_review",
        "changes_requested",
        "approved",
        "rejected",
        "cancelled",
      ]);
      const filter = allowed.has(status)
        ? (status as
            | "submitted"
            | "under_review"
            | "changes_requested"
            | "approved"
            | "rejected"
            | "cancelled")
        : "submitted";

      const rows = await db
        .select({
          id: calendarTickets.id,
          submitterUserId: calendarTickets.submitterUserId,
          submitterUsername: users.username,
          submitterDisplayName: users.displayName,
          payloadJson: calendarTickets.payloadJson,
          status: calendarTickets.status,
          reviewerUserId: calendarTickets.reviewerUserId,
          reviewReason: calendarTickets.reviewReason,
          decidedAt: calendarTickets.decidedAt,
          publishedEventId: calendarTickets.publishedEventId,
          createdAt: calendarTickets.createdAt,
          updatedAt: calendarTickets.updatedAt,
        })
        .from(calendarTickets)
        .leftJoin(users, eq(users.id, calendarTickets.submitterUserId))
        .where(eq(calendarTickets.status, filter))
        .orderBy(desc(calendarTickets.createdAt))
        .limit(200);

      res.json(rows);
    } catch (err) {
      console.error("[calendar] queue failed:", err);
      res.status(500).json({ error: "Failed to load ticket queue" });
    }
  }
);

const decideSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes", "cancel"]),
  reason: z.string().max(2000).optional(),
  // Operator edits before publish (optional — defaults from ticket payload):
  overrides: submitTicketSchema.partial().optional(),
});

router.post(
  "/api/calendar/tickets/:id/decide",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid ticket id" });
      }
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const actor = req.user as { id: number };

      const [ticket] = await db
        .select()
        .from(calendarTickets)
        .where(eq(calendarTickets.id, id));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const now = new Date();

      if (parsed.data.decision === "cancel") {
        const [updated] = await db
          .update(calendarTickets)
          .set({
            status: "cancelled",
            reviewerUserId: actor.id,
            reviewReason: parsed.data.reason ?? null,
            decidedAt: now,
            updatedAt: now,
          })
          .where(eq(calendarTickets.id, id))
          .returning();
        return res.json(updated);
      }

      if (parsed.data.decision === "request_changes") {
        const [updated] = await db
          .update(calendarTickets)
          .set({
            status: "changes_requested",
            reviewerUserId: actor.id,
            reviewReason: parsed.data.reason ?? null,
            decidedAt: now,
            updatedAt: now,
          })
          .where(eq(calendarTickets.id, id))
          .returning();
        return res.json(updated);
      }

      if (parsed.data.decision === "reject") {
        const [updated] = await db
          .update(calendarTickets)
          .set({
            status: "rejected",
            reviewerUserId: actor.id,
            reviewReason: parsed.data.reason ?? null,
            decidedAt: now,
            updatedAt: now,
          })
          .where(eq(calendarTickets.id, id))
          .returning();
        return res.json(updated);
      }

      // approve → publish a gameshow_events row
      const payload = {
        ...(ticket.payloadJson as z.infer<typeof submitTicketSchema>),
        ...(parsed.data.overrides ?? {}),
      };

      const startsAt = new Date(payload.startsAt);
      const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;
      if (!Number.isFinite(startsAt.getTime())) {
        return res.status(400).json({ error: "Invalid starts_at" });
      }

      const [event] = await db
        .insert(gameshowEvents)
        .values({
          kind: payload.kind,
          title: payload.title,
          description: payload.description ?? null,
          startsAt,
          endsAt,
          allDay: payload.allDay ?? false,
          sourceKind: "ticket",
          sourceId: ticket.id,
          visibility: payload.visibility,
          status: "published",
          linksJson: (payload.links ?? []) as unknown as Record<
            string,
            unknown
          >[],
          createdBy: ticket.submitterUserId,
          approvedBy: actor.id,
          approvedAt: now,
        })
        .returning();

      const [updated] = await db
        .update(calendarTickets)
        .set({
          status: "approved",
          reviewerUserId: actor.id,
          reviewReason: parsed.data.reason ?? null,
          decidedAt: now,
          publishedEventId: event.id,
          updatedAt: now,
        })
        .where(eq(calendarTickets.id, id))
        .returning();

      res.json({ ticket: updated, event });
    } catch (err) {
      console.error("[calendar] decide failed:", err);
      res.status(500).json({ error: "Failed to decide ticket" });
    }
  }
);

function visibilityFilterForRole(role: UserRole | null):
  | { allowed: ("public" | "contestants" | "hosts")[] } {
  if (!role) return { allowed: ["public"] };
  if (hasAtLeastRole(role, "cohost")) {
    return { allowed: ["public", "contestants", "hosts"] };
  }
  if (hasAtLeastRole(role, "contestant")) {
    return { allowed: ["public", "contestants"] };
  }
  return { allowed: ["public"] };
}

router.get("/api/calendar/events", async (req, res) => {
  try {
    const role = ((req.user as { role?: UserRole } | undefined)?.role ?? null) as
      | UserRole
      | null;
    const { allowed } = visibilityFilterForRole(role);

    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      return res.status(400).json({ error: "Invalid from/to" });
    }
    const includeExternal = String(req.query.includeExternal ?? "1") !== "0";

    const rows = await db
      .select({
        event: gameshowEvents,
        creatorUsername: users.username,
        creatorDisplayName: users.displayName,
      })
      .from(gameshowEvents)
      .leftJoin(users, eq(users.id, gameshowEvents.createdBy))
      .where(
        and(
          inArray(gameshowEvents.visibility, allowed),
          eq(gameshowEvents.status, "published"),
          gte(gameshowEvents.startsAt, from),
          lte(gameshowEvents.startsAt, to)
        )
      )
      .orderBy(gameshowEvents.startsAt);

    const wtfRows = rows.map((row) => ({
      ...row.event,
      sourceProvider: "wtf" as const,
      sourceRank: 10,
      location: null,
      categories: [row.event.kind],
      imageUrl: null,
      externalId: `wtf:${row.event.id}`,
      sourceUrl: null,
      creatorName:
        row.creatorDisplayName || row.creatorUsername || "WTF staff",
      creatorUrl: row.creatorUsername
        ? `/user/${encodeURIComponent(row.creatorUsername)}`
        : null,
    }));
    const ttcRows = includeExternal
      ? await loadTtcCalendarEvents(from, to)
      : [];

    const ranked = [...wtfRows, ...ttcRows].sort((a, b) => {
      const timeDelta =
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (timeDelta !== 0) return timeDelta;
      return (b.sourceRank ?? 0) - (a.sourceRank ?? 0);
    });
    const seen = new Set<string>();
    const merged = ranked.filter((event) => {
      const key = `${event.title.trim().toLowerCase()}|${new Date(
        event.startsAt
      ).toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(merged);
  } catch (err) {
    console.error("[calendar] events failed:", err);
    res.status(500).json({ error: "Failed to load events" });
  }
});

const manualEventSchema = submitTicketSchema.extend({
  status: z.enum(["draft", "published", "cancelled"]).optional(),
});

router.post(
  "/api/calendar/events",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const parsed = manualEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const actor = req.user as { id: number };
      const now = new Date();

      const [event] = await db
        .insert(gameshowEvents)
        .values({
          kind: parsed.data.kind,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          startsAt: new Date(parsed.data.startsAt),
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
          allDay: parsed.data.allDay ?? false,
          sourceKind: "manual",
          sourceId: null,
          visibility: parsed.data.visibility,
          status: parsed.data.status ?? "published",
          linksJson: (parsed.data.links ?? []) as unknown as Record<
            string,
            unknown
          >[],
          createdBy: actor.id,
          approvedBy: actor.id,
          approvedAt: now,
        })
        .returning();

      res.status(201).json(event);
    } catch (err) {
      console.error("[calendar] create event failed:", err);
      res.status(500).json({ error: "Failed to create event" });
    }
  }
);

const patchEventSchema = manualEventSchema.partial();

router.patch(
  "/api/calendar/events/:id",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid event id" });
      }
      const parsed = patchEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const patch: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (parsed.data.title !== undefined) patch.title = parsed.data.title;
      if (parsed.data.description !== undefined)
        patch.description = parsed.data.description ?? null;
      if (parsed.data.startsAt !== undefined)
        patch.startsAt = new Date(parsed.data.startsAt);
      if (parsed.data.endsAt !== undefined)
        patch.endsAt = parsed.data.endsAt
          ? new Date(parsed.data.endsAt)
          : null;
      if (parsed.data.allDay !== undefined) patch.allDay = parsed.data.allDay;
      if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
      if (parsed.data.visibility !== undefined)
        patch.visibility = parsed.data.visibility;
      if (parsed.data.status !== undefined) patch.status = parsed.data.status;
      if (parsed.data.links !== undefined)
        patch.linksJson = parsed.data.links;

      const [updated] = await db
        .update(gameshowEvents)
        .set(patch)
        .where(eq(gameshowEvents.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("[calendar] patch event failed:", err);
      res.status(500).json({ error: "Failed to update event" });
    }
  }
);

router.post(
  "/api/calendar/sync",
  requirePermission("manage_gameshow"),
  async (_req, res) => {
    try {
      const stats = await runCalendarMaterialization();
      res.json(stats);
    } catch (err) {
      console.error("[calendar] sync failed:", err);
      res.status(500).json({ error: "Failed to sync calendar" });
    }
  }
);

// ── iCal feed ────────────────────────────────────────────────────────────

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}Z`
  );
}

router.get("/api/calendar/feed.ics", async (req, res) => {
  try {
    const role = ((req.user as { role?: UserRole } | undefined)?.role ?? null) as
      | UserRole
      | null;
    const { allowed } = visibilityFilterForRole(role);

    const rows = await db
      .select()
      .from(gameshowEvents)
      .where(
        and(
          inArray(gameshowEvents.visibility, allowed),
          eq(gameshowEvents.status, "published")
        )
      )
      .orderBy(gameshowEvents.startsAt);

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//WTF Gameshow//Calendar//EN");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");
    lines.push(`X-WR-CALNAME:WTF Gameshow Calendar`);

    for (const e of rows) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:wtf-${e.id}@wtfgameshow.app`);
      lines.push(`DTSTAMP:${icsDate(new Date())}`);
      lines.push(`DTSTART:${icsDate(e.startsAt)}`);
      lines.push(
        `DTEND:${icsDate(e.endsAt ?? new Date(e.startsAt.getTime() + 30 * 60 * 1000))}`
      );
      lines.push(`SUMMARY:${icsEscape(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
      lines.push(`STATUS:CONFIRMED`);
      lines.push(`CATEGORIES:${e.kind.toUpperCase()}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="wtf-gameshow.ics"'
    );
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(lines.join("\r\n") + "\r\n");
  } catch (err) {
    console.error("[calendar] ics failed:", err);
    res.status(500).json({ error: "Failed to build feed" });
  }
});

export default router;
