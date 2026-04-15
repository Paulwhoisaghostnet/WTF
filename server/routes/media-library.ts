import { Router } from "express";
import { promises as fsPromises } from "fs";
import { createReadStream } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { userMediaLibrary, userOwnedTokens } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import {
  extractPlayableAsset,
  extractImageAsset,
  mediaCategoryFromMime,
  normalizeIpfsUri,
} from "../lib/media-utils";
import { probeMediaDuration } from "../lib/media-probe";

const router = Router();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads", "media");

async function ensureUploadsDir() {
  await fsPromises.mkdir(UPLOADS_DIR, { recursive: true });
}

function generateFilename(mimeType: string): string {
  const ext =
    mimeType === "video/mp4" ? ".mp4" :
    mimeType === "video/webm" ? ".webm" :
    mimeType === "video/quicktime" ? ".mov" :
    mimeType === "image/gif" ? ".gif" :
    mimeType === "image/png" ? ".png" :
    mimeType === "image/jpeg" ? ".jpg" :
    mimeType === "image/webp" ? ".webp" :
    ".bin";
  return `${randomBytes(16).toString("hex")}${ext}`;
}

router.get("/api/media/mine", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const category = String(req.query?.category || "").trim();

    const rows = await db
      .select()
      .from(userMediaLibrary)
      .where(
        category
          ? and(
              eq(userMediaLibrary.ownerUserId, user.id),
              eq(userMediaLibrary.mediaCategory, category)
            )
          : eq(userMediaLibrary.ownerUserId, user.id)
      )
      .orderBy(desc(userMediaLibrary.updatedAt));

    res.json(rows);
  } catch (err) {
    console.error("[media-library] list error:", err);
    res.status(500).json({ error: "Failed to list media" });
  }
});

router.get("/api/media/:id", isAuthenticated, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db
      .select()
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, id));

    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    console.error("[media-library] get error:", err);
    res.status(500).json({ error: "Failed to get media item" });
  }
});

router.post("/api/media/import-token", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const { contract, tokenId, mediaCategory } = req.body;
    if (!contract || tokenId == null) {
      return res.status(400).json({ error: "contract and tokenId are required" });
    }

    const [existing] = await db
      .select()
      .from(userMediaLibrary)
      .where(
        and(
          eq(userMediaLibrary.ownerUserId, user.id),
          eq(userMediaLibrary.tokenContract, contract),
          eq(userMediaLibrary.tokenId, String(tokenId))
        )
      );

    if (existing) return res.json(existing);

    const [ownedToken] = await db
      .select()
      .from(userOwnedTokens)
      .where(
        and(
          eq(userOwnedTokens.tokenContract, contract),
          eq(userOwnedTokens.tokenId, String(tokenId))
        )
      );

    const metadata = (ownedToken?.metadata as Record<string, any>) || {};
    const playable = extractPlayableAsset(metadata, metadata.name);
    const image = extractImageAsset(metadata, metadata.name);
    const asset = playable || image;

    if (!asset) {
      return res.status(422).json({ error: "Unable to extract media from this token" });
    }

    const mimeType = asset.mimeType || "application/octet-stream";
    const category = mediaCategory || mediaCategoryFromMime(mimeType);

    const [created] = await db
      .insert(userMediaLibrary)
      .values({
        ownerUserId: user.id,
        title: asset.title || `Token ${contract}:${tokenId}`,
        sourceType: "ipfs",
        sourceUrl: asset.sourceUri,
        playbackUrl: normalizeIpfsUri(asset.sourceUri),
        posterUrl: "thumbnailUri" in asset && (asset as any).thumbnailUri
          ? normalizeIpfsUri((asset as any).thumbnailUri)
          : null,
        mimeType,
        mediaCategory: category,
        tokenContract: contract,
        tokenId: String(tokenId),
        status: "ready",
      })
      .returning();

    res.status(201).json(created);
  } catch (err: any) {
    if (err?.constraint === "uml_token_unique_idx") {
      const [existing] = await db
        .select()
        .from(userMediaLibrary)
        .where(
          and(
            eq(userMediaLibrary.ownerUserId, (req.user as any).id),
            eq(userMediaLibrary.tokenContract, req.body.contract),
            eq(userMediaLibrary.tokenId, String(req.body.tokenId))
          )
        );
      if (existing) return res.json(existing);
    }
    console.error("[media-library] import-token error:", err);
    res.status(500).json({ error: "Failed to import token to library" });
  }
});

