import { Router } from "express";
import { createHash } from "crypto";
import path from "path";
import { promises as fsPromises, createReadStream, createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { hasAtLeastRole, type UserRole } from "@shared/types";
import { db, pool } from "../db";
import { isAuthenticated } from "../auth/passport";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import { hasPermission } from "../lib/permissions";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylists,
  tvPlaylistItems,
  tvBumpers,
  tvWtfChannelConfig,
  userMediaLibrary,
  tvScheduleEntries,
  walletHoldings,
  tokenMetadata,
  users,
  addressLabels,
} from "@shared/schema";
import { resolveArtifactMimeType, resourceUrisLikelySame } from "@shared/token-media";
import {
  isPlayableMimeType,
  guessMimeTypeFromUri,
  parseFormatsFromMetadata,
  // `normalizeIpfsUri` is imported here under an alias so this file
  // can keep its own thin wrapper that threads the TV-specific
  // gateway preference (the admin-configurable list below) into the
  // shared helper.  One code path now; before the audit there were
  // two subtly-different normalizers (`media-utils.ts` pinned to
  // ipfs.io, this file's using `TV_IPFS_GATEWAYS[0]`) that could drift
  // apart as the gateway list evolved.
  normalizeIpfsUri as normalizeIpfsUriShared,
  type PlayableAsset,
} from "../lib/media-utils";
import { normalizePublicHttpUrl, parseHostAllowlist } from "../lib/network-safety";
import { probeMediaDuration } from "../lib/media-probe";
import { pickPreferredWtfChannelConfig } from "../lib/tv-wtf-config";
import {
  buildTvChannelMediaPath,
  canEditTvChannelPolicy,
  resolveTvChannelPlaybackSource,
  resolveWtfSourceScope,
} from "../lib/tv-policy";
import { serveStoredMediaFile } from "../lib/storage/media-file-serve";
import {
  isTvCacheObjectStorageConfigured,
  mirrorTvCacheEntryToObjectStorage,
  promoteTvCacheEntryFromObjectStorage,
  type TvCacheMirrorMeta,
} from "../lib/storage/tv-cache-object-store";
import {
  createTvTelemetryStore,
  type TelemetryReason,
} from "../lib/tv-telemetry";
import { createTvStreamSnapshotCache } from "../lib/tv-stream-snapshot-cache";
import {
  computeTvBroadcastCursor,
  resolveTvBroadcastQueue,
} from "../lib/tv-broadcast";
import {
  readTvOverlayOverride,
  resolveTvOverlayMetadata,
  writeTvOverlayOverride,
} from "../lib/tv-overlay-metadata";
import {
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_COMMUNITY,
  BUMPER_CATEGORY_PERSONAL,
  daypartForMs,
  type DaypartName,
} from "../features/tv/daypart";
import {
  paginationMeta,
  parseBoundedQueryInt,
} from "../features/tv/pagination";
import {
  BUMPER_ALLOWED_MIME,
  BUMPER_MAX_DURATION_MS,
  BUMPER_MAX_FILE_BYTES,
  BUMPER_UPLOADS_DIR,
  bumperFilename,
  bumperUpload,
  ensureBumperDir,
} from "../features/tv/bumper-upload";

const router = Router();

const lastSeenTv = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

const TV_MAX_STAFF_CHANNELS = 3;
const TV_MAX_USER_CHANNELS = 1;
const TV_CHANNEL_LIST_DEFAULT_LIMIT = 100;
const TV_CHANNEL_LIST_MAX_LIMIT = 200;
const TV_CHANNEL_DETAIL_DEFAULT_VIDEO_LIMIT = 500;
const TV_CHANNEL_DETAIL_MAX_VIDEO_LIMIT = 1000;
const TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_LIMIT = 100;
const TV_CHANNEL_DETAIL_MAX_PLAYLIST_LIMIT = 200;
const TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_ITEM_LIMIT = 2000;
const TV_CHANNEL_DETAIL_MAX_PLAYLIST_ITEM_LIMIT = 5000;
// ─── TV media cache ────────────────────────────────────────
//
// Looping channels replay the same small set of videos over and over.
// The attached volume is the hot cache that browsers should feel, and
// object storage is the warm backing store so we stop treating IPFS as
// the system of record.  The serving order is therefore:
//
//   1. local volume cache
//   2. object storage mirror
//   3. public IPFS / external host as the last resort
//
// IPFS content is content-addressed and therefore immutable — we never
// re-fetch it until it falls out of the LRU budget. Non-IPFS sources
// still expire on a TTL so stale HTTP links don't pin us to outdated
// bytes forever.
const TV_CACHE_DIR =
  process.env.TV_CACHE_DIR?.trim() ||
  path.resolve(process.cwd(), "cache", "tv");
const TV_CACHE_MAX_AGE_MS =
  Math.max(1, Number(process.env.TV_CACHE_MAX_AGE_DAYS || 30)) *
  24 *
  60 *
  60 *
  1000;
const TV_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TV_CACHE_TMP_MAX_AGE_MS = 60 * 60 * 1000;
const TV_CACHE_MAX_REMOTE_BYTES = Math.max(
  20 * 1024 * 1024,
  Number(process.env.TV_CACHE_MAX_REMOTE_BYTES || 500 * 1024 * 1024)
);
// Total cache budget on disk.  Defaults to 10 GB which is well within
// the current 80 GB server while still fitting thousands of typical
// NFT video/gif artefacts.  Once exceeded we evict least-recently-used
// entries until we are back under.
const TV_CACHE_MAX_TOTAL_BYTES = Math.max(
  TV_CACHE_MAX_REMOTE_BYTES,
  Number(process.env.TV_CACHE_MAX_TOTAL_BYTES || 10 * 1024 * 1024 * 1024)
);
const TV_CACHE_ALLOWED_HOSTS_FROM_ENV = parseHostAllowlist(process.env.TV_CACHE_ALLOWED_HOSTS);
const TV_MEDIA_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TV_MEDIA_FETCH_TIMEOUT_MS || 25000)
);

// ─── TV transcode mezzanine ────────────────────────────────
//
// Tokenized videos routinely ship as 150–500 MB 1080p or 4K masters
// with high bitrates that simply will not stream cleanly over an
// average home connection.  For anything past the threshold we run
// ffmpeg once and save a 720p H.264 MP4 with +faststart alongside
// the original on the cache volume.  Hot-path serving prefers the
// transcode when it exists; the original stays on disk so the LRU
// anchor and cache miss fallbacks keep working.
//
//   • TV_TRANSCODE_ENABLED          — "0" turns the feature off.
//   • TV_TRANSCODE_THRESHOLD_BYTES  — source size that triggers a
//                                     transcode.  Default 40 MB.
//   • TV_TRANSCODE_MAX_HEIGHT       — vertical pixel cap, aspect-
//                                     preserved.  Default 720.
//   • TV_TRANSCODE_CRF              — libx264 CRF (lower = better /
//                                     bigger).  Default 23.
//   • TV_TRANSCODE_PER_SWEEP        — max transcodes per tick, so a
//                                     big backlog doesn't pin the
//                                     CPU for an hour.  Default 3.
//   • TV_TRANSCODE_SWEEP_INTERVAL_MS— cadence of the background
//                                     job.  Default 5 min.
const TV_TRANSCODE_ENABLED =
  String(process.env.TV_TRANSCODE_ENABLED ?? "1") !== "0";
const TV_TRANSCODE_THRESHOLD_BYTES = Math.max(
  4 * 1024 * 1024,
  Number(process.env.TV_TRANSCODE_THRESHOLD_BYTES || 40 * 1024 * 1024)
);
const TV_TRANSCODE_MAX_HEIGHT = Math.max(
  240,
  Math.min(1080, Number(process.env.TV_TRANSCODE_MAX_HEIGHT || 720))
);
const TV_TRANSCODE_CRF = Math.max(
  18,
  Math.min(32, Number(process.env.TV_TRANSCODE_CRF || 23))
);
const TV_TRANSCODE_PER_SWEEP = Math.max(
  1,
  Number(process.env.TV_TRANSCODE_PER_SWEEP || 3)
);
const TV_TRANSCODE_SWEEP_INTERVAL_MS = Math.max(
  60 * 1000,
  Number(process.env.TV_TRANSCODE_SWEEP_INTERVAL_MS || 5 * 60 * 1000)
);
const TV_TRANSCODE_BOOT_DELAY_MS = Math.max(
  0,
  Number(process.env.TV_TRANSCODE_BOOT_DELAY_MS || 90 * 1000)
);
// Cool-off window before retrying a transcode that previously
// failed — avoids an ffmpeg meat-grinder on a broken source every
// five minutes.  Cleared manually by deleting the `.720p.json`
// sidecar if you want to force a retry sooner.
const TV_TRANSCODE_ERROR_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Default IPFS gateway order is "fast and reliable first, ipfs.io
// last".  ipfs.io is famously slow when the CID isn't already pinned
// to its node, and was responsible for multi-minute cold starts in
// the previous proxy.  These defaults are overridden by the
// TV_IPFS_GATEWAYS env if the operator has stronger preferences.
const DEFAULT_IPFS_GATEWAYS = [
  "https://nftstorage.link/ipfs/",
  "https://w3s.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cf-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
];

/* ─── Cache-proxy timing telemetry ─────────────────────────
 *
 * Every cache request emits a structured `[tv-cache]` log line:
 *
 *   - hit                — served from disk (warm).
 *   - miss.first-byte    — IPFS gateway returned headers; cold pass
 *                          will now stream bytes through to the
 *                          client + disk in parallel.
 *   - miss.complete      — last byte arrived; cache file finalised.
 *   - error              — fetch failed entirely (all gateways down).
 *
 * Each line includes the source URI, gateway raced to (when warm),
 * total bytes, and time-to-first-byte vs total elapsed.  Pair this
 * with the `[tv-playback]` events posted by the client to follow a
 * frame end-to-end. */
function logCacheEvent(payload: Record<string, unknown>) {
  try {
    console.info("[tv-cache]", JSON.stringify(payload));
  } catch {
    /* swallow */
  }
}

function shortHashForLog(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

// Personal bumpers are only shown on their owner's channels; community
// bumpers are drawn into the global pool for any channel.  The hard
// per-user cap is enforced separately on each category so a user can
// contribute to the shared pool without sacrificing their personal
// interstitials.
const BUMPER_MAX_PER_USER_PERSONAL = 20;
const BUMPER_MAX_PER_USER_COMMUNITY = 3;

/**
 * Pulls MTV-style display fields out of a token metadata blob using
 * the same rules as the boot-time SQL backfill.  Returns all fields
 * optional so callers can spread the result into an insert/update.
 */
function extractTokenMetaFields(
  metadata: any,
  _tokenName?: string | null,
  options?: {
    tokenContract?: string | null;
    tokenId?: string | null;
    uploaderUsername?: string | null;
  }
): {
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAt: Date | null;
} {
  const resolved = resolveTvOverlayMetadata({
    metadata,
    tokenContract: options?.tokenContract,
    tokenId: options?.tokenId,
    uploaderUsername: options?.uploaderUsername,
  });
  return {
    creatorName: resolved.creatorName,
    creatorAddress: resolved.creatorAddress,
    collectionName: resolved.collectionName,
    mintedAt: resolved.mintedAt,
  };
}

async function hydrateChannelVideoMetadata(input: {
  tokenContract?: string | null;
  tokenId?: string | null;
  metadata: unknown;
}): Promise<Record<string, unknown> | null> {
  const tokenContract = String(input.tokenContract || "").trim();
  const tokenId = String(input.tokenId || "").trim();
  if (!tokenContract || !tokenId) {
    return input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : null;
  }

  const [tokenRow] = await db
    .select({ raw: tokenMetadata.raw })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.tokenContract, tokenContract),
        eq(tokenMetadata.tokenId, tokenId)
      )
    )
    .limit(1);

  if (!tokenRow?.raw) {
    return input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : null;
  }

  const overlay = readTvOverlayOverride(input.metadata);
  return writeTvOverlayOverride(tokenRow.raw, overlay);
}

let lastCleanupAt = 0;

type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};


const TV_IPFS_GATEWAYS = (() => {
  const raw = String(process.env.TV_IPFS_GATEWAYS || "").trim();
  const source = raw ? raw.split(",") : DEFAULT_IPFS_GATEWAYS;
  const unique = new Set<string>();
  for (const value of source) {
    const normalized = normalizeIpfsGatewayBase(value);
    if (normalized) unique.add(normalized);
  }
  if (unique.size > 0) return Array.from(unique);
  return [...DEFAULT_IPFS_GATEWAYS];
})();

function hostnamesFromUrls(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      /* ignore invalid configured gateways */
    }
  }
  return Array.from(hosts);
}

const TV_CACHE_ALLOWED_HOSTS = Array.from(
  new Set([
    ...TV_CACHE_ALLOWED_HOSTS_FROM_ENV,
    ...hostnamesFromUrls(TV_IPFS_GATEWAYS),
  ])
);

function isAllowedMediaCacheContentType(
  contentType: string,
  options: { allowImages?: boolean } = {}
): boolean {
  const value = String(contentType || "").toLowerCase().trim();
  if (value.startsWith("video/") || value === "image/gif") return true;
  return options.allowImages === true && value.startsWith("image/");
}

async function isStaffRole(role: UserRole): Promise<boolean> {
  return hasPermission(role, "manage_channels");
}

// ─── Dial-number allocator ─────────────────────────────────
//
// Dials 1, 2, 3, and 69 are reserved pins (opeculiar, yoeshi, WTF TV,
// platform).  Everyone else gets a monotonically-increasing dial that
// is sticky for the lifetime of the channel — we never recycle the
// dial of a deleted channel, so a creator who comes back later still
// owns the same broadcast slot they were originally given.
//
// `tv_dial_counter` (single-row table seeded by the boot backfill)
// holds the next dial to issue.  We bump it inside the same UPDATE
// that returns the value, so two concurrent channel creations get
// distinct numbers.  The unique partial index on tv_channels.dial_number
// is a belt-and-suspenders backstop.
const DIAL_RESERVED = new Set<number>([1, 2, 3, 69]);
const DIAL_AUTO_FLOOR = 4;

async function allocateNextDialNumber(): Promise<number> {
  for (;;) {
    const result = await pool.query<{ next_dial: number }>(
      `INSERT INTO tv_dial_counter (id, next_dial, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE
          SET next_dial  = tv_dial_counter.next_dial + 1,
              updated_at = NOW()
       RETURNING next_dial - 1 AS next_dial`,
      [DIAL_AUTO_FLOOR + 1]
    );
    const candidate = Number(result.rows[0]?.next_dial ?? DIAL_AUTO_FLOOR);
    if (!DIAL_RESERVED.has(candidate)) {
      return candidate;
    }
    // Skip past a reserved value — loop and pull the next one.
  }
}

// ─── Seeded shuffle ────────────────────────────────────────
//
// The stream endpoint returns the same playlist ordering to two viewers
// who open the channel inside the same 30-minute window, so bumper
// insertions and cache prefetches stay consistent — but the seed
// rotates every window, so a user who visits later in the day doesn't
// see the exact same loop again.  Using a deterministic seeded shuffle
// also keeps the response cacheable by CDN/edge layers.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREAM_SHUFFLE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const TV_STREAM_SNAPSHOT_CACHE_TTL_MS = Math.max(
  15_000,
  Number(process.env.TV_STREAM_SNAPSHOT_CACHE_TTL_MS || 2 * 60 * 1000)
);
const TV_STREAM_SNAPSHOT_CACHE_MAX_ENTRIES = Math.max(
  50,
  Number(process.env.TV_STREAM_SNAPSHOT_CACHE_MAX_ENTRIES || 500)
);

function streamShuffleSeed(channelId: number, playlistId: number, nowMs: number): number {
  const bucket = Math.floor(nowMs / STREAM_SHUFFLE_WINDOW_MS);
  // Mix three 32-bit values together so neighbouring channels /
  // playlists don't get correlated orderings.  Bitwise ops in JS
  // operate on signed 32-bit ints — wrapping is fine for a PRNG seed.
  return ((channelId * 2654435761) ^ (playlistId * 40503) ^ (bucket * 2246822519)) >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const rng = mulberry32(seed || 1);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

type TvStreamPlaylistRow = {
  itemId: number;
  sortOrder: number;
  durationSeconds: number;
  videoId: number;
  mediaItemId: number | null;
  tokenContract: string;
  tokenId: string;
  title: string | null;
  mimeType: string;
  sourceUri: string;
  mediaSourceType: string | null;
  mediaPlaybackUrl: string | null;
  thumbnailUri: string | null;
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAt: Date | null;
  metadata: unknown;
  uploaderUsername: string | null;
};

type TvStreamBumperRow = {
  id: number;
  title: string;
  mimeType: string;
  durationMs: number;
  category: string;
  ownerUserId: number;
  ownerUsername: string;
};

type TvStreamQueueItem = {
  queueIndex: number;
  playlistIndex: number;
  itemId: number;
  videoId: number;
  bumperId?: number;
  title: string;
  mimeType: string;
  thumbnailUri: string | null;
  sourceUri: string;
  cacheUrl: string;
  durationSeconds: number;
  assetDurationSeconds: number;
  offsetSeconds: number;
  kind: "video" | "gif" | "bumper";
  bumperCategory?: string | null;
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAtIso: string | null;
  objktUrl: string | null;
  addedByUsername: string | null;
};

type TvStreamSnapshotPayload = {
  generatedAt?: string;
  shuffleSeed?: number;
  loopDurationSeconds?: number;
  queue: TvStreamQueueItem[];
  current?: TvStreamQueueItem;
  offline: boolean;
  bumperOnly?: boolean;
  message?: string;
  videosPerBumper?: number;
  baseCadence?: number;
  daypart?: {
    name: DaypartName;
    displayName: string;
    preferredCategory: typeof BUMPER_CATEGORY_PERSONAL | typeof BUMPER_CATEGORY_COMMUNITY | null;
    cadenceMultiplier: number;
  };
};

const tvStreamSnapshotCache = createTvStreamSnapshotCache<TvStreamSnapshotPayload>({
  ttlMs: TV_STREAM_SNAPSHOT_CACHE_TTL_MS,
  maxEntries: TV_STREAM_SNAPSHOT_CACHE_MAX_ENTRIES,
});

function revisionStamp(value: Date | string | null | undefined): string {
  if (!value) return "0";
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return String(value);
  return asDate.toISOString();
}

async function loadTvStreamSnapshotRevision(params: {
  ownerUserId: number;
  activePlaylistId: number | null;
  channelUpdatedAt: Date | string | null | undefined;
  videosPerBumper: number | null | undefined;
}): Promise<string> {
  const { ownerUserId, activePlaylistId, channelUpdatedAt, videosPerBumper } = params;

  const [playlistRevision, bumperRevision] = await Promise.all([
    activePlaylistId
      ? db
          .select({
            itemCount: sql<number>`count(*)::int`,
            playlistItemUpdatedAt: sql<Date | null>`max(${tvPlaylistItems.updatedAt})`,
            videoUpdatedAt: sql<Date | null>`max(${tvChannelVideos.updatedAt})`,
            mediaUpdatedAt: sql<Date | null>`max(${userMediaLibrary.updatedAt})`,
          })
          .from(tvPlaylistItems)
          .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
          .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
          .where(eq(tvPlaylistItems.playlistId, activePlaylistId))
          .then(([row]) =>
            row ?? {
              itemCount: 0,
              playlistItemUpdatedAt: null,
              videoUpdatedAt: null,
              mediaUpdatedAt: null,
            }
          )
      : Promise.resolve({
          itemCount: 0,
          playlistItemUpdatedAt: null,
          videoUpdatedAt: null,
          mediaUpdatedAt: null,
        }),
    db
      .select({
        bumperCount: sql<number>`count(*)::int`,
        bumperCreatedAt: sql<Date | null>`max(${tvBumpers.createdAt})`,
        bumperOwnerUpdatedAt: sql<Date | null>`max(${users.updatedAt})`,
      })
      .from(tvBumpers)
      .innerJoin(users, eq(tvBumpers.ownerUserId, users.id))
      .where(
        sql`(${tvBumpers.category} = ${BUMPER_CATEGORY_COMMUNITY}
             OR ${tvBumpers.ownerUserId} = ${ownerUserId})`
      )
      .then(([row]) =>
        row ?? {
          bumperCount: 0,
          bumperCreatedAt: null,
          bumperOwnerUpdatedAt: null,
        }
      ),
  ]);

  return [
    `channel:${revisionStamp(channelUpdatedAt)}`,
    `cadence:${Number(videosPerBumper ?? 0)}`,
    `playlist:${activePlaylistId ?? 0}`,
    `items:${Number(playlistRevision.itemCount || 0)}`,
    `itemsAt:${revisionStamp(playlistRevision.playlistItemUpdatedAt)}`,
    `videosAt:${revisionStamp(playlistRevision.videoUpdatedAt)}`,
    `mediaAt:${revisionStamp(playlistRevision.mediaUpdatedAt)}`,
    `bumpers:${Number(bumperRevision.bumperCount || 0)}`,
    `bumpersAt:${revisionStamp(bumperRevision.bumperCreatedAt)}`,
    `bumpersOwnerAt:${revisionStamp(bumperRevision.bumperOwnerUpdatedAt)}`,
  ].join("|");
}

function buildTvStreamSnapshotCacheKey(params: {
  channelId: number;
  activePlaylistId: number | null;
  shuffleSeed: number;
  revision: string;
  blacklistSignature: string;
}): string {
  const { channelId, activePlaylistId, shuffleSeed, revision, blacklistSignature } = params;
  return [
    "tv-stream",
    channelId,
    activePlaylistId ?? 0,
    shuffleSeed,
    revision,
    blacklistSignature || "none",
  ].join(":");
}

async function buildTvStreamSnapshot(params: {
  channelId: number;
  ownerUserId: number;
  ownerUsername: string | null;
  videosPerBumper: number | null | undefined;
  activePlaylist: typeof tvPlaylists.$inferSelect | null;
  nowMs: number;
  blacklistedVideoIds: Set<number>;
}): Promise<TvStreamSnapshotPayload> {
  const {
    channelId,
    ownerUserId,
    ownerUsername,
    videosPerBumper,
    activePlaylist,
    nowMs,
    blacklistedVideoIds,
  } = params;

  let rows: TvStreamPlaylistRow[] = [];

  if (activePlaylist) {
    rows = await db
      .select({
        itemId: tvPlaylistItems.id,
        sortOrder: tvPlaylistItems.sortOrder,
        durationSeconds: tvPlaylistItems.durationSeconds,
        videoId: tvChannelVideos.id,
        mediaItemId: tvChannelVideos.mediaItemId,
        tokenContract: tvChannelVideos.tokenContract,
        tokenId: tvChannelVideos.tokenId,
        title: tvChannelVideos.title,
        mimeType: tvChannelVideos.mimeType,
        sourceUri: tvChannelVideos.sourceUri,
        mediaSourceType: userMediaLibrary.sourceType,
        mediaPlaybackUrl: userMediaLibrary.playbackUrl,
        thumbnailUri: tvChannelVideos.thumbnailUri,
        creatorName: tvChannelVideos.creatorName,
        creatorAddress: tvChannelVideos.creatorAddress,
        collectionName: tvChannelVideos.collectionName,
        mintedAt: tvChannelVideos.mintedAt,
        metadata: tvChannelVideos.metadata,
        uploaderUsername: users.username,
      })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
      .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
      .leftJoin(users, eq(userMediaLibrary.ownerUserId, users.id))
      .where(eq(tvPlaylistItems.playlistId, activePlaylist.id))
      .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));
  }

  const bumperRows: TvStreamBumperRow[] = await db
    .select({
      id: tvBumpers.id,
      title: tvBumpers.title,
      mimeType: tvBumpers.mimeType,
      durationMs: tvBumpers.durationMs,
      category: tvBumpers.category,
      ownerUserId: tvBumpers.ownerUserId,
      ownerUsername: users.username,
    })
    .from(tvBumpers)
    .innerJoin(users, eq(tvBumpers.ownerUserId, users.id))
    .where(
      sql`(${tvBumpers.category} = ${BUMPER_CATEGORY_COMMUNITY}
           OR ${tvBumpers.ownerUserId} = ${ownerUserId})`
    )
    .orderBy(asc(tvBumpers.id));

  const playlistId = activePlaylist?.id ?? 0;
  const shuffleSeed = streamShuffleSeed(channelId, playlistId, nowMs);
  const filteredRows = rows.filter((row) => !blacklistedVideoIds.has(row.videoId));
  const effectiveRows = filteredRows.length > 0 ? filteredRows : rows;
  const shuffledRows = seededShuffle(effectiveRows, shuffleSeed);
  const shuffledBumpers = seededShuffle(bumperRows, shuffleSeed ^ 0x9e3779b1);
  const creatorAddresses = Array.from(
    new Set(
      shuffledRows
        .map((row) =>
          resolveTvOverlayMetadata({
            metadata: row.metadata,
            tokenContract: row.tokenContract,
            tokenId: row.tokenId,
            storedCreatorName: row.creatorName,
            storedCreatorAddress: row.creatorAddress,
            storedCollectionName: row.collectionName,
            storedMintedAt: row.mintedAt,
            uploaderUsername: row.uploaderUsername,
            channelOwnerUsername: ownerUsername,
          }).creatorAddress
        )
        .filter((address): address is string => Boolean(address))
    )
  );
  const creatorLabelRows =
    creatorAddresses.length > 0
      ? await db
          .select({
            address: addressLabels.address,
            label: addressLabels.label,
            tezosDomain: addressLabels.tezosDomain,
          })
          .from(addressLabels)
          .where(inArray(addressLabels.address, creatorAddresses))
      : [];
  const creatorLabels = new Map(
    creatorLabelRows.map((row) => [
      row.address,
      { label: row.label, tezosDomain: row.tezosDomain },
    ])
  );

  if (shuffledRows.length === 0) {
    if (shuffledBumpers.length > 0) {
      const bumperQueue: TvStreamQueueItem[] = shuffledBumpers.map((b, index) => ({
        queueIndex: index,
        playlistIndex: -1,
        itemId: -b.id,
        videoId: -b.id,
        bumperId: b.id,
        title: b.title || `Bumper ${b.id}`,
        mimeType: b.mimeType,
        thumbnailUri: null,
        sourceUri: `/api/tv/bumpers/${b.id}/media`,
        cacheUrl: `/api/tv/bumpers/${b.id}/media`,
        durationSeconds: Math.max(1, Math.round(b.durationMs / 1000)),
        assetDurationSeconds: Math.max(1, Math.round(b.durationMs / 1000)),
        offsetSeconds: 0,
        kind: "bumper",
        bumperCategory: b.category,
        creatorName: b.ownerUsername,
        creatorAddress: null,
        collectionName: null,
        mintedAtIso: null,
        objktUrl: null,
        addedByUsername: b.ownerUsername,
      }));
      return {
        loopDurationSeconds: bumperQueue.reduce((sum, item) => sum + item.durationSeconds, 0),
        queue: bumperQueue,
        current: bumperQueue[0],
        offline: false,
        bumperOnly: true,
        message: "Playing bumpers (no playlist videos yet)",
      };
    }

    return {
      queue: [],
      offline: true,
      message: activePlaylist ? "Playlist has no videos" : "No active playlist configured",
    };
  }

  for (const row of shuffledRows) {
    if (isDefaultDuration(row.durationSeconds, row.mimeType)) {
      const probeSourceUri = resolveTvChannelPlaybackSource({
        channelId,
        mediaItemId: row.mediaItemId,
        sourceType: row.mediaSourceType,
        sourceUri: row.sourceUri,
        playbackUrl: row.mediaPlaybackUrl,
      });
      const probeUri = normalizeMediaUri(probeSourceUri) || probeSourceUri;
      probePlaylistItemAsync(row.itemId, probeUri);
    }
  }

  const queue: TvStreamQueueItem[] = [];
  const daypart = daypartForMs(nowMs);
  const baseCadence = Math.max(0, Math.min(20, Number(videosPerBumper ?? 4)));
  const cadence =
    baseCadence === 0
      ? 0
      : Math.max(1, Math.min(20, Math.round(baseCadence * daypart.cadenceMultiplier)));
  const bumperEnabled = cadence > 0 && shuffledBumpers.length > 0;
  let bumperCursor = 0;
  let videosSinceBumper = 0;
  const BUMPER_REPEAT_WINDOW = Math.min(
    Math.max(2, Math.floor(shuffledBumpers.length / 2)),
    8
  );
  const recentBumperIds: number[] = [];
  let lastBumperCategory: string | null = null;

  function pickAdaptiveBumper(): TvStreamBumperRow | null {
    if (shuffledBumpers.length === 0) return null;
    const scan = shuffledBumpers.length;
    for (let i = 0; i < scan; i++) {
      const candidate = shuffledBumpers[(bumperCursor + i) % scan]!;
      if (recentBumperIds.includes(candidate.id)) continue;
      if (
        daypart.preferredCategory !== null &&
        candidate.category !== daypart.preferredCategory
      ) continue;
      if (
        lastBumperCategory !== null &&
        candidate.category === lastBumperCategory
      ) continue;
      bumperCursor = (bumperCursor + i + 1) % scan;
      return candidate;
    }
    for (let i = 0; i < scan; i++) {
      const candidate = shuffledBumpers[(bumperCursor + i) % scan]!;
      if (recentBumperIds.includes(candidate.id)) continue;
      if (
        daypart.preferredCategory !== null &&
        candidate.category !== daypart.preferredCategory
      ) continue;
      bumperCursor = (bumperCursor + i + 1) % scan;
      return candidate;
    }
    for (let i = 0; i < scan; i++) {
      const candidate = shuffledBumpers[(bumperCursor + i) % scan]!;
      if (recentBumperIds.includes(candidate.id)) continue;
      bumperCursor = (bumperCursor + i + 1) % scan;
      return candidate;
    }
    const fallback = shuffledBumpers[bumperCursor % scan]!;
    bumperCursor += 1;
    return fallback;
  }

  shuffledRows.forEach((row, index) => {
    const playbackSource = resolveTvChannelPlaybackSource({
      channelId,
      mediaItemId: row.mediaItemId,
      sourceType: row.mediaSourceType,
      sourceUri: row.sourceUri,
      playbackUrl: row.mediaPlaybackUrl,
    });
    const sourceUri = normalizeMediaUri(playbackSource) || playbackSource;
    const cacheUrl = resolveCacheUrl(sourceUri);
    if (index > 0 && index < 15 && !isSameOriginMediaPath(sourceUri)) {
      prefetchMediaAsync(sourceUri);
    }
    const assetDurationSeconds = Math.max(1, Number(row.durationSeconds || 1));
    const labelEntry = creatorLabels.get(
      resolveTvOverlayMetadata({
        metadata: row.metadata,
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        storedCreatorName: row.creatorName,
        storedCreatorAddress: row.creatorAddress,
        storedCollectionName: row.collectionName,
        storedMintedAt: row.mintedAt,
        uploaderUsername: row.uploaderUsername,
        channelOwnerUsername: ownerUsername,
      }).creatorAddress || ""
    );
    const overlay = resolveTvOverlayMetadata({
      metadata: row.metadata,
      tokenContract: row.tokenContract,
      tokenId: row.tokenId,
      storedCreatorName: row.creatorName,
      storedCreatorAddress: row.creatorAddress,
      storedCollectionName: row.collectionName,
      storedMintedAt: row.mintedAt,
      creatorLabel: labelEntry?.label ?? null,
      creatorDomain: labelEntry?.tezosDomain ?? null,
      uploaderUsername: row.uploaderUsername,
      channelOwnerUsername: ownerUsername,
    });
    queue.push({
      queueIndex: queue.length,
      playlistIndex: index,
      itemId: row.itemId,
      videoId: row.videoId,
      title: row.title || `Video ${row.videoId}`,
      mimeType: row.mimeType,
      thumbnailUri: row.thumbnailUri,
      sourceUri,
      cacheUrl,
      durationSeconds: assetDurationSeconds,
      assetDurationSeconds,
      offsetSeconds: 0,
      kind: row.mimeType === "image/gif" ? "gif" : "video",
      creatorName: overlay.creatorName,
      creatorAddress: overlay.creatorAddress,
      collectionName: overlay.collectionName,
      mintedAtIso:
        overlay.mintedAt && !Number.isNaN(overlay.mintedAt.getTime())
          ? overlay.mintedAt.toISOString()
          : null,
      objktUrl: overlay.objktUrl,
      addedByUsername: overlay.addedByUsername,
    });
    videosSinceBumper += 1;

    const atLastItem = index === shuffledRows.length - 1;
    if (bumperEnabled && (videosSinceBumper >= cadence || atLastItem)) {
      const bumper = pickAdaptiveBumper();
      videosSinceBumper = 0;
      if (!bumper) return;
      recentBumperIds.push(bumper.id);
      if (recentBumperIds.length > BUMPER_REPEAT_WINDOW) {
        recentBumperIds.shift();
      }
      lastBumperCategory = bumper.category ?? null;
      queue.push({
        queueIndex: queue.length,
        playlistIndex: -1,
        itemId: -bumper.id,
        videoId: -bumper.id,
        bumperId: bumper.id,
        title: bumper.title || `Bumper ${bumper.id}`,
        mimeType: bumper.mimeType,
        thumbnailUri: null,
        sourceUri: `/api/tv/bumpers/${bumper.id}/media`,
        cacheUrl: `/api/tv/bumpers/${bumper.id}/media`,
        durationSeconds: Math.max(1, Math.round(bumper.durationMs / 1000)),
        assetDurationSeconds: Math.max(1, Math.round(bumper.durationMs / 1000)),
        offsetSeconds: 0,
        kind: "bumper",
        bumperCategory: bumper.category,
        creatorName: bumper.ownerUsername,
        creatorAddress: null,
        collectionName: null,
        mintedAtIso: null,
        objktUrl: null,
        addedByUsername: bumper.ownerUsername,
      });
    }
  });

  for (let index = 15; index < shuffledRows.length; index += 1) {
    const row = shuffledRows[index]!;
    const playbackSource = resolveTvChannelPlaybackSource({
      channelId,
      mediaItemId: row.mediaItemId,
      sourceType: row.mediaSourceType,
      sourceUri: row.sourceUri,
      playbackUrl: row.mediaPlaybackUrl,
    });
    const uri = normalizeMediaUri(playbackSource) || playbackSource;
    if (isSameOriginMediaPath(uri)) continue;
    prefetchMediaAsync(uri);
  }

  return {
    loopDurationSeconds: queue.reduce((sum, item) => sum + item.durationSeconds, 0),
    queue,
    current: queue[0],
    offline: false,
  };
}

