import { Router } from "express";
import { createHash } from "crypto";
import path from "path";
import { promises as fsPromises, createReadStream, createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import multer from "multer";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { hasAtLeastRole, type UserRole } from "@shared/types";
import { db, pool } from "../db";
import { isAuthenticated } from "../auth/passport";
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
} from "@shared/schema";
import { resolveArtifactMimeType, resourceUrisLikelySame } from "@shared/token-media";
import {
  isPlayableMimeType,
  guessMimeTypeFromUri,
  parseFormatsFromMetadata,
  type PlayableAsset,
} from "../lib/media-utils";
import { normalizePublicHttpUrl, parseHostAllowlist } from "../lib/network-safety";
import { probeMediaDuration } from "../lib/media-probe";

const router = Router();

const lastSeenTv = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

const TV_MAX_STAFF_CHANNELS = 3;
const TV_MAX_USER_CHANNELS = 1;
// ─── TV media cache ────────────────────────────────────────
//
// Looping channels replay the same small set of videos over and over.
// Every IPFS round-trip costs real bandwidth and stalls playback, so
// the cache is kept on a persistent Docker volume (/app/cache) and is
// sized generously.  IPFS content is content-addressed and therefore
// immutable — we never re-fetch it until it falls out of the LRU
// budget.  Non-IPFS sources still expire on a TTL so stale HTTP links
// don't pin us to outdated bytes forever.
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
const TV_CACHE_ALLOWED_HOSTS = parseHostAllowlist(process.env.TV_CACHE_ALLOWED_HOSTS);
const TV_MEDIA_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TV_MEDIA_FETCH_TIMEOUT_MS || 25000)
);
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
const BUMPER_CATEGORY_PERSONAL = "personal" as const;
const BUMPER_CATEGORY_COMMUNITY = "community" as const;
const BUMPER_CATEGORIES = new Set<string>([
  BUMPER_CATEGORY_PERSONAL,
  BUMPER_CATEGORY_COMMUNITY,
]);
const BUMPER_MAX_FILE_BYTES = 80 * 1024 * 1024;
const BUMPER_MAX_DURATION_MS = 30_000;
// Widened for the rebuild.  Any image/* mime that browsers animate
// (gif, webp, apng) plus the common web-safe video containers.  Token
// videos stay constrained by the token's own mimetype upstream — this
// list only affects user-uploaded interstitials.
const BUMPER_ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
  "image/gif",
  "image/webp",
  "image/apng",
  "image/png",
  "image/jpeg",
]);
const BUMPER_UPLOADS_DIR =
  process.env.BUMPER_UPLOADS_DIR ||
  path.resolve(process.cwd(), "uploads", "bumpers");

async function ensureBumperDir() {
  await fsPromises.mkdir(BUMPER_UPLOADS_DIR, { recursive: true });
}

function bumperExtensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "video/mp4":        return ".mp4";
    case "video/webm":       return ".webm";
    case "video/ogg":        return ".ogv";
    case "video/quicktime":  return ".mov";
    case "video/x-matroska": return ".mkv";
    case "image/gif":        return ".gif";
    case "image/webp":       return ".webp";
    case "image/apng":       return ".apng";
    case "image/png":        return ".png";
    case "image/jpeg":       return ".jpg";
    default:                 return ".bin";
  }
}

function bumperFilename(mimeType: string): string {
  const ext = bumperExtensionForMime(mimeType);
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
  return `${hex}${ext}`;
}

/**
 * Pulls MTV-style display fields out of a token metadata blob using
 * the same rules as the boot-time SQL backfill.  Returns all fields
 * optional so callers can spread the result into an insert/update.
 */
