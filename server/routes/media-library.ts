import { Router } from "express";
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

const router = Router();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/* ─── List my media ──────────────────────────────────── */

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

/* ─── Get single media item ──────────────────────────── */

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

/* ─── Import token to library ────────────────────────── */

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

    if (existing) {
      return res.json(existing);
    }

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

/* ─── Upload media ───────────────────────────────────── */

router.post("/api/media/upload", isAuthenticated, async (req: any, res: any) => {
  try {
    const user = req.user as any;
    const { title, mimeType, fileData, mediaCategory } = req.body;

    if (!title || !mimeType || !fileData) {
      return res.status(400).json({ error: "title, mimeType, and fileData are required" });
    }

    const dataStr = String(fileData);
    const base64Body = dataStr.includes(",") ? dataStr.split(",")[1] : dataStr;
    const fileSize = Math.ceil((base64Body.length * 3) / 4);

    if (fileSize > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
      });
    }

    const category = mediaCategory || mediaCategoryFromMime(mimeType);

    const [created] = await db
      .insert(userMediaLibrary)
      .values({
        ownerUserId: user.id,
        title: String(title).slice(0, 300),
        sourceType: "upload",
        sourceUrl: "upload://local",
        mimeType,
        mediaCategory: category,
        fileData: dataStr,
        fileSize,
        status: "ready",
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error("[media-library] upload error:", err);
    res.status(500).json({ error: "Failed to upload media" });
  }
});

/* ─── Serve uploaded file ────────────────────────────── */

router.get("/api/media/:id/file", async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        mimeType: userMediaLibrary.mimeType,
        fileData: userMediaLibrary.fileData,
        sourceType: userMediaLibrary.sourceType,
      })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, id));

    if (!item || item.sourceType !== "upload" || !item.fileData) {
      return res.status(404).json({ error: "File not found" });
    }

    const base64 = item.fileData.includes(",")
      ? item.fileData.split(",")[1]
      : item.fileData;
    const buffer = Buffer.from(base64, "base64");

    res.setHeader("Content-Type", item.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    console.error("[media-library] serve file error:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

/* ─── Update media item ──────────────────────────────── */

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

/* ─── Delete media item ──────────────────────────────── */

router.delete("/api/media/:id", isAuthenticated, async (req: any, res: any) => {
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

    await db.delete(userMediaLibrary).where(eq(userMediaLibrary.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[media-library] delete error:", err);
    res.status(500).json({ error: "Failed to delete media item" });
  }
});

export default router;
