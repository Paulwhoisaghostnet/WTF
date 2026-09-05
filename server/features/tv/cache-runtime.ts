import { promises as fsPromises, createReadStream, createWriteStream } from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { and, asc, eq } from "drizzle-orm";
import { tvChannels, tvChannelVideos, tvPlaylistItems, tvPlaylists } from "@shared/schema";
import { db } from "../../db";
import { guessMimeTypeFromUri } from "../../lib/media-utils";
import { probeMediaDuration } from "../../lib/media-probe";
import { promoteTvCacheEntryFromObjectStorage } from "../../lib/storage/tv-cache-object-store";
import {
  cacheFileBase,
  cacheMediaPath,
  cacheMetaPath,
  isImmutableSource,
  logCacheEvent,
  shortHashForLog,
  transcodeMediaPath,
  TV_CACHE_MAX_AGE_MS,
  TV_CACHE_MAX_REMOTE_BYTES,
  type CacheMeta,
} from "./cache-files";
import {
  cleanupTvCache,
  enforceCacheBudget,
  ensureCacheDir,
  queueTvCacheMirror,
  readCacheMeta,
  touchCache,
  writeCacheMeta,
} from "./cache-storage";
import {
  fetchMediaWithFallback,
  isAllowedMediaCacheContentType,
  isSameOriginMediaPath,
  normalizeMediaUri,
} from "./media-urls";

export async function ensureMediaCached(
  url: string,
  opts: { allowImages?: boolean; allowArtifacts?: boolean } = {}
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
  const allowArtifacts = opts.allowArtifacts === true;

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
      if (!isAllowedMediaCacheContentType(effectiveContentType, { allowImages, allowArtifacts })) {
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
    if (!isAllowedMediaCacheContentType(promotedContentType, { allowImages, allowArtifacts })) {
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
  if (!isAllowedMediaCacheContentType(contentType, { allowImages, allowArtifacts })) {
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
export async function streamMediaThroughCache(
  req: any,
  res: any,
  url: string,
  opts: { allowRange?: boolean; allowImages?: boolean; allowArtifacts?: boolean } = {}
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
  const allowArtifacts = opts.allowArtifacts === true;

  res.setHeader("X-Content-Type-Options", "nosniff");

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
      if (!isAllowedMediaCacheContentType(serveContentType, { allowImages, allowArtifacts })) {
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
    if (!isAllowedMediaCacheContentType(serveContentType, { allowImages, allowArtifacts })) {
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
  if (!isAllowedMediaCacheContentType(upstreamContentType, { allowImages, allowArtifacts })) {
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

export const DEFAULT_VIDEO_DURATION_SEC = 120;
export const DEFAULT_GIF_DURATION_SEC = 8;
export const MAX_STORED_DURATION_SEC = 60 * 60; // 1h ceiling

export function isDefaultDuration(value: number, mimeType: string): boolean {
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
export function probePlaylistItemAsync(itemId: number, sourceUri: string): void {
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
export function prefetchMediaAsync(sourceUri: string): void {
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
export function warmChannelAsync(channelId: number): void {
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