router.post("/api/media/upload", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const { title, mimeType, fileData, mediaCategory } = req.body;

    if (!title || !mimeType || !fileData) {
      return res.status(400).json({ error: "title, mimeType, and fileData are required" });
    }

    const dataStr = String(fileData);
    const base64Body = dataStr.includes(",") ? dataStr.split(",")[1] : dataStr;
    const buffer = Buffer.from(base64Body, "base64");

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
      });
    }

    await ensureUploadsDir();
    const filename = generateFilename(mimeType);
    const diskPath = path.join(UPLOADS_DIR, filename);
    await fsPromises.writeFile(diskPath, buffer);

    let durationSeconds: number | null = null;
    if (mimeType.startsWith("video/")) {
      const probe = await probeMediaDuration(diskPath);
      if (probe) durationSeconds = probe.durationSeconds;
    }

    const category = mediaCategory || mediaCategoryFromMime(mimeType);

    const [created] = await db
      .insert(userMediaLibrary)
      .values({
        ownerUserId: user.id,
        title: String(title).slice(0, 300),
        sourceType: "upload",
        sourceUrl: `disk://${filename}`,
        mimeType,
        mediaCategory: category,
        fileSize: buffer.length,
        durationSeconds,
        status: "ready",
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error("[media-library] upload error:", err);
    res.status(500).json({ error: "Failed to upload media" });
  }
});

router.get("/api/media/:id/file", async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        mimeType: userMediaLibrary.mimeType,
        sourceUrl: userMediaLibrary.sourceUrl,
        fileData: userMediaLibrary.fileData,
        sourceType: userMediaLibrary.sourceType,
      })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, id));

    if (!item || item.sourceType !== "upload") {
      return res.status(404).json({ error: "File not found" });
    }

    const contentType = item.mimeType || "application/octet-stream";

    if (item.sourceUrl?.startsWith("disk://")) {
      const filename = item.sourceUrl.slice(7);
      const diskPath = path.join(UPLOADS_DIR, filename);
      try {
        const stat = await fsPromises.stat(diskPath);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Cache-Control", "public, max-age=3600");
        createReadStream(diskPath).pipe(res);
        return;
      } catch {
        return res.status(404).json({ error: "File not found on disk" });
      }
    }

    if (item.fileData) {
      const base64 = item.fileData.includes(",")
        ? item.fileData.split(",")[1]
        : item.fileData;
      const buffer = Buffer.from(base64, "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buffer);
      return;
    }

    res.status(404).json({ error: "File not found" });
  } catch (err) {
    console.error("[media-library] serve file error:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

router.put("/api/media/:id", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db
      .select({ id: userMediaLibrary.id, ownerUserId: userMediaLibrary.ownerUserId })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, id));

    if (!item) return res.status(404).json({ error: "Not found" });
    if (item.ownerUserId !== user.id && !["admin", "host", "cohost"].includes(user.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { title, description, status } = req.body;
    const [updated] = await db
      .update(userMediaLibrary)
      .set({
        ...(title !== undefined && { title: String(title).slice(0, 300) }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        updatedAt: new Date(),
      })
      .where(eq(userMediaLibrary.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[media-library] update error:", err);
    res.status(500).json({ error: "Failed to update media item" });
  }
});

router.delete("/api/media/:id", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        ownerUserId: userMediaLibrary.ownerUserId,
        sourceUrl: userMediaLibrary.sourceUrl,
      })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, id));

    if (!item) return res.status(404).json({ error: "Not found" });
    if (item.ownerUserId !== user.id && !["admin", "host", "cohost"].includes(user.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (item.sourceUrl?.startsWith("disk://")) {
      const filename = item.sourceUrl.slice(7);
      const diskPath = path.join(UPLOADS_DIR, filename);
      await fsPromises.unlink(diskPath).catch(() => undefined);
    }

    await db.delete(userMediaLibrary).where(eq(userMediaLibrary.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[media-library] delete error:", err);
    res.status(500).json({ error: "Failed to delete media item" });
  }
});

export default router;
