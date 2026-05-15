import { Router } from "express";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { systemEventLogs } from "@shared/schema";
import { db } from "../db";
import { requirePermission } from "../auth/passport";
import { logSystemEvent } from "../lib/system-log";
import { boundedClientLogMetadata } from "../lib/client-log-metadata";
import { clientLogRateLimit } from "../lib/client-log-rate-limit";

const router = Router();

const SEVERITIES = new Set(["debug", "info", "warn", "error", "fatal"]);

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function parseSince(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clientSeverity(value: unknown) {
  const severity = boundedString(value, 16);
  return severity && SEVERITIES.has(severity) ? severity : "info";
}

router.post("/api/system/logs/client", clientLogRateLimit, (req, res) => {
  const user = req.user as { id?: number } | undefined;
  const event = logSystemEvent({
    source: "client",
    eventType: boundedString(req.body?.eventType, 120) || "client_event",
    severity: clientSeverity(req.body?.severity) as any,
    message: boundedString(req.body?.message, 2_000) || undefined,
    userId: user?.id ?? null,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: String(req.headers["user-agent"] || ""),
    metadata: {
      url: boundedString(req.body?.url, 2_000),
      metadata: boundedClientLogMetadata(req.body?.metadata),
    },
    error: req.body?.error ?? undefined,
  });
  res.json({ ok: true, eventId: event.eventId, requestId: event.requestId });
});

router.get(
  "/api/system/logs",
  requirePermission("manage_settings"),
  async (req, res) => {
    try {
      const filters = [];
      const severity = boundedString(req.query.severity, 16);
      const source = boundedString(req.query.source, 80);
      const eventType = boundedString(req.query.eventType, 120);
      const requestId = boundedString(req.query.requestId, 64);
      const since = parseSince(req.query.since);
      const q = boundedString(req.query.q, 200);

      if (severity) filters.push(eq(systemEventLogs.severity, severity));
      if (source) filters.push(eq(systemEventLogs.source, source));
      if (eventType) filters.push(eq(systemEventLogs.eventType, eventType));
      if (requestId) filters.push(eq(systemEventLogs.requestId, requestId));
      if (since) filters.push(gte(systemEventLogs.createdAt, since));
      if (q) {
        const like = `%${q}%`;
        filters.push(
          or(
            ilike(systemEventLogs.message, like),
            ilike(systemEventLogs.path, like),
            ilike(systemEventLogs.errorMessage, like),
            ilike(systemEventLogs.requestId, like),
            ilike(systemEventLogs.eventType, like),
            ilike(systemEventLogs.source, like)
          )
        );
      }

      let query = db.select().from(systemEventLogs).$dynamic();
      if (filters.length > 0) {
        query = query.where(and(...filters));
      }
      const rows = await query
        .orderBy(desc(systemEventLogs.createdAt))
        .limit(parseLimit(req.query.limit));

      res.json({ items: rows });
    } catch (err) {
      console.error("[system-logs] list failed:", err);
      res.status(500).json({ error: "Failed to load system logs" });
    }
  }
);

router.get(
  "/api/system/logs/summary",
  requirePermission("manage_settings"),
  async (req, res) => {
    try {
      const since = parseSince(req.query.since) ?? new Date(Date.now() - 60 * 60 * 1000);
      const bySeverity = await db
        .select({
          severity: systemEventLogs.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(systemEventLogs)
        .where(gte(systemEventLogs.createdAt, since))
        .groupBy(systemEventLogs.severity);

      const bySource = await db
        .select({
          source: systemEventLogs.source,
          count: sql<number>`count(*)::int`,
        })
        .from(systemEventLogs)
        .where(gte(systemEventLogs.createdAt, since))
        .groupBy(systemEventLogs.source);

      res.json({ since: since.toISOString(), bySeverity, bySource });
    } catch (err) {
      console.error("[system-logs] summary failed:", err);
      res.status(500).json({ error: "Failed to load system log summary" });
    }
  }
);

router.get(
  "/api/system/logs/request/:requestId",
  requirePermission("manage_settings"),
  async (req, res) => {
    try {
      const requestId = boundedString(req.params.requestId, 64);
      if (!requestId) return res.status(400).json({ error: "Invalid request id" });
      const rows = await db
        .select()
        .from(systemEventLogs)
        .where(eq(systemEventLogs.requestId, requestId))
        .orderBy(desc(systemEventLogs.createdAt))
        .limit(500);
      res.json({ items: rows });
    } catch (err) {
      console.error("[system-logs] request lookup failed:", err);
      res.status(500).json({ error: "Failed to load request logs" });
    }
  }
);

export default router;
