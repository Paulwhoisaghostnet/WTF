import { promises as fs } from "node:fs";
import {
  downloadObjectToFile,
  getObjectStorageConfig,
  putObjectBuffer,
  putObjectFromFile,
} from "./object-storage";

export type TvCacheMirrorMeta = {
  contentType?: string;
  updatedAt?: string;
  immutable?: boolean;
  sourceUri?: string;
  sizeBytes?: number;
  objectStorageBucket?: string;
  objectStorageKey?: string;
  objectStorageMetaKey?: string;
  mirroredAt?: string;
};

const TV_CACHE_OBJECT_PREFIX = (
  process.env.TV_CACHE_OBJECT_PREFIX?.trim() || "tv-cache/v1"
).replace(/^\/+|\/+$/g, "");

function baseObjectPrefix(base: string): string {
  return `${TV_CACHE_OBJECT_PREFIX}/${base}`;
}

export function tvCacheMediaObjectKey(base: string): string {
  return `${baseObjectPrefix(base)}.bin`;
}

export function tvCacheMetaObjectKey(base: string): string {
  return `${baseObjectPrefix(base)}.json`;
}

export function isTvCacheObjectStorageConfigured(): boolean {
  return Boolean(getObjectStorageConfig());
}

export async function mirrorTvCacheEntryToObjectStorage(input: {
  base: string;
  mediaPath: string;
  metaPath: string;
  meta: TvCacheMirrorMeta;
}): Promise<TvCacheMirrorMeta | null> {
  const config = getObjectStorageConfig();
  if (!config) return null;

  const stat = await fs.stat(input.mediaPath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`TV cache media file missing or empty: ${input.mediaPath}`);
  }

  const nowIso = new Date().toISOString();
  const mirroredMeta: TvCacheMirrorMeta = {
    ...input.meta,
    sizeBytes: stat.size,
    updatedAt: input.meta.updatedAt || nowIso,
    objectStorageBucket: config.bucket,
    objectStorageKey: tvCacheMediaObjectKey(input.base),
    objectStorageMetaKey: tvCacheMetaObjectKey(input.base),
    mirroredAt: nowIso,
  };
  const payload = JSON.stringify(mirroredMeta);

  await putObjectFromFile({
    key: mirroredMeta.objectStorageKey!,
    filePath: input.mediaPath,
    contentType: mirroredMeta.contentType || "application/octet-stream",
    contentLength: stat.size,
    metadata: {
      sourceUri: String(mirroredMeta.sourceUri || "").slice(0, 1000),
      base: input.base,
    },
  });
  await putObjectBuffer({
    key: mirroredMeta.objectStorageMetaKey!,
    body: payload,
    contentType: "application/json; charset=utf-8",
    metadata: {
      sourceUri: String(mirroredMeta.sourceUri || "").slice(0, 1000),
      base: input.base,
    },
  });
  await fs.writeFile(input.metaPath, payload, "utf8");
  return mirroredMeta;
}

export async function promoteTvCacheEntryFromObjectStorage(input: {
  base: string;
  mediaPath: string;
  metaPath: string;
  fallbackSourceUri: string;
  fallbackContentType: string;
  fallbackImmutable: boolean;
}): Promise<{ meta: TvCacheMirrorMeta; bytes: number } | null> {
  const config = getObjectStorageConfig();
  if (!config) return null;

  const mediaObjectKey = tvCacheMediaObjectKey(input.base);
  const metaObjectKey = tvCacheMetaObjectKey(input.base);
  const tempMediaPath = `${input.mediaPath}.${Date.now().toString(36)}-object.tmp`;
  const tempMetaPath = `${input.metaPath}.${Date.now().toString(36)}-object.tmp`;

  let parsedMeta: TvCacheMirrorMeta | null = null;
  try {
    try {
      await downloadObjectToFile({
        bucket: config.bucket,
        key: metaObjectKey,
        destinationPath: tempMetaPath,
      });
      parsedMeta = JSON.parse(await fs.readFile(tempMetaPath, "utf8")) as TvCacheMirrorMeta;
    } catch {
      parsedMeta = null;
      await fs.unlink(tempMetaPath).catch(() => undefined);
    }

    const mediaDownload = await downloadObjectToFile({
      bucket: config.bucket,
      key: mediaObjectKey,
      destinationPath: tempMediaPath,
    });
    const stat = await fs.stat(tempMediaPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`Downloaded TV cache object is empty: ${mediaObjectKey}`);
    }

    const normalizedContentType = String(
      parsedMeta?.contentType ||
        mediaDownload.contentType ||
        input.fallbackContentType ||
        "application/octet-stream"
    )
      .split(";")[0]
      .trim() || "application/octet-stream";

    const hydratedMeta: TvCacheMirrorMeta = {
      ...parsedMeta,
      contentType: normalizedContentType,
      immutable:
        typeof parsedMeta?.immutable === "boolean"
          ? parsedMeta.immutable
          : input.fallbackImmutable,
      sourceUri: parsedMeta?.sourceUri || input.fallbackSourceUri,
      sizeBytes: stat.size,
      updatedAt: parsedMeta?.updatedAt || new Date().toISOString(),
      objectStorageBucket: config.bucket,
      objectStorageKey: mediaObjectKey,
      objectStorageMetaKey: metaObjectKey,
      mirroredAt: parsedMeta?.mirroredAt || new Date().toISOString(),
    };
    const payload = JSON.stringify(hydratedMeta);

    let alreadyCached = false;
    try {
      const existing = await fs.stat(input.mediaPath);
      if (existing.isFile() && existing.size > 0) alreadyCached = true;
    } catch {
      alreadyCached = false;
    }

    if (alreadyCached) {
      await fs.unlink(tempMediaPath).catch(() => undefined);
    } else {
      await fs.rename(tempMediaPath, input.mediaPath);
    }
    await fs.writeFile(input.metaPath, payload, "utf8");
    return { meta: hydratedMeta, bytes: stat.size };
  } catch (error) {
    await fs.unlink(tempMediaPath).catch(() => undefined);
    await fs.unlink(tempMetaPath).catch(() => undefined);
    return null;
  }
}