function stripIpfsPrefix(input: string): string {
  return input
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^ipfs\//i, "")
    .replace(/^\/+/, "");
}

function normalizeIpfsGatewayBase(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const pathWithIpfs = cleanPath.toLowerCase().endsWith("/ipfs")
      ? cleanPath
      : `${cleanPath}/ipfs`;
    parsed.pathname = `${pathWithIpfs}/`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 100);
}

function normalizeIpfsUri(uri: string): string {
  // Delegate to the canonical normalizer in `server/lib/media-utils`
  // but pass the TV's preferred gateway (from the admin-configurable
  // list) as the rewrite target.  This keeps gateway preference
  // centralised here while letting every surface — TV, media-library,
  // upload path — agree on the parsing rules for malformed `ipfs://`
  // URIs we see in real token metadata.
  const base = TV_IPFS_GATEWAYS[0] || DEFAULT_IPFS_GATEWAYS[0];
  return normalizeIpfsUriShared(uri, base);
}

function normalizeMediaUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  return normalizePublicHttpUrl(normalized, TV_CACHE_ALLOWED_HOSTS);
}

/**
 * Same-origin paths (`/api/media/42/file`, `/api/tv/bumpers/7/media`,
 * etc.) are already served by this Express app, so wrapping them in
 * `/api/tv/cache/media?url=…` is both pointless and actively broken
 * (the cache proxy rejects any non-public-HTTP(S) scheme).  When the
 * queue builder is assembling `cacheUrl` entries for upload-backed
 * media, let those flow through untouched so the browser fetches them
 * directly.  External sources still go through the IPFS cache.
 */
function isSameOriginMediaPath(uri: string): boolean {
  const value = String(uri || "").trim();
  return value.startsWith("/api/") || value.startsWith("/uploads/");
}

function resolveCacheUrl(sourceUri: string): string {
  if (isSameOriginMediaPath(sourceUri)) return sourceUri;
  return `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;
}

function extractIpfsPath(uri: string): string | null {
  const trimmed = String(uri || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ipfs://")) {
    const path = stripIpfsPrefix(trimmed);
    return path || null;
  }
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/^\/ipfs\/(.+)$/i);
    if (match?.[1]) {
      return `${match[1]}${parsed.search || ""}`;
    }
    const lowerHost = parsed.hostname.toLowerCase();
    if (lowerHost.includes(".ipfs.")) {
      const cid = parsed.hostname.split(".ipfs.")[0];
      if (!cid) return null;
      const cleanPath = parsed.pathname.replace(/^\/+/, "");
      return `${cid}${cleanPath ? `/${cleanPath}` : ""}${parsed.search || ""}`;
    }
  } catch {
    return null;
  }
  return null;
}

function buildMediaFetchCandidates(uri: string): string[] {
  const normalized = normalizeMediaUri(uri);
  if (!normalized) return [];
  const candidates: string[] = [normalized];
  const ipfsPath = extractIpfsPath(normalized);
  if (!ipfsPath) return candidates;

  for (const gateway of TV_IPFS_GATEWAYS) {
    const candidate = normalizeMediaUri(`${gateway}${ipfsPath}`);
    if (!candidate) continue;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = TV_MEDIA_FETCH_TIMEOUT_MS
): Promise<Response> {
  const externalSignal = init.signal as AbortSignal | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Bridge an external abort signal (used by the in-flight cache GET
  // when the client disconnects mid-stream) so we don't keep pulling
  // bytes from IPFS for a viewer who already changed channels.
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

async function fetchWithRedirectGuard(
  startUrl: string,
  maxRedirects = 3,
  init?: RequestInit
): Promise<Response> {
  let currentUrl = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetchWithTimeout(currentUrl, {
      ...init,
      redirect: "manual",
    });
    if (response.status < 300 || response.status > 399) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect location missing");

    const redirected = normalizeMediaUri(new URL(location, currentUrl).toString());
    if (!redirected) throw new Error("Redirect target is not allowed");
    currentUrl = redirected;
  }

  throw new Error("Too many redirects while fetching media");
}

async function fetchMediaWithFallback(
  sourceUrl: string,
  init?: RequestInit
): Promise<{ response: Response; resolvedUrl: string; gatewayIndex: number }> {
  const candidates = buildMediaFetchCandidates(sourceUrl);
  if (candidates.length === 0) {
    throw new Error("Unsupported media URL");
  }

  let lastError: unknown = null;
  let lastResponse: Response | null = null;
  let lastResolvedUrl = candidates[0]!;
  let lastIndex = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidateUrl = candidates[i]!;
    try {
      const response = await fetchWithRedirectGuard(candidateUrl, 3, init);
      if (response.ok && response.body) {
        return { response, resolvedUrl: candidateUrl, gatewayIndex: i };
      }
      lastResponse = response;
      lastResolvedUrl = candidateUrl;
      lastIndex = i;
    } catch (err) {
      lastError = err;
      lastResolvedUrl = candidateUrl;
      lastIndex = i;
    }
  }

  if (lastResponse) {
    return { response: lastResponse, resolvedUrl: lastResolvedUrl, gatewayIndex: lastIndex };
  }

  if (lastError) throw lastError;
  throw new Error("Failed to fetch media from all gateways");
}

function compareTokenIds(a: string, b: string): number {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function decodeStoredBumperData(input: unknown): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  const value = String(input || "");
  if (!value) return Buffer.alloc(0);
  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex");
  }
  return Buffer.from(value, "base64");
}


function extractPlayableAssetFromTokenMetadata(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): PlayableAsset | null {
  const meta = metadata || {};
  const artifactUri = String(meta?.artifactUri || "").trim();
  let formats = parseFormatsFromMetadata(meta);
  if (artifactUri && formats.length > 1) {
    formats = [...formats].sort((a, b) => {
      const ra = resourceUrisLikelySame(a.uri, artifactUri) ? 0 : 1;
      const rb = resourceUrisLikelySame(b.uri, artifactUri) ? 0 : 1;
      return ra - rb;
    });
  }

  for (const format of formats) {
    if (!isPlayableMimeType(format.mimeType)) continue;
    const sourceUri = normalizeMediaUri(format.uri);
    if (!sourceUri) continue;
    return {
      sourceUri,
      mimeType: String(format.mimeType).toLowerCase(),
      title: String(meta?.name || fallbackTitle || "").trim() || null,
      thumbnailUri:
        normalizeMediaUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
    };
  }

  if (artifactUri) {
    const normalized = normalizeMediaUri(artifactUri);
    if (normalized) {
      const mimeType = String(
        resolveArtifactMimeType(meta as Record<string, unknown>) ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(normalized)
      ).toLowerCase();
      if (isPlayableMimeType(mimeType)) {
        return {
          sourceUri: normalized,
          mimeType,
          title: String(meta?.name || fallbackTitle || "").trim() || null,
          thumbnailUri:
            normalizeMediaUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
        };
      }
    }
  }

  return null;
}

/**
 * Shared public-visibility gate for a resolved channel row.
 *
 * Replaces the ad-hoc `isActive`-only filters that several public
 * endpoints used to carry (stream, now, schedule, slug-current).
 * Private channels now stay private even if a caller guesses the
 * numeric id — you must either be the owner or staff to fetch a
 * programming feed for a channel that isn't marked public.
 *
 * Active-only is still a hard gate for everyone: a disabled channel
 * never streams, regardless of who is looking at it.
 */
function canViewChannel(
  channel: {
    ownerUserId: number;
    isPublic?: boolean | null;
    isActive?: boolean | null;
  } | null | undefined,
  user: { id?: number | null; role?: UserRole | null } | null | undefined,
  opts?: { isStaff?: boolean }
): boolean {
  if (!channel) return false;
  if (channel.isActive === false) return false;
  if (channel.isPublic !== false) return true;
  if (!user || !user.id) return false;
  if (channel.ownerUserId === user.id) return true;
  if (opts?.isStaff) return true;
  return false;
}

async function ensureChannelEditable(channelId: number, user: AuthUser) {
  const [channel] = await db
    .select({
      id: tvChannels.id,
      ownerUserId: tvChannels.ownerUserId,
      slug: tvChannels.slug,
      title: tvChannels.title,
      description: tvChannels.description,
      logoUrl: tvChannels.logoUrl,
      bannerUrl: tvChannels.bannerUrl,
      isPublic: tvChannels.isPublic,
      isActive: tvChannels.isActive,
      createdAt: tvChannels.createdAt,
      updatedAt: tvChannels.updatedAt,
    })
    .from(tvChannels)
    .where(eq(tvChannels.id, channelId));

  if (!channel) return { error: "Channel not found", status: 404 as const, channel: null };

  const canEdit = canEditTvChannelPolicy(channel, user);
  if (!canEdit) return { error: "Not authorized", status: 403 as const, channel: null };

  return { error: null, status: 200 as const, channel };
}

function isUniqueConstraintError(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as any).code === "23505" &&
    (err as any).constraint === constraint
  );
}

async function lockTvChannelRow(tx: any, channelId: number): Promise<void> {
  await tx.execute(sql`
    SELECT id
      FROM ${tvChannels}
     WHERE ${tvChannels.id} = ${channelId}
     FOR UPDATE
  `);
}

async function findExistingChannelVideo(
  dbLike: any,
  channelId: number,
  mediaItemId: number | null,
  tokenContract: string,
  tokenId: string
): Promise<{ id: number } | undefined> {
  let existing: { id: number } | undefined;

  if (mediaItemId !== null) {
    [existing] = await dbLike
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, channelId),
          eq(tvChannelVideos.mediaItemId, mediaItemId)
        )
      )
      .limit(1);
  }

  if (!existing) {
    [existing] = await dbLike
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, channelId),
          eq(tvChannelVideos.tokenContract, tokenContract),
          eq(tvChannelVideos.tokenId, tokenId)
        )
      )
      .limit(1);
  }

  return existing;
}

async function uniqueChannelSlug(base: string): Promise<string> {
  const cleanBase = slugify(base) || "channel";
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? cleanBase : `${cleanBase}-${i + 1}`;
    const [exists] = await db
      .select({ id: tvChannels.id })
      .from(tvChannels)
      .where(eq(tvChannels.slug, candidate));
    if (!exists) return candidate;
  }
  const suffix = Date.now().toString(36);
  return `${cleanBase}-${suffix}`;
}

async function ensureCacheDir() {
  await fsPromises.mkdir(TV_CACHE_DIR, { recursive: true });
}

function isImmutableSource(url: string): boolean {
  const raw = String(url || "").toLowerCase();
  if (raw.startsWith("ipfs://")) return true;
  if (raw.includes("/ipfs/")) return true;
  return false;
}

type CacheMeta = TvCacheMirrorMeta;

type CacheEntry = {
  base: string;
  mediaPath: string;
  metaPath: string;
  /** Combined bytes on disk: original + transcode(s). */
  size: number;
  /** Bytes of the original `.bin` alone, for telemetry. */
  originalBytes: number;
  /** Bytes of the transcoded `.720p.mp4` if present, else 0. */
  transcodedBytes: number;
  mtimeMs: number;
  immutable: boolean;
};

function cacheFileBase(url: string): string {
  // Stable cache key across equivalent IPFS gateways: the same CID
  // served via nftstorage.link / w3s.link / ipfs.io / cf-ipfs / dweb.link
  // must resolve to one shared disk entry.  Otherwise a token that shows
  // up on three channels via three different gateway URLs downloads three
  // times and pins three copies against the LRU budget.
  //
  // Non-IPFS URLs (HTTP/HTTPS media hosted elsewhere) keep being keyed
  // on the full URL since the bytes really can differ per host.
  const ipfsPath = extractIpfsPath(url);
  const keyInput = ipfsPath ? `ipfs:${ipfsPath}` : url;
  return createHash("sha256").update(keyInput).digest("hex");
}

function cacheMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.bin`);
}

function cacheMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.json`);
}

/**
 * A transcode lives alongside the original in the same cache dir,
 * tagged with `.720p.mp4` (or whatever height).  The numeric suffix
 * lets future versions (e.g. 480p) co-exist without collision.
 */
function transcodeMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.${TV_TRANSCODE_MAX_HEIGHT}p.mp4`);
}

function transcodeMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.${TV_TRANSCODE_MAX_HEIGHT}p.json`);
}

type TranscodeMeta =
  | {
      status: "ok";
      createdAt: number;
      originalBytes: number;
      transcodedBytes: number;
      elapsedMs: number;
      height: number;
      crf: number;
    }
  | {
      status: "error";
      erroredAt: number;
      error: string;
      height: number;
    };

async function readCacheMeta(base: string): Promise<CacheMeta | null> {
  try {
    const raw = await fsPromises.readFile(cacheMetaPath(base), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCacheMeta(
  base: string,
  data: CacheMeta
) {
  const payload = JSON.stringify({
    ...data,
    updatedAt: data.updatedAt || new Date().toISOString(),
  });
  await fsPromises.writeFile(cacheMetaPath(base), payload, "utf8");
}

const inFlightTvCacheMirrors = new Set<string>();

function queueTvCacheMirror(base: string, meta: CacheMeta | null | undefined): void {
  if (!isTvCacheObjectStorageConfigured()) return;
  if (!meta?.sourceUri || !meta.contentType) return;
  if (meta.mirroredAt && meta.objectStorageKey) return;
  if (inFlightTvCacheMirrors.has(base)) return;
  inFlightTvCacheMirrors.add(base);

  const mediaPath = cacheMediaPath(base);
  const metaPath = cacheMetaPath(base);
  mirrorTvCacheEntryToObjectStorage({
    base,
    mediaPath,
    metaPath,
    meta: {
      ...meta,
      sourceUri: meta.sourceUri,
      contentType: meta.contentType,
      immutable: Boolean(meta.immutable),
      sizeBytes: meta.sizeBytes,
    },
  })
    .then((mirroredMeta) => {
      if (mirroredMeta) {
        logCacheEvent({
          event: "mirror.complete",
          source: shortHashForLog(String(mirroredMeta.sourceUri || "")),
          bytes: mirroredMeta.sizeBytes || null,
        });
      }
    })
    .catch((err) => {
      logCacheEvent({
        event: "mirror.error",
        source: shortHashForLog(String(meta.sourceUri || base)),
        message: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      inFlightTvCacheMirrors.delete(base);
    });
}

/** Touch the cached file so LRU ordering reflects recent use. */
async function touchCache(mediaPath: string): Promise<void> {
  const now = Date.now() / 1000;
  try {
    await fsPromises.utimes(mediaPath, now, now);
  } catch {
    /* best-effort */
  }
}

/** Enumerate every cache entry and return size + atime for eviction. */
async function listCacheEntries(): Promise<CacheEntry[]> {
  await ensureCacheDir();
  let names: string[];
  try {
    names = await fsPromises.readdir(TV_CACHE_DIR);
  } catch {
    return [];
  }
  const entries: CacheEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".bin")) continue;
    const base = name.slice(0, -4);
    const mediaPath = cacheMediaPath(base);
    const metaPath = cacheMetaPath(base);
    try {
      const stat = await fsPromises.stat(mediaPath);
      const meta = await readCacheMeta(base);
      // If we have a transcode, count its bytes against the same
      // entry so LRU pressure sees the real on-disk footprint.
      let transcodedBytes = 0;
      try {
        const tStat = await fsPromises.stat(transcodeMediaPath(base));
        if (tStat.size > 0) transcodedBytes = tStat.size;
      } catch {
        /* no transcode present — that's fine */
      }
      entries.push({
        base,
        mediaPath,
        metaPath,
        size: stat.size + transcodedBytes,
        originalBytes: stat.size,
        transcodedBytes,
        mtimeMs: stat.mtimeMs,
        immutable: Boolean(meta?.immutable),
      });
    } catch {
      /* skip partial entries */
    }
  }
  return entries;
}

async function deleteCacheEntry(entry: CacheEntry): Promise<void> {
  // Evict the original along with any transcoded siblings — once the
  // bin is gone the transcode can't be re-hydrated on miss anyway.
  const siblingPatterns = [".720p.mp4", ".720p.json", ".480p.mp4", ".480p.json"];
  const siblings = siblingPatterns.map((suffix) =>
    path.join(TV_CACHE_DIR, `${entry.base}${suffix}`)
  );
  await Promise.all([
    fsPromises.unlink(entry.mediaPath).catch(() => undefined),
    fsPromises.unlink(entry.metaPath).catch(() => undefined),
    ...siblings.map((p) => fsPromises.unlink(p).catch(() => undefined)),
  ]);
}

/**
 * Evict least-recently-used entries until the combined size of the
 * cache is at or under TV_CACHE_MAX_TOTAL_BYTES.
 *
 * Immutable (IPFS) entries are eligible for eviction once the budget
 * is exceeded — they are just more expensive to refetch than HTTP.
 */
async function enforceCacheBudget(existing?: CacheEntry[]): Promise<void> {
  const entries = existing ?? (await listCacheEntries());
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total <= TV_CACHE_MAX_TOTAL_BYTES) return;
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of entries) {
    if (total <= TV_CACHE_MAX_TOTAL_BYTES) break;
    await deleteCacheEntry(entry);
    total -= entry.size;
  }
}

async function cleanupTmpCacheFiles(now: number): Promise<number> {
  let names: string[];
  try {
    names = await fsPromises.readdir(TV_CACHE_DIR);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".tmp")) continue;
    const full = path.join(TV_CACHE_DIR, name);
    const stat = await fsPromises.stat(full).catch(() => null);
    if (!stat || now - stat.mtimeMs < TV_CACHE_TMP_MAX_AGE_MS) continue;
    await fsPromises.unlink(full).then(
      () => {
        removed += 1;
      },
      () => undefined
    );
  }
  return removed;
}

async function cleanupTvCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCleanupAt < TV_CACHE_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  await cleanupTmpCacheFiles(now);
  const entries = await listCacheEntries();
  const survivors: CacheEntry[] = [];
  for (const entry of entries) {
    // TTL-evict only non-immutable entries (IPFS is content-addressed
    // so its bytes can never change).
    if (!entry.immutable && now - entry.mtimeMs > TV_CACHE_MAX_AGE_MS) {
      await deleteCacheEntry(entry);
      continue;
    }
    survivors.push(entry);
  }
  await enforceCacheBudget(survivors);
}

/**
 * External-facing force-eviction used by the scheduled `tv-cache-evict`
 * background job and the `scripts/tv-cache-evict.ts` CLI. Guarantees a
 * pass regardless of when the last in-line cleanup happened.
 */
/**
 * One-shot rekey of the on-disk cache after `cacheFileBase` was
 * switched from `sha256(fullUrl)` to `sha256("ipfs:<cidPath>")`.
 *
 * Without this, every pre-existing IPFS entry is orphaned — its bytes
 * sit on disk forever while the code looks for them under a different
 * filename and dutifully re-downloads the same CID from scratch.  On
 * a server with ~1200 IPFS items that's several GB of wasted bandwidth
 * and multi-minute cold fetches for viewers.
 *
 * Each entry already has a `.json` sidecar containing `sourceUri`, so
 * the migration is deterministic and cheap: parse, recompute the key,
 * rename.  Safe to run on every boot — once the filenames match the
 * new scheme it becomes a no-op.  On key collision we keep the larger
 * / newer file and drop the loser, since both represent the same CID.
 */
export async function migrateTvCacheKeys(): Promise<{
  scanned: number;
  renamed: number;
  collisions: number;
  orphanedMeta: number;
  errors: number;
}> {
  await ensureCacheDir();
  let names: string[];
  try {
    names = await fsPromises.readdir(TV_CACHE_DIR);
  } catch {
    return { scanned: 0, renamed: 0, collisions: 0, orphanedMeta: 0, errors: 0 };
  }
  // Only rename original meta sidecars (`<base>.json`) — transcode
  // sidecars (e.g. `<base>.720p.json`) belong to a `<base>.bin` whose
  // rename is driven from the original sidecar, not by scanning the
  // derived file directly.
  const metaFiles = names.filter(
    (n) => n.endsWith(".json") && !/\.\d+p\.json$/.test(n)
  );
  const result = {
    scanned: metaFiles.length,
    renamed: 0,
    collisions: 0,
    orphanedMeta: 0,
    errors: 0,
  };

  for (const metaName of metaFiles) {
    const oldBase = metaName.replace(/\.json$/, "");
    const oldMetaPath = path.join(TV_CACHE_DIR, metaName);
    const oldMediaPath = path.join(TV_CACHE_DIR, `${oldBase}.bin`);

    let meta: CacheMeta | null;
    try {
      const raw = await fsPromises.readFile(oldMetaPath, "utf8");
      meta = JSON.parse(raw);
    } catch {
      result.errors += 1;
      continue;
    }
    const sourceUri = meta?.sourceUri;
    if (!sourceUri || typeof sourceUri !== "string") continue;

    const newBase = cacheFileBase(sourceUri);
    if (newBase === oldBase) continue; // already in new format

    const newMetaPath = path.join(TV_CACHE_DIR, `${newBase}.json`);
    const newMediaPath = path.join(TV_CACHE_DIR, `${newBase}.bin`);

    let oldMediaStat: import("fs").Stats | null = null;
    try {
      oldMediaStat = await fsPromises.stat(oldMediaPath);
    } catch {
      // Meta without its .bin — dead sidecar, drop it so we don't
      // keep re-scanning it.
      try {
        await fsPromises.unlink(oldMetaPath);
      } catch {
        /* best-effort */
      }
      result.orphanedMeta += 1;
      continue;
    }

    let newMediaStat: import("fs").Stats | null = null;
    try {
      newMediaStat = await fsPromises.stat(newMediaPath);
    } catch {
      newMediaStat = null;
    }

    try {
      if (newMediaStat) {
        // Same CID cached under both keys — keep the fuller / newer
        // copy, discard the other.  IPFS content is immutable so
        // either copy is byte-identical unless one is a partial write
        // from a prior crash; prefer the bigger/newer one.
        const newerIsBetter =
          newMediaStat.size > oldMediaStat.size ||
          (newMediaStat.size === oldMediaStat.size &&
            newMediaStat.mtimeMs >= oldMediaStat.mtimeMs);
        if (newerIsBetter) {
          await fsPromises.unlink(oldMediaPath).catch(() => undefined);
          await fsPromises.unlink(oldMetaPath).catch(() => undefined);
        } else {
          await fsPromises.rename(oldMediaPath, newMediaPath);
          await fsPromises.rename(oldMetaPath, newMetaPath);
        }
        result.collisions += 1;
      } else {
        await fsPromises.rename(oldMediaPath, newMediaPath);
        await fsPromises.rename(oldMetaPath, newMetaPath);
        result.renamed += 1;
      }
    } catch (err) {
      result.errors += 1;
      console.warn(
        `[tv-cache] migrate rename failed ${oldBase} -> ${newBase}:`,
        err
      );
    }
  }

  return result;
}

export async function runTvCacheEviction(): Promise<{
  beforeBytes: number;
  afterBytes: number;
  removed: number;
  kept: number;
}> {
  const before = await listCacheEntries();
  const beforeBytes = before.reduce((sum, e) => sum + e.size, 0);
  await cleanupTvCache(true);
  const after = await listCacheEntries();
  const afterBytes = after.reduce((sum, e) => sum + e.size, 0);
  return {
    beforeBytes,
    afterBytes,
    removed: before.length - after.length,
    kept: after.length,
  };
}

/** Read-only snapshot of cache state for ops/debug. */
export async function readTvCacheStats() {
  const entries = await listCacheEntries();
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const originalBytes = entries.reduce((sum, e) => sum + e.originalBytes, 0);
  const transcodedBytes = entries.reduce((sum, e) => sum + e.transcodedBytes, 0);
  const transcodedCount = entries.filter((e) => e.transcodedBytes > 0).length;
  const immutableCount = entries.filter((e) => e.immutable).length;
  return {
    dir: TV_CACHE_DIR,
    fileCount: entries.length,
    immutableCount,
    mutableCount: entries.length - immutableCount,
    totalBytes,
    originalBytes,
    transcodedBytes,
    transcodedCount,
    maxTotalBytes: TV_CACHE_MAX_TOTAL_BYTES,
    maxFileBytes: TV_CACHE_MAX_REMOTE_BYTES,
    ttlMs: TV_CACHE_MAX_AGE_MS,
    transcode: {
      enabled: TV_TRANSCODE_ENABLED,
      thresholdBytes: TV_TRANSCODE_THRESHOLD_BYTES,
      maxHeight: TV_TRANSCODE_MAX_HEIGHT,
      crf: TV_TRANSCODE_CRF,
    },
  };
}

async function ensureMediaCached(
  url: string,
  opts: { allowImages?: boolean } = {}
): Promise<{
  mediaPath: string;
  contentType: string;
  fromCache: boolean;
  bytes: number;
  ttfbMs: number;
  totalMs: number;
  resolvedUrl: string;
}> {
  await ensureCacheDir();
  cleanupTvCache().catch(() => undefined);

  const startedAt = Date.now();
  const base = cacheFileBase(url);
  const mediaPath = cacheMediaPath(base);
  // Per-call temp filename: prevents prefetch + on-demand serving
  // for the same URI from clobbering each other's bytes when both
  // race to populate the cache simultaneously.
  const tempPath = `${mediaPath}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  const immutable = isImmutableSource(url);
  const meta = await readCacheMeta(base);
  const sourceTag = shortHashForLog(url);
  const allowImages = opts.allowImages === true;

  try {
    const stat = await fsPromises.stat(mediaPath);
    const ttlOk = immutable || Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS;
    if (ttlOk) {
      touchCache(mediaPath).catch(() => undefined);
      const effectiveMeta: CacheMeta = {
        contentType: meta?.contentType || guessMimeTypeFromUri(url),
        immutable,
        sourceUri: meta?.sourceUri || url,
        sizeBytes: stat.size,
        updatedAt: meta?.updatedAt || new Date().toISOString(),
        objectStorageBucket: meta?.objectStorageBucket,
        objectStorageKey: meta?.objectStorageKey,
        objectStorageMetaKey: meta?.objectStorageMetaKey,
        mirroredAt: meta?.mirroredAt,
      };
      const effectiveContentType =
        effectiveMeta.contentType || "application/octet-stream";
      if (!isAllowedMediaCacheContentType(effectiveContentType, { allowImages })) {
        throw new Error(`Unsupported cached media content type: ${effectiveContentType}`);
      }
      queueTvCacheMirror(base, effectiveMeta);
      logCacheEvent({
        event: "hit",
        source: sourceTag,
        bytes: stat.size,
        elapsedMs: Date.now() - startedAt,
      });
      return {
        mediaPath,
        contentType: effectiveMeta.contentType || "application/octet-stream",
        fromCache: true,
        bytes: stat.size,
        ttfbMs: 0,
        totalMs: Date.now() - startedAt,
        resolvedUrl: url,
      };
    }
  } catch {
    // cache miss
  }

  const promoted = await promoteTvCacheEntryFromObjectStorage({
    base,
    mediaPath,
    metaPath: cacheMetaPath(base),
    fallbackSourceUri: url,
    fallbackContentType: meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream",
    fallbackImmutable: immutable,
  });
  if (promoted) {
    touchCache(mediaPath).catch(() => undefined);
    logCacheEvent({
      event: "object.hit",
      source: sourceTag,
      bytes: promoted.bytes,
      elapsedMs: Date.now() - startedAt,
    });
    const promotedContentType =
      promoted.meta.contentType || guessMimeTypeFromUri(url) || "application/octet-stream";
    if (!isAllowedMediaCacheContentType(promotedContentType, { allowImages })) {
      throw new Error(`Unsupported object media content type: ${promotedContentType}`);
    }
    return {
      mediaPath,
      contentType: promotedContentType,
      fromCache: true,
      bytes: promoted.bytes,
      ttfbMs: 0,
      totalMs: Date.now() - startedAt,
      resolvedUrl: url,
    };
  }

  const fetchStart = Date.now();
  const { response, resolvedUrl, gatewayIndex } = await fetchMediaWithFallback(url);
  const ttfbMs = Date.now() - fetchStart;
  if (!response.ok || !response.body) {
    logCacheEvent({
      event: "error",
      source: sourceTag,
      status: response.status,
      gatewayIndex,
      ttfbMs,
    });
    throw new Error(`Failed to fetch media: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > TV_CACHE_MAX_REMOTE_BYTES) {
    throw new Error("Remote media exceeds cache file size limit");
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessMimeTypeFromUri(resolvedUrl);
  if (!isAllowedMediaCacheContentType(contentType, { allowImages })) {
    throw new Error(`Unsupported remote media content type: ${contentType}`);
  }

  logCacheEvent({
    event: "miss.first-byte",
    source: sourceTag,
    gatewayIndex,
    ttfbMs,
    contentLength,
    contentType,
  });

  let bytes = 0;
  const byteCounter = new Transform({
    transform(chunk, _enc, callback) {
      bytes += chunk.length;
      if (bytes > TV_CACHE_MAX_REMOTE_BYTES) {
        callback(new Error("Remote media exceeded max allowed bytes"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as any),
      byteCounter,
      createWriteStream(tempPath)
    );
  } catch (err) {
    await fsPromises.unlink(tempPath).catch(() => undefined);
    throw err;
  }
  // Sibling-request tolerance: if a concurrent prefetch / serve has
  // already finalised the canonical path with valid bytes, drop our
  // temp instead of overwriting.  Same race-safety contract used by
  // streamMediaThroughCache.
  let alreadyCached = false;
  try {
    const existing = await fsPromises.stat(mediaPath);
    if (existing.size > 0) alreadyCached = true;
  } catch { /* not present yet → we win the race */ }
  if (alreadyCached) {
    await fsPromises.unlink(tempPath).catch(() => undefined);
  } else {
    await fsPromises.rename(tempPath, mediaPath);
    const freshMeta: CacheMeta = {
      contentType,
      immutable,
      sourceUri: url,
      sizeBytes: bytes,
    };
    await writeCacheMeta(base, freshMeta);
    queueTvCacheMirror(base, freshMeta);
    enforceCacheBudget().catch(() => undefined);
  }

  const totalMs = Date.now() - startedAt;
  logCacheEvent({
    event: "miss.complete",
    source: sourceTag,
    gatewayIndex,
    bytes,
    ttfbMs,
    totalMs,
  });
  return { mediaPath, contentType, fromCache: false, bytes, ttfbMs, totalMs, resolvedUrl };
}

/* ─── Streaming-through proxy ──────────────────────────────
 *
 * On a cache miss we used to wait for the entire IPFS download to
 * finish before sending a single byte to the client.  For a 30 MB
 * video on `ipfs.io` that meant cold starts of 30 s+ — long enough
 * that <video> elements gave up and the channel showed black.
 *
 * `streamMediaThroughCache` does both jobs in parallel: it pipes the
 * IPFS response straight to the client AND tees it to disk so the
 * next viewer of the same channel hits a warm cache.  Range requests
 * are honoured for the warm path so <video> can begin playback after
 * the very first chunk arrives. */
async function streamMediaThroughCache(
  req: any,
  res: any,
  url: string,
  opts: { allowRange?: boolean; allowImages?: boolean } = {}
): Promise<void> {
  const startedAt = Date.now();
  const sourceTag = shortHashForLog(url);
  const base = cacheFileBase(url);
  const mediaPath = cacheMediaPath(base);
  // Per-request temp filename so two concurrent cold misses for the
  // same URL don't clobber each other's bytes — both requests still
  // serve from upstream independently, but only the first to finish
  // wins the rename to the canonical mediaPath.  `Math.random` is
  // sufficient here; the temp file is unlinked moments later.
  const tempPath = `${mediaPath}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  const immutable = isImmutableSource(url);
  const meta = await readCacheMeta(base);
  const allowRange = opts.allowRange !== false;
  const allowImages = opts.allowImages === true;

  await ensureCacheDir();
  cleanupTvCache().catch(() => undefined);

  /* ─ Hot path ─ */
  try {
    const stat = await fsPromises.stat(mediaPath);
    const ttlOk = immutable || Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS;
    if (ttlOk) {
      const effectiveMeta: CacheMeta = {
        contentType: meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream",
        immutable,
        sourceUri: meta?.sourceUri || url,
        sizeBytes: stat.size,
        updatedAt: meta?.updatedAt || new Date().toISOString(),
        objectStorageBucket: meta?.objectStorageBucket,
        objectStorageKey: meta?.objectStorageKey,
        objectStorageMetaKey: meta?.objectStorageMetaKey,
        mirroredAt: meta?.mirroredAt,
      };
      queueTvCacheMirror(base, effectiveMeta);
      // Prefer the 720p H.264 transcode when one is available — it's
      // several times smaller than the original for oversized tokens
      // and streams cleanly over average home connections.  The raw
      // original stays on disk for LRU anchoring + future quality
      // tiers; the transcode is the wire format served to browsers.
      let servePath = mediaPath;
      let serveSize = stat.size;
      let serveContentType =
        meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream";
      let servedFromTranscode = false;
      try {
        const tPath = transcodeMediaPath(base);
        const tStat = await fsPromises.stat(tPath);
        if (tStat.size > 0) {
          servePath = tPath;
          serveSize = tStat.size;
          serveContentType = "video/mp4";
          servedFromTranscode = true;
          touchCache(tPath).catch(() => undefined);
        }
      } catch {
        /* no transcode available — serve the original */
      }
      if (!isAllowedMediaCacheContentType(serveContentType, { allowImages })) {
        logCacheEvent({
          event: "serve.error",
          source: sourceTag,
          reason: "unsupported_cached_content_type",
          contentType: serveContentType,
          elapsedMs: Date.now() - startedAt,
        });
        res.status(415).json({ error: "Unsupported cached media content type" });
        return;
      }
      touchCache(mediaPath).catch(() => undefined);

      const rangeHeader = allowRange ? String(req.headers?.range || "") : "";
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/i);

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", serveContentType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("X-TV-Cache", "HIT");
      if (servedFromTranscode) res.setHeader("X-TV-Transcode", `720p`);

      if (rangeMatch) {
        let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
        let end = rangeMatch[2] ? Number(rangeMatch[2]) : serveSize - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= serveSize) end = serveSize - 1;
        if (start > end) {
          res.status(416);
          res.setHeader("Content-Range", `bytes */${serveSize}`);
          res.end();
          return;
        }
        const length = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${serveSize}`);
        res.setHeader("Content-Length", String(length));

        const stream = createReadStream(servePath, { start, end });
        stream.on("error", (err) => {
          console.error("[tv-cache] hit-range stream error:", err);
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        stream.pipe(res);
      } else {
        res.status(200);
        res.setHeader("Content-Length", String(serveSize));
        const stream = createReadStream(servePath);
        stream.on("error", (err) => {
          console.error("[tv-cache] hit-full stream error:", err);
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        stream.pipe(res);
      }

      logCacheEvent({
        event: "serve.hit",
        source: sourceTag,
        bytes: serveSize,
        ranged: Boolean(rangeMatch),
        transcode: servedFromTranscode || undefined,
        originalBytes: servedFromTranscode ? stat.size : undefined,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
  } catch {
    // cache miss → fall through to network
  }

  const promoted = await promoteTvCacheEntryFromObjectStorage({
    base,
    mediaPath,
    metaPath: cacheMetaPath(base),
    fallbackSourceUri: url,
    fallbackContentType: meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream",
    fallbackImmutable: immutable,
  });
  if (promoted) {
    const promotedMeta = promoted.meta;
    let servePath = mediaPath;
    let serveSize = promoted.bytes;
    let serveContentType =
      promotedMeta.contentType || guessMimeTypeFromUri(url) || "application/octet-stream";
    let servedFromTranscode = false;
    try {
      const tPath = transcodeMediaPath(base);
      const tStat = await fsPromises.stat(tPath);
      if (tStat.size > 0) {
        servePath = tPath;
        serveSize = tStat.size;
        serveContentType = "video/mp4";
        servedFromTranscode = true;
        touchCache(tPath).catch(() => undefined);
      }
    } catch {
      /* no local transcode yet */
    }
    if (!isAllowedMediaCacheContentType(serveContentType, { allowImages })) {
      logCacheEvent({
        event: "serve.error",
        source: sourceTag,
        reason: "unsupported_object_content_type",
        contentType: serveContentType,
        elapsedMs: Date.now() - startedAt,
      });
      res.status(415).json({ error: "Unsupported cached media content type" });
      return;
    }
    touchCache(mediaPath).catch(() => undefined);

    const rangeHeader = allowRange ? String(req.headers?.range || "") : "";
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/i);

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", serveContentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.setHeader("X-TV-Cache", "OBJECT");
    if (servedFromTranscode) res.setHeader("X-TV-Transcode", `720p`);

    if (rangeMatch) {
      let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
      let end = rangeMatch[2] ? Number(rangeMatch[2]) : serveSize - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= serveSize) end = serveSize - 1;
      if (start > end) {
        res.status(416);
        res.setHeader("Content-Range", `bytes */${serveSize}`);
        res.end();
        return;
      }
      const length = end - start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${serveSize}`);
      res.setHeader("Content-Length", String(length));

      const stream = createReadStream(servePath, { start, end });
      stream.on("error", (err) => {
        console.error("[tv-cache] object-hit-range stream error:", err);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
    } else {
      res.status(200);
      res.setHeader("Content-Length", String(serveSize));
      const stream = createReadStream(servePath);
      stream.on("error", (err) => {
        console.error("[tv-cache] object-hit-full stream error:", err);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
    }

    logCacheEvent({
      event: "serve.object-hit",
      source: sourceTag,
      bytes: serveSize,
      ranged: Boolean(rangeMatch),
      transcode: servedFromTranscode || undefined,
      originalBytes: servedFromTranscode ? promoted.bytes : undefined,
      elapsedMs: Date.now() - startedAt,
    });
    return;
  }

  /* ─ Cold path: fetch upstream once, tee to client + disk ─ */
  // We DO NOT pass the client's Range header upstream.  Most public
  // IPFS gateways respond to Range with a 206 and only the requested
  // bytes — which means a per-request slice can never seed the disk
  // cache, and every viewer pays the cold-path price forever.  Pull
  // the full payload from upstream once, persist all bytes to disk
  // INDEPENDENTLY of the client (so client disconnects don't truncate
  // the cache), and slice the stream to satisfy the client's Range
  // on our end.
  const upstreamHeaders: Record<string, string> = {};
  const incomingRange = String(req.headers?.range || "").trim();
  const incomingRangeMatch = allowRange ? incomingRange.match(/bytes=(\d*)-(\d*)/i) : null;
  let clientStart = 0;
  let clientEnd: number | null = null;
  if (incomingRangeMatch) {
    clientStart = incomingRangeMatch[1] ? Number(incomingRangeMatch[1]) : 0;
    clientEnd = incomingRangeMatch[2] ? Number(incomingRangeMatch[2]) : null;
    if (!Number.isFinite(clientStart) || clientStart < 0) clientStart = 0;
    if (clientEnd !== null && (!Number.isFinite(clientEnd) || clientEnd < clientStart)) {
      clientEnd = null;
    }
  }

  // Upstream-only abort controller.  We deliberately do NOT bind it
  // to req.close — if the client disconnects after their slice, we
  // still want to drain the rest of the upstream into the disk cache.
  const upstreamAbort = new AbortController();
  let clientGone = false;
  req.on?.("close", () => { clientGone = true; });

  let fetchResult: Awaited<ReturnType<typeof fetchMediaWithFallback>>;
  const fetchStart = Date.now();
  try {
    fetchResult = await fetchMediaWithFallback(url, {
      headers: upstreamHeaders,
      signal: upstreamAbort.signal,
    });
  } catch (err) {
    logCacheEvent({
      event: "serve.error",
      source: sourceTag,
      reason: "fetch_failed",
      message: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - startedAt,
    });
    if (!res.headersSent) res.status(502).json({ error: "Failed to fetch media from source" });
    else res.end();
    return;
  }
  const ttfbMs = Date.now() - fetchStart;
  const { response, resolvedUrl, gatewayIndex } = fetchResult;

  if (!response.ok || !response.body) {
    logCacheEvent({
      event: "serve.error",
      source: sourceTag,
      reason: "upstream_status",
      status: response.status,
      gatewayIndex,
      ttfbMs,
      elapsedMs: Date.now() - startedAt,
    });
    if (!res.headersSent) res.status(response.status || 502).json({ error: "Upstream rejected media" });
    else res.end();
    return;
  }

  const upstreamContentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessMimeTypeFromUri(resolvedUrl) ||
    "application/octet-stream";
  if (!isAllowedMediaCacheContentType(upstreamContentType, { allowImages })) {
    logCacheEvent({
      event: "serve.error",
      source: sourceTag,
      reason: "unsupported_content_type",
      contentType: upstreamContentType,
      gatewayIndex,
      ttfbMs,
      elapsedMs: Date.now() - startedAt,
    });
    try {
      await response.body.cancel();
    } catch {
      /* best-effort upstream abort */
    }
    if (!res.headersSent) {
      res.status(415).json({ error: "Unsupported remote media content type" });
    } else {
      res.end();
    }
    return;
  }
  const upstreamContentLength = Number(response.headers.get("content-length") || 0);
  // Even though we didn't send a Range header, some gateways return
  // 206 anyway.  Mine the total file size from Content-Range when
  // present so we can do byte slicing for the client.
  const upstreamContentRange = response.headers.get("content-range") || "";
  const totalBytesKnown =
    upstreamContentLength > 0
      ? upstreamContentLength
      : (() => {
          const m = upstreamContentRange.match(/\/(\d+)\s*$/);
          return m ? Number(m[1]) : 0;
        })();
  // Persist when upstream gave us the full payload (200 + complete).
  // If upstream returned 206 we'd be saving a partial file, so skip.
  const isFullPayload =
    !upstreamContentRange &&
    (upstreamContentLength <= 0 || upstreamContentLength <= TV_CACHE_MAX_REMOTE_BYTES);

  // Build the response status + headers based on what the client
  // asked for.
  res.setHeader("Content-Type", upstreamContentType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-TV-Cache", "MISS");
  res.setHeader("X-TV-Cache-Gateway", String(gatewayIndex));

  const willSliceForClient =
    incomingRangeMatch !== null &&
    totalBytesKnown > 0 &&
    (clientStart > 0 || (clientEnd !== null && clientEnd < totalBytesKnown - 1));
  let sliceEnd = clientEnd;
  if (willSliceForClient) {
    if (sliceEnd === null || sliceEnd >= totalBytesKnown) sliceEnd = totalBytesKnown - 1;
    if (clientStart >= totalBytesKnown) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${totalBytesKnown}`);
      res.end();
      logCacheEvent({
        event: "serve.error",
        source: sourceTag,
        reason: "client_range_out_of_bounds",
        clientRange: incomingRange,
        totalBytes: totalBytesKnown,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${clientStart}-${sliceEnd}/${totalBytesKnown}`);
    res.setHeader("Content-Length", String((sliceEnd as number) - clientStart + 1));
  } else {
    res.status(200);
    if (upstreamContentLength > 0) res.setHeader("Content-Length", String(upstreamContentLength));
  }

  let firstByteLogged = false;
  let bytesForwarded = 0;
  let bytesPersisted = 0;
  let oversize = false;
  let diskClosed = false;
  const writeToDisk = isFullPayload ? createWriteStream(tempPath) : null;
  let upstreamOffset = 0;

  const finishDisk = (success: boolean): Promise<void> =>
    new Promise<void>((resolve) => {
      if (!writeToDisk || diskClosed) {
        diskClosed = true;
        resolve();
        return;
      }
      diskClosed = true;
      if (success && !oversize) {
        writeToDisk.end(() => resolve());
      } else {
        writeToDisk.destroy();
        resolve();
      }
    });

  // Manual tee: read every upstream chunk, write to disk regardless
  // of client lifetime, slice for client only if they're still
  // listening.  This decouples cache-seed completion from client
  // disconnect timing.
  const upstream = Readable.fromWeb(response.body as any);
  let pipelineErr: Error | undefined;

  await new Promise<void>((resolve) => {
    let closed = false;
    const finalise = () => {
      if (closed) return;
      closed = true;
      resolve();
    };

    upstream.on("data", (chunk: Buffer) => {
      const chunkStart = upstreamOffset;
      upstreamOffset += chunk.length;

      if (!firstByteLogged) {
        firstByteLogged = true;
        logCacheEvent({
          event: "serve.first-byte",
          source: sourceTag,
          gatewayIndex,
          ttfbMs,
          status: response.status,
          contentType: upstreamContentType,
          contentLength: upstreamContentLength,
          ranged: Boolean(upstreamContentRange),
          willPersist: Boolean(writeToDisk),
          clientRange: willSliceForClient ? `${clientStart}-${sliceEnd}` : null,
          totalBytes: totalBytesKnown || null,
        });
      }

      // Disk pipe — independent of client.
      if (writeToDisk && !oversize) {
        bytesPersisted += chunk.length;
        if (bytesPersisted > TV_CACHE_MAX_REMOTE_BYTES) {
          oversize = true;
          writeToDisk.destroy();
        } else {
          const ok = writeToDisk.write(chunk);
          if (!ok) {
            // Apply backpressure — pause upstream until disk drains.
            upstream.pause();
            writeToDisk.once("drain", () => {
              if (!clientGone || writeToDisk) upstream.resume();
            });
          }
        }
      }

      // Client pipe — only if they're still here and want this byte
      // range.
      if (clientGone) return;
      let outChunk: Buffer | null = chunk;
      if (willSliceForClient) {
        const sliceStartLocal = Math.max(0, clientStart - chunkStart);
        const sliceEndLocal = Math.min(chunk.length - 1, (sliceEnd as number) - chunkStart);
        if (
          sliceStartLocal > chunk.length - 1 ||
          sliceEndLocal < 0 ||
          sliceStartLocal > sliceEndLocal
        ) {
          outChunk = null;
        } else if (sliceStartLocal === 0 && sliceEndLocal === chunk.length - 1) {
          outChunk = chunk;
        } else {
          outChunk = chunk.slice(sliceStartLocal, sliceEndLocal + 1);
        }
      }
      if (outChunk && outChunk.length > 0) {
        try {
          const ok = res.write(outChunk);
          bytesForwarded += outChunk.length;
          if (!ok) {
            upstream.pause();
            res.once("drain", () => upstream.resume());
          }
        } catch (err) {
          // Client died — keep upstream alive for disk.
          clientGone = true;
        }
      }
    });

    upstream.on("end", () => {
      if (!clientGone) {
        try { res.end(); } catch { /* ignore */ }
      }
      finishDisk(true).then(finalise);
    });

    upstream.on("error", (err: Error) => {
      pipelineErr = err;
      if (!clientGone) {
        try { res.end(); } catch { /* ignore */ }
      }
      finishDisk(false).then(finalise);
    });

    res.on?.("close", () => {
      // Client gone — keep upstream draining to disk.
      clientGone = true;
    });
  });

  if (pipelineErr) {
    logCacheEvent({
      event: "serve.error",
      source: sourceTag,
      reason: "upstream_failed",
      message: pipelineErr.message,
      gatewayIndex,
      ttfbMs,
      bytes: bytesForwarded,
      persisted: bytesPersisted,
      elapsedMs: Date.now() - startedAt,
    });
    await fsPromises.unlink(tempPath).catch(() => undefined);
    if (!res.headersSent) {
      try {
        res.status(502).end();
      } catch {
        /* swallow — client likely disconnected */
      }
    }
    return;
  }

  // Only persist the cache entry when we got the FULL upstream
  // payload.  If the upstream advertised a Content-Length we can
  // verify exact byte count; otherwise we trust the natural EOF and
  // accept whatever bytes arrived (chunked transfer).
  const totalExpected = totalBytesKnown || upstreamContentLength;
  const bytesComplete =
    !!writeToDisk &&
    !oversize &&
    bytesPersisted > 0 &&
    (totalExpected <= 0 || bytesPersisted === totalExpected);

  if (bytesComplete) {
    try {
      // If a sibling cold request already finalised the canonical
      // path while we were streaming, prefer their copy: stat it,
      // and if it looks valid (non-empty), drop our temp file so
      // we don't overwrite a perfectly good cache entry.
      let alreadyCached = false;
      try {
        const existing = await fsPromises.stat(mediaPath);
        if (existing.size > 0) alreadyCached = true;
      } catch { /* not present yet → we win the race */ }
      if (alreadyCached) {
        await fsPromises.unlink(tempPath).catch(() => undefined);
      } else {
        await fsPromises.rename(tempPath, mediaPath);
        const freshMeta: CacheMeta = {
          contentType: upstreamContentType,
          immutable,
          sourceUri: url,
          sizeBytes: bytesPersisted,
        };
        await writeCacheMeta(base, freshMeta);
        queueTvCacheMirror(base, freshMeta);
        enforceCacheBudget().catch(() => undefined);
      }
    } catch (err) {
      console.warn("[tv-cache] persist failed:", err);
      await fsPromises.unlink(tempPath).catch(() => undefined);
    }
  } else if (writeToDisk) {
    if (totalExpected > 0 && bytesPersisted !== totalExpected) {
      logCacheEvent({
        event: "serve.persist-skipped",
        source: sourceTag,
        reason: "incomplete_payload",
        bytes: bytesPersisted,
        expected: totalExpected,
      });
    }
    await fsPromises.unlink(tempPath).catch(() => undefined);
  }

  logCacheEvent({
    event: "serve.complete",
    source: sourceTag,
    gatewayIndex,
    ttfbMs,
    bytes: bytesForwarded,
    persisted: writeToDisk && !oversize ? bytesPersisted : 0,
    elapsedMs: Date.now() - startedAt,
  });
}

// ─── Duration probing helpers ──────────────────────────────
//
// Users should never have to enter durations.  We probe the artifact
// itself (via ffprobe) once the media is cached, then write the real
// duration back into the playlist item.  GIFs report their single-loop
// duration; the broadcast helper expands that into the on-air display
// window before cursor math is applied.

const DEFAULT_VIDEO_DURATION_SEC = 120;
const DEFAULT_GIF_DURATION_SEC = 8;
const MAX_STORED_DURATION_SEC = 60 * 60; // 1h ceiling

function isDefaultDuration(value: number, mimeType: string): boolean {
  const d = Math.round(Number(value) || 0);
  if (mimeType === "image/gif") return d <= 0 || d === DEFAULT_GIF_DURATION_SEC;
  return d <= 0 || d === DEFAULT_VIDEO_DURATION_SEC;
}

async function cacheAndProbe(sourceUri: string): Promise<number | null> {
  try {
    if (isSameOriginMediaPath(sourceUri)) return null;
    const { mediaPath } = await ensureMediaCached(sourceUri);
    const probe = await probeMediaDuration(mediaPath);
    if (!probe) return null;
    const seconds = Math.max(1, Math.min(MAX_STORED_DURATION_SEC, Math.round(probe.durationSeconds)));
    return seconds;
  } catch (err) {
    return null;
  }
}

// Fire-and-forget: probe duration and UPDATE the playlist item.
// Used on add-to-channel and lazily when stream sees suspect durations.
const inFlightProbes = new Set<number>();
function probePlaylistItemAsync(itemId: number, sourceUri: string): void {
  if (!Number.isInteger(itemId) || itemId <= 0) return;
  if (inFlightProbes.has(itemId)) return;
  inFlightProbes.add(itemId);
  (async () => {
    try {
      const duration = await cacheAndProbe(sourceUri);
      if (!duration) return;
      await db
        .update(tvPlaylistItems)
        .set({ durationSeconds: duration, updatedAt: new Date() })
        .where(eq(tvPlaylistItems.id, itemId));
    } catch {
      /* best-effort */
    } finally {
      inFlightProbes.delete(itemId);
    }
  })();
}

// Background warm-up of the media cache (no probe) for lookahead.
const inFlightPrefetch = new Set<string>();
function prefetchMediaAsync(sourceUri: string): void {
  const key = String(sourceUri || "");
  if (!key || isSameOriginMediaPath(key) || inFlightPrefetch.has(key)) return;
  inFlightPrefetch.add(key);
  ensureMediaCached(key)
    .catch(() => undefined)
    .finally(() => {
      inFlightPrefetch.delete(key);
    });
}

/* ─── Server-side cache warmer ─────────────────────────────
 *
 * The cache used to be populated entirely by whichever unlucky viewer
 * opened the TV app first — they ate the IPFS cold-fetch penalty and
 * warmed the disk for everyone else.  That meant every fresh deploy,
 * every cache eviction, and every new playlist item forced at least
 * one human to sit through 30-60s of spinner before the channel felt
 * smooth again.
 *
 * This module walks every active channel's active playlist and
 * downloads each artifact to `/app/cache/tv/<sha>.bin` on the
 * persistent Docker volume, proactively and out-of-band, so that by
 * the time a user actually opens the channel the bytes are already on
 * local disk.  Because IPFS CIDs are content-addressed and the cache
 * key is CID-normalized (see `cacheFileBase`), the same token shared
 * across multiple channels only downloads once.
 *
 * Concurrency is capped so a boot-time sweep of a large platform
 * channel can't saturate the host or burn through public-gateway rate
 * limits.  Failures are logged but never thrown — a dead CID on one
 * item must not prevent the other 99 from warming. */
const TV_CACHE_WARM_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.TV_CACHE_WARM_CONCURRENCY || 3))
);
const TV_CACHE_WARM_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.TV_CACHE_WARM_INTERVAL_MS || 2 * 60 * 1000)
);
const TV_CACHE_WARM_BOOT_DELAY_MS = Math.max(
  1_000,
  Number(process.env.TV_CACHE_WARM_BOOT_DELAY_MS || 15_000)
);