function extractTokenMetaFields(
  metadata: any,
  tokenName?: string | null
): {
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAt: Date | null;
} {
  const meta = (metadata && typeof metadata === "object") ? metadata as Record<string, any> : null;
  if (!meta) {
    return { creatorName: null, creatorAddress: null, collectionName: null, mintedAt: null };
  }

  const pickString = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
  };

  const creators = Array.isArray(meta.creators) ? meta.creators
                 : Array.isArray(meta.authors)  ? meta.authors
                 : [];
  const firstCreator = pickString(creators[0]);

  const creatorNameRaw = firstCreator
                      ?? pickString(meta.creator)
                      ?? pickString(meta.artist)
                      ?? null;

  const tezAddressRe = /^(tz1|tz2|tz3|KT1)[A-Za-z0-9]{33,34}$/;
  const creatorAddress = firstCreator && tezAddressRe.test(firstCreator)
    ? firstCreator
    : null;

  const collectionName = pickString(meta.collectionName)
                      ?? pickString(meta.collection?.name)
                      ?? pickString(meta.contract?.name)
                      ?? null;

  let mintedAt: Date | null = null;
  const dateRaw = pickString(meta.date) ?? pickString(meta.mintedAt) ?? pickString(meta.created);
  if (dateRaw) {
    const parsed = new Date(dateRaw);
    if (!Number.isNaN(parsed.getTime())) mintedAt = parsed;
  }

  return {
    creatorName: creatorNameRaw,
    creatorAddress,
    collectionName,
    mintedAt,
  };
}

const bumperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BUMPER_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    // Accept everything on the allowlist; the route handler rejects
    // unknown mime types with a clear error message for the user
    // (multer's default on `false` is a silent drop that looks like a
    // missing file on the client).
    if (BUMPER_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

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
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const ipfsPath = stripIpfsPrefix(trimmed);
    const base = TV_IPFS_GATEWAYS[0] || DEFAULT_IPFS_GATEWAYS[0];
    return `${base}${ipfsPath}`;
  }
  return trimmed;
}

function normalizeMediaUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  return normalizePublicHttpUrl(normalized, TV_CACHE_ALLOWED_HOSTS);
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

  const canEdit = channel.ownerUserId === user.id || (await isStaffRole(user.role));
  if (!canEdit) return { error: "Not authorized", status: 403 as const, channel: null };

  return { error: null, status: 200 as const, channel };
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

type CacheMeta = {
  contentType?: string;
  updatedAt?: string;
  immutable?: boolean;
  sourceUri?: string;
  sizeBytes?: number;
};

type CacheEntry = {
  base: string;
  mediaPath: string;
  metaPath: string;
  size: number;
  mtimeMs: number;
  immutable: boolean;
};

