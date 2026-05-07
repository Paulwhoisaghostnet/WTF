import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  consoleAuditEvents,
  consoleGameVersions,
  consoleGames,
} from "@shared/schema";
import { slugifyConsoleGame } from "./catalog";
import type { JobResult } from "../../lib/scheduler";

const DEFAULT_HACKCADE_API_BASE = "https://hacktez.com/api/v1/arcade";
const DEFAULT_HACKCADE_PUBLIC_BASE = "https://hacktez.com";
const HACKCADE_PROXY_PREFIX = "/api/console/hackcade";
const HACKCADE_IMPORT_LIMIT = Math.max(
  1,
  Math.min(200, Number(process.env.HACKCADE_IMPORT_LIMIT || 100))
);

export const HACKCADE_IMPORT_JOB_NAME = "console-hackcade-import";
export const HACKCADE_IMPORT_INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.HACKCADE_IMPORT_INTERVAL_MS || 12 * 60 * 60 * 1000)
);

type HackcadeBuilder = {
  domain?: string;
  label?: string;
  address?: string;
};

type HackcadeGame = {
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  builder?: HackcadeBuilder;
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

type HackcadeImportCandidate = {
  remote: HackcadeGame;
  localSlug: string;
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

export async function runHackcadeImport(): Promise<JobResult> {
  if (String(process.env.HACKCADE_IMPORT_DISABLED || "").trim() === "1") {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "disabled" } };
  }

  const games = await fetchHackcadeGames();
  const candidates = games.map(toHackcadeImportCandidate).filter(Boolean) as HackcadeImportCandidate[];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const imported: Array<{ slug: string; action: "inserted" | "updated" | "skipped" }> = [];

  for (const candidate of candidates) {
    const result = await upsertHackcadeGame(candidate);
    if (result === "inserted") inserted += 1;
    else if (result === "updated") updated += 1;
    else skipped += 1;
    imported.push({ slug: candidate.localSlug, action: result });
  }

  return {
    itemsIn: candidates.length,
    itemsOut: inserted + updated,
    cursorAfter: {
      inserted,
      updated,
      skipped,
      imported,
      source: hackcadeApiUrl("/games"),
    },
  };
}

export async function fetchHackcadeGames(): Promise<HackcadeGame[]> {
  const listUrl = hackcadeApiUrl(`/games?limit=${HACKCADE_IMPORT_LIMIT}`);
  const list = await fetchJson<{ games?: HackcadeGame[] }>(listUrl);
  const games = Array.isArray(list.games) ? list.games : [];

  // Detail responses include score caps and sourceUrl when present.
  const detailed: HackcadeGame[] = [];
  for (const game of games) {
    const slug = String(game.slug || "").trim();
    if (!slug) continue;
    try {
      const detail = await fetchJson<{ game?: HackcadeGame }>(
        hackcadeApiUrl(`/games/${encodeURIComponent(slug)}`)
      );
      detailed.push({ ...game, ...(detail.game || {}) });
    } catch {
      detailed.push(game);
    }
  }
  return detailed;
}

export function toHackcadeImportCandidate(
  remote: HackcadeGame
): HackcadeImportCandidate | null {
  const remoteSlug = String(remote.slug || "").trim();
  const storageKey = normalizeHackcadeStorageKey(remote.ipfsCid);
  if (!remoteSlug || !storageKey) return null;

  const localSlug = `hackcade-${slugifyConsoleGame(remoteSlug)}`;
  const title = String(remote.title || remoteSlug).trim().slice(0, 200);
  const category = String(remote.category || "hackcade")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 80) || "hackcade";
  const version = normalizePositiveInt(remote.version, 1);
  const coverKey = normalizeHackcadeStorageKey(remote.coverKey || "");
  const builderName =
    String(remote.builder?.domain || remote.builder?.label || "").trim() || null;
  const builderAddress = String(remote.builder?.address || "").trim() || null;

  return {
    remote,
    localSlug,
    title,
    description: String(remote.description || "").trim().slice(0, 1000),
    category,
    embedPath: `${HACKCADE_PROXY_PREFIX}/${storageKey}/index.html?wtfGameSlug=${encodeURIComponent(localSlug)}&hackcadeSlug=${encodeURIComponent(remoteSlug)}`,
    sourceUrl: `${hackcadePublicBase()}/arcade-files/${storageKey}/index.html`,
    coverUri: coverKey ? `${HACKCADE_PROXY_PREFIX}/${coverKey}` : null,
    version,
    builderName,
    builderAddress,
    maxPossibleScore: normalizeNullableNonNegative(remote.maxPossibleScore),
    maxScorePerSecond: normalizeNullableNonNegative(remote.maxScorePerSecond),
    remotePlayCount: normalizePositiveInt(remote.playCount, 0),
    remotePlayerCount: normalizePositiveInt(remote.playerCount, 0),
  };
}

