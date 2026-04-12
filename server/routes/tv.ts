import { Router } from "express";
import { createHash } from "crypto";
import path from "path";
import { promises as fsPromises, createReadStream, createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
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

async function isStaffRole(role: UserRole): Promise<boolean> {
  return hasPermission(role, "manage_channels");
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
    return `https://ipfs.io/ipfs/${trimmed.replace("ipfs://", "")}`;
  }
  return trimmed;
}

function normalizeMediaUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  return normalizePublicHttpUrl(normalized, TV_CACHE_ALLOWED_HOSTS);
}

async function fetchWithRedirectGuard(
  startUrl: string,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(currentUrl, { redirect: "manual" });
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

  const response = await fetchWithRedirectGuard(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch media: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > TV_CACHE_MAX_REMOTE_BYTES) {
    throw new Error("Remote media exceeds cache file size limit");
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessMimeTypeFromUri(url);

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
    }

    const rows = await db
      .select({
        id: tvChannels.id,
        ownerUserId: tvChannels.ownerUserId,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
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

    const [channel] = await db
      .insert(tvChannels)
      .values({
        ownerUserId: user.id,
        title,
        description: description || null,
        slug: generatedSlug,
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

    const deduped = new Map<string, any>();
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
        return {
          id: row.id,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.tokenName || `#${row.tokenId}`,
          tokenThumbnail: row.tokenThumbnail || asset.thumbnailUri,
          walletAddress: row.walletAddress,
          mimeType: asset.mimeType,
          sourceUri: asset.sourceUri,
          title: asset.title,
          metadata: row.metadata,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => {
        if (!q) return true;
        return (
          row.tokenName.toLowerCase().includes(q) ||
          row.tokenContract.toLowerCase().includes(q) ||
          row.tokenId.toLowerCase().includes(q) ||
          row.mimeType.toLowerCase().includes(q)
        );
      })
      .slice(0, limit);

    res.json({ items: playable });
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
        isActive: tvChannels.isActive,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(tvChannels)
      .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
      .where(and(eq(tvChannels.id, channelId), eq(tvChannels.isActive, true)));

    if (!channel) return res.status(404).json({ error: "Channel not found" });

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

export default router;
