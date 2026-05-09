import { promises as fs } from "node:fs";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { hasPermission } from "../../lib/permissions";
import {
  consoleAuditEvents,
  consoleGameVersions,
  consoleGames,
  tokenMetadata,
  userMediaLibrary,
  walletHoldings,
} from "@shared/schema";
import { resolveMediaFilePath } from "../../lib/storage/media-cache";
import { tokenIdentityKey } from "../../lib/tezos-identity";
import {
  extractConsoleBundleZip,
  isConsoleZipMime,
  validateConsoleBundleZip,
} from "./bundle-storage";
import { getConsoleSourceAttribution } from "./attribution";
import { getDemoCartridges } from "./manifest";
import {
  buildConsoleTokenProvenanceMap,
  type ConsoleProvenanceInput,
} from "./provenance";
import type {
  ConsoleAuthUser,
  ConsoleCartridge,
  ConsolePublishedGame,
} from "./types";
import type { UserRole } from "@shared/types";
import { awardConsoleCreatorXp } from "./liveops";
import {
  arcadeGameSql,
  consoleStockGameSql,
  gameSurfaceSql,
  isConsoleStockCartridge,
  type GameSurface,
} from "./surfaces";
import {
  isArcadeSourceStorageMode,
  normalizeArcadeSourcePublicPath,
} from "../arcade/source-constants";

const lastSeenConsole = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

export type ConsoleSubmitInput = {
  mediaId: number;
  updateSlug?: string;
  title?: string;
  description?: string;
  category?: string;
  coverUri?: string | null;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
};

export type ConsoleBundleSubmitInput = {
  zipBytes: Buffer;
  updateSlug?: string;
  title?: string;
  description?: string;
  category?: string;
  coverUri?: string | null;
  sourceUrl?: string | null;
  builderAddress?: string | null;
  bundleMetadata?: Record<string, unknown>;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
};

export type ConsoleModerationGame = ConsolePublishedGame & {
  sourceUrl: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  removedAt: string | null;
  moderationNote: string | null;
  storageMode: string | null;
  sdkVersion: string | null;
  bundleVersion: number;
  latestVersion: {
    id: number;
    version: number;
    artifactUri: string;
    sourceUrl: string | null;
    status: string;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    bundleMetadata: unknown;
  } | null;
};

function consoleCatalogDedupeKey(cart: ConsoleCartridge): string {
  if (isConsoleStockCartridge(cart)) return `stock:${cart.slug}`;
  return cart.isPublished ? `published:${cart.slug}` : `${cart.tokenContract}:${cart.tokenId}`;
}

