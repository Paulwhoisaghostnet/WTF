import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { consoleGames } from "@shared/schema";
import {
  listPublishedConsoleCartridges,
  submitConsoleGameFromBundle,
  submitConsoleGameFromMedia,
  type ConsoleBundleSubmitInput,
  type ConsoleSubmitInput,
} from "../console/catalog";
import { getDemoCartridges } from "../console/manifest";
import {
  arcadeGameSql,
  gameSurfaceAliasSql,
  isArcadeCartridge,
  isConsoleStockSlug,
} from "../console/surfaces";
import type { ConsoleAuthUser, ConsoleCartridge } from "../console/types";
import { getArcadePaymentConfig } from "./payment";
import {
  arcadeSourceAuditActionSql,
  arcadeSourceStorageModeSql,
  nonArcadeSourceStorageModeSql,
} from "./source-constants";
import type { ArcadeCatalog } from "./types";

export async function listArcadeCartridges(limit = 100): Promise<ConsoleCartridge[]> {
  const [published, installed] = await Promise.all([
    listPublishedConsoleCartridges(Math.max(1, Math.min(200, limit)), {
      excludeConsoleStock: true,
    }),
    Promise.resolve(getDemoCartridges().filter(isArcadeCartridge)),
  ]);

  const seen = new Set<string>();
  return [...published, ...installed].filter((cart) => {
    const key = cart.isPublished ? `published:${cart.slug}` : `${cart.tokenContract}:${cart.tokenId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listArcadeCatalog(limit = 100): Promise<ArcadeCatalog> {
  const games = await listArcadeCartridges(limit);
  return {
    demos: [],
    published: games,
    mine: [],
    all: games,
    payment: await getArcadePaymentConfig(),
  };
}

export async function getArcadeCartridgeBySlug(slug: string): Promise<ConsoleCartridge | null> {
  const normalized = String(slug || "").trim();
  if (!normalized || isConsoleStockSlug(normalized)) return null;
  const catalog = await listArcadeCatalog(200);
  return catalog.all.find((cart) => cart.slug === normalized || cart.tokenId === normalized) ?? null;
}

export async function getDbBackedArcadeGameBySlug(slug: string) {
  const normalized = String(slug || "").trim();
  if (!normalized || isConsoleStockSlug(normalized)) return null;
  const [game] = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        eq(consoleGames.slug, normalized),
        eq(consoleGames.active, true),
        eq(consoleGames.status, "active"),
        eq(consoleGames.isPublic, true),
        arcadeGameSql()
      )
    )
    .limit(1);
  return game ?? null;
}

export async function getArcadeStats() {
  const catalog = await listArcadeCatalog(200);
  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int AS live_games,
      COUNT(*) FILTER (WHERE ${arcadeSourceStorageModeSql(sql`cg.storage_mode`)})::int AS source_games,
      COUNT(*) FILTER (
        WHERE ${nonArcadeSourceStorageModeSql(sql`cg.storage_mode`)}
          AND (cg.created_by IS NOT NULL OR cg.builder_user_id IS NOT NULL)
      )::int AS creator_games,
      COALESCE(SUM(cg.play_count), 0)::int AS total_plays,
      COALESCE(SUM(cg.player_count), 0)::int AS total_players,
      (
        SELECT COUNT(*)::int
        FROM console_scores cs
        INNER JOIN console_games score_games ON score_games.id = cs.game_id
        WHERE cs.valid = true
          AND ${gameSurfaceAliasSql("arcade", "score_games")}
      ) AS total_scores,
      (
        SELECT MAX(cae.created_at)
        FROM console_audit_events cae
        WHERE ${arcadeSourceAuditActionSql(sql`cae.action`)}
      ) AS latest_source_import_at
    FROM console_games cg
    WHERE cg.active = true
      AND cg.is_public = true
      AND cg.status = 'active'
      AND ${gameSurfaceAliasSql("arcade", "cg")}
  `);
  const row = (((rows as any).rows ?? []) as any[])[0] || {};
  return {
    totalGames: catalog.all.length,
    publishedGames: catalog.all.length,
    pendingGames: 0,
    sourceArcadeGames: Number(row.source_games || 0),
    creatorGames: Number(row.creator_games || 0),
    gameStudioGames: 0,
    totalPlays: Number(row.total_plays || 0),
    totalPlayers: Number(row.total_players || 0),
    totalScores: Number(row.total_scores || 0),
    totalConsoleXp: 0,
    openReports: 0,
    latestSourceArcadeImportAt: row.latest_source_import_at
      ? new Date(row.latest_source_import_at).toISOString()
      : null,
    latestConsoleActivityAt: null,
    topCategories: categoryStats(catalog.all),
    payment: await getArcadePaymentConfig(),
  };
}

function categoryStats(games: ConsoleCartridge[]) {
  const map = new Map<string, { category: string; games: number; plays: number }>();
  for (const game of games) {
    const category = String(game.category || "general").trim().toLowerCase() || "general";
    const current = map.get(category) || { category, games: 0, plays: 0 };
    current.games += 1;
    current.plays += Number(game.playCount || 0);
    map.set(category, current);
  }
  return Array.from(map.values())
    .sort((a, b) => b.games - a.games || b.plays - a.plays || a.category.localeCompare(b.category))
    .slice(0, 6);
}

export async function submitArcadeGameFromMedia(
  user: ConsoleAuthUser,
  input: ConsoleSubmitInput
) {
  return submitConsoleGameFromMedia(user, input);
}

export type ArcadeBundleSubmitInput = ConsoleBundleSubmitInput;

export async function submitArcadeGameFromBundle(
  user: ConsoleAuthUser,
  input: ArcadeBundleSubmitInput
) {
  return submitConsoleGameFromBundle(user, input);
}

export async function listUserSubmittedArcadeGames(userId: number) {
  const rows = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        eq(consoleGames.builderUserId, userId),
        arcadeGameSql()
      )
    )
    .orderBy(desc(consoleGames.updatedAt))
    .limit(100);
  return rows.map((game) => ({
    id: game.id,
    slug: game.slug,
    title: game.title,
    status: game.status,
    active: game.active,
  }));
}
