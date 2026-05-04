export type TelemetryReason = "ended" | "skipped" | "error" | "stall";

type TelemetryBucket = {
  plays: number;
  completions: number;
  skips: number;
  errors: number;
  stalls: number;
  lastSeenMs: number;
  erroredSessionIds: Map<string, number>;
};

export type VideoTelemetrySnapshot = {
  videoId: number;
  plays: number;
  completions: number;
  skips: number;
  errors: number;
  stalls: number;
  distinctErrorSessions: number;
  completionRate: number;
  lastSeenMs: number;
};

export type BumperTelemetrySnapshot = {
  bumperId: number;
  plays: number;
  completions: number;
  errors: number;
  distinctErrorSessions: number;
  lastSeenMs: number;
};

export type TvTelemetryAggregate = {
  windowMs: number;
  blacklistThreshold: number;
  blacklisted: number[];
  videos: VideoTelemetrySnapshot[];
  bumpers: BumperTelemetrySnapshot[];
};

type TvTelemetryStoreOptions = {
  windowMs?: number;
  blacklistThreshold?: number;
  maxTrackedVideos?: number;
  maxTrackedBumpers?: number;
  maxErroredSessionsPerItem?: number;
  now?: () => number;
};

type TelemetryRecordParams = {
  videoId?: number | null;
  bumperId?: number | null;
  sessionId: string;
  reason: TelemetryReason;
};

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_BLACKLIST_THRESHOLD = 3;
const DEFAULT_MAX_TRACKED_VIDEOS = 4_000;
const DEFAULT_MAX_TRACKED_BUMPERS = 1_000;
const DEFAULT_MAX_ERRORED_SESSIONS_PER_ITEM = 64;

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) return fallback;
  return Math.max(1, Math.trunc(candidate));
}

function emptyTelemetryBucket(): TelemetryBucket {
  return {
    plays: 0,
    completions: 0,
    skips: 0,
    errors: 0,
    stalls: 0,
    lastSeenMs: 0,
    erroredSessionIds: new Map<string, number>(),
  };
}

function pruneErroredSessions(bucket: TelemetryBucket, cutoffMs: number): void {
  for (const [sessionId, seenAtMs] of bucket.erroredSessionIds.entries()) {
    if (seenAtMs < cutoffMs) {
      bucket.erroredSessionIds.delete(sessionId);
    }
  }
}

function evictOldestErroredSessions(
  sessions: Map<string, number>,
  maxTrackedSessions: number
): void {
  if (sessions.size <= maxTrackedSessions) return;

  const overflow = sessions.size - maxTrackedSessions;
  const oldest = Array.from(sessions.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, overflow);

  for (const [sessionId] of oldest) {
    sessions.delete(sessionId);
  }
}

function pruneBucketMap(buckets: Map<number, TelemetryBucket>, cutoffMs: number): void {
  for (const [id, bucket] of buckets.entries()) {
    pruneErroredSessions(bucket, cutoffMs);
    if (bucket.lastSeenMs < cutoffMs) {
      buckets.delete(id);
    }
  }
}

function evictOldestBuckets(
  buckets: Map<number, TelemetryBucket>,
  maxTrackedBuckets: number
): void {
  if (buckets.size < maxTrackedBuckets) return;

  const overflow = buckets.size - maxTrackedBuckets + 1;
  const oldest = Array.from(buckets.entries())
    .sort((a, b) => a[1].lastSeenMs - b[1].lastSeenMs)
    .slice(0, overflow);

  for (const [id] of oldest) {
    buckets.delete(id);
  }
}