function cacheFileBase(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function cacheMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.bin`);
}

function cacheMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.json`);
}

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
  data: { contentType: string; immutable: boolean; sourceUri: string; sizeBytes: number }
) {
  const payload = JSON.stringify({
    contentType: data.contentType,
    immutable: data.immutable,
    sourceUri: data.sourceUri,
    sizeBytes: data.sizeBytes,
    updatedAt: new Date().toISOString(),
  });
  await fsPromises.writeFile(cacheMetaPath(base), payload, "utf8");
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
      entries.push({
        base,
        mediaPath,
        metaPath,
        size: stat.size,
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
  await Promise.all([
    fsPromises.unlink(entry.mediaPath).catch(() => undefined),
    fsPromises.unlink(entry.metaPath).catch(() => undefined),
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

async function cleanupTvCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCleanupAt < TV_CACHE_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

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

/** Read-only snapshot of cache state for ops/debug. */
export async function readTvCacheStats() {
  const entries = await listCacheEntries();
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const immutableCount = entries.filter((e) => e.immutable).length;
  return {
    dir: TV_CACHE_DIR,
    fileCount: entries.length,
    immutableCount,
    mutableCount: entries.length - immutableCount,
    totalBytes,
    maxTotalBytes: TV_CACHE_MAX_TOTAL_BYTES,
    maxFileBytes: TV_CACHE_MAX_REMOTE_BYTES,
    ttlMs: TV_CACHE_MAX_AGE_MS,
  };
}

async function ensureMediaCached(url: string): Promise<{
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
  const tempPath = `${mediaPath}.tmp`;
  const immutable = isImmutableSource(url);
  const meta = await readCacheMeta(base);
  const sourceTag = shortHashForLog(url);

  try {
    const stat = await fsPromises.stat(mediaPath);
    const ttlOk = immutable || Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS;
    if (ttlOk) {
      touchCache(mediaPath).catch(() => undefined);
      logCacheEvent({
        event: "hit",
        source: sourceTag,
        bytes: stat.size,
        elapsedMs: Date.now() - startedAt,
      });
      return {
        mediaPath,
        contentType: meta?.contentType || guessMimeTypeFromUri(url),
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
  await fsPromises.rename(tempPath, mediaPath);
  await writeCacheMeta(base, {
    contentType,
    immutable,
    sourceUri: url,
    sizeBytes: bytes,
  });
  enforceCacheBudget().catch(() => undefined);

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
  opts: { allowRange?: boolean } = {}
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

  await ensureCacheDir();
  cleanupTvCache().catch(() => undefined);

  /* ─ Hot path ─ */
  try {
    const stat = await fsPromises.stat(mediaPath);
    const ttlOk = immutable || Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS;
    if (ttlOk) {
      const contentType =
        meta?.contentType || guessMimeTypeFromUri(url) || "application/octet-stream";
      touchCache(mediaPath).catch(() => undefined);

      const totalSize = stat.size;
      const rangeHeader = allowRange ? String(req.headers?.range || "") : "";
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/i);

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("X-TV-Cache", "HIT");

      if (rangeMatch) {
        let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
        let end = rangeMatch[2] ? Number(rangeMatch[2]) : totalSize - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= totalSize) end = totalSize - 1;
        if (start > end) {
          res.status(416);
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          res.end();
          return;
        }
        const length = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", String(length));

        const stream = createReadStream(mediaPath, { start, end });
        stream.on("error", (err) => {
          console.error("[tv-cache] hit-range stream error:", err);
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        stream.pipe(res);
      } else {
        res.status(200);
        res.setHeader("Content-Length", String(totalSize));
        const stream = createReadStream(mediaPath);
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
        bytes: totalSize,
        ranged: Boolean(rangeMatch),
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
  } catch {
    // cache miss → fall through to network
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
        await writeCacheMeta(base, {
          contentType: upstreamContentType,
          immutable,
          sourceUri: url,
          sizeBytes: bytesPersisted,
        });
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
// duration; the client multiplies that by 3 at playback time.

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
  if (!key || inFlightPrefetch.has(key)) return;
  inFlightPrefetch.add(key);
  ensureMediaCached(key)
    .catch(() => undefined)
    .finally(() => {
      inFlightPrefetch.delete(key);
    });
}

// NOTE: the old wall-clock `computePlaylistCursor` helper was removed
// in the playback rebuild.  Channels are no longer time-synced across
// viewers: every client owns its own cursor and walks the playlist in
// order on natural video `ended` / gif-loop events.  If a true shared
// "everyone watches the same thing at the same second" mode is needed
// later, that has to be driven by an authoritative server-sent event
// stream, not by derived time math — the old derivation fought the
// natural media lifecycle and caused the cut-off glitches this rebuild
// fixes.

router.get("/api/tv/channels", async (req, res) => {
  try {
    const user = (req.user as AuthUser | undefined) || null;
    const mine = String(req.query.mine || "") === "1";

    const whereParts = [eq(tvChannels.isActive, true)];
    if (mine) {
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      whereParts.push(eq(tvChannels.ownerUserId, user.id));
    } else {
      whereParts.push(eq(tvChannels.isPublic, true));
    }

    const rows = await db
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
      );

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
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

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
        createdAt: tvChannels.createdAt,
        updatedAt: tvChannels.updatedAt,
      })
      .from(tvChannels)
      .where(eq(tvChannels.id, channelId));

    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const canManage = channel.ownerUserId === user.id || (await isStaffRole(user.role));

    const [videos, playlists] = await Promise.all([
      db
        .select()
        .from(tvChannelVideos)
        .where(eq(tvChannelVideos.channelId, channelId))
        .orderBy(desc(tvChannelVideos.updatedAt)),
      db
        .select()
        .from(tvPlaylists)
        .where(eq(tvPlaylists.channelId, channelId))
        .orderBy(desc(tvPlaylists.isActive), asc(tvPlaylists.name)),
    ]);

    const playlistIds = playlists.map((p) => p.id);
    const playlistItems =
      playlistIds.length === 0
        ? []
        : await db
            .select()
            .from(tvPlaylistItems)
            .where(inArray(tvPlaylistItems.playlistId, playlistIds))
            .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));

    res.json({
      channel,
      canManage,
      videos,
      playlists,
      playlistItems,
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

    if (mediaItemId !== null) {
      if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
        return res.status(400).json({ error: "mediaItemId must be a positive integer" });
      }
      // Adding a library item directly — same owner guard the media
      // library itself enforces, so a user can't graft someone else's
      // uploads onto their channel.  Staff can still operate on
      // anyone's channel via ensureChannelEditable() above.
      const [libItem] = await db
        .select()
        .from(userMediaLibrary)
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

      const rawUri = libItem.playbackUrl || libItem.sourceUrl;
      const normalized = normalizeMediaUri(rawUri) || rawUri;
      if (!normalized) {
        return res.status(422).json({ error: "Media item has no playable URL" });
      }
      sourceUri = normalized;
      mimeType = libItem.mimeType;
      title = manualTitle || libItem.title || `Media ${libItem.id}`;
      thumbnailUri = manualThumb || libItem.posterUrl || "";
      metadata = libItem.metadata || null;
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

    // Prefer the media_item_id path for duplicate detection when we
    // have one — that way the unique partial index (channel_id,
    // media_item_id) keeps us honest even if the legacy
    // (token_contract, token_id) tuple changed shape somewhere
    // upstream.  Fall back to the legacy tuple for token/manual adds.
    let existing: { id: number } | undefined;
    if (resolvedMediaItemId !== null) {
      [existing] = await db
        .select({ id: tvChannelVideos.id })
        .from(tvChannelVideos)
        .where(
          and(
            eq(tvChannelVideos.channelId, channelId),
            eq(tvChannelVideos.mediaItemId, resolvedMediaItemId)
          )
        );
    }
    if (!existing) {
      [existing] = await db
        .select({ id: tvChannelVideos.id })
        .from(tvChannelVideos)
        .where(
          and(
            eq(tvChannelVideos.channelId, channelId),
            eq(tvChannelVideos.tokenContract, effectiveTokenContract),
            eq(tvChannelVideos.tokenId, effectiveTokenId)
          )
        );
    }

    const tokenMetaFields = extractTokenMetaFields(metadata, title);

    let videoRow: any;
    if (existing) {
      [videoRow] = await db
        .update(tvChannelVideos)
        .set({
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
        })
        .where(eq(tvChannelVideos.id, existing.id))
        .returning();
    } else {
      [videoRow] = await db
        .insert(tvChannelVideos)
        .values({
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
        })
        .returning();
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
      const tokenMetaFields = extractTokenMetaFields(owned.metadata || null, owned.tokenName || null);
      if (asset.sourceUri !== video.sourceUri) {
        await db
          .update(tvChannelVideos)
          .set({
            sourceUri: asset.sourceUri,
            mimeType: asset.mimeType,
            thumbnailUri: asset.thumbnailUri || undefined,
            metadata: owned.metadata,
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
            metadata: owned.metadata,
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

    if (setActive) {
      await db
        .update(tvPlaylists)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(tvPlaylists.channelId, channelId));
    }

    const [playlist] = await db
      .insert(tvPlaylists)
      .values({
        channelId,
        name,
        transitionSeconds,
        isActive: setActive,
      })
      .returning();

    res.status(201).json(playlist);
  } catch (err) {
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
    if (typeof req.body?.isActive === "boolean") {
      if (req.body.isActive) {
        await db
          .update(tvPlaylists)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(tvPlaylists.channelId, playlist.channelId));
      }
      updates.isActive = req.body.isActive;
    }

    const [updated] = await db
      .update(tvPlaylists)
      .set(updates)
      .where(eq(tvPlaylists.id, playlistId))
      .returning();

    res.json(updated);
  } catch (err) {
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

    await db.delete(tvPlaylistItems).where(eq(tvPlaylistItems.playlistId, playlistId));

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

    const inserted = await db.insert(tvPlaylistItems).values(rows).returning();
    res.json({ ok: true, items: inserted });
  } catch (err) {
    console.error("[tv] failed to update playlist items:", err);
    res.status(500).json({ error: "Failed to update playlist items" });
  }
});

router.patch("/api/tv/playlist-items/:itemId/duration", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const durationSeconds = Math.max(1, Math.min(86400, Math.round(Number(req.body?.durationSeconds))));
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(durationSeconds)) {
      return res.status(400).json({ error: "Invalid params" });
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
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(and(eq(tvChannels.id, channelId), eq(tvChannels.isActive, true)));

    if (!channel) return res.status(404).json({ error: "Channel not found" });

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

    let rows: {
      itemId: number;
      sortOrder: number;
      durationSeconds: number;
      videoId: number;
      title: string | null;
      mimeType: string;
      sourceUri: string;
      thumbnailUri: string | null;
      creatorName: string | null;
      creatorAddress: string | null;
      collectionName: string | null;
      mintedAt: Date | null;
      metadata: unknown;
    }[] = [];

    if (activePlaylist) {
      rows = await db
        .select({
          itemId: tvPlaylistItems.id,
          sortOrder: tvPlaylistItems.sortOrder,
          durationSeconds: tvPlaylistItems.durationSeconds,
          videoId: tvChannelVideos.id,
          title: tvChannelVideos.title,
          mimeType: tvChannelVideos.mimeType,
          sourceUri: tvChannelVideos.sourceUri,
          thumbnailUri: tvChannelVideos.thumbnailUri,
          creatorName: tvChannelVideos.creatorName,
          creatorAddress: tvChannelVideos.creatorAddress,
          collectionName: tvChannelVideos.collectionName,
          mintedAt: tvChannelVideos.mintedAt,
          metadata: tvChannelVideos.metadata,
        })
        .from(tvPlaylistItems)
        .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
        .where(eq(tvPlaylistItems.playlistId, activePlaylist.id))
        .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));
    }

    // Pull the bumper pool once — channel-owner personals plus every
    // community bumper, shuffled with the same window seed as the
    // video queue so the server-authoritative cadence is stable for
    // every viewer in the current 30-minute bucket.  Personal bumpers
    // on OTHER users' channels never leak here (the WHERE clause
    // filters on owner) so an owner who wants their interstitials to
    // appear broadly has to mark them `community` explicitly — same
    // rule the upload form already advertises.
    const bumperRows = await db
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
             OR ${tvBumpers.ownerUserId} = ${channel.ownerUserId})`
      )
      .orderBy(asc(tvBumpers.id));

    const playlistId = activePlaylist?.id ?? 0;
    const shuffleSeed = streamShuffleSeed(channelId, playlistId, nowMs);
    const shuffledRows = seededShuffle(rows, shuffleSeed);
    const shuffledBumpers = seededShuffle(bumperRows, shuffleSeed ^ 0x9e3779b1);

    // If there are no playlist videos we still want to show the
    // channel's bumpers on a short loop so viewers see *something*
    // when a freshly-made channel hasn't had content added yet.
    if (shuffledRows.length === 0) {
      if (shuffledBumpers.length > 0) {
        const bumperQueue = shuffledBumpers.map((b, i) => ({
          queueIndex: i,
          playlistIndex: -1,
          itemId: -b.id,
          videoId: -b.id,
          bumperId: b.id,
          title: b.title || `Bumper ${b.id}`,
          mimeType: b.mimeType,
          thumbnailUri: null as string | null,
          sourceUri: `/api/tv/bumpers/${b.id}/media`,
          cacheUrl: `/api/tv/bumpers/${b.id}/media`,
          durationSeconds: Math.max(1, Math.round(b.durationMs / 1000)),
          offsetSeconds: 0,
          kind: "bumper" as const,
          bumperCategory: b.category,
          creatorName: b.ownerUsername,
          creatorAddress: null,
          collectionName: null,
          mintedAtIso: null,
        }));
        return res.json({
          channel,
          playlist: activePlaylist
            ? { id: activePlaylist.id, name: activePlaylist.name, transitionSeconds: activePlaylist.transitionSeconds }
            : null,
          scheduleLabel,
          generatedAt: new Date(nowMs).toISOString(),
          shuffleSeed,
          loopDurationSeconds: bumperQueue.reduce((s, b) => s + b.durationSeconds, 0),
          queue: bumperQueue,
          current: bumperQueue[0],
          offline: false,
          bumperOnly: true,
          message: "Playing bumpers (no playlist videos yet)",
        });
      }

      return res.json({
        channel,
        playlist: activePlaylist
          ? { id: activePlaylist.id, name: activePlaylist.name, transitionSeconds: activePlaylist.transitionSeconds }
          : null,
        queue: [],
        offline: true,
        message: activePlaylist ? "Playlist has no videos" : "No active playlist configured",
      });
    }

    // Lazily probe any items still carrying the default seed duration so
    // the next stream fetch reports the real length of the artifact.
    for (const row of shuffledRows) {
      if (isDefaultDuration(row.durationSeconds, row.mimeType)) {
        const probeUri = normalizeMediaUri(row.sourceUri) || row.sourceUri;
        probePlaylistItemAsync(row.itemId, probeUri);
      }
    }

    // Server-authoritative bumper interleaving.  Every
    // `videosPerBumper` videos we splice in one bumper drawn from the
    // shuffled pool via a rotating cursor.  `videosPerBumper === 0`
    // disables bumpers for the channel.  Bumper items carry kind
    // "bumper" so the client can render attribution and skip caching
    // them through the IPFS proxy.
    type QueueItem = {
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
      offsetSeconds: number;
      kind: "video" | "gif" | "bumper";
      bumperCategory?: string | null;
      creatorName: string | null;
      creatorAddress: string | null;
      collectionName: string | null;
      mintedAtIso: string | null;
    };
    const queue: QueueItem[] = [];
    const cadence = Math.max(0, Math.min(20, Number(channel.videosPerBumper ?? 4)));
    const bumperEnabled = cadence > 0 && shuffledBumpers.length > 0;
    let bumperCursor = 0;
    let videosSinceBumper = 0;

    shuffledRows.forEach((row, idx) => {
      const sourceUri = normalizeMediaUri(row.sourceUri) || row.sourceUri;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;
      // Warm the cache for a generous lookahead window so a cold boot
      // hits the ground playing.  Index 0 is what the viewer is about
      // to play right now (and the streaming proxy will tee it as it
      // arrives), so we only schedule background prefetch for 1..14.
      // Deduped / idempotent downstream via `inFlightPrefetch`.
      if (idx > 0 && idx < 15) prefetchMediaAsync(sourceUri);
      const mintedAt = row.mintedAt instanceof Date
        ? row.mintedAt
        : (row.mintedAt ? new Date(row.mintedAt as any) : null);
      queue.push({
        queueIndex: queue.length,
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
        creatorName: row.creatorName,
        creatorAddress: row.creatorAddress,
        collectionName: row.collectionName,
        mintedAtIso: mintedAt && !Number.isNaN(mintedAt.getTime())
          ? mintedAt.toISOString()
          : null,
      });
      videosSinceBumper++;

      const atLastItem = idx === shuffledRows.length - 1;
      if (bumperEnabled && (videosSinceBumper >= cadence || atLastItem)) {
        const b = shuffledBumpers[bumperCursor % shuffledBumpers.length]!;
        bumperCursor++;
        videosSinceBumper = 0;
        queue.push({
          queueIndex: queue.length,
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
          offsetSeconds: 0,
          kind: "bumper",
          bumperCategory: b.category,
          creatorName: b.ownerUsername,
          creatorAddress: null,
          collectionName: null,
          mintedAtIso: null,
        });
      }
    });

    // Warm the rest of the playlist in the background so a looping
    // channel reaches steady-state after one pass.
    for (let i = 15; i < shuffledRows.length; i++) {
      const uri = normalizeMediaUri(shuffledRows[i]!.sourceUri) || shuffledRows[i]!.sourceUri;
      prefetchMediaAsync(uri);
    }

    const loopDurationSeconds = queue.reduce((s, q) => s + q.durationSeconds, 0);

    res.json({
      channel,
      playlist: {
        id: activePlaylist.id,
        name: activePlaylist.name,
        transitionSeconds: activePlaylist.transitionSeconds,
      },
      scheduleLabel,
      generatedAt: new Date(nowMs).toISOString(),
      shuffleSeed,
      videosPerBumper: cadence,
      loopDurationSeconds,
      queue,
      current: queue[0],
      offline: false,
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

    await streamMediaThroughCache(req, res, normalized, { allowRange: true });
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

router.post("/api/tv/cache/prefetch", async (req, res) => {
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
      const [channel] = await db
        .select({ ownerUserId: tvChannels.ownerUserId })
        .from(tvChannels)
        .where(eq(tvChannels.id, channelId));
      if (channel) ownerUserId = channel.ownerUserId;
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

export async function refreshWtfPlaylist(): Promise<{ ok: boolean; count: number; message: string }> {
  const [config] = await db.select().from(tvWtfChannelConfig).limit(1);
  if (!config || !config.channelId || !config.enabled) {
    return { ok: false, count: 0, message: "WTF TV channel not configured or disabled" };
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

  const sourceMode = config.sourceMode || "all_users";
  const sourceUserIds = (Array.isArray(config.sourceUserIds) ? config.sourceUserIds : []) as number[];
  const sourceWallets = (Array.isArray(config.sourceWalletAddresses) ? config.sourceWalletAddresses : []) as string[];
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

  await db.delete(tvChannelVideos).where(eq(tvChannelVideos.channelId, config.channelId));

  if (deduped.size === 0) {
    await db.update(tvWtfChannelConfig)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(tvWtfChannelConfig.id, config.id));
    return { ok: true, count: 0, message: "No playable tokens found" };
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

  const insertedVideos = await db.insert(tvChannelVideos).values(videoInserts).returning({ id: tvChannelVideos.id });

  await db.delete(tvPlaylistItems).where(eq(tvPlaylistItems.playlistId, activePlaylist.id));

  const playlistInserts = insertedVideos.map((v, idx) => ({
    playlistId: activePlaylist.id,
    videoId: v.id,
    sortOrder: idx,
    durationSeconds: defaultDuration,
  }));

  await db.insert(tvPlaylistItems).values(playlistInserts);

  await db.update(tvWtfChannelConfig)
    .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
    .where(eq(tvWtfChannelConfig.id, config.id));

  return { ok: true, count: deduped.size, message: `Playlist refreshed with ${deduped.size} tokens` };
}

async function maybeAutoRefreshWtfChannel(channelId: number): Promise<void> {
  const [config] = await db
    .select()
    .from(tvWtfChannelConfig)
    .where(eq(tvWtfChannelConfig.channelId, channelId))
    .limit(1);

  if (!config || !config.enabled) return;

  const intervalMs = (config.refreshIntervalMinutes || 30) * 60 * 1000;
  const lastRefresh = config.lastRefreshedAt ? new Date(config.lastRefreshedAt).getTime() : 0;
  if (Date.now() - lastRefresh < intervalMs) return;

  try {
    await refreshWtfPlaylist();
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
      .where(and(eq(tvChannels.id, channelId), eq(tvChannels.isActive, true)));

    if (!channel) return res.status(404).json({ error: "Channel not found or inactive" });

    const scheduleEntries = await db
      .select({
        id: tvScheduleEntries.id,
        mediaItemId: tvScheduleEntries.mediaItemId,
        startsAt: tvScheduleEntries.startsAt,
        endsAt: tvScheduleEntries.endsAt,
        sortOrder: tvScheduleEntries.sortOrder,
        mediaTitle: userMediaLibrary.title,
        mediaSourceUrl: userMediaLibrary.sourceUrl,
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
      const sourceUrl = normalizeMediaUri(currentScheduled.mediaSourceUrl) || currentScheduled.mediaSourceUrl;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUrl)}`;
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
        title: tvChannelVideos.title,
        mimeType: tvChannelVideos.mimeType,
        sourceUri: tvChannelVideos.sourceUri,
        thumbnailUri: tvChannelVideos.thumbnailUri,
      })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
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

    const durations = playlistRows.map((r) => Math.max(1, Number(r.durationSeconds || 1)));

    // Client-driven playback: start of playlist, no offset.  See the
    // /stream handler above for the rationale.
    const queueSize = Math.min(3, playlistRows.length);
    const queue = Array.from({ length: queueSize }).map((_, idx) => {
      const row = playlistRows[idx]!;
      const sourceUri = normalizeMediaUri(row.sourceUri) || row.sourceUri;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;
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
        durationSeconds: durations[idx]!,
        offsetSeconds: 0,
        kind: row.mimeType === "image/gif" ? "gif" : "video",
      };
    });

    res.json({
      channel,
      mode: "playlist",
      current: queue[0],
      queue,
      playlist: {
        id: activePlaylist.id,
        name: activePlaylist.name,
        transitionSeconds: activePlaylist.transitionSeconds,
        totalItems: playlistRows.length,
      },
      loopDurationSeconds: durations.reduce((s, d) => s + d, 0),
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
      .select({ id: tvChannels.id, isActive: tvChannels.isActive })
      .from(tvChannels)
      .where(eq(tvChannels.id, channelId));

    if (!channel || !channel.isActive) {
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
      .where(and(eq(tvChannels.slug, slug), eq(tvChannels.isActive, true)));

    if (!channel) return res.status(404).json({ error: "Channel not found" });

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
      const sourceUrl = normalizeMediaUri(currentEntry.mediaSourceUrl) || currentEntry.mediaSourceUrl;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUrl)}`;
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
        title: tvChannelVideos.title,
        mimeType: tvChannelVideos.mimeType,
        sourceUri: tvChannelVideos.sourceUri,
        thumbnailUri: tvChannelVideos.thumbnailUri,
      })
      .from(tvPlaylistItems)
      .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
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

    const durations = playlistRows.map((r) => Math.max(1, Number(r.durationSeconds || 1)));
    const row = playlistRows[0]!;
    const sourceUri = normalizeMediaUri(row.sourceUri) || row.sourceUri;
    const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;

    res.json({
      channel,
      mode: "playlist",
      current: {
        videoId: row.videoId,
        title: row.title || `Video ${row.videoId}`,
        mimeType: row.mimeType,
        sourceUrl: sourceUri,
        cacheUrl,
        offsetSeconds: 0,
        durationSeconds: durations[0],
        kind: row.mimeType === "image/gif" ? "gif" : "video",
      },
      upcoming,
      offline: false,
    });
  } catch (err) {
    console.error("[tv] failed to resolve slug current:", err);
    res.status(500).json({ error: "Failed to resolve channel" });
  }
});

export default router;
