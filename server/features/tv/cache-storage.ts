import path from "path";
import { promises as fsPromises } from "fs";
import {
  isTvCacheObjectStorageConfigured,
  mirrorTvCacheEntryToObjectStorage,
} from "../../lib/storage/tv-cache-object-store";
import {
  cacheFileBase,
  cacheMediaPath,
  cacheMetaPath,
  logCacheEvent,
  shortHashForLog,
  transcodeMediaPath,
  TV_CACHE_CLEANUP_INTERVAL_MS,
  TV_CACHE_DIR,
  TV_CACHE_MAX_AGE_MS,
  TV_CACHE_MAX_REMOTE_BYTES,
  TV_CACHE_MAX_TOTAL_BYTES,
  TV_CACHE_TMP_MAX_AGE_MS,
  TV_TRANSCODE_CRF,
  TV_TRANSCODE_ENABLED,
  TV_TRANSCODE_MAX_HEIGHT,
  TV_TRANSCODE_THRESHOLD_BYTES,
  type CacheEntry,
  type CacheMeta,
} from "./cache-files";

let lastCleanupAt = 0;
const inFlightTvCacheMirrors = new Set<string>();

export async function ensureCacheDir() {
  await fsPromises.mkdir(TV_CACHE_DIR, { recursive: true });
}

export async function readCacheMeta(base: string): Promise<CacheMeta | null> {
  try {
    const raw = await fsPromises.readFile(cacheMetaPath(base), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCacheMeta(
  base: string,
  data: CacheMeta
) {
  const payload = JSON.stringify({
    ...data,
    updatedAt: data.updatedAt || new Date().toISOString(),
  });
  await fsPromises.writeFile(cacheMetaPath(base), payload, "utf8");
}

export function queueTvCacheMirror(base: string, meta: CacheMeta | null | undefined): void {
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

export async function touchCache(mediaPath: string): Promise<void> {
  const now = Date.now() / 1000;
  try {
    await fsPromises.utimes(mediaPath, now, now);
  } catch {
    /* best-effort */
  }
}

export async function listCacheEntries(): Promise<CacheEntry[]> {
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
      let transcodedBytes = 0;
      try {
        const tStat = await fsPromises.stat(transcodeMediaPath(base));
        if (tStat.size > 0) transcodedBytes = tStat.size;
      } catch {
        /* no transcode present */
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

export async function deleteCacheEntry(entry: CacheEntry): Promise<void> {
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

export async function enforceCacheBudget(existing?: CacheEntry[]): Promise<void> {
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

export async function cleanupTvCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCleanupAt < TV_CACHE_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  await cleanupTmpCacheFiles(now);
  const entries = await listCacheEntries();
  const survivors: CacheEntry[] = [];
  for (const entry of entries) {
    if (!entry.immutable && now - entry.mtimeMs > TV_CACHE_MAX_AGE_MS) {
      await deleteCacheEntry(entry);
      continue;
    }
    survivors.push(entry);
  }
  await enforceCacheBudget(survivors);
}

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
    if (newBase === oldBase) continue;

    const newMetaPath = path.join(TV_CACHE_DIR, `${newBase}.json`);
    const newMediaPath = path.join(TV_CACHE_DIR, `${newBase}.bin`);

    let oldMediaStat: import("fs").Stats | null = null;
    try {
      oldMediaStat = await fsPromises.stat(oldMediaPath);
    } catch {
      await fsPromises.unlink(oldMetaPath).catch(() => undefined);
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
