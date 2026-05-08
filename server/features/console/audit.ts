import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { consoleAuditEvents, consoleGames, users } from "@shared/schema";
import { gameSurfaceSql, type GameSurface } from "./surfaces";

export type ConsoleAuditEventDTO = {
  id: number;
  gameId: number | null;
  slug: string | null;
  title: string | null;
  actorUserId: number | null;
  actorUsername: string | null;
  action: string;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function listConsoleAuditEvents(options: {
  limit?: number;
  action?: string;
  gameSlug?: string;
  surface?: GameSurface;
} = {}): Promise<ConsoleAuditEventDTO[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const action = String(options.action || "").trim().slice(0, 80);
  const gameSlug = String(options.gameSlug || "").trim().slice(0, 160);
  const filters: SQL[] = [];
  if (options.surface) filters.push(auditSurfaceSql(options.surface));
  if (action) filters.push(eq(consoleAuditEvents.action, action));
  if (gameSlug) filters.push(eq(consoleGames.slug, gameSlug));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: consoleAuditEvents.id,
      gameId: consoleAuditEvents.gameId,
      slug: consoleGames.slug,
      title: consoleGames.title,
      actorUserId: consoleAuditEvents.actorUserId,
      actorUsername: users.username,
      action: consoleAuditEvents.action,
      reason: consoleAuditEvents.reason,
      payloadJson: consoleAuditEvents.payloadJson,
      createdAt: consoleAuditEvents.createdAt,
    })
    .from(consoleAuditEvents)
    .leftJoin(consoleGames, eq(consoleGames.id, consoleAuditEvents.gameId))
    .leftJoin(users, eq(users.id, consoleAuditEvents.actorUserId))
    .where(where)
    .orderBy(desc(consoleAuditEvents.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    gameId: row.gameId ?? null,
    slug: row.slug ?? null,
    title: row.title ?? null,
    actorUserId: row.actorUserId ?? null,
    actorUsername: row.actorUsername ?? null,
    action: row.action,
    reason: row.reason ?? null,
    payload:
      row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
        ? (row.payloadJson as Record<string, unknown>)
        : {},
    createdAt: row.createdAt.toISOString(),
  }));
}

function auditSurfaceSql(surface: GameSurface) {
  if (surface === "any") return sql`true`;
  return sql`(
    ${gameSurfaceSql(surface)}
    OR (
      ${consoleAuditEvents.gameId} IS NULL
      AND ${consoleAuditEvents.payloadJson}->>'surface' = ${surface}
    )
  )`;
}
