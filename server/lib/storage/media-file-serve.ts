import path from "node:path";
import { promises as fsPromises, createReadStream } from "node:fs";
import { resolveMediaFilePath } from "./media-cache";

const LEGACY_UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads", "media");

type StoredMediaFile = {
  id: number;
  mimeType?: string | null;
  sourceUrl?: string | null;
  fileData?: string | null;
  objectStorageBucket?: string | null;
  objectStorageKey?: string | null;
  safeFilename?: string | null;
  hotCachePath?: string | null;
};

function parseRangeHeader(header: string | undefined, size: number): {
  start: number;
  end: number;
} | null {
  const raw = String(header || "").trim();
  if (!raw.startsWith("bytes=")) return null;
  const [startRaw, endRaw] = raw.slice("bytes=".length).split("-", 2);
  if (raw.includes(",")) return null;

  let start: number;
  let end: number;

  if (startRaw === "" && endRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const clamped = Math.min(size, Math.floor(suffixLength));
    start = Math.max(0, size - clamped);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    start = Math.floor(start);
    end = Math.floor(end);
  }

  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

async function streamLocalFile(
  req: any,
  res: any,
  filePath: string,
  contentType: string,
  cacheStatus: string
): Promise<void> {
  const stat = await fsPromises.stat(filePath);
  const size = stat.size;
  const range = parseRangeHeader(req.headers?.range, size);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-WTF-Media-Cache", cacheStatus);

  if (range) {
    const { start, end } = range;
    res.status(206);
    res.setHeader("Content-Length", String(end - start + 1));
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  if (String(req.headers?.range || "").trim()) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }

  res.setHeader("Content-Length", String(size));
  createReadStream(filePath).pipe(res);
}

export async function serveStoredMediaFile(
  req: any,
  res: any,
  item: StoredMediaFile
): Promise<boolean> {
  const contentType = item.mimeType || "application/octet-stream";

  if (item.hotCachePath || item.objectStorageKey) {
    const resolved = await resolveMediaFilePath({
      mediaId: item.id,
      hotCachePath: item.hotCachePath,
      objectStorageBucket: item.objectStorageBucket,
      objectStorageKey: item.objectStorageKey,
      safeFilename: item.safeFilename,
    });
    if (resolved) {
      await streamLocalFile(
        req,
        res,
        resolved.path,
        contentType,
        resolved.promoted ? "PROMOTED" : "HIT"
      );
      return true;
    }
  }

  if (item.sourceUrl?.startsWith("disk://")) {
    const filename = item.sourceUrl.slice(7);
    const diskPath = path.join(LEGACY_UPLOADS_DIR, filename);
    await streamLocalFile(req, res, diskPath, contentType, "LEGACY_DISK");
    return true;
  }

  if (item.fileData) {
    const base64 = item.fileData.includes(",")
      ? item.fileData.split(",")[1]
      : item.fileData;
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("X-WTF-Media-Cache", "INLINE");
    res.send(buffer);
    return true;
  }

  return false;
}