type WarmOutcome = "hit" | "fetched" | "failed" | "skipped";

/**
 * Pull one URI into the disk cache, skipping the network entirely if
 * the file is already present and fresh.  Returns a structured outcome
 * so the caller (batch warmer / scheduler job) can tally results.
 */
async function warmOne(sourceUri: string): Promise<{
  outcome: WarmOutcome;
  bytes: number;
  totalMs: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const url = normalizeMediaUri(sourceUri);
  if (!url) {
    return { outcome: "skipped", bytes: 0, totalMs: 0 };
  }
  await ensureCacheDir();

  const base = cacheFileBase(url);
  const mediaPath = cacheMediaPath(base);
  const immutable = isImmutableSource(url);

  try {
    const stat = await fsPromises.stat(mediaPath);
    const ttlOk = immutable || Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS;
    if (ttlOk && stat.size > 0) {
      const meta = await readCacheMeta(base);
      touchCache(mediaPath).catch(() => undefined);
      queueTvCacheMirror(base, {
        contentType: meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream",
        immutable,
        sourceUri: meta?.sourceUri || url,
        sizeBytes: stat.size,
        updatedAt: meta?.updatedAt || new Date().toISOString(),
        objectStorageBucket: meta?.objectStorageBucket,
        objectStorageKey: meta?.objectStorageKey,
        objectStorageMetaKey: meta?.objectStorageMetaKey,
        mirroredAt: meta?.mirroredAt,
      });
      return { outcome: "hit", bytes: stat.size, totalMs: Date.now() - startedAt };
    }
  } catch {
    // cache miss → fall through to fetch
  }

  try {
    const { bytes } = await ensureMediaCached(url);
    return { outcome: "fetched", bytes, totalMs: Date.now() - startedAt };
  } catch (err) {
    return {
      outcome: "failed",
      bytes: 0,
      totalMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Walk a small worker pool over a batch of URIs.  Returns a summary
 * suitable for the scheduler `JobResult` and cockpit UI.  Duplicate
 * URIs are collapsed up front — same CID via different gateway hosts
 * would already share the on-disk entry after `cacheFileBase`
 * normalization, but dedupe cheaply before the I/O anyway.
 */
async function warmBatch(
  sourceUris: string[],
  label: string
): Promise<{
  scanned: number;
  hits: number;
  fetched: number;
  failed: number;
  bytesFetched: number;
  failures: Array<{ source: string; error: string }>;
}> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of sourceUris) {
    const url = normalizeMediaUri(String(raw || ""));
    if (!url) continue;
    // Dedupe by CID-aware cache key so three gateway variants of the
    // same artifact don't each take up a slot in the worker pool.
    const key = cacheFileBase(url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }

  const summary = {
    scanned: unique.length,
    hits: 0,
    fetched: 0,
    failed: 0,
    bytesFetched: 0,
    failures: [] as Array<{ source: string; error: string }>,
  };
  if (unique.length === 0) return summary;

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= unique.length) return;
      const uri = unique[idx]!;
      const result = await warmOne(uri);
      if (result.outcome === "hit") summary.hits += 1;
      else if (result.outcome === "fetched") {
        summary.fetched += 1;
        summary.bytesFetched += result.bytes;
      } else if (result.outcome === "failed") {
        summary.failed += 1;
        if (summary.failures.length < 20) {
          summary.failures.push({
            source: shortHashForLog(uri),
            error: result.error || "unknown",
          });
        }
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(TV_CACHE_WARM_CONCURRENCY, unique.length) },
    () => worker()
  );
  await Promise.all(workers);

  logCacheEvent({
    event: "warm.batch",
    label,
    scanned: summary.scanned,
    hits: summary.hits,
    fetched: summary.fetched,
    failed: summary.failed,
    bytesFetched: summary.bytesFetched,
  });

  return summary;
}

/**
 * Warm every playable item in a single channel's active playlist.
 * Fired on channel mutations (add video, reorder/replace playlist,
 * WTF auto-refresh) and as a per-channel subtask of the full warm
 * sweep.  Bumpers are excluded: they are already on local disk
 * (`/app/uploads/bumpers`) and served directly from there.
 */
export async function warmChannelCache(channelId: number): Promise<{
  scanned: number;
  hits: number;
  fetched: number;
  failed: number;
  bytesFetched: number;
}> {
  if (!Number.isInteger(channelId) || channelId <= 0) {
    return { scanned: 0, hits: 0, fetched: 0, failed: 0, bytesFetched: 0 };
  }
  const rows = await db
    .select({ sourceUri: tvChannelVideos.sourceUri })
    .from(tvPlaylistItems)
    .innerJoin(tvChannelVideos, eq(tvChannelVideos.id, tvPlaylistItems.videoId))
    .innerJoin(tvPlaylists, eq(tvPlaylists.id, tvPlaylistItems.playlistId))
    .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
    .orderBy(asc(tvPlaylistItems.sortOrder));

  const uris = rows.map((r) => String(r.sourceUri || "")).filter(Boolean);
  const summary = await warmBatch(uris, `channel:${channelId}`);
  const { failures: _failures, ...rest } = summary;
  return rest;
}

/** Fire-and-forget channel warm — callers don't want to await it. */
function warmChannelAsync(channelId: number): void {
  warmChannelCache(channelId).catch((err) => {
    console.warn(`[tv-cache-warm] channel ${channelId} failed:`, err);
  });
}

/**
 * Warm every playable item across every active channel.  Runs on a
 * timer from `background-jobs.ts` (every 2 min by default) and once
 * on boot so the cache is primed before the first viewer arrives.
 * Returns totals for the `sync_runs` audit row.
 */
export async function warmAllActiveChannels(): Promise<{
  channels: number;
  scanned: number;
  hits: number;
  fetched: number;
  failed: number;
  bytesFetched: number;
}> {
  const channels = await db
    .select({ id: tvChannels.id })
    .from(tvChannels)
    .where(and(eq(tvChannels.isActive, true), eq(tvChannels.isPublic, true)))
    .orderBy(asc(tvChannels.id));

  // Collapse all channels' playlists into a single URI list so one
  // shared artifact across channels only downloads once this cycle.
  const allUris: string[] = [];
  for (const ch of channels) {
    const rows = await db
      .select({ sourceUri: tvChannelVideos.sourceUri })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvChannelVideos.id, tvPlaylistItems.videoId))
      .innerJoin(tvPlaylists, eq(tvPlaylists.id, tvPlaylistItems.playlistId))
      .where(and(eq(tvPlaylists.channelId, ch.id), eq(tvPlaylists.isActive, true)))
      .orderBy(asc(tvPlaylistItems.sortOrder));
    for (const r of rows) {
      if (r.sourceUri) allUris.push(String(r.sourceUri));
    }
  }

  const started = Date.now();
  const summary = await warmBatch(allUris, "all-channels");
  logCacheEvent({
    event: "warm.sweep",
    channels: channels.length,
    scanned: summary.scanned,
    hits: summary.hits,
    fetched: summary.fetched,
    failed: summary.failed,
    bytesFetched: summary.bytesFetched,
    elapsedMs: Date.now() - started,
  });
  return {
    channels: channels.length,
    scanned: summary.scanned,
    hits: summary.hits,
    fetched: summary.fetched,
    failed: summary.failed,
    bytesFetched: summary.bytesFetched,
  };
}

/** Exposed for scheduler/boot wiring. */
export const TV_CACHE_WARM_TUNING = {
  concurrency: TV_CACHE_WARM_CONCURRENCY,
  intervalMs: TV_CACHE_WARM_INTERVAL_MS,
  bootDelayMs: TV_CACHE_WARM_BOOT_DELAY_MS,
};

/* ─── TV transcode worker ──────────────────────────────────
 *
 * Large token videos (150–500 MB 1080p/4K masters) stream badly over
 * home connections.  We keep the original on the cache volume for
 * LRU anchoring and run ffmpeg once to produce a 720p H.264 + AAC
 * MP4 with +faststart alongside it.  The hot-path prefers the
 * transcode when present, so the browser sees a file it can start
 * playing inside the first ~64 KB.
 *
 * Design notes:
 *   • Strictly serial — ffmpeg is CPU-bound and we'd rather finish
 *     three transcodes in a row than have six half-done competing
 *     for the same cores.
 *   • Per-sweep limit (TV_TRANSCODE_PER_SWEEP) so the scheduler
 *     reclaims the worker every few minutes for eviction + warming
 *     jobs.  Remaining candidates pick up next tick.
 *   • Failures write an `error` sidecar with a 24h cooldown so a
 *     broken source doesn't get re-processed on every sweep.
 *   • The sidecar also doubles as the "done" marker, so a restart
 *     mid-sweep won't re-transcode work that already finished.
 */
async function ffmpegTranscodeVideo(input: string, output: string): Promise<void> {
  const scaleFilter =
    `scale='if(gt(iw/ih,${TV_TRANSCODE_MAX_HEIGHT * 16}/${TV_TRANSCODE_MAX_HEIGHT * 9}),` +
    `min(${TV_TRANSCODE_MAX_HEIGHT * 16 / 9 | 0},iw),-2)':` +
    `'if(gt(iw/ih,${TV_TRANSCODE_MAX_HEIGHT * 16}/${TV_TRANSCODE_MAX_HEIGHT * 9}),-2,` +
    `min(${TV_TRANSCODE_MAX_HEIGHT},ih))':force_original_aspect_ratio=decrease,` +
    `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-i", input,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", String(TV_TRANSCODE_CRF),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-ar", "48000",
    "-vf", scaleFilter,
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "1024",
    "-f", "mp4",
    output,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 32_000) stderr = stderr.slice(-16_000);
    });
    child.once("error", (err) => reject(err));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600).trim()}`));
    });
  });
}

type TranscodeOutcome = "done" | "skipped" | "error";

