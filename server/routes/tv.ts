import { Router } from "express";
import { createHash } from "crypto";
import path from "path";
import { promises as fsPromises, createReadStream, createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import multer from "multer";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { UserRole } from "@shared/types";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { hasPermission } from "../lib/permissions";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylists,
  tvPlaylistItems,
  tvBumpers,
  tvWtfChannelConfig,
  tvMediaItems,
  tvScheduleEntries,
  userOwnedTokens,
  users,
} from "@shared/schema";
import { normalizePublicHttpUrl, parseHostAllowlist } from "../lib/network-safety";

const router = Router();

const TV_MAX_STAFF_CHANNELS = 3;
const TV_MAX_USER_CHANNELS = 1;
const IS_SERVERLESS_RUNTIME = Boolean(
  process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL
);
const TV_CACHE_DIR =
  process.env.TV_CACHE_DIR?.trim() ||
  (IS_SERVERLESS_RUNTIME
    ? path.join("/tmp", "wtf-tv-cache")
    : path.resolve(process.cwd(), ".cache", "wtf-tv"));
const TV_CACHE_MAX_AGE_MS =
  Math.max(1, Number(process.env.TV_CACHE_MAX_AGE_DAYS || 7)) *
  24 *
  60 *
  60 *
  1000;
const TV_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TV_CACHE_MAX_REMOTE_BYTES = Math.max(
  20 * 1024 * 1024,
  Number(process.env.TV_CACHE_MAX_REMOTE_BYTES || 350 * 1024 * 1024)
);
const TV_CACHE_ALLOWED_HOSTS = parseHostAllowlist(process.env.TV_CACHE_ALLOWED_HOSTS);
const TV_MEDIA_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TV_MEDIA_FETCH_TIMEOUT_MS || 15000)
);
const DEFAULT_IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

const BUMPER_MAX_PER_USER = 20;
const BUMPER_MAX_FILE_BYTES = 2 * 1024 * 1024;
const BUMPER_MAX_DURATION_MS = 5000;
const BUMPER_ALLOWED_MIME = new Set(["video/mp4", "video/webm", "image/gif"]);

const bumperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BUMPER_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, BUMPER_ALLOWED_MIME.has(file.mimetype));
  },
});

let lastCleanupAt = 0;

type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

