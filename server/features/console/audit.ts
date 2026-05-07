import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { consoleAuditEvents, consoleGames, users } from "@shared/schema";

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
} = {}): Promise<ConsoleAuditEventDTO[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const action = String(options.action || "").trim().slice(0, 80);
  const gameSlug = String(options.gameSlug || "").trim().slice(0, 160);
  const where =
    action && gameSlug
      ? sql`${consoleAuditEvents.action} = ${action} AND ${consoleGames.slug} = ${gameSlug}`
      : action
        ? eq(consoleAuditEvents.action, action)
        : gameSlug
          ? eq(consoleGames.slug, gameSlug)
          : undefined;

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