async function transcodeOne(base: string): Promise<{
  outcome: TranscodeOutcome;
  originalBytes: number;
  transcodedBytes: number;
  elapsedMs: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const inputPath = cacheMediaPath(base);
  const outputPath = transcodeMediaPath(base);
  const metaOutPath = transcodeMetaPath(base);

  // Already done?
  try {
    const outStat = await fsPromises.stat(outputPath);
    if (outStat.size > 0) {
      return {
        outcome: "skipped",
        originalBytes: 0,
        transcodedBytes: outStat.size,
        elapsedMs: Date.now() - startedAt,
      };
    }
  } catch {
    /* no existing output — continue */
  }

  // Previously errored within cooldown window?
  try {
    const raw = await fsPromises.readFile(metaOutPath, "utf8");
    const prior = JSON.parse(raw) as TranscodeMeta;
    if (
      prior.status === "error" &&
      Date.now() - prior.erroredAt < TV_TRANSCODE_ERROR_COOLDOWN_MS
    ) {
      return {
        outcome: "skipped",
        originalBytes: 0,
        transcodedBytes: 0,
        elapsedMs: Date.now() - startedAt,
      };
    }
  } catch {
    /* no prior meta — continue */
  }

  let inputStat: import("fs").Stats;
  try {
    inputStat = await fsPromises.stat(inputPath);
  } catch {
    return {
      outcome: "skipped",
      originalBytes: 0,
      transcodedBytes: 0,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const tempPath =
    `${outputPath}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`;

  logCacheEvent({
    event: "transcode.start",
    source: base,
    originalBytes: inputStat.size,
    height: TV_TRANSCODE_MAX_HEIGHT,
    crf: TV_TRANSCODE_CRF,
  });

  try {
    await ffmpegTranscodeVideo(inputPath, tempPath);
    const outStat = await fsPromises.stat(tempPath);
    if (outStat.size <= 0) throw new Error("ffmpeg produced an empty file");

    // Atomic swap: rename temp → final, then write the sidecar.
    await fsPromises.rename(tempPath, outputPath);
    const successMeta: TranscodeMeta = {
      status: "ok",
      createdAt: Date.now(),
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      elapsedMs: Date.now() - startedAt,
      height: TV_TRANSCODE_MAX_HEIGHT,
      crf: TV_TRANSCODE_CRF,
    };
    await fsPromises
      .writeFile(metaOutPath, JSON.stringify(successMeta), "utf8")
      .catch(() => undefined);

    logCacheEvent({
      event: "transcode.done",
      source: base,
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      ratio: Number((outStat.size / inputStat.size).toFixed(3)),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      outcome: "done",
      originalBytes: inputStat.size,
      transcodedBytes: outStat.size,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    await fsPromises.unlink(tempPath).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    const errorMeta: TranscodeMeta = {
      status: "error",
      erroredAt: Date.now(),
      error: message.slice(0, 400),
      height: TV_TRANSCODE_MAX_HEIGHT,
    };
    await fsPromises
      .writeFile(metaOutPath, JSON.stringify(errorMeta), "utf8")
      .catch(() => undefined);

    logCacheEvent({
      event: "transcode.error",
      source: base,
      originalBytes: inputStat.size,
      error: message.slice(0, 200),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      outcome: "error",
      originalBytes: inputStat.size,
      transcodedBytes: 0,
      elapsedMs: Date.now() - startedAt,
      error: message,
    };
  }
}

/**
 * Walk the cache dir and return bases that are:
 *   • a video (content-type starts with `video/`)
 *   • bigger than TV_TRANSCODE_THRESHOLD_BYTES
 *   • missing a usable transcode
 *   • not in error-cooldown
 *
 * Sorted biggest-first so each sweep tick attacks the worst
 * offenders — the ones most likely to be causing user-visible
 * stutters right now — before nibbling at the tail.
 */
async function scanTranscodeCandidates(): Promise<Array<{ base: string; size: number }>> {
  if (!TV_TRANSCODE_ENABLED) return [];
  await ensureCacheDir();
  let names: string[];
  try {
    names = await fsPromises.readdir(TV_CACHE_DIR);
  } catch {
    return [];
  }

  const heightTag = `${TV_TRANSCODE_MAX_HEIGHT}p`;
  const transcodeSuffix = `.${heightTag}.mp4`;
  const transcodeMetaSuffix = `.${heightTag}.json`;

  const allBases = new Set<string>();
  const haveTranscode = new Set<string>();
  const haveSidecar = new Set<string>();
  for (const name of names) {
    if (name.endsWith(".bin")) allBases.add(name.slice(0, -4));
    else if (name.endsWith(transcodeSuffix)) {
      haveTranscode.add(name.slice(0, -transcodeSuffix.length));
    } else if (name.endsWith(transcodeMetaSuffix)) {
      haveSidecar.add(name.slice(0, -transcodeMetaSuffix.length));
    }
  }

  const out: Array<{ base: string; size: number }> = [];
  for (const base of allBases) {
    if (haveTranscode.has(base)) continue;

    const meta = await readCacheMeta(base);
    const ct = String(meta?.contentType || "").toLowerCase();
    // Accept `video/*`; some gateways mislabel webm as
    // application/octet-stream, but we'd rather miss a few videos
    // than waste ffmpeg cycles on images.  Guessing from the URI
    // also helps when content-type is missing.
    const guessed = guessMimeTypeFromUri(String(meta?.sourceUri || "")) || "";
    const looksVideo = ct.startsWith("video/") || guessed.startsWith("video/");
    if (!looksVideo) continue;

    let stat: import("fs").Stats;
    try {
      stat = await fsPromises.stat(cacheMediaPath(base));
    } catch {
      continue;
    }
    if (stat.size < TV_TRANSCODE_THRESHOLD_BYTES) continue;

    if (haveSidecar.has(base)) {
      try {
        const raw = await fsPromises.readFile(transcodeMetaPath(base), "utf8");
        const prior = JSON.parse(raw) as TranscodeMeta;
        if (
          prior.status === "error" &&
          Date.now() - prior.erroredAt < TV_TRANSCODE_ERROR_COOLDOWN_MS
        ) {
          continue;
        }
      } catch {
        /* unreadable sidecar — fall through and attempt */
      }
    }

    out.push({ base, size: stat.size });
  }

  out.sort((a, b) => b.size - a.size);
  return out;
}

/**
 * Runs the transcode sweep.  Returns a summary for the scheduler
 * `JobResult` so the cockpit audit trail is meaningful.
 */
export async function runTvTranscodeSweep(): Promise<{
  scanned: number;
  transcoded: number;
  failed: number;
  skipped: number;
  bytesIn: number;
  bytesOut: number;
}> {
  const summary = {
    scanned: 0,
    transcoded: 0,
    failed: 0,
    skipped: 0,
    bytesIn: 0,
    bytesOut: 0,
  };
  if (!TV_TRANSCODE_ENABLED) return summary;

  const candidates = await scanTranscodeCandidates();
  summary.scanned = candidates.length;
  if (candidates.length === 0) return summary;

  let processed = 0;
  for (const { base } of candidates) {
    if (processed >= TV_TRANSCODE_PER_SWEEP) break;
    const result = await transcodeOne(base);
    if (result.outcome === "done") {
      summary.transcoded += 1;
      summary.bytesIn += result.originalBytes;
      summary.bytesOut += result.transcodedBytes;
      processed += 1;
    } else if (result.outcome === "error") {
      summary.failed += 1;
      processed += 1;
    } else {
      summary.skipped += 1;
    }
  }

  logCacheEvent({
    event: "transcode.sweep",
    scanned: summary.scanned,
    transcoded: summary.transcoded,
    failed: summary.failed,
    skipped: summary.skipped,
    bytesIn: summary.bytesIn,
    bytesOut: summary.bytesOut,
  });

  return summary;
}

/** Exposed for scheduler/boot wiring. */
export const TV_TRANSCODE_TUNING = {
  enabled: TV_TRANSCODE_ENABLED,
  thresholdBytes: TV_TRANSCODE_THRESHOLD_BYTES,
  maxHeight: TV_TRANSCODE_MAX_HEIGHT,
  crf: TV_TRANSCODE_CRF,
  perSweep: TV_TRANSCODE_PER_SWEEP,
  intervalMs: TV_TRANSCODE_SWEEP_INTERVAL_MS,
  bootDelayMs: TV_TRANSCODE_BOOT_DELAY_MS,
};

// TV playback is broadcast-style again: the server resolves the
// currently airing queue item and offset from wall clock, then each
// viewer joins that feed at the same point.  The client is only
// responsible for rendering what the server says is on-air, not for
// inventing its own per-viewer playlist cursor.

// ─────────────────────────────────────────────────────────────────
// Playback telemetry ring (in-memory, session-scope, self-healing)
// ─────────────────────────────────────────────────────────────────
//
// The audit called out the lack of observability ("buffer ratio,
// startup time, failure rate, skip rate, item health") and the way
// the client hides every failure behind atmospheric static.  The
// TV client now shows a skip banner; this is the server-side half
// of that loop.
//
// Clients POST `/api/tv/telemetry/item-end` on every natural end,
// skip, or error.  The server keeps a rolling in-memory count per
// video (and per bumper), scoped to a sliding window.  When an item
// accumulates too many errors across distinct sessions within the
// window, the queue builder silently drops it from future queues —
// so a clip that's broken for everyone gets pulled without anyone
// having to flag it manually.  Healthy clips just decay out of the
// window on their own.
//
// Ephemeral on purpose: restarting the server resets the state, so
// a genuinely recovered item (IPFS gateway came back, metadata was
// re-fetched) gets a clean slate on the next deploy.  If we ever
// want cross-restart persistence, we'd back this with a real table
// — but the current value is protecting *live viewers* from a
// broken item within the same session, which memory already does.
const TV_TELEMETRY_WINDOW_MS = Math.max(
  60 * 1000,
  Number(process.env.TV_TELEMETRY_WINDOW_MS || 60 * 60 * 1000)
);
const TV_TELEMETRY_BLACKLIST_THRESHOLD = Math.max(
  1,
  Number(process.env.TV_TELEMETRY_BLACKLIST_THRESHOLD || 3)
);
const TV_TELEMETRY_MAX_TRACKED_VIDEOS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_MAX_TRACKED_VIDEOS || 4000)
);
const TV_TELEMETRY_MAX_TRACKED_BUMPERS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_MAX_TRACKED_BUMPERS || 1000)
);
const TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM = Math.max(
  TV_TELEMETRY_BLACKLIST_THRESHOLD,
  Number(process.env.TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM || 64)
);
const TV_TELEMETRY_RATE_LIMIT_PER_MINUTE = Math.max(
  10,
  Number(process.env.TV_TELEMETRY_RATE_LIMIT_PER_MINUTE || 60)
);
const TV_TELEMETRY_RATE_LIMIT_MAX_KEYS = Math.max(
  100,
  Number(process.env.TV_TELEMETRY_RATE_LIMIT_MAX_KEYS || 2000)
);

const tvTelemetryStore = createTvTelemetryStore({
  windowMs: TV_TELEMETRY_WINDOW_MS,
  blacklistThreshold: TV_TELEMETRY_BLACKLIST_THRESHOLD,
  maxTrackedVideos: TV_TELEMETRY_MAX_TRACKED_VIDEOS,
  maxTrackedBumpers: TV_TELEMETRY_MAX_TRACKED_BUMPERS,
  maxErroredSessionsPerItem: TV_TELEMETRY_MAX_ERROR_SESSIONS_PER_ITEM,
});

const tvTelemetryRateLimit = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: TV_TELEMETRY_RATE_LIMIT_PER_MINUTE,
  message: { error: "Too many TV telemetry events, please try again later" },
  maxEntries: TV_TELEMETRY_RATE_LIMIT_MAX_KEYS,
});

function videoIdsCurrentlyBlacklisted(): Set<number> {
  return tvTelemetryStore.blacklistedVideoIds();
}

router.post("/api/tv/telemetry/item-end", tvTelemetryRateLimit, async (req, res) => {
  try {
    // Intentionally unauthenticated because playback health is a
    // cheap client-originating signal, but it is not unbounded
    // anymore: the route is rate-limited and the in-memory store
    // caps both tracked items and distinct error sessions per item.
    const body = req.body ?? {};
    const videoId = Number.isFinite(Number(body.videoId))
      ? Number(body.videoId)
      : null;
    const bumperId = Number.isFinite(Number(body.bumperId))
      ? Number(body.bumperId)
      : null;
    const sessionId = String(body.sessionId || "").slice(0, 64);
    const rawReason = String(body.reason || "ended").toLowerCase();
    const reason: TelemetryReason =
      rawReason === "ended" || rawReason === "skipped" || rawReason === "error" || rawReason === "stall"
        ? (rawReason as TelemetryReason)
        : "ended";

    if (videoId === null && bumperId === null) {
      return res.status(400).json({ error: "videoId or bumperId required" });
    }
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    tvTelemetryStore.record({ videoId, bumperId, sessionId, reason });
    res.json({ ok: true });
  } catch (err) {
    console.error("[tv] telemetry record failed:", err);
    res.status(500).json({ error: "Failed to record telemetry" });
  }
});

router.get("/api/tv/telemetry/aggregate", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    if (!(await isStaffRole(user.role))) {
      return res.status(403).json({ error: "Staff only" });
    }
    res.json(tvTelemetryStore.aggregate());
  } catch (err) {
    console.error("[tv] telemetry aggregate failed:", err);
    res.status(500).json({ error: "Failed to read telemetry" });
  }
});

router.get("/api/tv/channels", async (req, res) => {
  try {
    const user = (req.user as AuthUser | undefined) || null;
    const mine = String(req.query.mine || "") === "1";
    const includeMeta = String(req.query.includeMeta || "") === "1";
    const limit = parseBoundedQueryInt(
      req.query.limit,
      TV_CHANNEL_LIST_DEFAULT_LIMIT,
      { min: 1, max: TV_CHANNEL_LIST_MAX_LIMIT }
    );
    const offset = parseBoundedQueryInt(req.query.offset, 0, {
      min: 0,
      max: 100_000,
    });

    const whereParts = [eq(tvChannels.isActive, true)];
    if (mine) {
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      whereParts.push(eq(tvChannels.ownerUserId, user.id));
    } else {
      whereParts.push(eq(tvChannels.isPublic, true));
    }

    const [countRow, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvChannels)
        .where(and(...whereParts))
        .then(([row]) => row ?? { count: 0 }),
      db
        .select({
          id: tvChannels.id,
          ownerUserId: tvChannels.ownerUserId,
          slug: tvChannels.slug,
          title: tvChannels.title,
          description: tvChannels.description,
          logoUrl: tvChannels.logoUrl,
          bannerUrl: tvChannels.bannerUrl,
          isPublic: tvChannels.isPublic,
          isActive: tvChannels.isActive,
          sortOrder: tvChannels.sortOrder,
          dialNumber: tvChannels.dialNumber,
          videosPerBumper: tvChannels.videosPerBumper,
          createdAt: tvChannels.createdAt,
          updatedAt: tvChannels.updatedAt,
          ownerUsername: users.username,
          ownerDisplayName: users.displayName,
        })
        .from(tvChannels)
        .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
        .where(and(...whereParts))
        // Ordered by the stable dial number first — so "root channel"
        // sits on dial 1, WTF TV on dial 3, the platform channel on 69,
        // and new channels append from 4+.  Legacy rows without a dial
        // yet fall back to sort_order / id so the list never jumps
        // around mid-boot while the backfill runs.
        .orderBy(
          sql`${tvChannels.dialNumber} IS NULL`,
          asc(tvChannels.dialNumber),
          asc(tvChannels.sortOrder),
          asc(tvChannels.id)
        )
        .limit(limit)
        .offset(offset),
    ]);

    const meta = paginationMeta(Number(countRow?.count || 0), limit, offset);
    res.setHeader("X-WTF-Total-Count", String(meta.total));
    res.setHeader("X-WTF-Limit", String(meta.limit));
    res.setHeader("X-WTF-Offset", String(meta.offset));
    res.setHeader("X-WTF-Has-More", meta.hasMore ? "1" : "0");

    if (includeMeta) {
      return res.json({ items: rows, pagination: meta });
    }
    res.json(rows);
  } catch (err) {
    console.error("[tv] failed to list channels:", err);
    res.status(500).json({ error: "Failed to load channels" });
  }
});

router.get("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    const videoLimit = parseBoundedQueryInt(
      req.query.videoLimit,
      TV_CHANNEL_DETAIL_DEFAULT_VIDEO_LIMIT,
      { min: 1, max: TV_CHANNEL_DETAIL_MAX_VIDEO_LIMIT }
    );
    const videoOffset = parseBoundedQueryInt(req.query.videoOffset, 0, {
      min: 0,
      max: 100_000,
    });
    const playlistLimit = parseBoundedQueryInt(
      req.query.playlistLimit,
      TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_LIMIT,
      { min: 1, max: TV_CHANNEL_DETAIL_MAX_PLAYLIST_LIMIT }
    );
    const playlistOffset = parseBoundedQueryInt(req.query.playlistOffset, 0, {
      min: 0,
      max: 100_000,
    });
    const playlistItemLimit = parseBoundedQueryInt(
      req.query.playlistItemLimit,
      TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_ITEM_LIMIT,
      { min: 1, max: TV_CHANNEL_DETAIL_MAX_PLAYLIST_ITEM_LIMIT }
    );
    const playlistItemOffset = parseBoundedQueryInt(req.query.playlistItemOffset, 0, {
      min: 0,
      max: 100_000,
    });
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }
    const channel = editable.channel;
    const canManage = true;

    const [videoCountRow, playlistCountRow, videos, playlists] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvChannelVideos)
        .where(eq(tvChannelVideos.channelId, channelId))
        .then(([row]) => row ?? { count: 0 }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvPlaylists)
        .where(eq(tvPlaylists.channelId, channelId))
        .then(([row]) => row ?? { count: 0 }),
      db
        .select()
        .from(tvChannelVideos)
        .where(eq(tvChannelVideos.channelId, channelId))
        .orderBy(desc(tvChannelVideos.updatedAt))
        .limit(videoLimit)
        .offset(videoOffset),
      db
        .select()
        .from(tvPlaylists)
        .where(eq(tvPlaylists.channelId, channelId))
        .orderBy(desc(tvPlaylists.isActive), asc(tvPlaylists.name))
        .limit(playlistLimit)
        .offset(playlistOffset),
    ]);

    const playlistIds = playlists.map((p) => p.id);
    const [playlistItems, playlistItemsCountRow] = await Promise.all([
      playlistIds.length === 0
        ? []
        : db
            .select()
            .from(tvPlaylistItems)
            .where(inArray(tvPlaylistItems.playlistId, playlistIds))
            .orderBy(
              asc(tvPlaylistItems.playlistId),
              asc(tvPlaylistItems.sortOrder),
              asc(tvPlaylistItems.id)
            )
            .limit(playlistItemLimit)
            .offset(playlistItemOffset),
      playlistIds.length === 0
        ? [{ count: 0 }]
        : db
            .select({ count: sql<number>`count(*)::int` })
            .from(tvPlaylistItems)
            .where(inArray(tvPlaylistItems.playlistId, playlistIds))
            .then(([row]) => [row ?? { count: 0 }]),
    ]);

    const pagination = {
      videos: paginationMeta(Number(videoCountRow?.count || 0), videoLimit, videoOffset),
      playlists: paginationMeta(Number(playlistCountRow?.count || 0), playlistLimit, playlistOffset),
      playlistItems: {
        ...paginationMeta(
          Number((playlistItemsCountRow as Array<{ count: number }>)[0]?.count || 0),
          playlistItemLimit,
          playlistItemOffset
        ),
        scopePlaylistIds: playlistIds,
      },
    };

    res.json({
      channel,
      canManage,
      videos,
      playlists,
      playlistItems,
      pagination,
    });
  } catch (err) {
    console.error("[tv] failed to fetch channel detail:", err);
    res.status(500).json({ error: "Failed to load channel detail" });
  }
});

router.post("/api/tv/channels", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    if (!(await hasPermission(user.role, "create_tv_channel"))) {
      return res.status(403).json({ error: "Role cannot create TV channels" });
    }

    const staff = await isStaffRole(user.role);
    const maxChannels = staff ? TV_MAX_STAFF_CHANNELS : TV_MAX_USER_CHANNELS;
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tvChannels)
      .where(eq(tvChannels.ownerUserId, user.id));
    const channelCount = Number(countRow?.count || 0);
    if (channelCount >= maxChannels) {
      return res.status(400).json({
        error: `Channel limit reached for your role (${maxChannels})`,
      });
    }

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!title) return res.status(400).json({ error: "Title is required" });

    const slugInput = String(req.body?.slug || "").trim();
    const generatedSlug = await uniqueChannelSlug(
      slugInput || `${user.username}-${title}`
    );

    const logoUrl = String(req.body?.logoUrl || "").trim() || null;
    const bannerUrl = String(req.body?.bannerUrl || "").trim() || null;
    const isPublic = req.body?.isPublic !== false;

    // Append to the end of this owner's channel list so an existing
    // channel never gets renumbered when a new one is created.
    // `sort_order` is scoped to the owner, matching the list query
    // which only shows a single owner's channels at a time.
    const [maxRow] = await db
      .select({ max: sql<number>`COALESCE(MAX(${tvChannels.sortOrder}), 0)::int` })
      .from(tvChannels)
      .where(eq(tvChannels.ownerUserId, user.id));
    const nextSortOrder = Number(maxRow?.max || 0) + 1;

    // Allocate the lowest free dial number ≥ 4 — dials 1, 2, 3, 69 are
    // reserved for the pinned channels (opeculiar, yoeshi, WTF TV,
    // platform).  Even if those pins are not yet assigned, we skip
    // them here so a new user-created channel can't accidentally
    // squat the pinned dials.  The boot backfill later claims the
    // pins once the pinned users sign up / create their channels.
    const nextDial = await allocateNextDialNumber();

    const [channel] = await db
      .insert(tvChannels)
      .values({
        ownerUserId: user.id,
        title,
        description: description || null,
        slug: generatedSlug,
        logoUrl,
        bannerUrl,
        isPublic,
        isActive: true,
        sortOrder: nextSortOrder,
        dialNumber: nextDial,
      })
      .returning();

    const [playlist] = await db
      .insert(tvPlaylists)
      .values({
        channelId: channel.id,
        name: "Main Loop",
        isActive: true,
        transitionSeconds: 1,
      })
      .returning();

    res.status(201).json({ channel, playlist });
  } catch (err) {
    console.error("[tv] failed to create channel:", err);
    res.status(500).json({ error: "Failed to create channel" });
  }
});

router.put("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) return res.status(400).json({ error: "Title cannot be empty" });
      updates.title = title;
    }
    if (typeof req.body?.description === "string") {
      updates.description = req.body.description.trim() || null;
    }
    if (typeof req.body?.isActive === "boolean") {
      updates.isActive = req.body.isActive;
    }
    if (typeof req.body?.slug === "string") {
      const clean = slugify(req.body.slug.trim());
      if (!clean) return res.status(400).json({ error: "Invalid slug" });
      if (clean !== editable.channel.slug) {
        updates.slug = await uniqueChannelSlug(clean);
      }
    }
    if (typeof req.body?.logoUrl === "string") {
      updates.logoUrl = req.body.logoUrl.trim() || null;
    }
    if (typeof req.body?.bannerUrl === "string") {
      updates.bannerUrl = req.body.bannerUrl.trim() || null;
    }
    if (typeof req.body?.isPublic === "boolean") {
      updates.isPublic = req.body.isPublic;
    }
    // Channel owner picks how often bumpers interrupt the stream.
    // 0 disables bumpers.  The server clamps the value into a sane
    // range ([0, 20]) so an exuberant edit can't starve the queue.
    if (req.body?.videosPerBumper !== undefined) {
      const n = Number(req.body.videosPerBumper);
      if (!Number.isFinite(n) || n < 0 || n > 20) {
        return res.status(400).json({
          error: "videosPerBumper must be between 0 and 20",
        });
      }
      updates.videosPerBumper = Math.floor(n);
    }

    const [updated] = await db
      .update(tvChannels)
      .set(updates)
      .where(eq(tvChannels.id, channelId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[tv] failed to update channel:", err);
    res.status(500).json({ error: "Failed to update channel" });
  }
});

router.delete("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    await db.delete(tvChannels).where(eq(tvChannels.id, channelId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[tv] failed to delete channel:", err);
    res.status(500).json({ error: "Failed to delete channel" });
  }
});

