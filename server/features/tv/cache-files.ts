import { createHash } from "crypto";
import path from "path";
import { type TvCacheMirrorMeta } from "../../lib/storage/tv-cache-object-store";
import { extractIpfsPath } from "./media-urls";

export const TV_CACHE_DIR =
  process.env.TV_CACHE_DIR?.trim() ||
  path.resolve(process.cwd(), "cache", "tv");
export const TV_CACHE_MAX_AGE_MS =
  Math.max(1, Number(process.env.TV_CACHE_MAX_AGE_DAYS || 30)) *
  24 *
  60 *
  60 *
  1000;
export const TV_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const TV_CACHE_TMP_MAX_AGE_MS = 60 * 60 * 1000;
export const TV_CACHE_MAX_REMOTE_BYTES = Math.max(
  20 * 1024 * 1024,
  Number(process.env.TV_CACHE_MAX_REMOTE_BYTES || 500 * 1024 * 1024)
);
export const TV_CACHE_MAX_TOTAL_BYTES = Math.max(
  TV_CACHE_MAX_REMOTE_BYTES,
  Number(process.env.TV_CACHE_MAX_TOTAL_BYTES || 10 * 1024 * 1024 * 1024)
);
function parseRatio(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) return fallback;
  return value;
}

export const TV_CACHE_WARN_RATIO = parseRatio(process.env.TV_CACHE_WARN_RATIO, 0.9);
export const TV_CACHE_EVICT_TARGET_RATIO = Math.max(
  0.05,
  Math.min(
    TV_CACHE_WARN_RATIO - 0.01,
    parseRatio(process.env.TV_CACHE_EVICT_TARGET_RATIO, 0.85)
  )
);
export const TV_CACHE_WARN_BYTES = Math.floor(TV_CACHE_MAX_TOTAL_BYTES * TV_CACHE_WARN_RATIO);
export const TV_CACHE_EVICT_TARGET_BYTES = Math.floor(
  TV_CACHE_MAX_TOTAL_BYTES * TV_CACHE_EVICT_TARGET_RATIO
);

export const TV_TRANSCODE_ENABLED =
  String(process.env.TV_TRANSCODE_ENABLED ?? "1") !== "0";
export const TV_TRANSCODE_THRESHOLD_BYTES = Math.max(
  4 * 1024 * 1024,
  Number(process.env.TV_TRANSCODE_THRESHOLD_BYTES || 40 * 1024 * 1024)
);
export const TV_TRANSCODE_MAX_HEIGHT = Math.max(
  240,
  Math.min(1080, Number(process.env.TV_TRANSCODE_MAX_HEIGHT || 720))
);
export const TV_TRANSCODE_CRF = Math.max(
  18,
  Math.min(32, Number(process.env.TV_TRANSCODE_CRF || 23))
);
export const TV_TRANSCODE_PER_SWEEP = Math.max(
  1,
  Number(process.env.TV_TRANSCODE_PER_SWEEP || 3)
);
export const TV_TRANSCODE_SWEEP_INTERVAL_MS = Math.max(
  60 * 1000,
  Number(process.env.TV_TRANSCODE_SWEEP_INTERVAL_MS || 5 * 60 * 1000)
);
export const TV_TRANSCODE_BOOT_DELAY_MS = Math.max(
  0,
  Number(process.env.TV_TRANSCODE_BOOT_DELAY_MS || 90 * 1000)
);
export const TV_TRANSCODE_ERROR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type CacheMeta = TvCacheMirrorMeta;

export type CacheEntry = {
  base: string;
  mediaPath: string;
  metaPath: string;
  size: number;
  originalBytes: number;
  transcodedBytes: number;
  mtimeMs: number;
  immutable: boolean;
};

export type TranscodeMeta =
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

export function logCacheEvent(payload: Record<string, unknown>) {
  try {
    console.info("[tv-cache]", JSON.stringify(payload));
  } catch {
    /* swallow */
  }
}

export function shortHashForLog(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

export function isImmutableSource(url: string): boolean {
  const raw = String(url || "").toLowerCase();
  if (extractIpfsPath(url)) return true;
  if (raw.startsWith("ipfs://")) return true;
  if (raw.includes("/ipfs/")) return true;
  return false;
}

export function cacheFileBase(url: string): string {
  const ipfsPath = extractIpfsPath(url);
  const keyInput = ipfsPath ? `ipfs:${ipfsPath}` : url;
  return createHash("sha256").update(keyInput).digest("hex");
}

export function cacheMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.bin`);
}

export function cacheMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.json`);
}

export function transcodeMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.${TV_TRANSCODE_MAX_HEIGHT}p.mp4`);
}

export function transcodeMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.${TV_TRANSCODE_MAX_HEIGHT}p.json`);
}