export function createTvTelemetryStore(options: TvTelemetryStoreOptions = {}) {
  const windowMs = normalizePositiveInt(options.windowMs, DEFAULT_WINDOW_MS);
  const blacklistThreshold = normalizePositiveInt(
    options.blacklistThreshold,
    DEFAULT_BLACKLIST_THRESHOLD
  );
  const maxTrackedVideos = normalizePositiveInt(
    options.maxTrackedVideos,
    DEFAULT_MAX_TRACKED_VIDEOS
  );
  const maxTrackedBumpers = normalizePositiveInt(
    options.maxTrackedBumpers,
    DEFAULT_MAX_TRACKED_BUMPERS
  );
  const maxErroredSessionsPerItem = Math.max(
    blacklistThreshold,
    normalizePositiveInt(
      options.maxErroredSessionsPerItem,
      DEFAULT_MAX_ERRORED_SESSIONS_PER_ITEM
    )
  );
  const now = options.now ?? (() => Date.now());

  const telemetryByVideoId = new Map<number, TelemetryBucket>();
  const telemetryByBumperId = new Map<number, TelemetryBucket>();

  function prune(): void {
    const cutoffMs = now() - windowMs;
    pruneBucketMap(telemetryByVideoId, cutoffMs);
    pruneBucketMap(telemetryByBumperId, cutoffMs);
  }

  function ensureBucket(
    buckets: Map<number, TelemetryBucket>,
    id: number,
    maxTrackedBuckets: number
  ): TelemetryBucket {
    const existing = buckets.get(id);
    if (existing) return existing;

    evictOldestBuckets(buckets, maxTrackedBuckets);
    const created = emptyTelemetryBucket();
    buckets.set(id, created);
    return created;
  }

  function record(params: TelemetryRecordParams): boolean {
    const atMs = now();
    const cutoffMs = atMs - windowMs;
    const { videoId, bumperId, sessionId, reason } = params;

    let bucket: TelemetryBucket | null = null;
    if (typeof bumperId === "number" && Number.isFinite(bumperId) && bumperId > 0) {
      bucket = ensureBucket(telemetryByBumperId, bumperId, maxTrackedBumpers);
    } else if (typeof videoId === "number" && Number.isFinite(videoId) && videoId > 0) {
      bucket = ensureBucket(telemetryByVideoId, videoId, maxTrackedVideos);
    }
    if (!bucket) return false;

    pruneErroredSessions(bucket, cutoffMs);
    bucket.plays += 1;
    bucket.lastSeenMs = atMs;
    if (reason === "ended") bucket.completions += 1;
    if (reason === "skipped") bucket.skips += 1;
    if (reason === "stall") bucket.stalls += 1;
    if (reason === "error") {
      bucket.errors += 1;
      if (sessionId) {
        bucket.erroredSessionIds.set(sessionId, atMs);
        evictOldestErroredSessions(bucket.erroredSessionIds, maxErroredSessionsPerItem);
      }
    }

    return true;
  }

  function blacklistedVideoIds(): Set<number> {
    prune();
    const out = new Set<number>();
    for (const [videoId, bucket] of telemetryByVideoId.entries()) {
      if (bucket.erroredSessionIds.size >= blacklistThreshold) {
        out.add(videoId);
      }
    }
    return out;
  }

  function videos(): VideoTelemetrySnapshot[] {
    prune();
    return Array.from(telemetryByVideoId.entries()).map(([id, bucket]) => ({
      videoId: id,
      plays: bucket.plays,
      completions: bucket.completions,
      skips: bucket.skips,
      errors: bucket.errors,
      stalls: bucket.stalls,
      distinctErrorSessions: bucket.erroredSessionIds.size,
      completionRate: bucket.plays > 0 ? bucket.completions / bucket.plays : 0,
      lastSeenMs: bucket.lastSeenMs,
    }));
  }

  function bumpers(): BumperTelemetrySnapshot[] {
    prune();
    return Array.from(telemetryByBumperId.entries()).map(([id, bucket]) => ({
      bumperId: id,
      plays: bucket.plays,
      completions: bucket.completions,
      errors: bucket.errors,
      distinctErrorSessions: bucket.erroredSessionIds.size,
      lastSeenMs: bucket.lastSeenMs,
    }));
  }

  function aggregate(): TvTelemetryAggregate {
    const blacklisted = Array.from(blacklistedVideoIds());
    return {
      windowMs,
      blacklistThreshold,
      blacklisted,
      videos: videos(),
      bumpers: bumpers(),
    };
  }

  return {
    record,
    prune,
    blacklistedVideoIds,
    videos,
    bumpers,
    aggregate,
  };
}