router.get("/api/tv/me/playable-tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const limit = Math.max(1, Math.min(Number(req.query.limit || 500), 1000));
    const q = String(req.query.q || "").trim().toLowerCase();
    const sortInput = String(req.query.sort || "recent").trim().toLowerCase();
    const sortMode: "recent" | "name" | "contract" | "mime" =
      sortInput === "name" ||
      sortInput === "contract" ||
      sortInput === "mime"
        ? sortInput
        : "recent";

    const rows = await db
      .select({
        id: walletHoldings.id,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        walletAddress: walletHoldings.walletAddress,
        creatorAddress: sql<string | null>`(${tokenMetadata.raw} -> 'creators' ->> 0)`,
        lastSeenAt: lastSeenTv,
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
          eq(walletHoldings.userId, user.id),
          sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
        )
      )
      .orderBy(desc(lastSeenTv))
      .limit(5000);

    const deduped = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.tokenContract}:${row.tokenId}`;
      if (!deduped.has(key)) deduped.set(key, row);
    }

    const playable = Array.from(deduped.values())
      .map((row) => {
        const asset = extractPlayableAssetFromTokenMetadata(
          (row.metadata as any) || null,
          row.tokenName || null
        );
        if (!asset) return null;
        const normalizedThumb = normalizeMediaUri(String(row.tokenThumbnail || ""));
        return {
          id: row.id,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.tokenName || `#${row.tokenId}`,
          tokenThumbnail: normalizedThumb || asset.thumbnailUri,
          walletAddress: row.walletAddress,
          creatorAddress: row.creatorAddress || null,
          mimeType: asset.mimeType,
          sourceUri: asset.sourceUri,
          title: asset.title,
          metadata: row.metadata,
          lastSeenAt: (() => {
            const ls = row.lastSeenAt as string | Date | null | undefined;
            if (ls == null) return null;
            const d = ls instanceof Date ? ls : new Date(String(ls));
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const filtered = playable.filter((row) => {
      if (!q) return true;
      const meta = (row.metadata as any) || {};
      const creators = Array.isArray(meta.creators) ? meta.creators : [];
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      return (
        row.tokenName.toLowerCase().includes(q) ||
        row.tokenContract.toLowerCase().includes(q) ||
        row.tokenId.toLowerCase().includes(q) ||
        row.mimeType.toLowerCase().includes(q) ||
        (row.creatorAddress || "").toLowerCase().includes(q) ||
        creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
        tags.some((t: string) => String(t).toLowerCase().includes(q))
      );
    });

    filtered.sort((a, b) => {
      if (sortMode === "name") {
        return a.tokenName.localeCompare(b.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      if (sortMode === "contract") {
        const contractOrder = a.tokenContract.localeCompare(b.tokenContract, undefined, {
          sensitivity: "base",
        });
        if (contractOrder !== 0) return contractOrder;
        return compareTokenIds(a.tokenId, b.tokenId);
      }
      if (sortMode === "mime") {
        const mimeOrder = a.mimeType.localeCompare(b.mimeType, undefined, {
          sensitivity: "base",
        });
        if (mimeOrder !== 0) return mimeOrder;
        return a.tokenName.localeCompare(b.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      return (
        new Date(b.lastSeenAt || 0).getTime() -
        new Date(a.lastSeenAt || 0).getTime()
      );
    });

    res.json({ items: filtered.slice(0, limit), sort: sortMode });
  } catch (err) {
    console.error("[tv] failed to fetch playable tokens:", err);
    res.status(500).json({ error: "Failed to fetch playable tokens" });
  }
});

router.post("/api/tv/channels/:channelId/videos", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const tokenContract = String(req.body?.tokenContract || "").trim();
    const tokenId = String(req.body?.tokenId || "").trim();
    const manualSourceUri = String(req.body?.sourceUri || "").trim();
    const manualMimeType = String(req.body?.mimeType || "").trim().toLowerCase();
    const manualTitle = String(req.body?.title || "").trim();
    const manualThumb = String(req.body?.thumbnailUri || "").trim();
    const mediaItemIdRaw = req.body?.mediaItemId;
    const mediaItemId =
      mediaItemIdRaw === undefined || mediaItemIdRaw === null
        ? null
        : Number(mediaItemIdRaw);

    let sourceUri = "";
    let mimeType = "";
    let title = "";
    let thumbnailUri = "";
    let metadata: any = null;
    let resolvedMediaItemId: number | null = null;
    let resolvedTokenContract: string | null = null;
    let resolvedTokenId: string | null = null;
    let mediaDurationSeconds: number | null = null;
    let mediaOwnerUsername: string | null = null;

    if (mediaItemId !== null) {
      if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
        return res.status(400).json({ error: "mediaItemId must be a positive integer" });
      }
      // Adding a library item directly — same owner guard the media
      // library itself enforces, so a user can't graft someone else's
      // uploads onto their channel.  Staff can still operate on
      // anyone's channel via ensureChannelEditable() above.
      const [libItem] = await db
        .select({
          id: userMediaLibrary.id,
          ownerUserId: userMediaLibrary.ownerUserId,
          title: userMediaLibrary.title,
          sourceType: userMediaLibrary.sourceType,
          sourceUrl: userMediaLibrary.sourceUrl,
          playbackUrl: userMediaLibrary.playbackUrl,
          posterUrl: userMediaLibrary.posterUrl,
          mimeType: userMediaLibrary.mimeType,
          metadata: userMediaLibrary.metadata,
          tokenContract: userMediaLibrary.tokenContract,
          tokenId: userMediaLibrary.tokenId,
          durationSeconds: userMediaLibrary.durationSeconds,
          ownerUsername: users.username,
        })
        .from(userMediaLibrary)
        .innerJoin(users, eq(userMediaLibrary.ownerUserId, users.id))
        .where(eq(userMediaLibrary.id, mediaItemId));

      if (!libItem) {
        return res.status(404).json({ error: "Media library item not found" });
      }
      const canUseLibraryItem =
        libItem.ownerUserId === user.id ||
        (await isStaffRole(user.role)) ||
        libItem.ownerUserId === editable.channel.ownerUserId;
      if (!canUseLibraryItem) {
        return res.status(403).json({
          error: "You can only add your own media-library items to a channel",
        });
      }

      // Upload-backed media stores a `disk://<filename>` pseudo-URL in
      // `sourceUrl`.  That is an internal token — the TV cache proxy
      // explicitly rejects any scheme that isn't public HTTP(S) — so
      // for uploads we route playback through the same-origin media
      // file endpoint instead.  Legacy rows that were inserted before
      // the upload route started stamping `playbackUrl` are handled
      // here by reading the id, not the stored string.
      let rawUri: string;
      if (
        libItem.sourceType === "upload" ||
        String(libItem.sourceUrl || "").startsWith("disk://")
      ) {
        rawUri = buildTvChannelMediaPath(channelId, libItem.id);
      } else {
        rawUri = libItem.playbackUrl || libItem.sourceUrl;
      }
      // Same-origin paths are already playable — only token/URL
      // sources need to go through the public-HTTP normalizer.
      const isSameOriginPath =
        typeof rawUri === "string" && rawUri.startsWith("/");
      const normalized = isSameOriginPath
        ? rawUri
        : (normalizeMediaUri(rawUri) || rawUri);
      if (!normalized) {
        return res.status(422).json({ error: "Media item has no playable URL" });
      }
      sourceUri = normalized;
      mimeType = libItem.mimeType;
      title = manualTitle || libItem.title || `Media ${libItem.id}`;
      thumbnailUri = manualThumb || libItem.posterUrl || "";
      metadata = await hydrateChannelVideoMetadata({
        tokenContract: libItem.tokenContract,
        tokenId: libItem.tokenId,
        metadata: libItem.metadata || null,
      });
      mediaOwnerUsername = libItem.ownerUsername || null;
      resolvedMediaItemId = libItem.id;
      resolvedTokenContract = libItem.tokenContract || `media:${libItem.id}`;
      resolvedTokenId = libItem.tokenId || String(libItem.id);
      mediaDurationSeconds = libItem.durationSeconds || null;
    } else if (tokenContract && tokenId) {
      const [owned] = await db
        .select({
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          tokenName: tokenMetadata.name,
          tokenThumbnail: tokenMetadata.thumbnail,
          metadata: tokenMetadata.raw,
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
            eq(walletHoldings.userId, user.id),
            eq(walletHoldings.tokenContract, tokenContract),
            eq(walletHoldings.tokenId, tokenId),
            sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
          )
        );

      if (!owned) {
        return res.status(400).json({
          error: "Token not found in your owned token index. Sync profile tokens first.",
        });
      }

      const asset = extractPlayableAssetFromTokenMetadata(
        (owned.metadata as any) || null,
        owned.tokenName || null
      );
      if (!asset) {
        return res.status(400).json({
          error: "Token metadata does not expose a playable video or gif asset",
        });
      }

      sourceUri = asset.sourceUri;
      mimeType = asset.mimeType;
      title = manualTitle || asset.title || owned.tokenName || `#${owned.tokenId}`;
      thumbnailUri = manualThumb || asset.thumbnailUri || owned.tokenThumbnail || "";
      metadata = owned.metadata;
      resolvedTokenContract = tokenContract;
      resolvedTokenId = tokenId;

      // When a user adds a token they own directly to a channel, mirror
      // the same token into their media library if it's not there yet.
      // This way the single delete button in MyVideos is *always* the
      // authoritative removal point, and the ON DELETE CASCADE chain
      // sweeps the channel video + playlist item when the media row
      // goes away.
      if (editable.channel.ownerUserId === user.id) {
        const [existingLib] = await db
          .select({ id: userMediaLibrary.id })
          .from(userMediaLibrary)
          .where(
            and(
              eq(userMediaLibrary.ownerUserId, user.id),
              eq(userMediaLibrary.tokenContract, tokenContract),
              eq(userMediaLibrary.tokenId, tokenId)
            )
          );
        if (existingLib) {
          resolvedMediaItemId = existingLib.id;
        } else {
          const [libCreated] = await db
            .insert(userMediaLibrary)
            .values({
              ownerUserId: user.id,
              title,
              sourceType: "ipfs",
              sourceUrl: sourceUri,
              playbackUrl: sourceUri,
              posterUrl: thumbnailUri || null,
              mimeType,
              tokenContract,
              tokenId,
              metadata,
              status: "ready",
            })
            .onConflictDoNothing()
            .returning({ id: userMediaLibrary.id });
          if (libCreated?.id) resolvedMediaItemId = libCreated.id;
        }
      }
    } else {
      const normalized = normalizeMediaUri(manualSourceUri);
      if (!normalized) {
        return res.status(400).json({ error: "A valid sourceUri is required" });
      }
      const resolvedMime = manualMimeType || guessMimeTypeFromUri(normalized);
      if (!isPlayableMimeType(resolvedMime)) {
        return res.status(400).json({ error: "Only video/* or image/gif are allowed" });
      }
      sourceUri = normalized;
      mimeType = resolvedMime;
      title = manualTitle || "Untitled TV Asset";
      thumbnailUri = manualThumb || "";
    }

    const effectiveTokenContract = resolvedTokenContract || "manual";
    const effectiveTokenId =
      resolvedTokenId || createHash("md5").update(sourceUri).digest("hex");

    const tokenMetaFields = extractTokenMetaFields(metadata, title, {
      tokenContract: effectiveTokenContract,
      tokenId: effectiveTokenId,
      uploaderUsername: mediaOwnerUsername,
    });
    const videoValues = {
      channelId,
      tokenContract: effectiveTokenContract,
      tokenId: effectiveTokenId,
      sourceUri,
      mimeType,
      title,
      thumbnailUri: thumbnailUri || null,
      metadata,
      mediaItemId: resolvedMediaItemId,
      creatorName: tokenMetaFields.creatorName,
      creatorAddress: tokenMetaFields.creatorAddress,
      collectionName: tokenMetaFields.collectionName,
      mintedAt: tokenMetaFields.mintedAt,
    } as const;
    const videoUpdateValues = {
      tokenContract: effectiveTokenContract,
      tokenId: effectiveTokenId,
      sourceUri,
      mimeType,
      title,
      thumbnailUri: thumbnailUri || null,
      metadata,
      mediaItemId: resolvedMediaItemId,
      creatorName: tokenMetaFields.creatorName,
      creatorAddress: tokenMetaFields.creatorAddress,
      collectionName: tokenMetaFields.collectionName,
      mintedAt: tokenMetaFields.mintedAt,
      updatedAt: new Date(),
    } as const;

    let videoRow: any;
    try {
      if (resolvedMediaItemId !== null) {
        [videoRow] = await db
          .insert(tvChannelVideos)
          .values(videoValues)
          .onConflictDoUpdate({
            target: [tvChannelVideos.channelId, tvChannelVideos.mediaItemId],
            targetWhere: sql`${tvChannelVideos.mediaItemId} IS NOT NULL`,
            set: videoUpdateValues,
          })
          .returning();
      } else {
        [videoRow] = await db
          .insert(tvChannelVideos)
          .values(videoValues)
          .onConflictDoUpdate({
            target: [
              tvChannelVideos.channelId,
              tvChannelVideos.tokenContract,
              tvChannelVideos.tokenId,
            ],
            set: videoUpdateValues,
          })
          .returning();
      }
    } catch (err) {
      if (
        isUniqueConstraintError(err, "tv_video_unique_token_per_channel_idx") ||
        isUniqueConstraintError(err, "tv_channel_videos_channel_media_unique_idx")
      ) {
        const existing = await findExistingChannelVideo(
          db,
          channelId,
          resolvedMediaItemId,
          effectiveTokenContract,
          effectiveTokenId
        );
        if (existing) {
          [videoRow] = await db
            .update(tvChannelVideos)
            .set(videoUpdateValues)
            .where(eq(tvChannelVideos.id, existing.id))
            .returning();
        }
      }
      if (!videoRow) throw err;
    }

    const [activePlaylist] = await db
      .select({ id: tvPlaylists.id })
      .from(tvPlaylists)
      .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
      .orderBy(asc(tvPlaylists.id))
      .limit(1);

    if (activePlaylist) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvPlaylistItems)
        .where(eq(tvPlaylistItems.playlistId, activePlaylist.id));
      const nextOrder = Number(countRow?.count || 0);

      const clientDuration = Number(req.body?.durationSeconds);
      const hasClientDuration = Number.isFinite(clientDuration) && clientDuration > 0;
      const seedDuration = hasClientDuration
        ? Math.min(Math.round(clientDuration), MAX_STORED_DURATION_SEC)
        : mediaDurationSeconds && mediaDurationSeconds > 0
          ? Math.min(mediaDurationSeconds, MAX_STORED_DURATION_SEC)
          : mimeType === "image/gif"
            ? DEFAULT_GIF_DURATION_SEC
            : DEFAULT_VIDEO_DURATION_SEC;

      const [inserted] = await db
        .insert(tvPlaylistItems)
        .values({
          playlistId: activePlaylist.id,
          videoId: videoRow.id,
          mediaItemId: resolvedMediaItemId,
          sortOrder: nextOrder,
          durationSeconds: seedDuration,
        })
        .onConflictDoNothing()
        .returning({ id: tvPlaylistItems.id });

      // Fire-and-forget probe: real duration will overwrite the seed.
      if (inserted?.id && !hasClientDuration) {
        probePlaylistItemAsync(inserted.id, sourceUri);
      }
      // Eagerly warm the cache so the first playback of this item
      // never hits IPFS.  Idempotent: returns immediately if the file
      // is already cached or an in-flight fetch exists.
      prefetchMediaAsync(sourceUri);
    }

    res.status(201).json(videoRow);
  } catch (err) {
    console.error("[tv] failed to add channel video:", err);
    res.status(500).json({ error: "Failed to add video to channel" });
  }
});

router.post("/api/tv/channels/:channelId/refresh-sources", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    await ensureChannelEditable(channelId, user);

    const videos = await db
      .select({
        id: tvChannelVideos.id,
        mediaItemId: tvChannelVideos.mediaItemId,
        tokenContract: tvChannelVideos.tokenContract,
        tokenId: tvChannelVideos.tokenId,
        sourceUri: tvChannelVideos.sourceUri,
      })
      .from(tvChannelVideos)
      .where(eq(tvChannelVideos.channelId, channelId));

    let updated = 0;
    for (const video of videos) {
      if (video.tokenContract === "manual") continue;
      const [owned] = await db
        .select({ metadata: tokenMetadata.raw, tokenName: tokenMetadata.name })
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
            eq(walletHoldings.userId, user.id),
            eq(walletHoldings.tokenContract, video.tokenContract),
            eq(walletHoldings.tokenId, video.tokenId)
          )
        );
      if (!owned) continue;
      const asset = extractPlayableAssetFromTokenMetadata((owned.metadata as any) || null, owned.tokenName || null);
      if (!asset) continue;
      const [libraryItem] =
        video.mediaItemId != null
          ? await db
              .select({ metadata: userMediaLibrary.metadata })
              .from(userMediaLibrary)
              .where(eq(userMediaLibrary.id, video.mediaItemId))
              .limit(1)
          : [];
      const mergedMetadata = await hydrateChannelVideoMetadata({
        tokenContract: video.tokenContract,
        tokenId: video.tokenId,
        metadata: libraryItem?.metadata ?? owned.metadata ?? null,
      });
      const tokenMetaFields = extractTokenMetaFields(mergedMetadata, owned.tokenName || null, {
        tokenContract: video.tokenContract,
        tokenId: video.tokenId,
      });
      if (asset.sourceUri !== video.sourceUri) {
        await db
          .update(tvChannelVideos)
          .set({
            sourceUri: asset.sourceUri,
            mimeType: asset.mimeType,
            thumbnailUri: asset.thumbnailUri || undefined,
            metadata: mergedMetadata,
            creatorName: tokenMetaFields.creatorName,
            creatorAddress: tokenMetaFields.creatorAddress,
            collectionName: tokenMetaFields.collectionName,
            mintedAt: tokenMetaFields.mintedAt,
            updatedAt: new Date(),
          })
          .where(eq(tvChannelVideos.id, video.id));
        updated++;
        prefetchMediaAsync(asset.sourceUri);
      } else {
        // Source unchanged — still refresh metadata columns so changes
        // to creator/collection flow through, and warm the cache in
        // case the file fell out of our LRU.
        await db
          .update(tvChannelVideos)
          .set({
            metadata: mergedMetadata,
            creatorName: tokenMetaFields.creatorName,
            creatorAddress: tokenMetaFields.creatorAddress,
            collectionName: tokenMetaFields.collectionName,
            mintedAt: tokenMetaFields.mintedAt,
            updatedAt: new Date(),
          })
          .where(eq(tvChannelVideos.id, video.id));
        prefetchMediaAsync(video.sourceUri);
      }
    }

    res.json({ ok: true, total: videos.length, updated });
  } catch (err: any) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    console.error("[tv] failed to refresh sources:", err);
    res.status(500).json({ error: "Failed to refresh sources" });
  }
});

router.put(
  "/api/tv/channels/:channelId/videos/:videoId",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const channelId = Number(req.params.channelId);
      const videoId = Number(req.params.videoId);
      if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(videoId) || videoId <= 0) {
        return res.status(400).json({ error: "Invalid channel/video id" });
      }

      const editable = await ensureChannelEditable(channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body?.title === "string") {
        updates.title = req.body.title.trim() || null;
      }
      if (typeof req.body?.thumbnailUri === "string") {
        updates.thumbnailUri = normalizeMediaUri(req.body.thumbnailUri) || null;
      }
      if (typeof req.body?.sourceUri === "string") {
        const normalized = normalizeMediaUri(req.body.sourceUri);
        if (!normalized) return res.status(400).json({ error: "Invalid sourceUri" });
        updates.sourceUri = normalized;
      }
      if (typeof req.body?.mimeType === "string") {
        const mime = req.body.mimeType.trim().toLowerCase();
        if (!isPlayableMimeType(mime)) {
          return res.status(400).json({ error: "Only video/* or image/gif are allowed" });
        }
        updates.mimeType = mime;
      }

      const [updated] = await db
        .update(tvChannelVideos)
        .set(updates)
        .where(and(eq(tvChannelVideos.id, videoId), eq(tvChannelVideos.channelId, channelId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Video not found" });
      res.json(updated);
    } catch (err) {
      console.error("[tv] failed to update channel video:", err);
      res.status(500).json({ error: "Failed to update channel video" });
    }
  }
);

router.delete(
  "/api/tv/channels/:channelId/videos/:videoId",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const channelId = Number(req.params.channelId);
      const videoId = Number(req.params.videoId);
      if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(videoId) || videoId <= 0) {
        return res.status(400).json({ error: "Invalid channel/video id" });
      }

      const editable = await ensureChannelEditable(channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }

      await db
        .delete(tvChannelVideos)
        .where(and(eq(tvChannelVideos.id, videoId), eq(tvChannelVideos.channelId, channelId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[tv] failed to delete channel video:", err);
      res.status(500).json({ error: "Failed to delete channel video" });
    }
  }
);

router.delete(
  "/api/tv/channels/:channelId/media/:mediaItemId",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const channelId = Number(req.params.channelId);
      const mediaItemId = Number(req.params.mediaItemId);
      if (
        !Number.isInteger(channelId) ||
        channelId <= 0 ||
        !Number.isInteger(mediaItemId) ||
        mediaItemId <= 0
      ) {
        return res.status(400).json({ error: "Invalid channel/media id" });
      }

      const editable = await ensureChannelEditable(channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }

      const removed = await db
        .delete(tvChannelVideos)
        .where(
          and(
            eq(tvChannelVideos.channelId, channelId),
            eq(tvChannelVideos.mediaItemId, mediaItemId)
          )
        )
        .returning({ id: tvChannelVideos.id });

      if (removed.length === 0) {
        return res
          .status(404)
          .json({ error: "Media item is not attached to this channel" });
      }

      res.json({ ok: true, removed: removed.length });
    } catch (err) {
      console.error("[tv] failed to detach media from channel:", err);
      res.status(500).json({ error: "Failed to remove media from channel" });
    }
  }
);

router.post("/api/tv/channels/:channelId/playlists", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Playlist name is required" });
    const transitionSeconds = Math.max(
      0,
      Math.min(10, Number(req.body?.transitionSeconds ?? 1))
    );
    const setActive = Boolean(req.body?.isActive);

    const [playlist] = await db.transaction(async (tx) => {
      await lockTvChannelRow(tx, channelId);

      if (setActive) {
        await tx
          .update(tvPlaylists)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(tvPlaylists.channelId, channelId));
      }

      return tx
        .insert(tvPlaylists)
        .values({
          channelId,
          name,
          transitionSeconds,
          isActive: setActive,
        })
        .returning();
    });

    res.status(201).json(playlist);
  } catch (err) {
    if (isUniqueConstraintError(err, "tv_playlist_one_active_per_channel_idx")) {
      return res.status(409).json({ error: "Another active playlist update won the race. Retry." });
    }
    console.error("[tv] failed to create playlist:", err);
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

router.put("/api/tv/playlists/:playlistId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const playlistId = Number(req.params.playlistId);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: "Invalid playlist id" });
    }

    const [playlist] = await db
      .select()
      .from(tvPlaylists)
      .where(eq(tvPlaylists.id, playlistId));
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    const editable = await ensureChannelEditable(playlist.channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ error: "Playlist name cannot be empty" });
      updates.name = name;
    }
    if (typeof req.body?.transitionSeconds === "number") {
      updates.transitionSeconds = Math.max(0, Math.min(10, req.body.transitionSeconds));
    }
    const [updated] = await db.transaction(async (tx) => {
      await lockTvChannelRow(tx, playlist.channelId);

      if (typeof req.body?.isActive === "boolean") {
        if (req.body.isActive) {
          await tx
            .update(tvPlaylists)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(tvPlaylists.channelId, playlist.channelId));
        }
        updates.isActive = req.body.isActive;
      }

      return tx
        .update(tvPlaylists)
        .set(updates)
        .where(eq(tvPlaylists.id, playlistId))
        .returning();
    });

    res.json(updated);
  } catch (err) {
    if (isUniqueConstraintError(err, "tv_playlist_one_active_per_channel_idx")) {
      return res.status(409).json({ error: "Another active playlist update won the race. Retry." });
    }
    console.error("[tv] failed to update playlist:", err);
    res.status(500).json({ error: "Failed to update playlist" });
  }
});

router.put("/api/tv/playlists/:playlistId/items", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const playlistId = Number(req.params.playlistId);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: "Invalid playlist id" });
    }

    const [playlist] = await db
      .select()
      .from(tvPlaylists)
      .where(eq(tvPlaylists.id, playlistId));
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    const editable = await ensureChannelEditable(playlist.channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: "items must be an array" });
    if (items.length > 500) return res.status(400).json({ error: "Playlist is too large" });

    const videoIds = items
      .map((item: any) => Number(item.videoId))
      .filter((id: number) => Number.isInteger(id) && id > 0);
    if (videoIds.length !== items.length) {
      return res.status(400).json({ error: "Each item requires a valid videoId" });
    }

    if (videoIds.length === 0) {
      await db.delete(tvPlaylistItems).where(eq(tvPlaylistItems.playlistId, playlistId));
      return res.json({ ok: true, items: [] });
    }

    const videos = await db
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, playlist.channelId),
          inArray(tvChannelVideos.id, videoIds)
        )
      );
    const videoSet = new Set(videos.map((v) => v.id));
    for (const id of videoIds) {
      if (!videoSet.has(id)) {
        return res.status(400).json({ error: `Video ${id} is not in this channel` });
      }
    }

    const rows = items.map((item: any, index: number) => ({
      playlistId,
      videoId: Number(item.videoId),
      sortOrder:
        typeof item.sortOrder === "number"
          ? Math.max(0, Math.floor(item.sortOrder))
          : index,
      durationSeconds: Math.max(
        1,
        Math.min(24 * 60 * 60, Math.floor(Number(item.durationSeconds) || 30))
      ),
      updatedAt: new Date(),
    }));

    const inserted = await db.transaction(async (tx) => {
      await tx
        .delete(tvPlaylistItems)
        .where(eq(tvPlaylistItems.playlistId, playlistId));
      return tx.insert(tvPlaylistItems).values(rows).returning();
    });
    // A playlist replace may have just introduced brand-new items that
    // aren't in the disk cache yet.  Warm the whole channel in the
    // background so the first viewer after the save still hits hot
    // cache instead of paying the IPFS cold-fetch penalty.
    warmChannelAsync(playlist.channelId);
    res.json({ ok: true, items: inserted });
  } catch (err) {
    console.error("[tv] failed to update playlist items:", err);
    res.status(500).json({ error: "Failed to update playlist items" });
  }
});

// Duration mutation is now owner/wtf-admin-only.  Earlier this endpoint
// was unauthenticated so the client could opportunistically persist
// metadata-probe results — but that also let any anonymous caller
// rewrite playlist-item durations (slot timing) by id.  Server-side
// duration probing (see `probePlaylistItemAsync` / `probeMediaDuration`)
// is the authoritative path now; this endpoint stays for explicit
// creator overrides.
router.patch(
  "/api/tv/playlist-items/:itemId/duration",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const itemId = Number(req.params.itemId);
      const durationSeconds = Math.max(
        1,
        Math.min(86400, Math.round(Number(req.body?.durationSeconds)))
      );
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(durationSeconds)) {
        return res.status(400).json({ error: "Invalid params" });
      }

      const [owned] = await db
        .select({
          itemId: tvPlaylistItems.id,
          channelId: tvPlaylists.channelId,
          ownerUserId: tvChannels.ownerUserId,
        })
        .from(tvPlaylistItems)
        .innerJoin(tvPlaylists, eq(tvPlaylists.id, tvPlaylistItems.playlistId))
        .innerJoin(tvChannels, eq(tvChannels.id, tvPlaylists.channelId))
        .where(eq(tvPlaylistItems.id, itemId));

      if (!owned) {
        return res.status(404).json({ error: "Playlist item not found" });
      }

      const canEdit = canEditTvChannelPolicy(owned, user);
      if (!canEdit) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await db
        .update(tvPlaylistItems)
        .set({ durationSeconds, updatedAt: new Date() })
        .where(eq(tvPlaylistItems.id, itemId));
      res.json({ ok: true });
    } catch (err) {
      console.error("[tv] failed to update item duration:", err);
      res.status(500).json({ error: "Failed to update duration" });
    }
  }
);

router.get("/api/tv/channels/:channelId/media/:mediaItemId/file", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    const mediaItemId = Number(req.params.mediaItemId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }
    if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
      return res.status(400).json({ error: "Invalid media item id" });
    }

    const [channel] = await db
      .select({
        id: tvChannels.id,
        ownerUserId: tvChannels.ownerUserId,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
      })
      .from(tvChannels)
      .where(eq(tvChannels.id, channelId));
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const viewer = (req as any).user as AuthUser | undefined;
    const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
    if (!canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const [playlistBindings, scheduleBindings] = await Promise.all([
      db
        .select({ id: tvChannelVideos.id })
        .from(tvChannelVideos)
        .where(
          and(
            eq(tvChannelVideos.channelId, channelId),
            eq(tvChannelVideos.mediaItemId, mediaItemId)
          )
        )
        .limit(1),
      db
        .select({ id: tvScheduleEntries.id })
        .from(tvScheduleEntries)
        .where(
          and(
            eq(tvScheduleEntries.channelId, channelId),
            eq(tvScheduleEntries.mediaItemId, mediaItemId)
          )
        )
        .limit(1),
    ]);

    if (playlistBindings.length === 0 && scheduleBindings.length === 0) {
      return res.status(404).json({ error: "Media not found on channel" });
    }

    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        mimeType: userMediaLibrary.mimeType,
        sourceUrl: userMediaLibrary.sourceUrl,
        fileData: userMediaLibrary.fileData,
        sourceType: userMediaLibrary.sourceType,
        objectStorageBucket: userMediaLibrary.objectStorageBucket,
        objectStorageKey: userMediaLibrary.objectStorageKey,
        safeFilename: userMediaLibrary.safeFilename,
        hotCachePath: userMediaLibrary.hotCachePath,
      })
      .from(userMediaLibrary)
      .where(and(eq(userMediaLibrary.id, mediaItemId), eq(userMediaLibrary.status, "ready")));

    if (!item || item.sourceType !== "upload") {
      return res.status(404).json({ error: "File not found" });
    }

    const served = await serveStoredMediaFile(req, res, item);
    if (!served) {
      res.status(404).json({ error: "File not found" });
    }
  } catch (err) {
    console.error("[tv] failed to serve channel media:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to serve media" });
    }
  }
});