export function normalizeHackcadeStorageKey(value: unknown): string {
  const key = String(value || "").trim().replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return "";
  }
  return key;
}

export function hackcadePublicBase(): string {
  return String(process.env.HACKCADE_PUBLIC_BASE || DEFAULT_HACKCADE_PUBLIC_BASE).replace(/\/+$/, "");
}

function hackcadeApiBase(): string {
  return String(process.env.HACKCADE_API_BASE || DEFAULT_HACKCADE_API_BASE).replace(/\/+$/, "");
}

function hackcadeApiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${hackcadeApiBase()}${suffix}`;
}

async function upsertHackcadeGame(
  candidate: HackcadeImportCandidate
): Promise<"inserted" | "updated" | "skipped"> {
  const [existing] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.slug, candidate.localSlug))
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
        storageMode: "hackcade_proxy",
        sdkVersion: "hackcade-compat-v1",
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

    await recordHackcadeVersion(game.id, candidate, "active");
    await auditHackcadeImport(game.id, null, candidate, "hackcade_import");
    return "inserted";
  }

  const changed =
    existing.embedPath !== candidate.embedPath ||
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
      storageMode: "hackcade_proxy",
      sdkVersion: "hackcade-compat-v1",
      bundleVersion: candidate.version,
      playCount: sql`GREATEST(${consoleGames.playCount}, ${candidate.remotePlayCount})`,
      playerCount: sql`GREATEST(${consoleGames.playerCount}, ${candidate.remotePlayerCount})`,
      maxPossibleScore: candidate.maxPossibleScore,
      maxScorePerSecond: candidate.maxScorePerSecond,
      updatedAt: new Date(),
    })
    .where(eq(consoleGames.id, existing.id));

  await recordHackcadeVersion(existing.id, candidate, "active");
  await auditHackcadeImport(existing.id, existing.sourceUrl, candidate, "hackcade_update");
  return "updated";
}

async function recordHackcadeVersion(
  gameId: number,
  candidate: HackcadeImportCandidate,
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
      sdkVersion: "hackcade-compat-v1",
      status,
      bundleMetadata: hackcadeBundleMetadata(candidate),
      reviewedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [consoleGameVersions.gameId, consoleGameVersions.version],
      set: {
        artifactUri: candidate.embedPath,
        sourceUrl: candidate.sourceUrl,
        coverUri: candidate.coverUri,
        status,
        bundleMetadata: hackcadeBundleMetadata(candidate),
        reviewedAt: new Date(),
      },
    });
}

async function auditHackcadeImport(
  gameId: number,
  previousSourceUrl: string | null,
  candidate: HackcadeImportCandidate,
  action: string
) {
  await db.insert(consoleAuditEvents).values({
    gameId,
    actorUserId: null,
    action,
    reason: "Automated twice-daily Hackcade import",
    payloadJson: {
      previousSourceUrl,
      remote: candidate.remote,
      localSlug: candidate.localSlug,
      sourceUrl: candidate.sourceUrl,
      embedPath: candidate.embedPath,
      attribution: hackcadeAttributionMetadata(candidate),
    },
  });
}

function hackcadeBundleMetadata(candidate: HackcadeImportCandidate) {
  return {
    source: "hackcade",
    attribution: hackcadeAttributionMetadata(candidate),
    remoteSlug: candidate.remote.slug,
    remoteIpfsCid: candidate.remote.ipfsCid,
    remoteCoverKey: candidate.remote.coverKey ?? null,
    remoteVersion: candidate.version,
    remoteUpdatedAt: candidate.remote.updatedAt ?? null,
    builder: candidate.remote.builder ?? null,
  };
}

function hackcadeAttributionMetadata(candidate: HackcadeImportCandidate) {
  return {
    sourcePlatform: "Hackcade / hack.tez",
    sourceUrl: candidate.sourceUrl,
    sourceApi: hackcadeApiUrl(`/games/${encodeURIComponent(String(candidate.remote.slug || ""))}`),
    license: "MIT",
    builderName: candidate.builderName,
    builderAddress: candidate.builderAddress,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WTF-Console-Hackcade-Importer/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Hackcade API returned ${response.status} for ${url}`);
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
