import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getObjectStorageConfig, objectStorageClient } from "../../lib/storage/object-storage";
import { isSpineEnabled } from "./config";
import { isAllowedMediaKey } from "./media-echo";

/**
 * Media gateway handler (S2.6). Streams S3-stored bytes for a media.echo reference. Mounted
 * on media.wtfos.me by the kernel router when ATPROTO_SPINE_ENABLED. Read-only and key-guarded
 * (no traversal, must match the configured prefix); never exposes credentials.
 */
export async function mediaGatewayHandler(req: Request, res: Response): Promise<void> {
  if (!isSpineEnabled()) {
    res.status(404).json({ error: "media_gateway_disabled" });
    return;
  }
  const key = String(req.query.key ?? req.params.key ?? "");
  if (!isAllowedMediaKey(key)) {
    res.status(400).json({ error: "invalid_media_key" });
    return;
  }
  const config = getObjectStorageConfig();
  if (!config) {
    res.status(503).json({ error: "object_storage_unconfigured" });
    return;
  }
  try {
    const client = objectStorageClient(config);
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (result.ContentType) res.setHeader("content-type", result.ContentType);
    if (result.ContentLength != null) res.setHeader("content-length", String(result.ContentLength));
    if (result.ETag) res.setHeader("etag", result.ETag);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    const body = result.Body;
    if (!body) {
      res.status(404).json({ error: "media_not_found" });
      return;
    }
    Readable.from(body as Readable).pipe(res);
  } catch (err) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey" || code === "NotFound") {
      res.status(404).json({ error: "media_not_found" });
      return;
    }
    res.status(502).json({ error: "media_fetch_failed" });
  }
}
