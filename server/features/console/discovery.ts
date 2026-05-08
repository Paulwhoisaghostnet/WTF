import { and, asc, desc, eq, sql } from "drizzle-orm";
import { consoleGameVersions, consoleGames } from "@shared/schema";
import { db } from "../../db";
import { getConsoleSourceAttribution } from "./attribution";
import type {
  ConsoleDiscoveryShelfItem,
  ConsoleDiscoveryShelves,
} from "./types";
import { gameSurfaceSql, type GameSurface } from "./surfaces";
import {
  arcadeSourceStorageModeSql,
  nonArcadeSourceStorageModeSql,
} from "../arcade/source-constants";

const studioSourceExists = sql<boolean>`EXISTS (
  SELECT 1
  FROM ${consoleGameVersions}
  WHERE ${consoleGameVersions.gameId} = ${consoleGames.id}
    AND ${consoleGameVersions.bundleMetadata}->>'source' = 'game_studio_project'
)`;

const discoveryColumns = {
  id: consoleGames.id,
  slug: consoleGames.slug,
  title: consoleGames.title,
  description: consoleGames.description,
  category: consoleGames.category,
  coverUri: consoleGames.coverUri,
  builderName: consoleGames.builderName,
  sourceUrl: consoleGames.sourceUrl,
  storageMode: consoleGames.storageMode,
  playCount: consoleGames.playCount,
  playerCount: consoleGames.playerCount,
  updatedAt: consoleGames.updatedAt,
  isGameStudio: studioSourceExists,
};

type DiscoveryRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  coverUri: string | null;
  builderName: string | null;
  sourceUrl: string | null;
  storageMode: string | null;
  playCount: number;
  playerCount: number;
  updatedAt: Date;
  isGameStudio: boolean;
};

export async function getConsoleDiscoveryShelves(
  limit = 8,
  options: { surface?: GameSurface } = {}
): Promise<ConsoleDiscoveryShelves> {
  const safeLimit = normalizeDiscoveryLimit(limit);
  const surface = options.surface ?? "any";
  const [popular, newest, sourceArcadeRows, creator, studio] = await Promise.all([
    db
      .select(discoveryColumns)
      .from(consoleGames)
      .where(publicConsoleGameWhere(surface))
      .orderBy(desc(consoleGames.playCount), desc(consoleGames.playerCount), asc(consoleGames.title))
      .limit(safeLimit),
    db
      .select(discoveryColumns)
      .from(consoleGames)
      .where(publicConsoleGameWhere(surface))
      .orderBy(desc(consoleGames.updatedAt), asc(consoleGames.title))
      .limit(safeLimit),
    db
      .select(discoveryColumns)
      .from(consoleGames)
      .where(and(publicConsoleGameWhere(surface), arcadeSourceStorageModeSql(consoleGames.storageMode)))
      .orderBy(desc(consoleGames.updatedAt), asc(consoleGames.title))
      .limit(safeLimit),
    db
      .select(discoveryColumns)
      .from(consoleGames)
      .where(
        and(
          publicConsoleGameWhere(surface),
          nonArcadeSourceStorageModeSql(consoleGames.storageMode),
          sql`(${consoleGames.createdBy} IS NOT NULL OR ${consoleGames.builderUserId} IS NOT NULL)`
        )
      )
      .orderBy(desc(consoleGames.updatedAt), asc(consoleGames.title))
      .limit(safeLimit),
    db
      .select(discoveryColumns)
      .from(consoleGames)
      .where(and(publicConsoleGameWhere(surface), studioSourceExists))
      .orderBy(desc(consoleGames.updatedAt), asc(consoleGames.title))
      .limit(safeLimit),
  ]);

  const sourceArcade = sourceArcadeRows.map(rowToDiscoveryShelfItem);
  return {
    popular: popular.map(rowToDiscoveryShelfItem),
    newest: newest.map(rowToDiscoveryShelfItem),
    sourceArcade,
    creator: creator.map(rowToDiscoveryShelfItem),
    studio: studio.map(rowToDiscoveryShelfItem),
  };
}

function publicConsoleGameWhere(surface: GameSurface = "any") {
  return and(
    eq(consoleGames.active, true),
    eq(consoleGames.isPublic, true),
    eq(consoleGames.status, "active"),
    gameSurfaceSql(surface)
  );
}

function rowToDiscoveryShelfItem(row: DiscoveryRow): ConsoleDiscoveryShelfItem {
  const attribution = getConsoleSourceAttribution(row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category || "general",
    coverUri: row.coverUri ?? null,
    builderName: row.builderName ?? null,
    sourceUrl: attribution.sourceUrl,
    sourceLabel: attribution.sourceLabel,
    licenseName: attribution.licenseName,
    playCount: Number(row.playCount || 0),
    playerCount: Number(row.playerCount || 0),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeDiscoveryLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}