router.get("/api/tv/channels/:channelId/stream", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const atMs = Number(req.query.at || Date.now());
    const nowMs = Number.isFinite(atMs) ? atMs : Date.now();

    const [channel] = await db
      .select({
        id: tvChannels.id,
        ownerUserId: tvChannels.ownerUserId,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
        logoUrl: tvChannels.logoUrl,
        bannerUrl: tvChannels.bannerUrl,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
        dialNumber: tvChannels.dialNumber,
        videosPerBumper: tvChannels.videosPerBumper,
        updatedAt: tvChannels.updatedAt,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(eq(tvChannels.id, channelId));

    if (!channel) return res.status(404).json({ error: "Channel not found" });
    // Visibility gate: private channels are owner/staff only even when
    // active.  Returning 404 (not 403) so callers can't confirm the
    // existence of a private channel by guessing numeric ids.
    const viewer = (req as any).user as AuthUser | undefined;
    const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
    if (!canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
      return res.status(404).json({ error: "Channel not found" });
    }

    await maybeAutoRefreshWtfChannel(channelId);

    // Check recurring daily schedule for the current minute of day
    const nowDate = new Date(nowMs);
    const currentMinuteOfDay = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
    const scheduledEntries = await db
      .select({
        playlistId: tvScheduleEntries.playlistId,
        label: tvScheduleEntries.label,
        startMinuteOfDay: tvScheduleEntries.startMinuteOfDay,
        endMinuteOfDay: tvScheduleEntries.endMinuteOfDay,
      })
      .from(tvScheduleEntries)
      .where(
        and(
          eq(tvScheduleEntries.channelId, channelId),
          sql`${tvScheduleEntries.playlistId} IS NOT NULL`,
          sql`${tvScheduleEntries.startMinuteOfDay} <= ${currentMinuteOfDay}`,
          sql`${tvScheduleEntries.endMinuteOfDay} > ${currentMinuteOfDay}`
        )
      )
      .orderBy(asc(tvScheduleEntries.sortOrder))
      .limit(1);

    let resolvedPlaylistId: number | null = null;
    let scheduleLabel: string | null = null;

    if (scheduledEntries.length > 0 && scheduledEntries[0]!.playlistId) {
      resolvedPlaylistId = scheduledEntries[0]!.playlistId;
      scheduleLabel = scheduledEntries[0]!.label || null;
    }

    // Fall back to default active playlist if no schedule match
    let activePlaylist: typeof tvPlaylists.$inferSelect | null = null;
    if (resolvedPlaylistId) {
      const [pl] = await db.select().from(tvPlaylists).where(eq(tvPlaylists.id, resolvedPlaylistId));
      activePlaylist = pl || null;
    }
    if (!activePlaylist) {
      const [pl] = await db
        .select()
        .from(tvPlaylists)
        .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
        .orderBy(asc(tvPlaylists.id))
        .limit(1);
      activePlaylist = pl || null;
      scheduleLabel = null;
    }

    const playlistId = activePlaylist?.id ?? 0;
    const shuffleSeed = streamShuffleSeed(channelId, playlistId, nowMs);
    const blacklistedVideoIds = videoIdsCurrentlyBlacklisted();
    const blacklistSignature = Array.from(blacklistedVideoIds)
      .sort((a, b) => a - b)
      .join(",");
    const revision = await loadTvStreamSnapshotRevision({
      ownerUserId: channel.ownerUserId,
      activePlaylistId: activePlaylist?.id ?? null,
      channelUpdatedAt: channel.updatedAt,
      videosPerBumper: channel.videosPerBumper,
    });
    const cacheKey = buildTvStreamSnapshotCacheKey({
      channelId,
      activePlaylistId: activePlaylist?.id ?? null,
      shuffleSeed,
      revision,
      blacklistSignature,
    });
    const { value: snapshot, status: cacheStatus } = await tvStreamSnapshotCache.getOrLoad(
      cacheKey,
      () =>
        buildTvStreamSnapshot({
          channelId,
          ownerUserId: channel.ownerUserId,
          ownerUsername: channel.ownerUsername,
          videosPerBumper: channel.videosPerBumper,
          activePlaylist,
          nowMs,
          blacklistedVideoIds,
        })
    );

    const daypart = daypartForMs(nowMs);
    const baseCadence = Math.max(0, Math.min(20, Number(channel.videosPerBumper ?? 4)));
    const cadence =
      baseCadence === 0
        ? 0
        : Math.max(1, Math.min(20, Math.round(baseCadence * daypart.cadenceMultiplier)));

    const broadcast = resolveTvBroadcastQueue(snapshot.queue, nowMs);
    const broadcastQueue = broadcast.queue.map((item, index) => ({
      ...item,
      queueIndex: index,
    }));

    res.setHeader("X-WTF-TV-Stream-Cache", cacheStatus.toUpperCase());
    res.json({
      channel,
      playlist: activePlaylist
        ? {
            id: activePlaylist.id,
            name: activePlaylist.name,
            transitionSeconds: activePlaylist.transitionSeconds,
          }
        : null,
      scheduleLabel,
      generatedAt: new Date(nowMs).toISOString(),
      shuffleSeed,
      videosPerBumper: cadence,
      baseCadence,
      daypart: {
        name: daypart.name,
        displayName: daypart.displayName,
        preferredCategory: daypart.preferredCategory,
        cadenceMultiplier: daypart.cadenceMultiplier,
      },
      ...snapshot,
      queue: broadcastQueue,
      current: broadcast.current
        ? {
            ...broadcast.current,
            queueIndex: 0,
          }
        : null,
      loopDurationSeconds: broadcast.loopDurationSeconds,
    });
  } catch (err) {
    console.error("[tv] failed to build stream queue:", err);
    res.status(500).json({ error: "Failed to build stream queue" });
  }
});

async function handleCacheMedia(req: any, res: any) {
  try {
    const input = String(req.query.url || "").trim();
    if (!input) return res.status(400).json({ error: "url is required" });

    const normalized = normalizeMediaUri(input);
    if (!normalized) return res.status(400).json({ error: "Unsupported media URL" });

    const allowImages = String(req.path || "") === "/api/cache/media";
    await streamMediaThroughCache(req, res, normalized, {
      allowRange: true,
      allowImages,
    });
  } catch (err) {
    console.error("[tv] failed to proxy/cache media:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to fetch media from source" });
    } else {
      try { res.end(); } catch { /* swallow */ }
    }
  }
}

router.get("/api/tv/cache/media", handleCacheMedia);
router.get("/api/cache/media", handleCacheMedia);

// GET /api/tv/cache/stats  (staff-only)
// Returns a snapshot of disk usage + configured limits.  Useful for
// monitoring that the looping-channel cache is warming up and not
// getting blown away on every redeploy.
router.get("/api/tv/cache/stats", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    if (!(await isStaffRole(user.role))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const stats = await readTvCacheStats();
    const pct =
      stats.maxTotalBytes > 0
        ? Math.round((stats.totalBytes / stats.maxTotalBytes) * 10000) / 100
        : 0;
    res.json({ ...stats, utilizationPct: pct });
  } catch (err) {
    console.error("[tv] cache stats error:", err);
    res.status(500).json({ error: "Failed to read cache stats" });
  }
});

// POST /api/tv/cache/prefetch
// Body: { urls: string[] }  — up to 10 URLs to warm the server cache in
// the background.  Returns 202 immediately so the client can continue;
// later GETs to /api/tv/cache/media?url=... hit warm disk instead of IPFS.
/* ─── Playback telemetry ──────────────────────────────────
 *
 * Clients POST diagnostic events (item start/end, stalls, bumper
 * decisions, drift snaps, …) here so we have a persistent log of
 * why playback behaves the way it does.  This is append-only and
 * intentionally minimal: each event is emitted to the process
 * logger (`[tv-playback]`) so it's captured by `docker compose
 * logs app`.
 *
 * Authenticated or anonymous — both are accepted; we include the
 * user id when available for later correlation. */
router.post("/api/tv/playback/events", async (req, res) => {
  try {
    const body = req.body;
    const raw = Array.isArray(body?.events) ? body.events : [];
    if (raw.length === 0) {
      res.status(204).end();
      return;
    }
    const userId =
      typeof (req as any).user?.id === "number"
        ? (req as any).user.id
        : null;
    let kept = 0;
    for (const ev of raw.slice(0, 30)) {
      if (!ev || typeof ev !== "object") continue;
      if (typeof (ev as any).event !== "string") continue;
      const safe: Record<string, unknown> = {};
      let written = 0;
      for (const [k, v] of Object.entries(ev as Record<string, unknown>)) {
        if (written >= 20) break;
        if (
          v === null ||
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          const key = String(k).slice(0, 32);
          const value =
            typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
          safe[key] = value;
          written += 1;
        }
      }
      if (userId !== null) safe.userId = userId;
      console.info("[tv-playback]", JSON.stringify(safe));
      kept += 1;
    }
    res.status(202).json({ kept });
  } catch (err) {
    res.status(400).json({ error: "Invalid events payload" });
  }
});

router.post("/api/tv/cache/prefetch", isAuthenticated, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const uris: string[] = [];
    for (const value of raw.slice(0, 10)) {
      if (typeof value !== "string") continue;
      let candidate = value.trim();
      if (!candidate) continue;
      // Accept either a raw artifact URI or a cache URL we issued.
      try {
        if (candidate.startsWith("/api/tv/cache/media") || candidate.startsWith("/api/cache/media")) {
          const url = new URL(candidate, "http://local");
          candidate = url.searchParams.get("url") || "";
          if (!candidate) continue;
        }
      } catch {
        /* ignore bad URL */
      }
      const normalized = normalizeMediaUri(candidate);
      if (!normalized) continue;
      uris.push(normalized);
    }
    for (const uri of uris) prefetchMediaAsync(uri);
    res.status(202).json({ queued: uris.length });
  } catch (err) {
    res.status(400).json({ error: "Invalid prefetch payload" });
  }
});

/* ─── Bumpers (transition clips) ─────────────────────────── */

router.get("/api/tv/bumpers", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const rows = await db
      .select({
        id: tvBumpers.id,
        title: tvBumpers.title,
        mimeType: tvBumpers.mimeType,
        fileSize: tvBumpers.fileSize,
        durationMs: tvBumpers.durationMs,
        category: tvBumpers.category,
        createdAt: tvBumpers.createdAt,
      })
      .from(tvBumpers)
      .where(eq(tvBumpers.ownerUserId, user.id))
      .orderBy(asc(tvBumpers.category), desc(tvBumpers.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[tv] failed to list bumpers:", err);
    res.status(500).json({ error: "Failed to list bumpers" });
  }
});

router.post(
  "/api/tv/bumpers",
  isAuthenticated,
  bumperUpload.single("file"),
  async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          error: `File is required. Accepted: ${[...BUMPER_ALLOWED_MIME].join(", ")}. Max size: ${Math.floor(BUMPER_MAX_FILE_BYTES / (1024 * 1024))}MB.`,
        });
      }

      if (!BUMPER_ALLOWED_MIME.has(file.mimetype)) {
        return res.status(400).json({
          error: `File type "${file.mimetype}" is not supported for bumpers.`,
        });
      }

      const durationMs = Math.max(0, Math.floor(Number(req.body?.durationMs || 0)));
      if (durationMs <= 0 || durationMs > BUMPER_MAX_DURATION_MS) {
        return res.status(400).json({
          error: `Duration must be between 1ms and ${BUMPER_MAX_DURATION_MS}ms (${BUMPER_MAX_DURATION_MS / 1000}s)`,
        });
      }

      const requestedCategory = String(req.body?.category || BUMPER_CATEGORY_PERSONAL)
        .trim()
        .toLowerCase();
      const category = BUMPER_CATEGORIES.has(requestedCategory)
        ? (requestedCategory as typeof BUMPER_CATEGORY_PERSONAL | typeof BUMPER_CATEGORY_COMMUNITY)
        : BUMPER_CATEGORY_PERSONAL;

      // Community bumpers show up on every channel platform-wide, so
      // the contributor has to at least be a contestant.  Witnesses
      // (read-only tier) still get 20 personal slots, they just can't
      // push interstitials into other people's channels.
      if (category === BUMPER_CATEGORY_COMMUNITY) {
        const allowed = hasAtLeastRole(user.role, "contestant");
        if (!allowed) {
          return res.status(403).json({
            error:
              "Community bumpers are available to contestants and above. Upload as 'personal' instead, or ask a host to promote your account.",
          });
        }
      }

      // Caps are enforced *per category* so contributing to the
      // community pool never costs a user a personal bumper slot and
      // vice versa.
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvBumpers)
        .where(
          and(
            eq(tvBumpers.ownerUserId, user.id),
            eq(tvBumpers.category, category)
          )
        );
      const maxForCategory =
        category === BUMPER_CATEGORY_COMMUNITY
          ? BUMPER_MAX_PER_USER_COMMUNITY
          : BUMPER_MAX_PER_USER_PERSONAL;
      if (Number(countRow?.count || 0) >= maxForCategory) {
        return res.status(400).json({
          error:
            category === BUMPER_CATEGORY_COMMUNITY
              ? `You can contribute at most ${maxForCategory} community bumpers. Delete one first.`
              : `You can have at most ${maxForCategory} personal bumpers. Delete one first.`,
        });
      }

      const title = String(req.body?.title || "").trim() || `Bumper ${Date.now().toString(36)}`;

      await ensureBumperDir();
      const filename = bumperFilename(file.mimetype);
      const diskPath = path.join(BUMPER_UPLOADS_DIR, filename);
      await fsPromises.writeFile(diskPath, file.buffer);

      const [row] = await db
        .insert(tvBumpers)
        .values({
          ownerUserId: user.id,
          title: title.slice(0, 100),
          mimeType: file.mimetype,
          fileSize: file.size,
          durationMs,
          data: `disk://${filename}`,
          category,
        })
        .returning({
          id: tvBumpers.id,
          title: tvBumpers.title,
          mimeType: tvBumpers.mimeType,
          fileSize: tvBumpers.fileSize,
          durationMs: tvBumpers.durationMs,
          category: tvBumpers.category,
          createdAt: tvBumpers.createdAt,
        });

      res.status(201).json(row);
    } catch (err) {
      console.error("[tv] failed to upload bumper:", err);
      res.status(500).json({ error: "Failed to upload bumper" });
    }
  }
);

router.get("/api/tv/bumpers/pool", async (req, res) => {
  try {
    const channelId = Number(req.query.channelId);
    let ownerUserId: number | null = null;

    if (Number.isInteger(channelId) && channelId > 0) {
      const viewer = (req as any).user as AuthUser | undefined;
      const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
      const [channel] = await db
        .select({
          id: tvChannels.id,
          ownerUserId: tvChannels.ownerUserId,
          isPublic: tvChannels.isPublic,
          isActive: tvChannels.isActive,
        })
        .from(tvChannels)
        .where(eq(tvChannels.id, channelId));
      if (!channel || !canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found" });
      }
      ownerUserId = channel.ownerUserId;
    }

    // Pool contents:
    //  - every community bumper (shared across all channels)
    //  - plus the channel owner's personal bumpers, when a channel is
    //    specified.  With no channel context we stay community-only so
    //    we don't leak another user's personal interstitials into an
    //    unrelated channel.
    //
    // Randomised with a hard cap so the client sees a fresh shuffle
    // without pulling a huge payload.
    const whereClause = ownerUserId !== null
      ? sql`(${tvBumpers.category} = ${BUMPER_CATEGORY_COMMUNITY}
             OR ${tvBumpers.ownerUserId} = ${ownerUserId})`
      : eq(tvBumpers.category, BUMPER_CATEGORY_COMMUNITY);

    const rows = await db
      .select({
        id: tvBumpers.id,
        mimeType: tvBumpers.mimeType,
        durationMs: tvBumpers.durationMs,
        category: tvBumpers.category,
        ownerUsername: users.username,
      })
      .from(tvBumpers)
      .innerJoin(users, eq(tvBumpers.ownerUserId, users.id))
      .where(whereClause)
      .orderBy(sql`RANDOM()`)
      .limit(80);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(
      rows.map((r) => ({
        id: r.id,
        mimeType: r.mimeType,
        durationMs: r.durationMs,
        category: r.category,
        mediaUrl: `/api/tv/bumpers/${r.id}/media`,
        credit: r.ownerUsername,
      }))
    );
  } catch (err) {
    console.error("[tv] failed to fetch bumper pool:", err);
    res.status(500).json({ error: "Failed to fetch bumper pool" });
  }
});

// Read-only listing of every community bumper so the "Community"
// tab can show the aggregated list with credits.
router.get("/api/tv/bumpers/community", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: tvBumpers.id,
        title: tvBumpers.title,
        mimeType: tvBumpers.mimeType,
        durationMs: tvBumpers.durationMs,
        createdAt: tvBumpers.createdAt,
        ownerUsername: users.username,
      })
      .from(tvBumpers)
      .innerJoin(users, eq(tvBumpers.ownerUserId, users.id))
      .where(eq(tvBumpers.category, BUMPER_CATEGORY_COMMUNITY))
      .orderBy(desc(tvBumpers.createdAt))
      .limit(200);

    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        mimeType: r.mimeType,
        durationMs: r.durationMs,
        mediaUrl: `/api/tv/bumpers/${r.id}/media`,
        credit: r.ownerUsername,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("[tv] failed to fetch community bumpers:", err);
    res.status(500).json({ error: "Failed to fetch community bumpers" });
  }
});

router.patch("/api/tv/bumpers/:bumperId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const bumperId = Number(req.params.bumperId);
    if (!Number.isInteger(bumperId) || bumperId <= 0) {
      return res.status(400).json({ error: "Invalid bumper id" });
    }

    const [bumper] = await db
      .select({
        id: tvBumpers.id,
        ownerUserId: tvBumpers.ownerUserId,
        title: tvBumpers.title,
        category: tvBumpers.category,
      })
      .from(tvBumpers)
      .where(eq(tvBumpers.id, bumperId));

    if (!bumper) return res.status(404).json({ error: "Bumper not found" });

    const isOwner = bumper.ownerUserId === user.id;
    const isStaff = await isStaffRole(user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const updates: Record<string, any> = {};

    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) {
        return res.status(400).json({ error: "Bumper title cannot be empty" });
      }
      updates.title = title.slice(0, 100);
    }

    if (typeof req.body?.category === "string") {
      const requestedCategory = req.body.category.trim().toLowerCase();
      if (!BUMPER_CATEGORIES.has(requestedCategory)) {
        return res.status(400).json({ error: "Invalid bumper category" });
      }

      const category = requestedCategory as
        | typeof BUMPER_CATEGORY_PERSONAL
        | typeof BUMPER_CATEGORY_COMMUNITY;

      if (category === BUMPER_CATEGORY_COMMUNITY) {
        const allowed = hasAtLeastRole(user.role, "contestant");
        if (!allowed) {
          return res.status(403).json({
            error:
              "Community bumpers are available to contestants and above. Keep this bumper personal or ask a host to promote your account.",
          });
        }
      }

      if (category !== bumper.category) {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tvBumpers)
          .where(
            and(
              eq(tvBumpers.ownerUserId, bumper.ownerUserId),
              eq(tvBumpers.category, category)
            )
          );
        const maxForCategory =
          category === BUMPER_CATEGORY_COMMUNITY
            ? BUMPER_MAX_PER_USER_COMMUNITY
            : BUMPER_MAX_PER_USER_PERSONAL;
        if (Number(countRow?.count || 0) >= maxForCategory) {
          return res.status(400).json({
            error:
              category === BUMPER_CATEGORY_COMMUNITY
                ? `You can contribute at most ${maxForCategory} community bumpers. Pull one out first.`
                : `You can keep at most ${maxForCategory} personal bumpers. Remove one first.`,
          });
        }
      }

      updates.category = category;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No bumper changes requested" });
    }

    const [updated] = await db
      .update(tvBumpers)
      .set(updates)
      .where(eq(tvBumpers.id, bumperId))
      .returning({
        id: tvBumpers.id,
        title: tvBumpers.title,
        mimeType: tvBumpers.mimeType,
        fileSize: tvBumpers.fileSize,
        durationMs: tvBumpers.durationMs,
        category: tvBumpers.category,
        createdAt: tvBumpers.createdAt,
      });

    res.json(updated);
  } catch (err) {
    console.error("[tv] failed to update bumper:", err);
    res.status(500).json({ error: "Failed to update bumper" });
  }
});