type PlayableAsset = {
  sourceUri: string;
  mimeType: string;
  title: string | null;
  thumbnailUri: string | null;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRedirectGuard(
  startUrl: string,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetchWithTimeout(currentUrl, { redirect: "manual" });
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
  sourceUrl: string
): Promise<{ response: Response; resolvedUrl: string }> {
  const candidates = buildMediaFetchCandidates(sourceUrl);
  if (candidates.length === 0) {
    throw new Error("Unsupported media URL");
  }

  let lastError: unknown = null;
  let lastResponse: Response | null = null;
  let lastResolvedUrl = candidates[0]!;

  for (const candidateUrl of candidates) {
    try {
      const response = await fetchWithRedirectGuard(candidateUrl);
      if (response.ok && response.body) {
        return { response, resolvedUrl: candidateUrl };
      }
      lastResponse = response;
      lastResolvedUrl = candidateUrl;
    } catch (err) {
      lastError = err;
      lastResolvedUrl = candidateUrl;
    }
  }

  if (lastResponse) {
    return { response: lastResponse, resolvedUrl: lastResolvedUrl };
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

function isPlayableMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  if (!value) return false;
  return value.startsWith("video/") || value === "image/gif";
}

function guessMimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m3u8")) return "application/x-mpegURL";
  return "application/octet-stream";
}

function parseFormatsFromMetadata(metadata: any): Array<{
  uri: string;
  mimeType: string;
}> {
  if (!metadata || typeof metadata !== "object") return [];
  const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
  const parsed: Array<{ uri: string; mimeType: string }> = [];
  for (const row of formats) {
    const uri = String(row?.uri || "").trim();
    const mimeType = String(row?.mimeType || row?.mime_type || "").trim();
    if (!uri || !mimeType) continue;
    parsed.push({ uri, mimeType });
  }
  return parsed;
}

function extractPlayableAssetFromTokenMetadata(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): PlayableAsset | null {
  const meta = metadata || {};
  const formats = parseFormatsFromMetadata(meta);

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

  const artifactUri = String(meta?.artifactUri || "").trim();
  if (artifactUri) {
    const normalized = normalizeMediaUri(artifactUri);
    if (normalized) {
      const mimeType = String(meta?.mimeType || guessMimeTypeFromUri(normalized)).toLowerCase();
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

async function cleanupTvCache() {
  const now = Date.now();
  if (now - lastCleanupAt < TV_CACHE_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  await ensureCacheDir();
  const entries = await fsPromises.readdir(TV_CACHE_DIR, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = path.join(TV_CACHE_DIR, entry.name);
      try {
        const stat = await fsPromises.stat(filePath);
        if (now - stat.mtimeMs > TV_CACHE_MAX_AGE_MS) {
          await fsPromises.unlink(filePath).catch(() => undefined);
        }
      } catch {
        return;
      }
    })
  );
}

function cacheFileBase(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function cacheMediaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.bin`);
}

function cacheMetaPath(base: string): string {
  return path.join(TV_CACHE_DIR, `${base}.json`);
}

async function readCacheMeta(base: string): Promise<{ contentType?: string } | null> {
  try {
    const raw = await fsPromises.readFile(cacheMetaPath(base), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCacheMeta(base: string, contentType: string) {
  const payload = JSON.stringify({
    contentType,
    updatedAt: new Date().toISOString(),
  });
  await fsPromises.writeFile(cacheMetaPath(base), payload, "utf8");
}

async function ensureMediaCached(url: string): Promise<{
  mediaPath: string;
  contentType: string;
}> {
  await ensureCacheDir();
  await cleanupTvCache();

  const base = cacheFileBase(url);
  const mediaPath = cacheMediaPath(base);
  const tempPath = `${mediaPath}.tmp`;
  const meta = await readCacheMeta(base);

  try {
    const stat = await fsPromises.stat(mediaPath);
    if (Date.now() - stat.mtimeMs <= TV_CACHE_MAX_AGE_MS) {
      return {
        mediaPath,
        contentType: meta?.contentType || guessMimeTypeFromUri(url),
      };
    }
  } catch {
    // cache miss
  }

  const { response, resolvedUrl } = await fetchMediaWithFallback(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch media: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > TV_CACHE_MAX_REMOTE_BYTES) {
    throw new Error("Remote media exceeds cache file size limit");
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessMimeTypeFromUri(resolvedUrl);

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
  await writeCacheMeta(base, contentType);

  return { mediaPath, contentType };
}

function computePlaylistCursor(
  durations: number[],
  nowMs: number
): { currentIndex: number; offsetSeconds: number; loopDurationSeconds: number } {
  if (durations.length === 0) {
    return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds: 0 };
  }
  const normalized = durations.map((d) => Math.max(1, Math.floor(d)));
  const loopDurationSeconds = normalized.reduce((sum, v) => sum + v, 0);
  if (loopDurationSeconds <= 0) {
    return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds: 0 };
  }

  const now = new Date(nowMs);
  const startUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const secondsOfDay = Math.floor((nowMs - startUtc) / 1000);
  const loopOffset = ((secondsOfDay % loopDurationSeconds) + loopDurationSeconds) % loopDurationSeconds;

  let cursor = 0;
  for (let i = 0; i < normalized.length; i++) {
    const duration = normalized[i]!;
    if (loopOffset < cursor + duration) {
      return {
        currentIndex: i,
        offsetSeconds: loopOffset - cursor,
        loopDurationSeconds,
      };
    }
    cursor += duration;
  }

  return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds };
}

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
        createdAt: tvChannels.createdAt,
        updatedAt: tvChannels.updatedAt,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(and(...whereParts))
      .orderBy(asc(tvChannels.title));

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
    const limit = Math.max(1, Math.min(Number(req.query.limit || 120), 300));
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
        id: userOwnedTokens.id,
        tokenContract: userOwnedTokens.tokenContract,
        tokenId: userOwnedTokens.tokenId,
        tokenName: userOwnedTokens.tokenName,
        tokenThumbnail: userOwnedTokens.tokenThumbnail,
        metadata: userOwnedTokens.metadata,
        walletAddress: userOwnedTokens.walletAddress,
        lastSeenAt: userOwnedTokens.lastSeenAt,
      })
      .from(userOwnedTokens)
      .where(
        and(
          eq(userOwnedTokens.userId, user.id),
          sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`
        )
      )
      .orderBy(desc(userOwnedTokens.lastSeenAt))
      .limit(800);

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
          mimeType: asset.mimeType,
          sourceUri: asset.sourceUri,
          title: asset.title,
          metadata: row.metadata,
          lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const filtered = playable.filter((row) => {
      if (!q) return true;
      return (
        row.tokenName.toLowerCase().includes(q) ||
        row.tokenContract.toLowerCase().includes(q) ||
        row.tokenId.toLowerCase().includes(q) ||
        row.mimeType.toLowerCase().includes(q)
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

    let sourceUri = "";
    let mimeType = "";
    let title = "";
    let thumbnailUri = "";
    let metadata: any = null;

    if (tokenContract && tokenId) {
      const [owned] = await db
        .select({
          tokenContract: userOwnedTokens.tokenContract,
          tokenId: userOwnedTokens.tokenId,
          tokenName: userOwnedTokens.tokenName,
          tokenThumbnail: userOwnedTokens.tokenThumbnail,
          metadata: userOwnedTokens.metadata,
        })
        .from(userOwnedTokens)
        .where(
          and(
            eq(userOwnedTokens.userId, user.id),
            eq(userOwnedTokens.tokenContract, tokenContract),
            eq(userOwnedTokens.tokenId, tokenId),
            sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`
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

    const [existing] = await db
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, channelId),
          eq(tvChannelVideos.tokenContract, tokenContract || "manual"),
          eq(tvChannelVideos.tokenId, tokenId || createHash("md5").update(sourceUri).digest("hex"))
        )
      );

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
          updatedAt: new Date(),
        })
        .where(eq(tvChannelVideos.id, existing.id))
        .returning();
    } else {
      [videoRow] = await db
        .insert(tvChannelVideos)
        .values({
          channelId,
          tokenContract: tokenContract || "manual",
          tokenId: tokenId || createHash("md5").update(sourceUri).digest("hex"),
          sourceUri,
          mimeType,
          title,
          thumbnailUri: thumbnailUri || null,
          metadata,
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

      await db
        .insert(tvPlaylistItems)
        .values({
          playlistId: activePlaylist.id,
          videoId: videoRow.id,
          sortOrder: nextOrder,
          durationSeconds: mimeType === "image/gif" ? 8 : 30,
        })
        .onConflictDoNothing();
    }

    res.status(201).json(videoRow);
  } catch (err) {
    console.error("[tv] failed to add channel video:", err);
    res.status(500).json({ error: "Failed to add video to channel" });
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
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(and(eq(tvChannels.id, channelId), eq(tvChannels.isActive, true)));

    if (!channel) return res.status(404).json({ error: "Channel not found" });

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
        playlist: null,
        queue: [],
        offline: true,
        message: "No active playlist configured",
      });
    }

    const rows = await db
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

    if (rows.length === 0) {
      return res.json({
        channel,
        playlist: activePlaylist,
        queue: [],
        offline: true,
        message: "Playlist has no videos",
      });
    }

    const durations = rows.map((row) => Math.max(1, Number(row.durationSeconds || 1)));
    const cursor = computePlaylistCursor(durations, nowMs);

    const queue = Array.from({ length: Math.min(3, rows.length) }).map((_, offset) => {
      const idx = (cursor.currentIndex + offset) % rows.length;
      const row = rows[idx]!;
      const sourceUri = normalizeMediaUri(row.sourceUri) || row.sourceUri;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;
      return {
        queueIndex: offset,
        playlistIndex: idx,
        itemId: row.itemId,
        videoId: row.videoId,
        title: row.title || `Video ${row.videoId}`,
        mimeType: row.mimeType,
        thumbnailUri: row.thumbnailUri,
        sourceUri,
        cacheUrl,
        durationSeconds: Math.max(1, Number(row.durationSeconds || 1)),
        offsetSeconds: offset === 0 ? cursor.offsetSeconds : 0,
        kind: row.mimeType === "image/gif" ? "gif" : "video",
      };
    });

    res.json({
      channel,
      playlist: {
        id: activePlaylist.id,
        name: activePlaylist.name,
        transitionSeconds: activePlaylist.transitionSeconds,
      },
      generatedAt: new Date(nowMs).toISOString(),
      loopDurationSeconds: cursor.loopDurationSeconds,
      queue,
      current: queue[0],
      offline: false,
    });
  } catch (err) {
    console.error("[tv] failed to build stream queue:", err);
    res.status(500).json({ error: "Failed to build stream queue" });
  }
});

router.get("/api/tv/cache/media", async (req, res) => {
  try {
    const input = String(req.query.url || "").trim();
    if (!input) return res.status(400).json({ error: "url is required" });

    const normalized = normalizeMediaUri(input);
    if (!normalized) return res.status(400).json({ error: "Unsupported media URL" });

    const { mediaPath, contentType } = await ensureMediaCached(normalized);
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const stream = createReadStream(mediaPath);
    stream.on("error", (err) => {
      console.error("[tv] cache stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read cached media" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error("[tv] failed to proxy/cache media:", err);
    res.status(502).json({ error: "Failed to fetch media from source" });
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
        createdAt: tvBumpers.createdAt,
      })
      .from(tvBumpers)
      .where(eq(tvBumpers.ownerUserId, user.id))
      .orderBy(desc(tvBumpers.createdAt));
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
          error: `File is required. Accepted: ${[...BUMPER_ALLOWED_MIME].join(", ")}. Max size: ${Math.floor(BUMPER_MAX_FILE_BYTES / 1024)}KB.`,
        });
      }

      if (!BUMPER_ALLOWED_MIME.has(file.mimetype)) {
        return res.status(400).json({ error: "Only mp4, webm, and gif files are allowed" });
      }

      const durationMs = Math.max(0, Math.floor(Number(req.body?.durationMs || 0)));
      if (durationMs <= 0 || durationMs > BUMPER_MAX_DURATION_MS) {
        return res.status(400).json({
          error: `Duration must be between 1ms and ${BUMPER_MAX_DURATION_MS}ms (${BUMPER_MAX_DURATION_MS / 1000}s)`,
        });
      }

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvBumpers)
        .where(eq(tvBumpers.ownerUserId, user.id));
      if (Number(countRow?.count || 0) >= BUMPER_MAX_PER_USER) {
        return res.status(400).json({
          error: `You can have at most ${BUMPER_MAX_PER_USER} bumpers. Delete one first.`,
        });
      }

      const title = String(req.body?.title || "").trim() || `Bumper ${Date.now().toString(36)}`;
      const data = file.buffer.toString("base64");

      const [row] = await db
        .insert(tvBumpers)
        .values({
          ownerUserId: user.id,
          title: title.slice(0, 100),
          mimeType: file.mimetype,
          fileSize: file.size,
          durationMs,
          data,
        })
        .returning({
          id: tvBumpers.id,
          title: tvBumpers.title,
          mimeType: tvBumpers.mimeType,
          fileSize: tvBumpers.fileSize,
          durationMs: tvBumpers.durationMs,
          createdAt: tvBumpers.createdAt,
        });

      res.status(201).json(row);
    } catch (err) {
      console.error("[tv] failed to upload bumper:", err);
      res.status(500).json({ error: "Failed to upload bumper" });
    }
  }
);

router.get("/api/tv/bumpers/pool", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: tvBumpers.id,
        mimeType: tvBumpers.mimeType,
        durationMs: tvBumpers.durationMs,
        ownerUsername: users.username,
      })
      .from(tvBumpers)
      .innerJoin(users, eq(tvBumpers.ownerUserId, users.id))
      .orderBy(sql`RANDOM()`)
      .limit(50);

    res.setHeader("Cache-Control", "public, max-age=120");
    res.json(
      rows.map((r) => ({
        id: r.id,
        mimeType: r.mimeType,
        durationMs: r.durationMs,
        mediaUrl: `/api/tv/bumpers/${r.id}/media`,
        credit: r.ownerUsername,
      }))
    );
  } catch (err) {
    console.error("[tv] failed to fetch bumper pool:", err);
    res.status(500).json({ error: "Failed to fetch bumper pool" });
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
      .select({ id: tvBumpers.id, ownerUserId: tvBumpers.ownerUserId })
      .from(tvBumpers)
      .where(eq(tvBumpers.id, bumperId));

    if (!bumper) return res.status(404).json({ error: "Bumper not found" });

    const isOwner = bumper.ownerUserId === user.id;
    const isStaff = await isStaffRole(user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "Not authorized" });
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

    const buffer = decodeStoredBumperData(bumper.data);
    if (buffer.length === 0) {
      return res.status(500).json({ error: "Bumper data is empty or invalid" });
    }
    res.setHeader("Content-Type", bumper.mimeType);
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

  const conditions = [sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`];
  if (sourceMode === "selected_users" && sourceUserIds.length > 0) {
    conditions.push(inArray(userOwnedTokens.userId, sourceUserIds));
  } else if (sourceMode === "specific_wallets" && sourceWallets.length > 0) {
    conditions.push(inArray(userOwnedTokens.walletAddress, sourceWallets));
  }

  const tokenRows = await db
    .select({
      id: userOwnedTokens.id,
      userId: userOwnedTokens.userId,
      walletAddress: userOwnedTokens.walletAddress,
      tokenContract: userOwnedTokens.tokenContract,
      tokenId: userOwnedTokens.tokenId,
      tokenName: userOwnedTokens.tokenName,
      tokenThumbnail: userOwnedTokens.tokenThumbnail,
      metadata: userOwnedTokens.metadata,
    })
    .from(userOwnedTokens)
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
    return {
      channelId: config.channelId!,
      tokenContract: row.tokenContract,
      tokenId: row.tokenId,
      sourceUri: asset.sourceUri,
      mimeType: asset.mimeType,
      title: asset.title || row.tokenName || `#${row.tokenId}`,
      thumbnailUri: asset.thumbnailUri,
      metadata: row.metadata,
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

// ─── Media Items (user-level library) ───────────────────

router.get("/api/tv/me/media", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const rows = await db
      .select()
      .from(tvMediaItems)
      .where(eq(tvMediaItems.ownerUserId, user.id))
      .orderBy(desc(tvMediaItems.updatedAt));
    res.json(rows);
  } catch (err) {
    console.error("[tv] failed to list media items:", err);
    res.status(500).json({ error: "Failed to load media items" });
  }
});

router.post("/api/tv/media", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Title is required" });

    const sourceUrl = String(req.body?.sourceUrl || "").trim();
    if (!sourceUrl) return res.status(400).json({ error: "sourceUrl is required" });

    const sourceType = String(req.body?.sourceType || "ipfs").trim();
    if (!["ipfs", "upload", "external"].includes(sourceType)) {
      return res.status(400).json({ error: "Invalid sourceType" });
    }

    const mimeType = String(req.body?.mimeType || "video/mp4").trim();
    const description = String(req.body?.description || "").trim() || null;
    const posterUrl = String(req.body?.posterUrl || "").trim() || null;
    const playbackUrl = String(req.body?.playbackUrl || "").trim() || null;
    const durationSeconds = req.body?.durationSeconds != null
      ? Math.max(0, Math.floor(Number(req.body.durationSeconds)))
      : null;

    const [item] = await db
      .insert(tvMediaItems)
      .values({
        ownerUserId: user.id,
        title,
        description,
        sourceType: sourceType as "ipfs" | "upload" | "external",
        sourceUrl,
        playbackUrl,
        posterUrl,
        mimeType,
        durationSeconds,
        status: "ready",
        metadata: req.body?.metadata || null,
      })
      .returning();

    res.status(201).json(item);
  } catch (err) {
    console.error("[tv] failed to create media item:", err);
    res.status(500).json({ error: "Failed to create media item" });
  }
});

router.put("/api/tv/media/:mediaId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const mediaId = Number(req.params.mediaId);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).json({ error: "Invalid media id" });
    }

    const [existing] = await db
      .select({ id: tvMediaItems.id, ownerUserId: tvMediaItems.ownerUserId })
      .from(tvMediaItems)
      .where(eq(tvMediaItems.id, mediaId));

    if (!existing) return res.status(404).json({ error: "Media item not found" });
    if (existing.ownerUserId !== user.id && !(await isStaffRole(user.role))) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof req.body?.title === "string") {
      const t = req.body.title.trim();
      if (!t) return res.status(400).json({ error: "Title cannot be empty" });
      updates.title = t;
    }
    if (typeof req.body?.description === "string") updates.description = req.body.description.trim() || null;
    if (typeof req.body?.posterUrl === "string") updates.posterUrl = req.body.posterUrl.trim() || null;
    if (typeof req.body?.playbackUrl === "string") updates.playbackUrl = req.body.playbackUrl.trim() || null;
    if (typeof req.body?.status === "string" && ["draft", "processing", "ready", "blocked"].includes(req.body.status)) {
      updates.status = req.body.status;
    }
    if (req.body?.durationSeconds != null) {
      updates.durationSeconds = Math.max(0, Math.floor(Number(req.body.durationSeconds)));
    }

    const [updated] = await db
      .update(tvMediaItems)
      .set(updates)
      .where(eq(tvMediaItems.id, mediaId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[tv] failed to update media item:", err);
    res.status(500).json({ error: "Failed to update media item" });
  }
});

router.delete("/api/tv/media/:mediaId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const mediaId = Number(req.params.mediaId);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).json({ error: "Invalid media id" });
    }

    const [existing] = await db
      .select({ id: tvMediaItems.id, ownerUserId: tvMediaItems.ownerUserId })
      .from(tvMediaItems)
      .where(eq(tvMediaItems.id, mediaId));

    if (!existing) return res.status(404).json({ error: "Media item not found" });
    if (existing.ownerUserId !== user.id && !(await isStaffRole(user.role))) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await db.delete(tvMediaItems).where(eq(tvMediaItems.id, mediaId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[tv] failed to delete media item:", err);
    res.status(500).json({ error: "Failed to delete media item" });
  }
});

// ─── Schedule Entries (time-slot per channel) ───────────

router.get("/api/tv/channels/:channelId/schedule", async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Invalid channel id" });
    }

    const [channel] = await db
      .select({ id: tvChannels.id, isActive: tvChannels.isActive, isPublic: tvChannels.isPublic })
      .from(tvChannels)
      .where(eq(tvChannels.id, channelId));

    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const rows = await db
      .select({
        id: tvScheduleEntries.id,
        channelId: tvScheduleEntries.channelId,
        mediaItemId: tvScheduleEntries.mediaItemId,
        startsAt: tvScheduleEntries.startsAt,
        endsAt: tvScheduleEntries.endsAt,
        sortOrder: tvScheduleEntries.sortOrder,
        createdAt: tvScheduleEntries.createdAt,
        mediaTitle: tvMediaItems.title,
        mediaSourceUrl: tvMediaItems.sourceUrl,
        mediaMimeType: tvMediaItems.mimeType,
        mediaPosterUrl: tvMediaItems.posterUrl,
        mediaDuration: tvMediaItems.durationSeconds,
        mediaStatus: tvMediaItems.status,
      })
      .from(tvScheduleEntries)
      .innerJoin(tvMediaItems, eq(tvScheduleEntries.mediaItemId, tvMediaItems.id))
      .where(eq(tvScheduleEntries.channelId, channelId))
      .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder));

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

    const mediaItemId = Number(req.body?.mediaItemId);
    if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
      return res.status(400).json({ error: "mediaItemId is required" });
    }

    const [media] = await db
      .select({ id: tvMediaItems.id, status: tvMediaItems.status })
      .from(tvMediaItems)
      .where(eq(tvMediaItems.id, mediaItemId));
    if (!media) return res.status(404).json({ error: "Media item not found" });

    const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
    if (!startsAt || !endsAt || isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "startsAt and endsAt are required (ISO timestamps)" });
    }
    if (endsAt <= startsAt) {
      return res.status(400).json({ error: "endsAt must be after startsAt" });
    }

    const sortOrder = req.body?.sortOrder != null ? Math.floor(Number(req.body.sortOrder)) : 0;

    const [entry] = await db
      .insert(tvScheduleEntries)
      .values({
        channelId,
        mediaItemId,
        startsAt,
        endsAt,
        sortOrder,
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
        mediaTitle: tvMediaItems.title,
        mediaSourceUrl: tvMediaItems.sourceUrl,
        mediaMimeType: tvMediaItems.mimeType,
        mediaPosterUrl: tvMediaItems.posterUrl,
        mediaDuration: tvMediaItems.durationSeconds,
        mediaSourceType: tvMediaItems.sourceType,
      })
      .from(tvScheduleEntries)
      .innerJoin(tvMediaItems, eq(tvScheduleEntries.mediaItemId, tvMediaItems.id))
      .where(
        and(
          eq(tvScheduleEntries.channelId, channel.id),
          sql`${tvScheduleEntries.endsAt} > NOW()`,
          eq(tvMediaItems.status, "ready")
        )
      )
      .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder))
      .limit(10);

    const now = new Date(nowMs);
    const currentEntry = scheduleEntries.find(
      (e) => new Date(e.startsAt) <= now && new Date(e.endsAt) > now
    );
    const upcoming = scheduleEntries.filter(
      (e) => new Date(e.startsAt) > now
    ).slice(0, 5);

    if (currentEntry) {
      const sourceUrl = normalizeMediaUri(currentEntry.mediaSourceUrl) || currentEntry.mediaSourceUrl;
      const cacheUrl = `/api/tv/cache/media?url=${encodeURIComponent(sourceUrl)}`;
      const elapsedSec = Math.floor((nowMs - new Date(currentEntry.startsAt).getTime()) / 1000);

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
    const cursor = computePlaylistCursor(durations, nowMs);
    const row = playlistRows[cursor.currentIndex]!;
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
        offsetSeconds: cursor.offsetSeconds,
        durationSeconds: durations[cursor.currentIndex],
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
