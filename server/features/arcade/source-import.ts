import { eq, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  consoleAuditEvents,
  consoleGameVersions,
  consoleGames,
} from "@shared/schema";
import { slugifyConsoleGame } from "../console/catalog";
import type { JobResult } from "../../lib/scheduler";
import {
  ARCADE_SOURCE_CHECK_ACTION,
  ARCADE_SOURCE_IMPORT_ACTION,
  ARCADE_SOURCE_STORAGE_MODE,
  ARCADE_SOURCE_UPDATE_ACTION,
} from "./source-constants";

const DEFAULT_ARCADE_SOURCE_API_BASE = "https://hacktez.com/api/v1/arcade";
const DEFAULT_ARCADE_SOURCE_PUBLIC_BASE = "https://hacktez.com";
const ARCADE_SOURCE_PROXY_PREFIX = "/api/arcade/source";
const ARCADE_SOURCE_IMPORT_LIMIT = Math.max(
  1,
  Math.min(200, Number(process.env.ARCADE_SOURCE_IMPORT_LIMIT || process.env.HACKCADE_IMPORT_LIMIT || 100))
);

export const ARCADE_SOURCE_IMPORT_JOB_NAME = "arcade-source-import";
export function resolveArcadeSourceImportIntervalMs(
  env: Partial<NodeJS.ProcessEnv> = process.env
): number {
  return Math.max(
    60 * 60 * 1000,
    Number(
      env.ARCADE_SOURCE_IMPORT_INTERVAL_MS ||
        env.HACKCADE_IMPORT_INTERVAL_MS ||
        12 * 60 * 60 * 1000
    )
  );
}
export const ARCADE_SOURCE_IMPORT_INTERVAL_MS = resolveArcadeSourceImportIntervalMs();

type ArcadeSourceBuilder = {
  domain?: string;
  label?: string;
  address?: string;
};

type ArcadeSourceGame = {
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  builder?: ArcadeSourceBuilder;
  ipfsCid?: string;
  coverKey?: string | null;
  version?: number;
  playCount?: number;
  playerCount?: number;
  createdAt?: string;
  updatedAt?: string;
  sourceUrl?: string | null;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
  status?: string;
};

type ArcadeSourceImportCandidate = {
  remote: ArcadeSourceGame;
  localSlug: string;
  legacySlug: string;
  title: string;
  description: string;
  category: string;
  embedPath: string;
  sourceUrl: string;
  coverUri: string | null;
  version: number;
  builderName: string | null;
  builderAddress: string | null;
  maxPossibleScore: number | null;
  maxScorePerSecond: number | null;
  remotePlayCount: number;
  remotePlayerCount: number;
};

export async function runArcadeSourceImport(): Promise<JobResult> {
  if (
    String(
      process.env.ARCADE_SOURCE_IMPORT_DISABLED ||
        process.env.HACKCADE_IMPORT_DISABLED ||
        ""
    ).trim() === "1"
  ) {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "disabled" } };
  }

  const games = await fetchArcadeSourceGames();
  const candidates = games.map(toArcadeSourceImportCandidate).filter(Boolean) as ArcadeSourceImportCandidate[];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const imported: Array<{ slug: string; action: "inserted" | "updated" | "skipped" }> = [];

  for (const candidate of candidates) {
    const result = await upsertArcadeSourceGame(candidate);
    if (result === "inserted") inserted += 1;
    else if (result === "updated") updated += 1;
    else skipped += 1;
    imported.push({ slug: candidate.localSlug, action: result });
  }

  const cursorAfter = {
    inserted,
    updated,
    skipped,
    imported,
    source: arcadeSourceApiUrl("/games"),
  };
  await auditArcadeSourceImportCheck(candidates.length, cursorAfter);

  return {
    itemsIn: candidates.length,
    itemsOut: inserted + updated,
    cursorAfter,
  };
}

export async function fetchArcadeSourceGames(): Promise<ArcadeSourceGame[]> {
  const listUrl = arcadeSourceApiUrl(`/games?limit=${ARCADE_SOURCE_IMPORT_LIMIT}`);
  const list = await fetchJson<{ games?: ArcadeSourceGame[] }>(listUrl);
  const games = Array.isArray(list.games) ? list.games : [];

  // Detail responses include score caps and sourceUrl when present.
  const detailed: ArcadeSourceGame[] = [];
  for (const game of games) {
    const slug = String(game.slug || "").trim();
    if (!slug) continue;
    try {
      const detail = await fetchJson<{ game?: ArcadeSourceGame }>(
        arcadeSourceApiUrl(`/games/${encodeURIComponent(slug)}`)
      );
      detailed.push({ ...game, ...(detail.game || {}) });
    } catch {
      detailed.push(game);
    }
  }
  return detailed;
}