router.delete("/api/tv/bumpers/:bumperId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const bumperId = Number(req.params.bumperId);
    if (!Number.isInteger(bumperId) || bumperId <= 0) {
      return res.status(400).json({ error: "Invalid bumper id" });
    }

    const [bumper] = await db
      .select({
        id: tvBumpers.id,
        ownerUserId: tvBumpers.ownerUserId,
        data: tvBumpers.data,
      })
      .from(tvBumpers)
      .where(eq(tvBumpers.id, bumperId));

    if (!bumper) return res.status(404).json({ error: "Bumper not found" });

    const isOwner = bumper.ownerUserId === user.id;
    const isStaff = await isStaffRole(user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const dataStr = String(bumper.data || "");
    if (dataStr.startsWith("disk://")) {
      const filename = dataStr.slice(7);
      const diskPath = path.join(BUMPER_UPLOADS_DIR, filename);
      await fsPromises.unlink(diskPath).catch(() => undefined);
    }

    await db.delete(tvBumpers).where(eq(tvBumpers.id, bumperId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[tv] failed to delete bumper:", err);
    res.status(500).json({ error: "Failed to delete bumper" });
  }
});

router.get("/api/tv/bumpers/:bumperId/media", async (req, res) => {
  try {
    const bumperId = Number(req.params.bumperId);
    if (!Number.isInteger(bumperId) || bumperId <= 0) {
      return res.status(400).json({ error: "Invalid bumper id" });
    }

    const [bumper] = await db
      .select({ mimeType: tvBumpers.mimeType, data: tvBumpers.data })
      .from(tvBumpers)
      .where(eq(tvBumpers.id, bumperId));

    if (!bumper) return res.status(404).json({ error: "Bumper not found" });

    const contentType = bumper.mimeType || "application/octet-stream";
    const dataStr = String(bumper.data || "");

    if (dataStr.startsWith("disk://")) {
      const filename = dataStr.slice(7);
      const diskPath = path.join(BUMPER_UPLOADS_DIR, filename);
      try {
        const stat = await fsPromises.stat(diskPath);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Cache-Control", "public, max-age=86400");
        createReadStream(diskPath).pipe(res);
        return;
      } catch {
        return res.status(404).json({ error: "Bumper file not found on disk" });
      }
    }

    const buffer = decodeStoredBumperData(bumper.data);
    if (buffer.length === 0) {
      return res.status(500).json({ error: "Bumper data is empty or invalid" });
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  } catch (err) {
    console.error("[tv] failed to serve bumper media:", err);
    res.status(500).json({ error: "Failed to serve bumper" });
  }
});

/* ─── WTF TV Auto-Playlist ──────────────────────────────── */

type WtfChannelConfigRow = typeof tvWtfChannelConfig.$inferSelect;

export async function refreshWtfPlaylist(
  configOverride?: WtfChannelConfigRow
): Promise<{ ok: boolean; count: number; message: string }> {
  const config =
    configOverride ??
    pickPreferredWtfChannelConfig(await db.select().from(tvWtfChannelConfig));
  if (!config || !config.channelId || !config.enabled) {
    return { ok: false, count: 0, message: "WTF TV channel not configured or disabled" };
  }

  const [configuredChannel] = await db
    .select({
      id: tvChannels.id,
      ownerUserId: tvChannels.ownerUserId,
      slug: tvChannels.slug,
      dialNumber: tvChannels.dialNumber,
      ownerUsername: users.username,
    })
    .from(tvChannels)
    .leftJoin(users, eq(tvChannels.ownerUserId, users.id))
    .where(eq(tvChannels.id, config.channelId))
    .limit(1);

  if (!configuredChannel) {
    return { ok: false, count: 0, message: "Configured WTF TV channel no longer exists" };
  }

  const [activePlaylist] = await db
    .select()
    .from(tvPlaylists)
    .where(and(eq(tvPlaylists.channelId, config.channelId), eq(tvPlaylists.isActive, true)))
    .orderBy(asc(tvPlaylists.id))
    .limit(1);

  if (!activePlaylist) {
    return { ok: false, count: 0, message: "No active playlist on WTF TV channel" };
  }

  const sourceScope = resolveWtfSourceScope({
    sourceMode: config.sourceMode,
    sourceUserIds: config.sourceUserIds,
    sourceWalletAddresses: config.sourceWalletAddresses,
    channelOwnerUserId: configuredChannel.ownerUserId,
    channelOwnerUsername: configuredChannel.ownerUsername,
    channelSlug: configuredChannel.slug,
    channelDialNumber: configuredChannel.dialNumber,
  });
  const sourceMode = sourceScope.mode;
  const sourceUserIds = sourceScope.sourceUserIds;
  const sourceWallets = sourceScope.sourceWalletAddresses;
  const tokensPerWallet = config.tokensPerWalletPerHour || 5;
  const playlistSize = Math.max(5, Math.min(500, config.playlistSize || 100));
  const defaultDuration = Math.max(3, Math.min(300, config.defaultDurationSeconds || 15));

  const conditions = [sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`];
  if (sourceMode === "selected_users" && sourceUserIds.length > 0) {
    conditions.push(inArray(walletHoldings.userId, sourceUserIds));
  } else if (sourceMode === "specific_wallets" && sourceWallets.length > 0) {
    conditions.push(inArray(walletHoldings.walletAddress, sourceWallets));
  }

  const tokenRows = await db
    .select({
      id: walletHoldings.id,
      userId: walletHoldings.userId,
      walletAddress: walletHoldings.walletAddress,
      tokenContract: walletHoldings.tokenContract,
      tokenId: walletHoldings.tokenId,
      tokenName: tokenMetadata.name,
      tokenThumbnail: tokenMetadata.thumbnail,
      metadata: tokenMetadata.raw,
    })
    .from(walletHoldings)
    .leftJoin(
      tokenMetadata,
      and(
        eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
        eq(tokenMetadata.tokenId, walletHoldings.tokenId)
      )
    )
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(playlistSize * 3);

  const deduped = new Map<string, typeof tokenRows[0]>();
  const walletCounts = new Map<string, number>();
  for (const row of tokenRows) {
    const key = `${row.tokenContract}:${row.tokenId}`;
    if (deduped.has(key)) continue;
    const walletCount = walletCounts.get(row.walletAddress) || 0;
    if (walletCount >= tokensPerWallet) continue;
    const asset = extractPlayableAssetFromTokenMetadata(
      (row.metadata as any) || null,
      row.tokenName || null
    );
    if (!asset) continue;
    deduped.set(key, row);
    walletCounts.set(row.walletAddress, walletCount + 1);
    if (deduped.size >= playlistSize) break;
  }

  // Do NOT delete the current playlist until we've confirmed we have
  // replacement content to swap in.  The old code wiped the channel
  // first and then asked "is there anything new?" — if the answer was
  // "no" (TzKT down, metadata-sync lagging, everyone's wallets empty,
  // a config bug that shrinks the eligible set to zero, etc.) the
  // channel went dark until the *next* refresh cycle succeeded.  The
  // audit calls this out as a P1: an upstream hiccup should never be
  // able to black-screen WTF TV.
  if (deduped.size === 0) {
    await db
      .update(tvWtfChannelConfig)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(tvWtfChannelConfig.id, config.id));
    return {
      ok: true,
      count: 0,
      message:
        "No playable tokens found this cycle — keeping existing playlist online",
    };
  }

  const entries = Array.from(deduped.values());
  const videoInserts = entries.map((row) => {
    const asset = extractPlayableAssetFromTokenMetadata(
      (row.metadata as any) || null,
      row.tokenName || null
    )!;
    const metaFields = extractTokenMetaFields(row.metadata, row.tokenName || null);
    return {
      channelId: config.channelId!,
      tokenContract: row.tokenContract,
      tokenId: row.tokenId,
      sourceUri: asset.sourceUri,
      mimeType: asset.mimeType,
      title: asset.title || row.tokenName || `#${row.tokenId}`,
      thumbnailUri: asset.thumbnailUri,
      metadata: row.metadata,
      creatorName: metaFields.creatorName,
      creatorAddress: metaFields.creatorAddress,
      collectionName: metaFields.collectionName,
      mintedAt: metaFields.mintedAt,
    };
  });

  // Swap atomically: tear down the old content *and* insert the new
  // batch in the same transaction so we never have a window where the
  // channel is empty.  Playlist items are deleted first because of the
  // FK onto tv_channel_videos.
  await db.transaction(async (tx) => {
    await tx
      .delete(tvPlaylistItems)
      .where(eq(tvPlaylistItems.playlistId, activePlaylist.id));
    await tx
      .delete(tvChannelVideos)
      .where(eq(tvChannelVideos.channelId, config.channelId!));

    const insertedVideos = await tx
      .insert(tvChannelVideos)
      .values(videoInserts)
      .returning({ id: tvChannelVideos.id });

    const playlistInserts = insertedVideos.map((v, idx) => ({
      playlistId: activePlaylist.id,
      videoId: v.id,
      sortOrder: idx,
      durationSeconds: defaultDuration,
    }));

    await tx.insert(tvPlaylistItems).values(playlistInserts);

    await tx
      .update(tvWtfChannelConfig)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(tvWtfChannelConfig.id, config.id));
  });

  // The auto-refresh just replaced every video on the WTF TV channel.
  // Warm the new list in the background so the next viewer plays
  // smoothly instead of priming IPFS one item at a time.
  warmChannelAsync(config.channelId);

  return { ok: true, count: deduped.size, message: `Playlist refreshed with ${deduped.size} tokens` };
}

const TV_WTF_REFRESH_LOCK_NAMESPACE = 0x575446;

async function withTvWtfRefreshLock<T>(
  channelId: number,
  task: () => Promise<T>
): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [TV_WTF_REFRESH_LOCK_NAMESPACE, channelId]
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) return null;
    return await task();
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [
          TV_WTF_REFRESH_LOCK_NAMESPACE,
          channelId,
        ])
        .catch(() => undefined);
    }
    client.release();
  }
}

async function maybeAutoRefreshWtfChannel(channelId: number): Promise<void> {
  const configRows = await db
    .select()
    .from(tvWtfChannelConfig)
    .where(eq(tvWtfChannelConfig.channelId, channelId))
    .orderBy(desc(tvWtfChannelConfig.updatedAt), desc(tvWtfChannelConfig.id));
  const config = pickPreferredWtfChannelConfig(configRows);

  if (!config || !config.enabled) return;

  const intervalMs = (config.refreshIntervalMinutes || 30) * 60 * 1000;
  const lastRefresh = config.lastRefreshedAt ? new Date(config.lastRefreshedAt).getTime() : 0;
  if (Date.now() - lastRefresh < intervalMs) return;

  try {
    await withTvWtfRefreshLock(channelId, async () => {
      const freshConfigRows = await db
        .select()
        .from(tvWtfChannelConfig)
        .where(eq(tvWtfChannelConfig.channelId, channelId))
        .orderBy(desc(tvWtfChannelConfig.updatedAt), desc(tvWtfChannelConfig.id));
      const freshConfig = pickPreferredWtfChannelConfig(freshConfigRows);
      if (!freshConfig || !freshConfig.enabled) return;

      const freshIntervalMs =
        (freshConfig.refreshIntervalMinutes || 30) * 60 * 1000;
      const freshLastRefresh = freshConfig.lastRefreshedAt
        ? new Date(freshConfig.lastRefreshedAt).getTime()
        : 0;
      if (Date.now() - freshLastRefresh < freshIntervalMs) return;

      await refreshWtfPlaylist(freshConfig);
    });
  } catch (err) {
    console.error("[tv] auto-refresh WTF playlist failed:", err);
  }
}

// ─── /now – live channel state ──────────────────────────

router.get("/api/tv/channels/:channelId/now", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const nowMs = Date.now();

    const [channel] = await db
      .select({
        id: tvChannels.id,
        ownerUserId: tvChannels.ownerUserId,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
        logoUrl: tvChannels.logoUrl,
        bannerUrl: tvChannels.bannerUrl,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(eq(tvChannels.id, channelId));

    if (!channel) return res.status(404).json({ error: "Channel not found or inactive" });
    // Respect channel visibility the same way the /stream handler does.
    const nowViewer = (req as any).user as AuthUser | undefined;
    const nowViewerIsStaff = nowViewer ? await isStaffRole(nowViewer.role) : false;
    if (!canViewChannel(channel, nowViewer ?? null, { isStaff: nowViewerIsStaff })) {
      return res.status(404).json({ error: "Channel not found or inactive" });
    }

    const scheduleEntries = await db
      .select({
        id: tvScheduleEntries.id,
        mediaItemId: tvScheduleEntries.mediaItemId,
        startsAt: tvScheduleEntries.startsAt,
        endsAt: tvScheduleEntries.endsAt,
        sortOrder: tvScheduleEntries.sortOrder,
        mediaTitle: userMediaLibrary.title,
        mediaSourceUrl: userMediaLibrary.sourceUrl,
        mediaPlaybackUrl: userMediaLibrary.playbackUrl,
        mediaMimeType: userMediaLibrary.mimeType,
        mediaPosterUrl: userMediaLibrary.posterUrl,
        mediaDuration: userMediaLibrary.durationSeconds,
        mediaSourceType: userMediaLibrary.sourceType,
      })
      .from(tvScheduleEntries)
      .innerJoin(userMediaLibrary, eq(tvScheduleEntries.mediaItemId, userMediaLibrary.id))
      .where(
        and(
          eq(tvScheduleEntries.channelId, channelId),
          sql`${tvScheduleEntries.endsAt} > NOW()`,
          eq(userMediaLibrary.status, "ready")
        )
      )
      .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder))
      .limit(10);

    const now = new Date(nowMs);
    const currentScheduled = scheduleEntries.find(
      (e) => e.startsAt && e.endsAt && new Date(e.startsAt) <= now && new Date(e.endsAt) > now
    );
    const upcoming = scheduleEntries.filter((e) => e.startsAt && new Date(e.startsAt) > now).slice(0, 5);

    if (currentScheduled) {
      const playbackSource = resolveTvChannelPlaybackSource({
        channelId,
        mediaItemId: currentScheduled.mediaItemId,
        sourceType: currentScheduled.mediaSourceType,
        sourceUri: currentScheduled.mediaSourceUrl,
        playbackUrl: currentScheduled.mediaPlaybackUrl,
      });
      const sourceUrl = normalizeMediaUri(playbackSource) || playbackSource;
      const cacheUrl = resolveCacheUrl(sourceUrl);
      const elapsedSec = currentScheduled.startsAt ? Math.floor((nowMs - new Date(currentScheduled.startsAt).getTime()) / 1000) : 0;

      return res.json({
        channel,
        mode: "schedule",
        current: {
          ...currentScheduled,
          sourceUrl,
          cacheUrl,
          offsetSeconds: elapsedSec,
          kind: currentScheduled.mediaMimeType === "image/gif" ? "gif" : "video",
        },
        upcoming,
        offline: false,
      });
    }

    await maybeAutoRefreshWtfChannel(channelId);

    const [activePlaylist] = await db
      .select()
      .from(tvPlaylists)
      .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
      .orderBy(asc(tvPlaylists.id))
      .limit(1);

    if (!activePlaylist) {
      return res.json({
        channel,
        mode: "idle",
        current: null,
        upcoming,
        offline: true,
        message: "Nothing scheduled and no active playlist",
      });
    }

    const playlistRows = await db
      .select({
        itemId: tvPlaylistItems.id,
        sortOrder: tvPlaylistItems.sortOrder,
        durationSeconds: tvPlaylistItems.durationSeconds,
        videoId: tvChannelVideos.id,
        mediaItemId: tvChannelVideos.mediaItemId,
        tokenContract: tvChannelVideos.tokenContract,
        tokenId: tvChannelVideos.tokenId,
        title: tvChannelVideos.title,
        mimeType: tvChannelVideos.mimeType,
        sourceUri: tvChannelVideos.sourceUri,
        mediaSourceType: userMediaLibrary.sourceType,
        mediaPlaybackUrl: userMediaLibrary.playbackUrl,
        thumbnailUri: tvChannelVideos.thumbnailUri,
        creatorName: tvChannelVideos.creatorName,
        creatorAddress: tvChannelVideos.creatorAddress,
        collectionName: tvChannelVideos.collectionName,
        mintedAt: tvChannelVideos.mintedAt,
        metadata: tvChannelVideos.metadata,
      })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
      .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
      .where(eq(tvPlaylistItems.playlistId, activePlaylist.id))
      .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));

    if (playlistRows.length === 0) {
      return res.json({
        channel,
        mode: "playlist",
        current: null,
        upcoming,
        offline: true,
        message: "Playlist is empty",
      });
    }

    const queue = playlistRows.map((row, idx) => {
      const playbackSource = resolveTvChannelPlaybackSource({
        channelId,
        mediaItemId: row.mediaItemId,
        sourceType: row.mediaSourceType,
        sourceUri: row.sourceUri,
        playbackUrl: row.mediaPlaybackUrl,
      });
      const sourceUri = normalizeMediaUri(playbackSource) || playbackSource;
      const cacheUrl = resolveCacheUrl(sourceUri);
      const overlay = resolveTvOverlayMetadata({
        metadata: row.metadata,
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        storedCreatorName: row.creatorName,
        storedCreatorAddress: row.creatorAddress,
        storedCollectionName: row.collectionName,
        storedMintedAt: row.mintedAt,
        channelOwnerUsername: channel.ownerUsername,
      });
      return {
        queueIndex: idx,
        playlistIndex: idx,
        itemId: row.itemId,
        videoId: row.videoId,
        title: row.title || `Video ${row.videoId}`,
        mimeType: row.mimeType,
        thumbnailUri: row.thumbnailUri,
        sourceUri,
        cacheUrl,
        durationSeconds: Math.max(1, Number(row.durationSeconds || 1)),
        offsetSeconds: 0,
        kind: row.mimeType === "image/gif" ? "gif" : "video",
        creatorName: overlay.creatorName,
        creatorAddress: overlay.creatorAddress,
        collectionName: overlay.collectionName,
        mintedAtIso:
          overlay.mintedAt && !Number.isNaN(overlay.mintedAt.getTime())
            ? overlay.mintedAt.toISOString()
            : null,
        objktUrl: overlay.objktUrl,
        addedByUsername: overlay.addedByUsername,
      };
    });
    const broadcast = resolveTvBroadcastQueue(queue, nowMs);
    const previewQueue = broadcast.queue.slice(0, Math.min(3, broadcast.queue.length));

    res.json({
      channel,
      mode: "playlist",
      current: broadcast.current,
      queue: previewQueue,
      playlist: {
        id: activePlaylist.id,
        name: activePlaylist.name,
        transitionSeconds: activePlaylist.transitionSeconds,
        totalItems: playlistRows.length,
      },
      loopDurationSeconds: broadcast.loopDurationSeconds,
      upcoming,
      offline: false,
    });
  } catch (err) {
    console.error("[tv] /now endpoint failed:", err);
    res.status(500).json({ error: "Failed to resolve channel state" });
  }
});

// ─── Schedule Entries (recurring daily playlist time-slots) ───────────

router.get("/api/tv/channels/:channelId/schedule", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const [channel] = await db
      .select({
        id: tvChannels.id,
        isActive: tvChannels.isActive,
        isPublic: tvChannels.isPublic,
        ownerUserId: tvChannels.ownerUserId,
      })
      .from(tvChannels)
      .where(eq(tvChannels.id, channelId));

    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: "Channel not found" });
    }
    // Schedule metadata also needs the visibility gate — otherwise a
    // guessed id reveals when a private channel is programmed.
    const scheduleViewer = (req as any).user as AuthUser | undefined;
    const scheduleViewerIsStaff = scheduleViewer
      ? await isStaffRole(scheduleViewer.role)
      : false;
    if (!canViewChannel(channel, scheduleViewer ?? null, { isStaff: scheduleViewerIsStaff })) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const rows = await db
      .select({
        id: tvScheduleEntries.id,
        channelId: tvScheduleEntries.channelId,
        playlistId: tvScheduleEntries.playlistId,
        label: tvScheduleEntries.label,
        startMinuteOfDay: tvScheduleEntries.startMinuteOfDay,
        endMinuteOfDay: tvScheduleEntries.endMinuteOfDay,
        sortOrder: tvScheduleEntries.sortOrder,
        createdAt: tvScheduleEntries.createdAt,
        playlistName: tvPlaylists.name,
      })
      .from(tvScheduleEntries)
      .leftJoin(tvPlaylists, eq(tvScheduleEntries.playlistId, tvPlaylists.id))
      .where(
        and(
          eq(tvScheduleEntries.channelId, channelId),
          sql`${tvScheduleEntries.playlistId} IS NOT NULL`
        )
      )
      .orderBy(asc(tvScheduleEntries.startMinuteOfDay), asc(tvScheduleEntries.sortOrder));

    res.json(rows);
  } catch (err) {
    console.error("[tv] failed to list schedule:", err);
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.post("/api/tv/channels/:channelId/schedule", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    const playlistId = Number(req.body?.playlistId);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: "playlistId is required" });
    }

    const [playlist] = await db
      .select({ id: tvPlaylists.id, channelId: tvPlaylists.channelId })
      .from(tvPlaylists)
      .where(eq(tvPlaylists.id, playlistId));
    if (!playlist || playlist.channelId !== channelId) {
      return res.status(404).json({ error: "Playlist not found or doesn't belong to this channel" });
    }

    const startMinute = Math.floor(Number(req.body?.startMinuteOfDay ?? -1));
    const endMinute = Math.floor(Number(req.body?.endMinuteOfDay ?? -1));
    if (startMinute < 0 || startMinute >= 1440 || endMinute < 0 || endMinute > 1440) {
      return res.status(400).json({ error: "startMinuteOfDay (0–1439) and endMinuteOfDay (1–1440) are required" });
    }
    if (endMinute <= startMinute) {
      return res.status(400).json({ error: "endMinuteOfDay must be after startMinuteOfDay" });
    }

    const overlaps = await db
      .select({ id: tvScheduleEntries.id })
      .from(tvScheduleEntries)
      .where(
        and(
          eq(tvScheduleEntries.channelId, channelId),
          sql`${tvScheduleEntries.playlistId} IS NOT NULL`,
          sql`${tvScheduleEntries.startMinuteOfDay} < ${endMinute}`,
          sql`${tvScheduleEntries.endMinuteOfDay} > ${startMinute}`
        )
      )
      .limit(1);

    if (overlaps.length > 0) {
      return res.status(409).json({ error: "Time slot overlaps with an existing schedule entry" });
    }

    const label = String(req.body?.label || "").trim().slice(0, 120) || null;

    const [entry] = await db
      .insert(tvScheduleEntries)
      .values({
        channelId,
        playlistId,
        label,
        startMinuteOfDay: startMinute,
        endMinuteOfDay: endMinute,
      })
      .returning();

    res.status(201).json(entry);
  } catch (err) {
    console.error("[tv] failed to create schedule entry:", err);
    res.status(500).json({ error: "Failed to create schedule entry" });
  }
});

router.delete("/api/tv/channels/:channelId/schedule/:entryId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const channelId = Number(req.params.channelId);
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ error: "Invalid ids" });
    }

    const editable = await ensureChannelEditable(channelId, user);
    if (editable.error || !editable.channel) {
      return res.status(editable.status).json({ error: editable.error });
    }

    await db
      .delete(tvScheduleEntries)
      .where(and(eq(tvScheduleEntries.id, entryId), eq(tvScheduleEntries.channelId, channelId)));

    res.json({ ok: true });
  } catch (err) {
    console.error("[tv] failed to delete schedule entry:", err);
    res.status(500).json({ error: "Failed to delete schedule entry" });
  }
});

// ─── Slug-based public "now playing" ────────────────────

router.get("/api/tv/channels/by-slug/:slug/current", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: "Slug is required" });

    const [channel] = await db
      .select({
        id: tvChannels.id,
        ownerUserId: tvChannels.ownerUserId,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
        logoUrl: tvChannels.logoUrl,
        bannerUrl: tvChannels.bannerUrl,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(eq(tvChannels.slug, slug));

    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const slugViewer = (req as any).user as AuthUser | undefined;
    const slugViewerIsStaff = slugViewer ? await isStaffRole(slugViewer.role) : false;
    if (!canViewChannel(channel, slugViewer ?? null, { isStaff: slugViewerIsStaff })) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const nowMs = Date.now();

    const scheduleEntries = await db
      .select({
        id: tvScheduleEntries.id,
        mediaItemId: tvScheduleEntries.mediaItemId,
        startsAt: tvScheduleEntries.startsAt,
        endsAt: tvScheduleEntries.endsAt,
        sortOrder: tvScheduleEntries.sortOrder,
        mediaTitle: userMediaLibrary.title,
        mediaSourceUrl: userMediaLibrary.sourceUrl,
        mediaPlaybackUrl: userMediaLibrary.playbackUrl,
        mediaMimeType: userMediaLibrary.mimeType,
        mediaPosterUrl: userMediaLibrary.posterUrl,
        mediaDuration: userMediaLibrary.durationSeconds,
        mediaSourceType: userMediaLibrary.sourceType,
      })
      .from(tvScheduleEntries)
      .innerJoin(userMediaLibrary, eq(tvScheduleEntries.mediaItemId, userMediaLibrary.id))
      .where(
        and(
          eq(tvScheduleEntries.channelId, channel.id),
          sql`${tvScheduleEntries.endsAt} > NOW()`,
          eq(userMediaLibrary.status, "ready")
        )
      )
      .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder))
      .limit(10);

    const now = new Date(nowMs);
    const currentEntry = scheduleEntries.find(
      (e) => e.startsAt && e.endsAt && new Date(e.startsAt) <= now && new Date(e.endsAt) > now
    );
    const upcoming = scheduleEntries.filter(
      (e) => e.startsAt && new Date(e.startsAt) > now
    ).slice(0, 5);

    if (currentEntry) {
      const playbackSource = resolveTvChannelPlaybackSource({
        channelId: channel.id,
        mediaItemId: currentEntry.mediaItemId,
        sourceType: currentEntry.mediaSourceType,
        sourceUri: currentEntry.mediaSourceUrl,
        playbackUrl: currentEntry.mediaPlaybackUrl,
      });
      const sourceUrl = normalizeMediaUri(playbackSource) || playbackSource;
      const cacheUrl = resolveCacheUrl(sourceUrl);
      const elapsedSec = currentEntry.startsAt ? Math.floor((nowMs - new Date(currentEntry.startsAt).getTime()) / 1000) : 0;

      return res.json({
        channel,
        mode: "schedule",
        current: {
          ...currentEntry,
          sourceUrl,
          cacheUrl,
          offsetSeconds: elapsedSec,
          kind: currentEntry.mediaMimeType === "image/gif" ? "gif" : "video",
        },
        upcoming,
        offline: false,
      });
    }

    await maybeAutoRefreshWtfChannel(channel.id);

    const [activePlaylist] = await db
      .select()
      .from(tvPlaylists)
      .where(and(eq(tvPlaylists.channelId, channel.id), eq(tvPlaylists.isActive, true)))
      .orderBy(asc(tvPlaylists.id))
      .limit(1);

    if (!activePlaylist) {
      return res.json({
        channel,
        mode: "schedule",
        current: null,
        upcoming,
        offline: true,
        message: "Nothing scheduled and no active playlist",
      });
    }

    const playlistRows = await db
      .select({
        itemId: tvPlaylistItems.id,
        sortOrder: tvPlaylistItems.sortOrder,
        durationSeconds: tvPlaylistItems.durationSeconds,
        videoId: tvChannelVideos.id,
        mediaItemId: tvChannelVideos.mediaItemId,
        title: tvChannelVideos.title,
        mimeType: tvChannelVideos.mimeType,
        sourceUri: tvChannelVideos.sourceUri,
        mediaSourceType: userMediaLibrary.sourceType,
        mediaPlaybackUrl: userMediaLibrary.playbackUrl,
        thumbnailUri: tvChannelVideos.thumbnailUri,
      })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
      .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
      .where(eq(tvPlaylistItems.playlistId, activePlaylist.id))
      .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));

    if (playlistRows.length === 0) {
      return res.json({
        channel,
        mode: "playlist",
        current: null,
        upcoming,
        offline: true,
        message: "No content available",
      });
    }

    const queue = playlistRows.map((row, index) => {
      const playbackSource = resolveTvChannelPlaybackSource({
        channelId: channel.id,
        mediaItemId: row.mediaItemId,
        sourceType: row.mediaSourceType,
        sourceUri: row.sourceUri,
        playbackUrl: row.mediaPlaybackUrl,
      });
      const sourceUri = normalizeMediaUri(playbackSource) || playbackSource;
      const cacheUrl = resolveCacheUrl(sourceUri);
      return {
        queueIndex: index,
        playlistIndex: index,
        itemId: row.itemId,
        videoId: row.videoId,
        title: row.title || `Video ${row.videoId}`,
        mimeType: row.mimeType,
        thumbnailUri: row.thumbnailUri,
        sourceUri,
        cacheUrl,
        durationSeconds: Math.max(1, Number(row.durationSeconds || 1)),
        offsetSeconds: 0,
        kind: row.mimeType === "image/gif" ? "gif" : "video",
      };
    });
    const broadcast = resolveTvBroadcastQueue(queue, nowMs);

    res.json({
      channel,
      mode: "playlist",
      current: broadcast.current,
      upcoming,
      offline: false,
    });
  } catch (err) {
    console.error("[tv] failed to resolve slug current:", err);
    res.status(500).json({ error: "Failed to resolve channel" });
  }
});

export default router;
