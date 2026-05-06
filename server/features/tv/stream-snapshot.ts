import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  addressLabels,
  tvBumpers,
  tvChannelVideos,
  tvPlaylistItems,
  tvPlaylists,
  userMediaLibrary,
  users,
} from "@shared/schema";
import { db } from "../../db";
import { createTvStreamSnapshotCache } from "../../lib/tv-stream-snapshot-cache";
import { resolveTvOverlayMetadata } from "../../lib/tv-overlay-metadata";
import { resolveTvChannelPlaybackSource } from "../../lib/tv-policy";
import {
  BUMPER_CATEGORY_COMMUNITY,
  BUMPER_CATEGORY_PERSONAL,
  daypartForMs,
  type DaypartName,
} from "./daypart";
import {
  isDefaultDuration,
  prefetchMediaAsync,
  probePlaylistItemAsync,
} from "./cache-runtime";
import {
  isSameOriginMediaPath,
  normalizeMediaUri,
  resolveCacheUrl,
} from "./media-urls";

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

export function streamShuffleSeed(channelId: number, playlistId: number, nowMs: number): number {
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

export type TvStreamQueueItem = {
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

export type TvStreamSnapshotPayload = {
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

export const tvStreamSnapshotCache = createTvStreamSnapshotCache<TvStreamSnapshotPayload>({
  ttlMs: TV_STREAM_SNAPSHOT_CACHE_TTL_MS,
  maxEntries: TV_STREAM_SNAPSHOT_CACHE_MAX_ENTRIES,
});

function revisionStamp(value: Date | string | null | undefined): string {
  if (!value) return "0";
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return String(value);
  return asDate.toISOString();
}

export async function loadTvStreamSnapshotRevision(params: {
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

export function buildTvStreamSnapshotCacheKey(params: {
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

export async function buildTvStreamSnapshot(params: {
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