export function toArcadeSourceImportCandidate(
  remote: ArcadeSourceGame
): ArcadeSourceImportCandidate | null {
  const remoteSlug = String(remote.slug || "").trim();
  const storageKey = normalizeArcadeSourceStorageKey(remote.ipfsCid);
  if (!remoteSlug || !storageKey) return null;

  const slugBase = slugifyConsoleGame(remoteSlug);
  const localSlug = `arcade-${slugBase}`;
  const legacySlug = `hackcade-${slugBase}`;
  const title = String(remote.title || remoteSlug).trim().slice(0, 200);
  const category = String(remote.category || "wtf-arcade")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 80) || "wtf-arcade";
  const version = normalizePositiveInt(remote.version, 1);
  const coverKey = normalizeArcadeSourceStorageKey(remote.coverKey || "");
  const builderName =
    String(remote.builder?.domain || remote.builder?.label || "").trim() || null;
  const builderAddress = String(remote.builder?.address || "").trim() || null;

  return {
    remote,
    localSlug,
    legacySlug,
    title,
    description: String(remote.description || "").trim().slice(0, 1000),
    category,
    embedPath: `${ARCADE_SOURCE_PROXY_PREFIX}/${storageKey}/index.html?wtfGameSlug=${encodeURIComponent(localSlug)}&sourceSlug=${encodeURIComponent(remoteSlug)}`,
    sourceUrl: `${arcadeSourcePublicBase()}/arcade-files/${storageKey}/index.html`,
    coverUri: coverKey ? `${ARCADE_SOURCE_PROXY_PREFIX}/${coverKey}` : null,
    version,
    builderName,
    builderAddress,
    maxPossibleScore: normalizeNullableNonNegative(remote.maxPossibleScore),
    maxScorePerSecond: normalizeNullableNonNegative(remote.maxScorePerSecond),
    remotePlayCount: normalizePositiveInt(remote.playCount, 0),
    remotePlayerCount: normalizePositiveInt(remote.playerCount, 0),
  };
}

export function normalizeArcadeSourceStorageKey(value: unknown): string {
  const key = String(value || "").trim().replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return "";
  }
  return key;
}

export function arcadeSourcePublicBase(): string {
  return String(
    process.env.ARCADE_SOURCE_PUBLIC_BASE ||
      process.env.HACKCADE_PUBLIC_BASE ||
      DEFAULT_ARCADE_SOURCE_PUBLIC_BASE
  ).replace(/\/+$/, "");
}

function arcadeSourceApiBase(): string {
  return String(
    process.env.ARCADE_SOURCE_API_BASE ||
      process.env.HACKCADE_API_BASE ||
      DEFAULT_ARCADE_SOURCE_API_BASE
  ).replace(/\/+$/, "");
}

function arcadeSourceApiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${arcadeSourceApiBase()}${suffix}`;
}

async function upsertArcadeSourceGame(
  candidate: ArcadeSourceImportCandidate
): Promise<"inserted" | "updated" | "skipped"> {
  const [existing] = await db
    .select()
    .from(consoleGames)
    .where(
      or(
        eq(consoleGames.slug, candidate.localSlug),
        eq(consoleGames.slug, candidate.legacySlug)
      )
    )
    .limit(1);

  if (!existing) {
    const now = new Date();
    const [game] = await db
      .insert(consoleGames)
      .values({
        slug: candidate.localSlug,
        title: candidate.title,
        description: candidate.description,
        category: candidate.category,
        embedPath: candidate.embedPath,
        coverUri: candidate.coverUri,
        sourceUrl: candidate.sourceUrl,
        builderName: candidate.builderName,
        builderAddress: candidate.builderAddress,
        status: "active",
        active: true,
        isPublic: true,
        storageMode: ARCADE_SOURCE_STORAGE_MODE,
        sdkVersion: "arcade-source-compat-v1",
        bundleVersion: candidate.version,
        playCount: candidate.remotePlayCount,
        playerCount: candidate.remotePlayerCount,
        maxPossibleScore: candidate.maxPossibleScore,
        maxScorePerSecond: candidate.maxScorePerSecond,
        submittedAt: parseDateOr(candidate.remote.createdAt, now),
        approvedAt: now,
        updatedAt: parseDateOr(candidate.remote.updatedAt, now),
      })
      .returning();

    await recordArcadeSourceVersion(game.id, candidate, "active");
    await auditArcadeSourceImport(game.id, null, candidate, ARCADE_SOURCE_IMPORT_ACTION);
    return "inserted";
  }

  const changed =
    existing.embedPath !== candidate.embedPath ||
    existing.slug !== candidate.localSlug ||
    existing.sourceUrl !== candidate.sourceUrl ||
    existing.coverUri !== candidate.coverUri ||
    existing.title !== candidate.title ||
    existing.description !== candidate.description ||
    existing.category !== candidate.category ||
    existing.bundleVersion !== candidate.version ||
    existing.maxPossibleScore !== candidate.maxPossibleScore ||
    existing.maxScorePerSecond !== candidate.maxScorePerSecond ||
    existing.status !== "active" ||
    existing.active !== true;

  if (!changed) {
    await db
      .update(consoleGames)
      .set({
        playCount: sql`GREATEST(${consoleGames.playCount}, ${candidate.remotePlayCount})`,
        playerCount: sql`GREATEST(${consoleGames.playerCount}, ${candidate.remotePlayerCount})`,
        updatedAt: new Date(),
      })
      .where(eq(consoleGames.id, existing.id));
    return "skipped";
  }

  await db
    .update(consoleGames)
    .set({
      slug: candidate.localSlug,
      title: candidate.title,
      description: candidate.description,
      category: candidate.category,
      embedPath: candidate.embedPath,
      coverUri: candidate.coverUri,
      sourceUrl: candidate.sourceUrl,
      builderName: candidate.builderName,
      builderAddress: candidate.builderAddress,
      status: "active",
      active: true,
      isPublic: true,
      storageMode: ARCADE_SOURCE_STORAGE_MODE,
      sdkVersion: "arcade-source-compat-v1",
      bundleVersion: candidate.version,
      playCount: sql`GREATEST(${consoleGames.playCount}, ${candidate.remotePlayCount})`,
      playerCount: sql`GREATEST(${consoleGames.playerCount}, ${candidate.remotePlayerCount})`,
      maxPossibleScore: candidate.maxPossibleScore,
      maxScorePerSecond: candidate.maxScorePerSecond,
      updatedAt: new Date(),
    })
    .where(eq(consoleGames.id, existing.id));

  await recordArcadeSourceVersion(existing.id, candidate, "active");
  await auditArcadeSourceImport(existing.id, existing.sourceUrl, candidate, ARCADE_SOURCE_UPDATE_ACTION);
  return "updated";
}

async function recordArcadeSourceVersion(
  gameId: number,
  candidate: ArcadeSourceImportCandidate,
  status: string
) {
  await db
    .insert(consoleGameVersions)
    .values({
      gameId,
      version: candidate.version,
      artifactUri: candidate.embedPath,
      sourceUrl: candidate.sourceUrl,
      coverUri: candidate.coverUri,
      sdkVersion: "arcade-source-compat-v1",
      status,
      bundleMetadata: arcadeSourceBundleMetadata(candidate),
      reviewedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [consoleGameVersions.gameId, consoleGameVersions.version],
      set: {
        artifactUri: candidate.embedPath,
        sourceUrl: candidate.sourceUrl,
        coverUri: candidate.coverUri,
        status,
        bundleMetadata: arcadeSourceBundleMetadata(candidate),
        reviewedAt: new Date(),
      },
    });
}

async function auditArcadeSourceImport(
  gameId: number,
  previousSourceUrl: string | null,
  candidate: ArcadeSourceImportCandidate,
  action: string
) {
  await db.insert(consoleAuditEvents).values({
    gameId,
    actorUserId: null,
    action,
    reason: "Automated twice-daily WTF Arcade compatible-source ingest",
    payloadJson: {
      previousSourceUrl,
      remote: candidate.remote,
      localSlug: candidate.localSlug,
      sourceUrl: candidate.sourceUrl,
      embedPath: candidate.embedPath,
      attribution: arcadeSourceAttributionMetadata(candidate),
    },
  });
}

async function auditArcadeSourceImportCheck(
  itemsIn: number,
  summary: {
    inserted: number;
    updated: number;
    skipped: number;
    imported: Array<{ slug: string; action: "inserted" | "updated" | "skipped" }>;
    source: string;
  }
) {
  await db.insert(consoleAuditEvents).values({
    gameId: null,
    actorUserId: null,
    action: ARCADE_SOURCE_CHECK_ACTION,
    reason: "Automated twice-daily WTF Arcade compatible-source check",
    payloadJson: {
      surface: "arcade",
      itemsIn,
      itemsOut: summary.inserted + summary.updated,
      inserted: summary.inserted,
      updated: summary.updated,
      skipped: summary.skipped,
      imported: summary.imported,
      source: summary.source,
    },
  });
}

function arcadeSourceBundleMetadata(candidate: ArcadeSourceImportCandidate) {
  return {
    source: "source_arcade",
    attribution: arcadeSourceAttributionMetadata(candidate),
    remoteSlug: candidate.remote.slug,
    remoteIpfsCid: candidate.remote.ipfsCid,
    remoteCoverKey: candidate.remote.coverKey ?? null,
    remoteVersion: candidate.version,
    remoteUpdatedAt: candidate.remote.updatedAt ?? null,
    builder: candidate.remote.builder ?? null,
  };
}

function arcadeSourceAttributionMetadata(candidate: ArcadeSourceImportCandidate) {
  return {
    sourcePlatform: "Built on hack.tez",
    sourceUrl: candidate.sourceUrl,
    sourceApi: arcadeSourceApiUrl(`/games/${encodeURIComponent(String(candidate.remote.slug || ""))}`),
    license: "MIT",
    builderName: candidate.builderName,
    builderAddress: candidate.builderAddress,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WTF-Arcade-Source-Importer/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`WTF Arcade source API returned ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function parseDateOr(value: unknown, fallback: Date): Date {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeNullableNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
