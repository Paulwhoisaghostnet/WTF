import { sql } from "drizzle-orm";
import { db } from "../../db";
import { gameSurfaceAliasSql } from "./surfaces";

export type ConsoleCategoryStat = {
  category: string;
  games: number;
  plays: number;
};

export type ConsoleStatsDTO = {
  totalGames: number;
  publishedGames: number;
  pendingGames: number;
  sourceArcadeGames: number;
  creatorGames: number;
  gameStudioGames: number;
  totalPlays: number;
  totalPlayers: number;
  totalScores: number;
  totalConsoleXp: number;
  openReports: number;
  latestSourceArcadeImportAt: string | null;
  latestConsoleActivityAt: string | null;
  topCategories: ConsoleCategoryStat[];
};

export async function getConsoleStats(): Promise<ConsoleStatsDTO> {
  const summaryRows = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_games,
      COUNT(*) FILTER (
        WHERE cg.active = true AND cg.is_public = true AND cg.status = 'active'
      )::int AS published_games,
      COUNT(*) FILTER (WHERE cg.status = 'pending')::int AS pending_games,
      0::int AS source_arcade_games,
      0::int AS creator_games,
      COALESCE(SUM(cg.play_count), 0)::int AS total_plays,
      COALESCE(SUM(cg.player_count), 0)::int AS total_players,
      (
        SELECT COUNT(DISTINCT cgv.game_id)::int
        FROM console_game_versions cgv
        INNER JOIN console_games version_games ON version_games.id = cgv.game_id
        WHERE cgv.bundle_metadata->>'source' = 'game_studio_project'
          AND ${gameSurfaceAliasSql("console", "version_games")}
      ) AS game_studio_games,
      (
        SELECT COUNT(*)::int
        FROM console_scores cs
        INNER JOIN console_games score_games ON score_games.id = cs.game_id
        WHERE cs.valid = true
          AND ${gameSurfaceAliasSql("console", "score_games")}
      ) AS total_scores,
      (
        SELECT COALESCE(SUM(xe.amount), 0)::int
        FROM xp_events xe
        INNER JOIN console_games xp_games ON xp_games.id::text = xe.metadata->>'gameId'
        WHERE xe.metadata->>'source' = 'console'
          AND ${gameSurfaceAliasSql("console", "xp_games")}
      ) AS total_console_xp,
      (
        SELECT COUNT(*)::int
        FROM console_game_reports cgr
        INNER JOIN console_games report_games ON report_games.id = cgr.game_id
        WHERE cgr.status = 'open'
          AND ${gameSurfaceAliasSql("console", "report_games")}
      ) AS open_reports,
      NULL::timestamp AS latest_source_arcade_import_at,
      GREATEST(
        COALESCE((
          SELECT MAX(cs.submitted_at)
          FROM console_scores cs
          INNER JOIN console_games score_games ON score_games.id = cs.game_id
          WHERE ${gameSurfaceAliasSql("console", "score_games")}
        ), 'epoch'::timestamp),
        COALESCE((
          SELECT MAX(cae.created_at)
          FROM console_audit_events cae
          INNER JOIN console_games audit_games ON audit_games.id = cae.game_id
          WHERE ${gameSurfaceAliasSql("console", "audit_games")}
        ), 'epoch'::timestamp),
        COALESCE(MAX(cg.updated_at), 'epoch'::timestamp)
      ) AS latest_console_activity_at
    FROM console_games cg
    WHERE ${gameSurfaceAliasSql("console", "cg")}
  `);
  const row = (((summaryRows as any).rows ?? []) as any[])[0] || {};

  const categoryRows = await db.execute(sql`
    SELECT
      COALESCE(NULLIF(TRIM(cg.category), ''), 'general') AS category,
      COUNT(*)::int AS games,
      COALESCE(SUM(cg.play_count), 0)::int AS plays
    FROM console_games cg
    WHERE cg.active = true
      AND cg.is_public = true
      AND cg.status = 'active'
      AND ${gameSurfaceAliasSql("console", "cg")}
    GROUP BY COALESCE(NULLIF(TRIM(cg.category), ''), 'general')
    ORDER BY games DESC, plays DESC, category ASC
    LIMIT 6
  `);

  return {
    totalGames: Number(row.total_games || 0),
    publishedGames: Number(row.published_games || 0),
    pendingGames: Number(row.pending_games || 0),
    sourceArcadeGames: Number(row.source_arcade_games || 0),
    creatorGames: Number(row.creator_games || 0),
    gameStudioGames: Number(row.game_studio_games || 0),
    totalPlays: Number(row.total_plays || 0),
    totalPlayers: Number(row.total_players || 0),
    totalScores: Number(row.total_scores || 0),
    totalConsoleXp: Number(row.total_console_xp || 0),
    openReports: Number(row.open_reports || 0),
    latestSourceArcadeImportAt: toIsoOrNull(row.latest_source_arcade_import_at),
    latestConsoleActivityAt: toIsoOrNull(row.latest_console_activity_at, true),
    topCategories: (((categoryRows as any).rows ?? []) as any[]).map((entry) => ({
      category: String(entry.category || "general"),
      games: Number(entry.games || 0),
      plays: Number(entry.plays || 0),
    })),
  };
}

function toIsoOrNull(value: unknown, nullEpoch = false): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  if (nullEpoch && date.getTime() === 0) return null;
  return date.toISOString();
}