export function dedupeConsoleCatalogCartridges(
  cartridges: ConsoleCartridge[]
): ConsoleCartridge[] {
  const seen = new Set<string>();
  return cartridges.filter((cart) => {
    const key = consoleCatalogDedupeKey(cart);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function slugifyConsoleGame(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "game";
}

export function isZipToken(meta: Record<string, any>, artifactUri: string): boolean {
  const rootMime = String(meta.mimeType || meta.mime_type || "")
    .trim()
    .toLowerCase();
  if (
    rootMime === "application/zip" ||
    rootMime === "application/x-zip-compressed" ||
    rootMime === "application/x-zip"
  ) {
    return true;
  }

  const formats = Array.isArray(meta.formats) ? meta.formats : [];
  for (const f of formats) {
    const fm = String(f.mimeType || f.mime_type || "")
      .trim()
      .toLowerCase();
    if (
      fm === "application/zip" ||
      fm === "application/x-zip-compressed" ||
      fm === "application/x-zip"
    ) {
      return true;
    }
  }

  return artifactUri.toLowerCase().endsWith(".zip");
}

function rowToPublishedGame(
  row: typeof consoleGames.$inferSelect,
  provenance: ConsolePublishedGame["provenance"] = null
): ConsolePublishedGame {
  const attribution = getConsoleSourceAttribution(row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    embedPath: normalizeArcadeSourcePublicPath(row.embedPath) ?? row.embedPath,
    coverUri: normalizeArcadeSourcePublicPath(row.coverUri) ?? null,
    builderName: row.builderName ?? null,
    sourceUrl: attribution.sourceUrl,
    sourceLabel: attribution.sourceLabel,
    licenseName: attribution.licenseName,
    provenance,
    status: row.status,
    active: row.active,
    playCount: row.playCount,
    playerCount: row.playerCount,
    arcadeCreditsRequired: row.arcadeCreditsRequired ?? true,
    arcadeCreditPrice: Math.max(0, Number(row.arcadeCreditPrice ?? 1)),
    userSubmitted: Boolean(row.builderUserId || row.createdBy),
    maxPossibleScore: row.maxPossibleScore ?? null,
    maxScorePerSecond: row.maxScorePerSecond ?? null,
  };
}

function rowToModerationGame(
  row: typeof consoleGames.$inferSelect,
  latestVersion: typeof consoleGameVersions.$inferSelect | null = null
): ConsoleModerationGame {
  return {
    ...rowToPublishedGame(row),
    sourceUrl: row.sourceUrl ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    removedAt: row.removedAt ? row.removedAt.toISOString() : null,
    moderationNote: row.moderationNote ?? null,
    storageMode: row.storageMode ?? null,
    sdkVersion: row.sdkVersion ?? null,
    bundleVersion: row.bundleVersion,
    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          artifactUri:
            normalizeArcadeSourcePublicPath(latestVersion.artifactUri) ??
            latestVersion.artifactUri,
          sourceUrl: latestVersion.sourceUrl ?? null,
          status: latestVersion.status,
          reviewNote: latestVersion.reviewNote ?? null,
          createdAt: latestVersion.createdAt.toISOString(),
          reviewedAt: latestVersion.reviewedAt
            ? latestVersion.reviewedAt.toISOString()
            : null,
          bundleMetadata: latestVersion.bundleMetadata,
        }
      : null,
  };
}

function publishedGameToCartridge(
  row: typeof consoleGames.$inferSelect,
  provenance: ConsoleCartridge["provenance"] = null
): ConsoleCartridge {
  const attribution = getConsoleSourceAttribution(row);
  return {
    id: `published-${row.slug}`,
    slug: row.slug,
    title: row.title,
    description: row.description,
    mimeType: row.embedPath.endsWith(".zip") ? "application/zip" : "text/html",
    thumbnailUri: normalizeArcadeSourcePublicPath(row.coverUri) ?? null,
    artifactUri: normalizeArcadeSourcePublicPath(row.embedPath) ?? row.embedPath,
    tokenContract: "console",
    tokenId: row.slug,
    isDemo: false,
    isPublished: true,
    category: row.category,
    builderName: row.builderName,
    sourceUrl: attribution.sourceUrl,
    sourceLabel: attribution.sourceLabel,
    licenseName: attribution.licenseName,
    provenance,
    status: row.status,
    playCount: row.playCount,
    playerCount: row.playerCount,
    leaderboardEnabled: true,
    arcadeCreditsRequired: row.arcadeCreditsRequired ?? true,
    arcadeCreditPrice: Math.max(0, Number(row.arcadeCreditPrice ?? 1)),
    userSubmitted: Boolean(row.builderUserId || row.createdBy),
    maxPossibleScore: row.maxPossibleScore ?? null,
    maxScorePerSecond: row.maxScorePerSecond ?? null,
  };
}

async function publishedProvenanceByGameId(rows: (typeof consoleGames.$inferSelect)[]) {
  const out = new Map<number, ConsoleCartridge["provenance"]>();
  if (rows.length === 0) return out;

  const versions = await db
    .select()
    .from(consoleGameVersions)
    .where(inArray(consoleGameVersions.gameId, rows.map((row) => row.id)))
    .orderBy(desc(consoleGameVersions.version), desc(consoleGameVersions.createdAt));

  const latestByGame = new Map<number, typeof consoleGameVersions.$inferSelect>();
  for (const version of versions) {
    if (!latestByGame.has(version.gameId)) latestByGame.set(version.gameId, version);
  }

  const inputs: (ConsoleProvenanceInput & { gameId: number })[] = [];
  for (const row of rows) {
    const version = latestByGame.get(row.id);
    const metadata = version?.bundleMetadata as Record<string, any> | null | undefined;
    const stored = metadata?.wtfProvenance || metadata?.provenance;
    if (stored && typeof stored === "object") {
      out.set(row.id, stored as ConsoleCartridge["provenance"]);
      continue;
    }
    if (metadata?.tokenContract && metadata?.tokenId) {
      inputs.push({
        gameId: row.id,
        tokenContract: metadata.tokenContract,
        tokenId: metadata.tokenId,
        tokenName: row.title,
        source: "tezos-token",
      });
    }
  }

  const provenanceByToken = await buildConsoleTokenProvenanceMap(inputs);
  for (const input of inputs) {
    const provenance = provenanceByToken.get(
      tokenIdentityKey(input.tokenContract, input.tokenId)
    );
    if (provenance) out.set(input.gameId, provenance);
  }

  return out;
}

export async function listPublishedConsoleGames(options: {
  includeInactive?: boolean;
  includePending?: boolean;
  builderUserId?: number;
  limit?: number;
  includeConsoleStockOnly?: boolean;
  excludeConsoleStock?: boolean;
} = {}): Promise<ConsolePublishedGame[]> {
  const whereParts = [];
  if (!options.includeInactive) whereParts.push(eq(consoleGames.active, true));
  if (!options.includePending) whereParts.push(eq(consoleGames.status, "active"));
  whereParts.push(eq(consoleGames.isPublic, true));
  if (options.builderUserId) {
    whereParts.push(eq(consoleGames.builderUserId, options.builderUserId));
  }
  if (options.includeConsoleStockOnly) whereParts.push(consoleStockGameSql());
  if (options.excludeConsoleStock) whereParts.push(arcadeGameSql());

  const rows = await db
    .select()
    .from(consoleGames)
    .where(whereParts.length ? and(...whereParts) : sql`true`)
    .orderBy(desc(consoleGames.updatedAt))
    .limit(Math.max(1, Math.min(100, options.limit ?? 50)));

  const provenanceByGame = await publishedProvenanceByGameId(rows);
  return rows.map((row) => rowToPublishedGame(row, provenanceByGame.get(row.id) ?? null));
}

export async function listPublishedConsoleCartridges(
  limit = 50,
  options: { includeConsoleStockOnly?: boolean; excludeConsoleStock?: boolean } = {}
): Promise<ConsoleCartridge[]> {
  const whereParts = [
    eq(consoleGames.active, true),
    eq(consoleGames.isPublic, true),
    eq(consoleGames.status, "active"),
  ];
  if (options.includeConsoleStockOnly) whereParts.push(consoleStockGameSql());
  if (options.excludeConsoleStock) whereParts.push(arcadeGameSql());

  const rows = await db
    .select()
    .from(consoleGames)
    .where(and(...whereParts))
    .orderBy(desc(consoleGames.updatedAt))
    .limit(Math.max(1, Math.min(100, limit)));

  const provenanceByGame = await publishedProvenanceByGameId(rows);
  return rows.map((row) =>
    publishedGameToCartridge(row, provenanceByGame.get(row.id) ?? null)
  );
}

export async function getPublishedConsoleGameBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        eq(consoleGames.slug, slug),
        eq(consoleGames.active, true),
        eq(consoleGames.isPublic, true),
        eq(consoleGames.status, "active")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listUserConsoleCartridges(userId: number): Promise<ConsoleCartridge[]> {
  const [rows, libraryRows] = await Promise.all([
    db
      .select({
        id: walletHoldings.id,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        balance: walletHoldings.balance,
      })
      .from(walletHoldings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(
        and(
          eq(walletHoldings.userId, userId),
          sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
        )
      )
      .orderBy(desc(lastSeenConsole))
      .limit(2000),
    db
      .select()
      .from(userMediaLibrary)
      .where(
        and(
          eq(userMediaLibrary.ownerUserId, userId),
          eq(userMediaLibrary.mediaCategory, "game"),
          eq(userMediaLibrary.status, "ready")
        )
      )
      .orderBy(desc(userMediaLibrary.updatedAt))
      .limit(500),
  ]);

  const libraryEntries = libraryRows
    .map((row) => {
      const meta = (row.metadata as Record<string, any>) || {};
      const artifactUri = row.playbackUrl || row.sourceUrl;
      if (!artifactUri) return null;
      const cart: ConsoleCartridge = {
          id: `media-${row.id}`,
          slug: `media-${row.id}`,
          title: row.title || meta.name || `Token #${row.tokenId}`,
          description: String(row.description || meta.description || "").slice(0, 200),
          mimeType: row.mimeType || "application/zip",
          thumbnailUri: row.posterUrl || String(meta.thumbnailUri || meta.displayUri || "") || null,
          artifactUri,
          tokenContract: row.tokenContract || "media",
          tokenId: row.tokenId || String(row.id),
          isDemo: false,
          category: "owned",
          leaderboardEnabled: false,
        };
      return {
        cart,
        provenanceInput: {
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.title || meta.name || null,
          metadata: meta,
          source: "tezos-token" as const,
        },
      };
    })
    .filter(Boolean) as Array<{
      cart: ConsoleCartridge;
      provenanceInput: ConsoleProvenanceInput;
    }>;

  const walletEntries = rows
    .map((row) => {
      const meta = (row.metadata as Record<string, any>) || {};
      const artifactUri = String(meta.artifactUri || "").trim();
      if (!artifactUri) return null;
      if (!isZipToken(meta, artifactUri)) return null;

      const cart: ConsoleCartridge = {
          id: `${row.tokenContract}:${row.tokenId}`,
          slug: `${row.tokenContract}-${row.tokenId}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          title: row.tokenName || meta.name || `Token #${row.tokenId}`,
          description: String(meta.description || "").slice(0, 200),
          mimeType: "application/zip",
          thumbnailUri: row.tokenThumbnail || meta.thumbnailUri || meta.displayUri || null,
          artifactUri,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          isDemo: false,
          category: "owned",
          leaderboardEnabled: false,
        };
      return {
        cart,
        provenanceInput: {
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.tokenName || meta.name || null,
          metadata: meta,
          source: "tezos-token" as const,
        },
      };
    })
    .filter(Boolean) as Array<{
      cart: ConsoleCartridge;
      provenanceInput: ConsoleProvenanceInput;
    }>;

  const entries = [...libraryEntries, ...walletEntries];
  const provenanceByToken = await buildConsoleTokenProvenanceMap(
    entries.map((entry) => entry.provenanceInput)
  );

  const seen = new Set<string>();
  return entries.map((entry) => {
    const provenance = provenanceByToken.get(
      tokenIdentityKey(entry.cart.tokenContract, entry.cart.tokenId)
    );
    return provenance ? { ...entry.cart, provenance } : entry.cart;
  }).filter((cart) => {
    const key = `${cart.tokenContract}:${cart.tokenId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listConsoleCatalog(userId?: number) {
  const [installedStock, stockPublished, mine] = await Promise.all([
    Promise.resolve(getDemoCartridges().filter(isConsoleStockCartridge)),
    listPublishedConsoleCartridges(100, { includeConsoleStockOnly: true }),
    userId ? listUserConsoleCartridges(userId) : Promise.resolve([]),
  ]);

  const demos = dedupeConsoleCatalogCartridges([...installedStock, ...stockPublished]);
  const all = dedupeConsoleCatalogCartridges([...demos, ...mine]);

  return { demos, published: [], mine, all };
}

async function nextAvailableSlug(base: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [existing] = await db
      .select({ id: consoleGames.id })
      .from(consoleGames)
      .where(eq(consoleGames.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function submitConsoleGameFromBundle(
  user: ConsoleAuthUser,
  input: ConsoleBundleSubmitInput
) {
  const title = String(input.title || "Untitled Game")
    .trim()
    .slice(0, 200);
  const description = String(input.description ?? "")
    .trim()
    .slice(0, 1000);
  const category = normalizeConsoleCategory(input.category || "community");
  const updateSlug = String(input.updateSlug || "").trim();
  if (updateSlug) {
    return submitConsoleGameUpdateFromBundle(user, {
      ...input,
      title,
      description,
      category,
      updateSlug,
    });
  }

  const slug = await nextAvailableSlug(slugifyConsoleGame(title));
  const coverUri = input.coverUri === undefined ? null : input.coverUri;
  const builderName = user.displayName || user.username;
  const now = new Date();
  const version = 1;
  const trustedBypass = await canBypassConsoleReview(user);
  const reviewStatus = trustedBypass ? "active" : "pending";
  const maxPossibleScore = normalizeNullableLimit(input.maxPossibleScore);
  const maxScorePerSecond = normalizeNullableLimit(input.maxScorePerSecond);
  const provenance = await provenanceForBundleMetadata(input.bundleMetadata, title);

  const validation = validateConsoleBundleZip(input.zipBytes);
  if (!validation.ok) {
    throw new Error(`Console bundle validation failed: ${validation.errors.join(", ")}`);
  }
  const bundle = await extractConsoleBundleZip({
    zipBytes: input.zipBytes,
    slug,
    version,
  });

  const [game] = await db
    .insert(consoleGames)
    .values({
      slug,
      title,
      description,
      category,
      embedPath: bundle.entryUri,
      coverUri: coverUri || null,
      sourceUrl: input.sourceUrl || null,
      createdBy: user.id,
      builderUserId: user.id,
      builderName,
      builderAddress: input.builderAddress || null,
      status: reviewStatus,
      active: trustedBypass,
      isPublic: true,
      storageMode: "console_bundle",
      verificationMode: "parent_postmessage",
      maxPossibleScore,
      maxScorePerSecond,
      submittedAt: now,
      approvedAt: trustedBypass ? now : null,
      updatedAt: now,
    })
    .returning();

  await db.insert(consoleGameVersions).values({
    gameId: game.id,
    version,
    artifactUri: bundle.entryUri,
    sourceUrl: input.sourceUrl || null,
    coverUri: coverUri || null,
    sdkVersion: game.sdkVersion,
    submittedBy: user.id,
    status: reviewStatus,
    reviewedAt: trustedBypass ? now : null,
    reviewNote: trustedBypass ? "Trusted creator auto-publish" : null,
    bundleMetadata: {
      ...(input.bundleMetadata ?? {}),
      source: input.bundleMetadata?.source || "direct_bundle",
      extractedPath: bundle.publicBasePath,
      entryPath: bundle.entryPath,
      totalUncompressedBytes: bundle.totalUncompressedBytes,
      fileCount: bundle.files.length,
      files: bundle.files.slice(0, 50),
      sdkInjected: !bundle.hasSdk,
      ...(provenance ? { wtfProvenance: provenance } : {}),
    },
  });

  await db.insert(consoleAuditEvents).values({
    gameId: game.id,
    actorUserId: user.id,
    action: trustedBypass ? "submit_auto_publish" : "submit",
    payloadJson: {
      source: input.bundleMetadata?.source || "direct_bundle",
      title,
      category,
      artifactUri: bundle.entryUri,
      coverUri: coverUri || null,
      validation: {
        totalUncompressedBytes: bundle.totalUncompressedBytes,
        fileCount: bundle.files.length,
      },
      trustedBypass,
      metadata: input.bundleMetadata ?? {},
      provenance,
    },
  });

  await awardConsoleCreatorXpSafely({
    userId: user.id,
    gameId: game.id,
    gameSlug: game.slug,
    version,
    eventType: "submission",
    metadata: { channel: "direct_bundle" },
  });
  if (trustedBypass) {
    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: game.id,
      gameSlug: game.slug,
      version,
      eventType: "publish",
      metadata: { channel: "trusted_creator_auto_publish" },
    });
  }

  return rowToPublishedGame(game, provenance);
}

export async function submitConsoleGameFromMedia(
  user: ConsoleAuthUser,
  input: ConsoleSubmitInput
) {
  const media = await requireReadyGameMedia(user.id, input.mediaId);

  const title = String(input.title || media.title || "Untitled Game")
    .trim()
    .slice(0, 200);
  const description = String(input.description ?? media.description ?? "")
    .trim()
    .slice(0, 1000);
  const category = normalizeConsoleCategory(input.category || "community");
  const updateSlug = String(input.updateSlug || "").trim();
  if (updateSlug) {
    return submitConsoleGameUpdateFromMedia(user, {
      ...input,
      title,
      description,
      category,
      updateSlug,
    });
  }

  const slug = await nextAvailableSlug(slugifyConsoleGame(title));
  const coverUri = input.coverUri === undefined ? media.posterUrl : input.coverUri;
  const builderName = user.displayName || user.username;
  const now = new Date();
  const version = 1;
  const trustedBypass = await canBypassConsoleReview(user);
  const reviewStatus = trustedBypass ? "active" : "pending";

  const maxPossibleScore = normalizeNullableLimit(input.maxPossibleScore);
  const maxScorePerSecond = normalizeNullableLimit(input.maxScorePerSecond);
  const provenance = await provenanceForMedia(media, title);

  const zipBytes = await readUploadedMediaBuffer(media);
  const validation = validateConsoleBundleZip(zipBytes);
  if (!validation.ok) {
    throw new Error(`Console bundle validation failed: ${validation.errors.join(", ")}`);
  }
  const bundle = await extractConsoleBundleZip({
    zipBytes,
    slug,
    version,
  });

  const [game] = await db
    .insert(consoleGames)
    .values({
      slug,
      title,
      description,
      category,
      embedPath: bundle.entryUri,
      coverUri: coverUri || null,
      sourceUrl: media.sourceUrl,
      createdBy: user.id,
      builderUserId: user.id,
      builderName,
      builderAddress: media.ownerWallet,
      status: reviewStatus,
      active: trustedBypass,
      isPublic: true,
      storageMode: "console_bundle",
      verificationMode: "parent_postmessage",
      maxPossibleScore,
      maxScorePerSecond,
      submittedAt: now,
      approvedAt: trustedBypass ? now : null,
      updatedAt: now,
    })
    .returning();

  await db.insert(consoleGameVersions).values({
    gameId: game.id,
    version,
    artifactUri: bundle.entryUri,
    sourceUrl: media.sourceUrl,
    coverUri: coverUri || null,
    sdkVersion: game.sdkVersion,
    submittedBy: user.id,
    status: reviewStatus,
    reviewedAt: trustedBypass ? now : null,
    reviewNote: trustedBypass ? "Trusted creator auto-publish" : null,
    bundleMetadata: {
      mediaId: media.id,
      tokenContract: media.tokenContract,
      tokenId: media.tokenId,
      wtfProvenance: provenance,
      mimeType: media.mimeType,
      fileSizeBytes: media.fileSizeBytes,
      extractedPath: bundle.publicBasePath,
      entryPath: bundle.entryPath,
      totalUncompressedBytes: bundle.totalUncompressedBytes,
      fileCount: bundle.files.length,
      files: bundle.files.slice(0, 50),
      sdkInjected: !bundle.hasSdk,
    },
  });

  await db.insert(consoleAuditEvents).values({
    gameId: game.id,
    actorUserId: user.id,
    action: trustedBypass ? "submit_auto_publish" : "submit",
    payloadJson: {
      mediaId: media.id,
      title,
      category,
      artifactUri: bundle.entryUri,
      coverUri: coverUri || null,
      validation: {
        totalUncompressedBytes: bundle.totalUncompressedBytes,
        fileCount: bundle.files.length,
      },
      trustedBypass,
      provenance,
    },
  });

  await awardConsoleCreatorXpSafely({
    userId: user.id,
    gameId: game.id,
    gameSlug: game.slug,
    version,
    eventType: "submission",
    metadata: { channel: "media_upload", mediaId: media.id },
  });
  if (trustedBypass) {
    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: game.id,
      gameSlug: game.slug,
      version,
      eventType: "publish",
      metadata: { channel: "trusted_creator_auto_publish", mediaId: media.id },
    });
  }

  return rowToPublishedGame(game, provenance);
}

async function submitConsoleGameUpdateFromBundle(
  user: ConsoleAuthUser,
  input: ConsoleBundleSubmitInput & {
    updateSlug: string;
    title: string;
    description: string;
    category: string;
  }
) {
  const [existing] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.slug, input.updateSlug))
    .limit(1);
  if (!existing) throw new Error("Console game not found.");
  if (existing.builderUserId !== user.id) {
    throw new Error("Only the original creator can submit updates for this game.");
  }
  if (isArcadeSourceStorageMode(existing.storageMode)) {
    throw new Error("WTF Arcade source builds update from their public source worker.");
  }

  const [pendingVersion] = await db
    .select({ id: consoleGameVersions.id })
    .from(consoleGameVersions)
    .where(
      and(
        eq(consoleGameVersions.gameId, existing.id),
        eq(consoleGameVersions.status, "pending")
      )
    )
    .limit(1);
  if (pendingVersion) {
    throw new Error("This game already has a pending update awaiting review.");
  }

  const coverUri = input.coverUri === undefined ? existing.coverUri : input.coverUri;
  const title = String(input.title || existing.title).trim().slice(0, 200);
  const description = String(input.description ?? existing.description ?? "")
    .trim()
    .slice(0, 1000);
  const category = normalizeConsoleCategory(input.category || existing.category);
  const maxPossibleScore = normalizeNullableLimit(input.maxPossibleScore);
  const maxScorePerSecond = normalizeNullableLimit(input.maxScorePerSecond);
  const trustedBypass = await canBypassConsoleReview(user);
  const reviewStatus = trustedBypass ? "active" : "pending";
  const metadataProvenance = await provenanceForBundleMetadata(input.bundleMetadata, title);
  const previousProvenance = metadataProvenance
    ? null
    : (await publishedProvenanceByGameId([existing])).get(existing.id) ?? null;
  const provenance = metadataProvenance ?? previousProvenance;

  const [lastVersion] = await db
    .select({ version: consoleGameVersions.version })
    .from(consoleGameVersions)
    .where(eq(consoleGameVersions.gameId, existing.id))
    .orderBy(desc(consoleGameVersions.version))
    .limit(1);
  const version = (lastVersion?.version ?? existing.bundleVersion ?? 0) + 1;

  const validation = validateConsoleBundleZip(input.zipBytes);
  if (!validation.ok) {
    throw new Error(`Console bundle validation failed: ${validation.errors.join(", ")}`);
  }
  const bundle = await extractConsoleBundleZip({
    zipBytes: input.zipBytes,
    slug: existing.slug,
    version,
  });
  const now = new Date();

  await db.insert(consoleGameVersions).values({
    gameId: existing.id,
    version,
    artifactUri: bundle.entryUri,
    sourceUrl: input.sourceUrl || existing.sourceUrl,
    coverUri: coverUri || existing.coverUri || null,
    sdkVersion: existing.sdkVersion,
    submittedBy: user.id,
    status: reviewStatus,
    reviewedAt: trustedBypass ? now : null,
    reviewNote: trustedBypass ? "Trusted creator auto-publish" : null,
    bundleMetadata: {
      ...(input.bundleMetadata ?? {}),
      source: input.bundleMetadata?.source || "direct_bundle",
      extractedPath: bundle.publicBasePath,
      entryPath: bundle.entryPath,
      totalUncompressedBytes: bundle.totalUncompressedBytes,
      fileCount: bundle.files.length,
      files: bundle.files.slice(0, 50),
      sdkInjected: !bundle.hasSdk,
      submission: {
        title,
        description,
        category,
        coverUri: coverUri || existing.coverUri || null,
        maxPossibleScore,
        maxScorePerSecond,
      },
      ...(provenance ? { wtfProvenance: provenance } : {}),
    },
  });

  if (trustedBypass) {
    await db
      .update(consoleGameVersions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(consoleGameVersions.gameId, existing.id),
          eq(consoleGameVersions.status, "active"),
          ne(consoleGameVersions.version, version)
        )
      );

    const [published] = await db
      .update(consoleGames)
      .set({
        title,
        description,
        category,
        embedPath: bundle.entryUri,
        coverUri: coverUri || existing.coverUri || null,
        sourceUrl: input.sourceUrl || existing.sourceUrl,
        bundleVersion: version,
        maxPossibleScore,
        maxScorePerSecond,
        moderationNote: null,
        status: "active",
        active: true,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(consoleGames.id, existing.id))
      .returning();

    await db.insert(consoleAuditEvents).values({
      gameId: existing.id,
      actorUserId: user.id,
      action: "submit_update_auto_publish",
      payloadJson: {
        source: input.bundleMetadata?.source || "direct_bundle",
        previousVersion: existing.bundleVersion,
        version,
        title,
        category,
        artifactUri: bundle.entryUri,
        coverUri: coverUri || existing.coverUri || null,
        trustedBypass,
        validation: {
          totalUncompressedBytes: bundle.totalUncompressedBytes,
          fileCount: bundle.files.length,
        },
        metadata: input.bundleMetadata ?? {},
        provenance,
      },
    });

    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: existing.id,
      gameSlug: existing.slug,
      version,
      eventType: "update",
      metadata: { channel: "direct_bundle" },
    });
    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: existing.id,
      gameSlug: existing.slug,
      version,
      eventType: "publish_update",
      metadata: { channel: "trusted_creator_auto_publish" },
    });

    return rowToPublishedGame(published, provenance);
  }

  await db
    .update(consoleGames)
    .set({
      moderationNote: "Update pending review",
      updatedAt: now,
    })
    .where(eq(consoleGames.id, existing.id));

  await db.insert(consoleAuditEvents).values({
    gameId: existing.id,
    actorUserId: user.id,
    action: "submit_update",
    payloadJson: {
      source: input.bundleMetadata?.source || "direct_bundle",
      version,
      title,
      category,
      artifactUri: bundle.entryUri,
      coverUri: coverUri || existing.coverUri || null,
      trustedBypass,
      validation: {
        totalUncompressedBytes: bundle.totalUncompressedBytes,
        fileCount: bundle.files.length,
      },
      metadata: input.bundleMetadata ?? {},
      provenance,
    },
  });

  await awardConsoleCreatorXpSafely({
    userId: user.id,
    gameId: existing.id,
    gameSlug: existing.slug,
    version,
    eventType: "update",
    metadata: { channel: "direct_bundle" },
  });

  const [updated] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.id, existing.id))
    .limit(1);
  return rowToPublishedGame(updated ?? existing, provenance);
}

async function submitConsoleGameUpdateFromMedia(
  user: ConsoleAuthUser,
  input: ConsoleSubmitInput & { updateSlug: string }
) {
  const [existing] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.slug, input.updateSlug))
    .limit(1);
  if (!existing) throw new Error("Console game not found.");
  if (existing.builderUserId !== user.id) {
    throw new Error("Only the original creator can submit updates for this game.");
  }
  if (isArcadeSourceStorageMode(existing.storageMode)) {
    throw new Error("WTF Arcade source builds update from their public source worker.");
  }

  const [pendingVersion] = await db
    .select({ id: consoleGameVersions.id })
    .from(consoleGameVersions)
    .where(
      and(
        eq(consoleGameVersions.gameId, existing.id),
        eq(consoleGameVersions.status, "pending")
      )
    )
    .limit(1);
  if (pendingVersion) {
    throw new Error("This game already has a pending update awaiting review.");
  }

  const media = await requireReadyGameMedia(user.id, input.mediaId);
  const coverUri = input.coverUri === undefined ? media.posterUrl : input.coverUri;
  const title = String(input.title || existing.title).trim().slice(0, 200);
  const description = String(input.description ?? existing.description ?? "")
    .trim()
    .slice(0, 1000);
  const category = normalizeConsoleCategory(input.category || existing.category);
  const maxPossibleScore = normalizeNullableLimit(input.maxPossibleScore);
  const maxScorePerSecond = normalizeNullableLimit(input.maxScorePerSecond);
  const trustedBypass = await canBypassConsoleReview(user);
  const reviewStatus = trustedBypass ? "active" : "pending";
  const provenance = await provenanceForMedia(media, title);

  const [lastVersion] = await db
    .select({ version: consoleGameVersions.version })
    .from(consoleGameVersions)
    .where(eq(consoleGameVersions.gameId, existing.id))
    .orderBy(desc(consoleGameVersions.version))
    .limit(1);
  const version = (lastVersion?.version ?? existing.bundleVersion ?? 0) + 1;

  const zipBytes = await readUploadedMediaBuffer(media);
  const validation = validateConsoleBundleZip(zipBytes);
  if (!validation.ok) {
    throw new Error(`Console bundle validation failed: ${validation.errors.join(", ")}`);
  }
  const bundle = await extractConsoleBundleZip({
    zipBytes,
    slug: existing.slug,
    version,
  });
  const now = new Date();

  await db.insert(consoleGameVersions).values({
    gameId: existing.id,
    version,
    artifactUri: bundle.entryUri,
    sourceUrl: media.sourceUrl,
    coverUri: coverUri || existing.coverUri || null,
    sdkVersion: existing.sdkVersion,
    submittedBy: user.id,
    status: reviewStatus,
    reviewedAt: trustedBypass ? now : null,
    reviewNote: trustedBypass ? "Trusted creator auto-publish" : null,
    bundleMetadata: {
      mediaId: media.id,
      tokenContract: media.tokenContract,
      tokenId: media.tokenId,
      wtfProvenance: provenance,
      mimeType: media.mimeType,
      fileSizeBytes: media.fileSizeBytes,
      extractedPath: bundle.publicBasePath,
      entryPath: bundle.entryPath,
      totalUncompressedBytes: bundle.totalUncompressedBytes,
      fileCount: bundle.files.length,
      files: bundle.files.slice(0, 50),
      sdkInjected: !bundle.hasSdk,
      submission: {
        title,
        description,
        category,
        coverUri: coverUri || existing.coverUri || null,
        maxPossibleScore,
        maxScorePerSecond,
      },
    },
  });

  if (trustedBypass) {
    await db
      .update(consoleGameVersions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(consoleGameVersions.gameId, existing.id),
          eq(consoleGameVersions.status, "active"),
          ne(consoleGameVersions.version, version)
        )
      );

    const [published] = await db
      .update(consoleGames)
      .set({
        title,
        description,
        category,
        embedPath: bundle.entryUri,
        coverUri: coverUri || existing.coverUri || null,
        sourceUrl: media.sourceUrl,
        bundleVersion: version,
        maxPossibleScore,
        maxScorePerSecond,
        moderationNote: null,
        status: "active",
        active: true,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(consoleGames.id, existing.id))
      .returning();

    await db.insert(consoleAuditEvents).values({
      gameId: existing.id,
      actorUserId: user.id,
      action: "submit_update_auto_publish",
      payloadJson: {
        mediaId: media.id,
        previousVersion: existing.bundleVersion,
        version,
        title,
        category,
        artifactUri: bundle.entryUri,
        coverUri: coverUri || existing.coverUri || null,
        trustedBypass,
        validation: {
          totalUncompressedBytes: bundle.totalUncompressedBytes,
          fileCount: bundle.files.length,
        },
        provenance,
      },
    });

    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: existing.id,
      gameSlug: existing.slug,
      version,
      eventType: "update",
      metadata: { channel: "media_upload", mediaId: media.id },
    });
    await awardConsoleCreatorXpSafely({
      userId: user.id,
      gameId: existing.id,
      gameSlug: existing.slug,
      version,
      eventType: "publish_update",
      metadata: { channel: "trusted_creator_auto_publish", mediaId: media.id },
    });

    return rowToPublishedGame(published, provenance);
  }

  await db
    .update(consoleGames)
    .set({
      moderationNote: "Update pending review",
      updatedAt: now,
    })
    .where(eq(consoleGames.id, existing.id));

  await db.insert(consoleAuditEvents).values({
    gameId: existing.id,
    actorUserId: user.id,
    action: "submit_update",
    payloadJson: {
      mediaId: media.id,
      version,
      title,
      category,
      artifactUri: bundle.entryUri,
      coverUri: coverUri || existing.coverUri || null,
      trustedBypass,
      validation: {
        totalUncompressedBytes: bundle.totalUncompressedBytes,
        fileCount: bundle.files.length,
      },
      provenance,
    },
  });

  await awardConsoleCreatorXpSafely({
    userId: user.id,
    gameId: existing.id,
    gameSlug: existing.slug,
    version,
    eventType: "update",
    metadata: { channel: "media_upload", mediaId: media.id },
  });

  const [updated] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.id, existing.id))
    .limit(1);
  return rowToPublishedGame(updated ?? existing, provenance);
}

async function provenanceForMedia(
  media: typeof userMediaLibrary.$inferSelect,
  tokenName?: string | null
) {
  const provenance = await buildConsoleTokenProvenanceMap([
    {
      tokenContract: media.tokenContract,
      tokenId: media.tokenId,
      tokenName: tokenName || media.title,
      metadata: media.metadata,
      source: "tezos-token",
    },
  ]);
  return media.tokenContract && media.tokenId
    ? provenance.get(tokenIdentityKey(media.tokenContract, media.tokenId)) ?? null
    : null;
}

async function provenanceForBundleMetadata(
  bundleMetadata: Record<string, unknown> | undefined,
  tokenName?: string | null
) {
  const metadata = normalizeRecord(bundleMetadata);
  const stored = metadata.wtfProvenance || metadata.provenance;
  if (stored && typeof stored === "object") {
    return stored as ConsolePublishedGame["provenance"];
  }

  const tokenContract = String(metadata.tokenContract || metadata.contract || "").trim();
  const tokenId = String(metadata.tokenId || "").trim();
  if (!tokenContract || !tokenId) return null;

  const provenance = await buildConsoleTokenProvenanceMap([
    {
      tokenContract,
      tokenId,
      tokenName: tokenName || null,
      metadata,
      source: "tezos-token",
    },
  ]);
  return provenance.get(tokenIdentityKey(tokenContract, tokenId)) ?? null;
}

async function requireReadyGameMedia(userId: number, mediaIdInput: unknown) {
  const mediaId = Number(mediaIdInput);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new Error("Select a ready game asset from your media library.");
  }

  const [media] = await db
    .select()
    .from(userMediaLibrary)
    .where(
      and(
        eq(userMediaLibrary.id, mediaId),
        eq(userMediaLibrary.ownerUserId, userId),
        eq(userMediaLibrary.mediaCategory, "game"),
        eq(userMediaLibrary.status, "ready")
      )
    )
    .limit(1);

  if (!media) throw new Error("Game media asset not found or not ready.");
  const artifactUri = media.playbackUrl || media.sourceUrl;
  if (!artifactUri) throw new Error("Game media asset is missing a playable URL.");
  if (!isConsoleZipMime(media.mimeType)) {
    throw new Error("Console submissions must be ZIP bundles with a root index.html.");
  }
  return media;
}

async function readUploadedMediaBuffer(media: typeof userMediaLibrary.$inferSelect): Promise<Buffer> {
  if (media.fileData) {
    const data = String(media.fileData);
    return Buffer.from(data.includes(",") ? data.split(",")[1] : data, "base64");
  }

  const resolved = await resolveMediaFilePath({
    mediaId: media.id,
    hotCachePath: media.hotCachePath,
    objectStorageBucket: media.objectStorageBucket,
    objectStorageKey: media.objectStorageKey,
    safeFilename: media.safeFilename,
  });
  if (resolved) return fs.readFile(resolved.path);

  throw new Error(
    "Console bundle bytes are not available. Upload the ZIP through Game Studio before submitting."
  );
}

function normalizeConsoleCategory(value: unknown): string {
  return (
    String(value || "community")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 80) || "community"
  );
}

function normalizeNullableLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

async function awardConsoleCreatorXpSafely(
  input: Parameters<typeof awardConsoleCreatorXp>[0]
) {
  try {
    return await awardConsoleCreatorXp(input);
  } catch (err) {
    console.warn("[console] creator XP award skipped:", err);
    return null;
  }
}

async function canBypassConsoleReview(user: ConsoleAuthUser): Promise<boolean> {
  const role = String(user.role || "witness") as UserRole;
  return (
    (await hasPermission(role, "trusted_console_creator")) ||
    (await hasPermission(role, "trusted_arcade_creator"))
  );
}

export async function listUserSubmittedConsoleGames(userId: number) {
  const rows = await db
    .select()
    .from(consoleGames)
    .where(and(eq(consoleGames.builderUserId, userId), arcadeGameSql()))
    .orderBy(desc(consoleGames.updatedAt))
    .limit(100);

  const provenanceByGame = await publishedProvenanceByGameId(rows);
  return rows.map((row) => rowToPublishedGame(row, provenanceByGame.get(row.id) ?? null));
}

export async function listConsoleModerationQueue(options: {
  status?: string;
  limit?: number;
  surface?: GameSurface;
} = {}) {
  const status = String(options.status || "pending").trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const surface = options.surface ?? "arcade";
  const pendingVersionRows =
    status === "pending" || status === "all"
      ? await db
          .select()
          .from(consoleGameVersions)
          .where(eq(consoleGameVersions.status, "pending"))
          .orderBy(desc(consoleGameVersions.version), desc(consoleGameVersions.createdAt))
      : [];
  const pendingGameIds = Array.from(
    new Set(pendingVersionRows.map((row) => row.gameId))
  );
  const rows = await db
    .select()
    .from(consoleGames)
    .where(
      and(
        gameSurfaceSql(surface),
        status === "all"
          ? sql`true`
          : status === "pending" && pendingGameIds.length > 0
            ? or(eq(consoleGames.status, "pending"), inArray(consoleGames.id, pendingGameIds))
            : eq(consoleGames.status, status)
      )
    )
    .orderBy(desc(consoleGames.updatedAt))
    .limit(limit);

  const versionRows = rows.length
    ? [
        ...pendingVersionRows.filter((version) =>
          rows.some((row) => row.id === version.gameId)
        ),
        ...(await db
          .select()
          .from(consoleGameVersions)
          .where(inArray(consoleGameVersions.gameId, rows.map((row) => row.id)))
          .orderBy(desc(consoleGameVersions.version), desc(consoleGameVersions.createdAt))),
      ]
    : [];

  const latestByGame = new Map<number, typeof consoleGameVersions.$inferSelect>();
  for (const version of versionRows) {
    if (!latestByGame.has(version.gameId)) latestByGame.set(version.gameId, version);
  }

  return rows.map((row) => rowToModerationGame(row, latestByGame.get(row.id) ?? null));
}

export async function moderateConsoleGame(options: {
  actorUserId: number;
  slug: string;
  action: "approve" | "reject" | "remove" | "restore";
  reason?: string;
}) {
  const [existing] = await db
    .select()
    .from(consoleGames)
    .where(eq(consoleGames.slug, options.slug))
    .limit(1);
  if (!existing) throw new Error("Console game not found.");

  const now = new Date();
  const [latestPendingVersion] = await db
    .select()
    .from(consoleGameVersions)
    .where(
      and(
        eq(consoleGameVersions.gameId, existing.id),
        eq(consoleGameVersions.status, "pending")
      )
    )
    .orderBy(desc(consoleGameVersions.version), desc(consoleGameVersions.createdAt))
    .limit(1);

  if (latestPendingVersion && options.action === "approve") {
    await db
      .update(consoleGameVersions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(consoleGameVersions.gameId, existing.id),
          eq(consoleGameVersions.status, "active"),
          ne(consoleGameVersions.id, latestPendingVersion.id)
        )
      );
    await db
      .update(consoleGameVersions)
      .set({
        status: "active",
        reviewedBy: options.actorUserId,
        reviewedAt: now,
        reviewNote: options.reason || null,
      })
      .where(eq(consoleGameVersions.id, latestPendingVersion.id));

    const promotedPatch = buildConsoleGamePatchFromVersion(
      existing,
      latestPendingVersion
    );
    const [game] = await db
      .update(consoleGames)
      .set({
        ...promotedPatch,
        status: "active",
        active: true,
        approvedAt: now,
        removedAt: null,
        moderationNote: null,
        bundleVersion: latestPendingVersion.version,
        updatedAt: now,
      })
      .where(eq(consoleGames.id, existing.id))
      .returning();

    await auditConsoleModeration({
      gameId: existing.id,
      actorUserId: options.actorUserId,
      action:
        latestPendingVersion.version > existing.bundleVersion
          ? "approve_update"
          : "approve",
      reason: options.reason,
      payloadJson: {
        previousStatus: existing.status,
        nextStatus: game.status,
        promotedVersion: latestPendingVersion.version,
        artifactUri: latestPendingVersion.artifactUri,
      },
    });

    await awardConsoleCreatorXpSafely({
      userId: latestPendingVersion.submittedBy ?? existing.builderUserId,
      gameId: existing.id,
      gameSlug: existing.slug,
      version: latestPendingVersion.version,
      eventType:
        latestPendingVersion.version > existing.bundleVersion
          ? "publish_update"
          : "publish",
      awardedBy: options.actorUserId,
      metadata: {
        channel: "moderation_approval",
        action:
          latestPendingVersion.version > existing.bundleVersion
            ? "approve_update"
            : "approve",
      },
    });

    return rowToPublishedGame(game);
  }

  if (
    latestPendingVersion &&
    options.action === "reject" &&
    existing.status === "active"
  ) {
    await db
      .update(consoleGameVersions)
      .set({
        status: "rejected",
        reviewedBy: options.actorUserId,
        reviewedAt: now,
        reviewNote: options.reason || null,
      })
      .where(eq(consoleGameVersions.id, latestPendingVersion.id));

    const [game] = await db
      .update(consoleGames)
      .set({
        moderationNote: options.reason || "Update rejected",
        updatedAt: now,
      })
      .where(eq(consoleGames.id, existing.id))
      .returning();

    await auditConsoleModeration({
      gameId: existing.id,
      actorUserId: options.actorUserId,
      action: "reject_update",
      reason: options.reason,
      payloadJson: {
        previousStatus: existing.status,
        nextStatus: game.status,
        rejectedVersion: latestPendingVersion.version,
      },
    });

    return rowToPublishedGame(game);
  }

  const patch =
    options.action === "approve" || options.action === "restore"
      ? { status: "active", active: true, approvedAt: now, removedAt: null }
      : options.action === "remove"
        ? { status: "removed", active: false, removedAt: now }
        : { status: "rejected", active: false, moderationNote: options.reason || null };

  const [game] = await db
    .update(consoleGames)
    .set({ ...patch, updatedAt: now })
    .where(eq(consoleGames.id, existing.id))
    .returning();

  await auditConsoleModeration({
    gameId: existing.id,
    actorUserId: options.actorUserId,
    action: options.action,
    reason: options.reason,
    payloadJson: { previousStatus: existing.status, nextStatus: game.status },
  });

  const [latestVersion] = await db
    .select()
    .from(consoleGameVersions)
    .where(eq(consoleGameVersions.gameId, existing.id))
    .orderBy(desc(consoleGameVersions.version), desc(consoleGameVersions.createdAt))
    .limit(1);

  if (latestVersion) {
    await db
      .update(consoleGameVersions)
      .set({
        status:
          options.action === "approve" || options.action === "restore"
            ? "active"
            : options.action === "remove"
              ? "removed"
              : "rejected",
        reviewedBy: options.actorUserId,
        reviewedAt: now,
        reviewNote: options.reason || null,
      })
      .where(eq(consoleGameVersions.id, latestVersion.id));
  }

  return rowToPublishedGame(game);
}

function buildConsoleGamePatchFromVersion(
  existing: typeof consoleGames.$inferSelect,
  version: typeof consoleGameVersions.$inferSelect
) {
  const metadata = normalizeRecord(version.bundleMetadata);
  const submission = normalizeRecord(metadata.submission);
  const has = (key: string) => Object.prototype.hasOwnProperty.call(submission, key);
  return {
    title: has("title") ? String(submission.title || existing.title).slice(0, 200) : existing.title,
    description: has("description")
      ? String(submission.description || "").slice(0, 1000)
      : existing.description,
    category: has("category")
      ? normalizeConsoleCategory(submission.category || existing.category)
      : existing.category,
    embedPath: version.artifactUri,
    sourceUrl: version.sourceUrl ?? existing.sourceUrl,
    coverUri: version.coverUri ?? existing.coverUri,
    sdkVersion: version.sdkVersion ?? existing.sdkVersion,
    maxPossibleScore: has("maxPossibleScore")
      ? normalizeNullableLimit(submission.maxPossibleScore)
      : existing.maxPossibleScore,
    maxScorePerSecond: has("maxScorePerSecond")
      ? normalizeNullableLimit(submission.maxScorePerSecond)
      : existing.maxScorePerSecond,
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function auditConsoleModeration(input: {
  gameId: number;
  actorUserId: number;
  action: string;
  reason?: string;
  payloadJson: Record<string, unknown>;
}) {
  await db.insert(consoleAuditEvents).values({
    gameId: input.gameId,
    actorUserId: input.actorUserId,
    action: input.action,
    reason: input.reason || null,
    payloadJson: input.payloadJson,
  });
}
