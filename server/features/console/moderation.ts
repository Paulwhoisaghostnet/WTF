import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  consoleAuditEvents,
  consoleGameReports,
  consoleGames,
  consoleScores,
} from "@shared/schema";
import type { ConsoleAuthUser } from "./types";

const REPORT_CATEGORIES = new Set([
  "broken",
  "unsafe",
  "stolen",
  "spam",
  "score-abuse",
  "other",
]);

const ACTIVE_REPORT_STATUSES = ["open", "reviewing"];

export type ConsoleGameReportDTO = {
  id: number;
  gameId: number;
  slug: string;
  title: string;
  builderName: string | null;
  reporterUserId: number | null;
  reporterUsername: string | null;
  reporterDisplayName: string | null;
  category: string;
  reason: string;
  status: string;
  priorityScore: number;
  sameCategoryOpenCount: number;
  totalOpenCount: number;
  invalidScoreSignals: number;
  resolvedBy: number | null;
  resolverUsername: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export function normalizeConsoleReportCategory(value: unknown): string {
  const category = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return REPORT_CATEGORIES.has(category) ? category : "other";
}

export function normalizeConsoleReportReason(value: unknown): string {
  const reason = String(value || "").trim().replace(/\s+/g, " ").slice(0, 1200);
  if (reason.length < 8) {
    throw new Error("Report reason must be at least 8 characters.");
  }
  return reason;
}

export async function reportConsoleGame(input: {
  user: ConsoleAuthUser;
  slug: string;
  category?: unknown;
  reason?: unknown;
  userAgent?: string;
  ip?: string;
}) {
  const slug = String(input.slug || "").trim();
  if (!slug) throw new Error("Missing console game slug.");
  const [game] = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        eq(consoleGames.slug, slug),
        eq(consoleGames.isPublic, true),
        eq(consoleGames.active, true),
        eq(consoleGames.status, "active")
      )
    )
    .limit(1);
  if (!game) throw new Error("Console game not found or not reportable.");

  const category = normalizeConsoleReportCategory(input.category);
  const reason = normalizeConsoleReportReason(input.reason);
  const [existing] = await db
    .select()
    .from(consoleGameReports)
    .where(
      and(
        eq(consoleGameReports.gameId, game.id),
        eq(consoleGameReports.reporterUserId, input.user.id),
        eq(consoleGameReports.category, category),
        inArray(consoleGameReports.status, ACTIVE_REPORT_STATUSES)
      )
    )
    .orderBy(desc(consoleGameReports.createdAt))
    .limit(1);
  if (existing) {
    throw new Error("You already have an open report for this game and category.");
  }

  const now = new Date();
  const [report] = await db
    .insert(consoleGameReports)
    .values({
      gameId: game.id,
      reporterUserId: input.user.id,
      category,
      reason,
      status: "open",
      payloadJson: {
        gameSlug: game.slug,
        userAgent: input.userAgent || null,
        ip: input.ip || null,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(consoleAuditEvents).values({
    gameId: game.id,
    actorUserId: input.user.id,
    action: "report_opened",
    reason,
    payloadJson: {
      reportId: report.id,
      category,
      gameSlug: game.slug,
    },
  });

  return {
    ok: true,
    report: {
      id: report.id,
      slug: game.slug,
      category: report.category,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    },
  };
}

export async function listConsoleGameReports(options: {
  status?: string;
  limit?: number;
} = {}): Promise<ConsoleGameReportDTO[]> {
  const status = normalizeReportStatusFilter(options.status);
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const where =
    status === "all"
      ? sql`true`
      : sql`r.status = ${status}`;
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.game_id,
      r.reporter_user_id,
      r.category,
      r.reason,
      r.status,
      r.resolved_by,
      r.resolution_note,
      r.created_at,
      r.updated_at,
      r.resolved_at,
      g.slug,
      g.title,
      g.builder_name,
      reporter.username AS reporter_username,
      reporter.display_name AS reporter_display_name,
      resolver.username AS resolver_username,
      COALESCE(report_counts.same_category_open_count, 0) AS same_category_open_count,
      COALESCE(report_counts.total_open_count, 0) AS total_open_count,
      COALESCE(score_signals.invalid_score_signals, 0) AS invalid_score_signals,
      CASE
        WHEN r.status IN ('open', 'reviewing') THEN
          CASE r.category
            WHEN 'unsafe' THEN 50
            WHEN 'stolen' THEN 45
            WHEN 'score-abuse' THEN 40
            WHEN 'broken' THEN 25
            WHEN 'spam' THEN 15
            ELSE 10
          END
          + LEAST(30, COALESCE(report_counts.same_category_open_count, 0) * 5)
          + LEAST(25, COALESCE(report_counts.total_open_count, 0) * 3)
          + LEAST(30, COALESCE(score_signals.invalid_score_signals, 0) * 4)
        ELSE 0
      END AS priority_score
    FROM console_game_reports r
    INNER JOIN console_games g ON g.id = r.game_id
    LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
    LEFT JOIN users resolver ON resolver.id = r.resolved_by
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE same.category = r.category
            AND same.status IN ('open', 'reviewing')
        )::int AS same_category_open_count,
        COUNT(*) FILTER (
          WHERE same.status IN ('open', 'reviewing')
        )::int AS total_open_count
      FROM console_game_reports same
      WHERE same.game_id = r.game_id
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS invalid_score_signals
      FROM ${consoleScores} s
      WHERE s.game_id = r.game_id
        AND s.valid = false
        AND s.submitted_at >= NOW() - INTERVAL '24 hours'
    ) score_signals ON true
    WHERE ${where}
    ORDER BY priority_score DESC, r.created_at DESC
    LIMIT ${limit}
  `);

  return (((rows as any).rows ?? []) as any[]).map(rowToReportDto);
}

export async function moderateConsoleGameReport(input: {
  actorUserId: number;
  id: number;
  action: "review" | "resolve" | "dismiss" | "reopen";
  note?: unknown;
}) {
  const [existing] = await db
    .select()
    .from(consoleGameReports)
    .where(eq(consoleGameReports.id, input.id))
    .limit(1);
  if (!existing) throw new Error("Console game report not found.");

  const now = new Date();
  const note = String(input.note || "").trim().slice(0, 1000) || null;
  const nextStatus =
    input.action === "review"
      ? "reviewing"
      : input.action === "resolve"
        ? "resolved"
        : input.action === "dismiss"
          ? "dismissed"
          : "open";

  const [report] = await db
    .update(consoleGameReports)
    .set({
      status: nextStatus,
      resolvedBy:
        input.action === "resolve" || input.action === "dismiss"
          ? input.actorUserId
          : null,
      resolutionNote:
        input.action === "resolve" || input.action === "dismiss" ? note : null,
      resolvedAt:
        input.action === "resolve" || input.action === "dismiss" ? now : null,
      updatedAt: now,
    })
    .where(eq(consoleGameReports.id, existing.id))
    .returning();

  await db.insert(consoleAuditEvents).values({
    gameId: existing.gameId,
    actorUserId: input.actorUserId,
    action: `report_${input.action}`,
    reason: note,
    payloadJson: {
      reportId: existing.id,
      previousStatus: existing.status,
      nextStatus,
    },
  });

  return {
    ok: true,
    report: {
      id: report.id,
      status: report.status,
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
    },
  };
}

function normalizeReportStatusFilter(value: unknown): string {
  const status = String(value || "open").trim().toLowerCase();
  return ["open", "reviewing", "resolved", "dismissed", "all"].includes(status)
    ? status
    : "open";
}

function rowToReportDto(row: any): ConsoleGameReportDTO {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    slug: String(row.slug),
    title: String(row.title),
    builderName: row.builder_name ? String(row.builder_name) : null,
    reporterUserId: row.reporter_user_id == null ? null : Number(row.reporter_user_id),
    reporterUsername: row.reporter_username ? String(row.reporter_username) : null,
    reporterDisplayName: row.reporter_display_name
      ? String(row.reporter_display_name)
      : null,
    category: String(row.category || "other"),
    reason: String(row.reason || ""),
    status: String(row.status || "open"),
    priorityScore: Number(row.priority_score || 0),
    sameCategoryOpenCount: Number(row.same_category_open_count || 0),
    totalOpenCount: Number(row.total_open_count || 0),
    invalidScoreSignals: Number(row.invalid_score_signals || 0),
    resolvedBy: row.resolved_by == null ? null : Number(row.resolved_by),
    resolverUsername: row.resolver_username ? String(row.resolver_username) : null,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
  };
}
