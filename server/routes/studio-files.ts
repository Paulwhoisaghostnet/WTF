/**
 * Studio — file upload, serving, rename, move, delete.
 *
 * Uploads stream through multer (memory buffer, capped per-backend) and
 * are persisted via the project's configured storage driver.  Preview /
 * thumbnail derivatives are produced via the preview pipeline with
 * graceful degradation — callers always get the original URL back even
 * if the preview tooling couldn't produce a derivative.
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  dmConversations,
  dmMessages,
  studioFiles,
  studioFolders,
  users,
} from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  StudioAccessError,
  canEditFiles,
  requireStudioAccess,
  resolveStudioAccess,
} from "../lib/studio/access";
import {
  StorageQuotaExceededError,
  maxFileUploadBytes,
  releaseStorage,
  reserveStorage,
} from "../lib/studio/quota";
import { resolveDriverForProject } from "../lib/studio/driver-registry";
import type { StudioStorageBackend } from "@shared/types";
import { generatePreview } from "../lib/studio/preview/pipeline";
import { StorageNotFoundError } from "../lib/studio/drivers/local-disk-driver";
import { migrateUriToProjectBackend } from "../lib/studio/lazy-migrate";
import { broadcastStudioEvent } from "../websocket";

const router = Router();

/* ── Upload middleware ──────────────────────────────────── */

const GLOBAL_UPLOAD_MAX = 200 * 1024 * 1024; // 200 MB absolute cap

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: GLOBAL_UPLOAD_MAX,
    files: 1,
    fields: 10,
    fieldSize: 1024 * 1024,
  },
});

/**
 * MIME allowlist for uploads.  Two hard rules:
 *
 *   1. Never accept anything the browser will treat as same-origin
 *      executable content.  That excludes `text/html`, every flavour of
 *      JS / WASM / xhtml, and `image/svg+xml` (SVGs run inline scripts).
 *      Keep these out at upload time so a project owner can't turn the
 *      file pipeline into a stored XSS launcher for the rest of the
 *      project members.
 *
 *   2. `text/*` is opt-in via an exact-match list, not a `text/`
 *      prefix.  Anything else lands in the binary buckets below.
 */
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/json",
  "application/zip",
  "application/octet-stream",
];

const ALLOWED_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
]);

const BLOCKED_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/svg",
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "text/javascript",
  "text/ecmascript",
  "application/wasm",
]);

function mimeAllowed(mime: string): boolean {
  const m = String(mime || "").toLowerCase();
  if (!m) return true; // fallback to octet-stream elsewhere
  if (BLOCKED_MIME_TYPES.has(m)) return false;
  if (m.startsWith("text/")) return ALLOWED_TEXT_TYPES.has(m);
  return ALLOWED_MIME_PREFIXES.some((p) => (p.endsWith("/") ? m.startsWith(p) : m === p));
}

/**
 * Mime types that are safe to render inline in a same-origin context.
 * Everything else gets `Content-Disposition: attachment` so the browser
 * downloads instead of executing.  Keep this list narrow.
 */
const INLINE_SAFE_MIME_PREFIXES = ["image/", "audio/", "video/"];
const INLINE_SAFE_MIME_TYPES = new Set(["application/pdf"]);

function isInlineSafe(mime: string): boolean {
  const m = String(mime || "").toLowerCase();
  if (BLOCKED_MIME_TYPES.has(m)) return false;
  if (m === "image/svg+xml") return false;
  if (INLINE_SAFE_MIME_TYPES.has(m)) return true;
  return INLINE_SAFE_MIME_PREFIXES.some((p) => m.startsWith(p));
}

/**
 * Force a safe Content-Type on the wire.  We never trust the stored
 * mime once it's leaving the API: HTML, SVG, and JS are downgraded to
 * plain text or octet-stream regardless of what was in the DB.
 */
function safeServeMimeType(stored: string): string {
  const m = String(stored || "").toLowerCase().trim();
  if (!m) return "application/octet-stream";
  if (BLOCKED_MIME_TYPES.has(m)) return "application/octet-stream";
  if (m === "image/svg+xml") return "application/octet-stream";
  if (m.startsWith("text/")) {
    return ALLOWED_TEXT_TYPES.has(m) ? m : "text/plain; charset=utf-8";
  }
  return m;
}

function quoteFilenameForHeader(name: string): string {
  const sanitised = String(name || "file")
    .replace(/[\\\r\n"]/g, "_")
    .slice(0, 200);
  const encoded = encodeURIComponent(sanitised);
  return `filename="${sanitised}"; filename*=UTF-8''${encoded}`;
}

function parseId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function mapAccessError(
  err: unknown
): { status: number; body: { error: string } } {
  if (err instanceof StudioAccessError) {
    return { status: err.status, body: { error: err.message } };
  }
  if (err instanceof StorageQuotaExceededError) {
    return {
      status: 413,
      body: {
        error: "Project storage quota exceeded — archive or remove files first.",
      },
    };
  }
  return { status: 500, body: { error: "Studio operation failed" } };
}

const renameMoveSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    folderId: z.number().int().positive().optional().nullable(),
    position: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields provided",
  });

/* ── Upload ─────────────────────────────────────────────── */

router.post(
  "/api/studio/projects/:id/files",
  isAuthenticated,
  requirePermission("access_studio"),
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg =
          err instanceof Error && err.message.includes("File too large")
            ? "File too large"
            : err instanceof Error
              ? err.message
              : "Upload failed";
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const user = req.user as { id: number; role: string };
    const file = (req as Request & { file?: Express.Multer.File }).file;

    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        canEditFiles,
        "upload files"
      );

      const mime = (file.mimetype || "application/octet-stream").toLowerCase();
      if (!mimeAllowed(mime)) {
        return res
          .status(415)
          .json({ error: `Unsupported file type: ${mime}` });
      }

      const backendCap = maxFileUploadBytes(
        access.project.storageBackend as StudioStorageBackend
      );
      if (file.size > backendCap) {
        return res.status(413).json({
          error: `File exceeds per-file cap (${backendCap} bytes)`,
        });
      }

      let folderId: number | null = null;
      if (req.body && req.body.folderId != null && req.body.folderId !== "") {
        const parsed = Number(req.body.folderId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ error: "Invalid folderId" });
        }
        const [folder] = await db
          .select({ id: studioFolders.id, projectId: studioFolders.projectId })
          .from(studioFolders)
          .where(eq(studioFolders.id, parsed))
          .limit(1);
        if (!folder || folder.projectId !== projectId) {
          return res.status(400).json({ error: "Folder not in this project" });
        }
        folderId = parsed;
      }

      // Reserve quota BEFORE writing bytes so we never exceed cap; if
      // the upload/driver fails after reservation we release below.
      await reserveStorage(projectId, file.size);

      const { driver, context } = resolveDriverForProject(access.project);

      let stored;
      try {
        stored = await driver.upload(
          context,
          {
            buffer: file.buffer,
            mimeType: mime,
            filename: file.originalname || "upload",
          },
          "original"
        );
      } catch (uploadErr) {
        await releaseStorage(projectId, file.size).catch(() => null);
        throw uploadErr;
      }

      let previewUri: string | null = null;
      let thumbnailUri: string | null = null;
      let derivativeBytes = 0;
      let metadata: Record<string, unknown> = {};

      try {
        const prev = await generatePreview(driver, context, {
          buffer: file.buffer,
          mimeType: mime,
          filename: file.originalname || "upload",
        });
        if (prev.preview) {
          previewUri = prev.preview.uri;
          derivativeBytes += prev.preview.sizeBytes;
        }
        if (prev.thumbnail) {
          thumbnailUri = prev.thumbnail.uri;
          derivativeBytes += prev.thumbnail.sizeBytes;
        }
        metadata = prev.metadata;
      } catch (err) {
        console.warn("[studio] preview generation failed:", err);
      }

      // Best-effort reserve for derivative bytes; if it would push the
      // project over quota, drop the derivative and keep the original.
      if (derivativeBytes > 0) {
        try {
          await reserveStorage(projectId, derivativeBytes);
        } catch {
          if (previewUri) {
            await driver.remove(context, previewUri).catch(() => null);
            previewUri = null;
          }
          if (thumbnailUri) {
            await driver.remove(context, thumbnailUri).catch(() => null);
            thumbnailUri = null;
          }
          derivativeBytes = 0;
        }
      }

      const [inserted] = await db
        .insert(studioFiles)
        .values({
          projectId,
          folderId,
          uploaderId: user.id,
          name: (file.originalname || "upload").slice(0, 300),
          mimeType: mime,
          sizeBytes: file.size,
          sourceUri: stored.uri,
          previewUri,
          thumbnailUri,
          fileHash: stored.hash ?? null,
          metadata: metadata as Record<string, unknown>,
          currentVersion: 1,
          position: Number(req.body?.position ?? 0) || 0,
        })
        .returning();

      if (access.project.conversationId != null) {
        await db.insert(dmMessages).values({
          conversationId: access.project.conversationId,
          senderId: user.id,
          content: `Uploaded "${inserted.name}".`,
          messageType: "studio_system",
          metadata: {
            eventKey: "studio.file_uploaded",
            studioProjectId: projectId,
            studioFileId: inserted.id,
            mimeType: mime,
            sizeBytes: file.size,
          },
        });
        await db
          .update(dmConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(dmConversations.id, access.project.conversationId));
      }

      broadcastStudioEvent(projectId, "studio_file_uploaded", {
        fileId: inserted.id,
        folderId: inserted.folderId,
        name: inserted.name,
        mimeType: inserted.mimeType,
        sizeBytes: inserted.sizeBytes,
        uploaderId: user.id,
        hasPreview: Boolean(inserted.previewUri),
        hasThumbnail: Boolean(inserted.thumbnailUri),
        position: inserted.position,
      });

      res.status(201).json({
        id: inserted.id,
        projectId,
        folderId: inserted.folderId,
        name: inserted.name,
        mimeType: inserted.mimeType,
        sizeBytes: inserted.sizeBytes,
        previewUrl: inserted.previewUri ? `/api/studio/files/${inserted.id}/preview` : null,
        thumbnailUrl: inserted.thumbnailUri ? `/api/studio/files/${inserted.id}/thumbnail` : null,
        currentVersion: inserted.currentVersion,
        uploaderId: inserted.uploaderId,
        metadata: inserted.metadata,
        position: inserted.position,
        updatedAt: inserted.updatedAt.toISOString(),
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] upload failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Stream helpers ─────────────────────────────────────── */

type FileStreamKind = "raw" | "preview" | "thumbnail";

async function serveFileStream(
  req: Request,
  res: Response,
  fileId: number,
  kind: FileStreamKind
): Promise<void> {
  const user = req.user as { id: number; role: string };
  const [file] = await db
    .select()
    .from(studioFiles)
    .where(eq(studioFiles.id, fileId))
    .limit(1);
  if (!file || file.deletedAt) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const access = await resolveStudioAccess(file.projectId, {
    id: user.id,
    role: user.role as any,
  });
  if (!access) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  let uri = file.sourceUri;
  let fallbackMime = file.mimeType;
  if (kind === "preview" && file.previewUri) {
    uri = file.previewUri;
    fallbackMime = "application/octet-stream";
  } else if (kind === "thumbnail" && file.thumbnailUri) {
    uri = file.thumbnailUri;
    fallbackMime = "application/octet-stream";
  }

  const { driver, context } = resolveDriverForProject(access.project);

  // Lazy migration — if a project was switched to a non-disk backend
  // but this row still points at `disk://…` from before the cutover,
  // copy the bytes onto the active backend before serving.  No-op for
  // already-aligned URIs.
  uri = await migrateUriToProjectBackend({
    fileId: file.id,
    uri,
    kind,
    driver,
    context,
    fallbackMimeType: kind === "raw" ? fallbackMime : "application/octet-stream",
    fallbackFilename: file.name || "file",
  });

  try {
    const stream = await driver.stream(context, uri);
    const driverMime =
      stream.mimeType && stream.mimeType !== "application/octet-stream"
        ? stream.mimeType
        : fallbackMime;
    const serveMime = safeServeMimeType(driverMime);
    const inlineSafe = isInlineSafe(driverMime);

    // Belt-and-braces: helmet sets nosniff globally, but the streamed
    // file response doesn't always go through every middleware.  Set
    // it explicitly so the browser cannot sniff a payload back into an
    // executable type once we've downgraded the Content-Type above.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", serveMime);
    res.setHeader("Content-Length", String(stream.sizeBytes));
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader(
      "Content-Disposition",
      `${inlineSafe ? "inline" : "attachment"}; ${quoteFilenameForHeader(
        file.name || "file"
      )}`
    );
    if (stream.etag) res.setHeader("ETag", stream.etag);
    stream.stream.on("error", (err) => {
      console.error("[studio] stream error:", err);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    stream.stream.pipe(res);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: "File blob missing" });
      return;
    }
    console.error("[studio] serve failed:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
}

router.get(
  "/api/studio/files/:id/raw",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    await serveFileStream(req, res, fileId, "raw");
  }
);

router.get(
  "/api/studio/files/:id/preview",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    await serveFileStream(req, res, fileId, "preview");
  }
);

router.get(
  "/api/studio/files/:id/thumbnail",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    await serveFileStream(req, res, fileId, "thumbnail");
  }
);

/* ── Rename / move ──────────────────────────────────────── */

router.patch(
  "/api/studio/files/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    const parsed = renameMoveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const [file] = await db
        .select()
        .from(studioFiles)
        .where(eq(studioFiles.id, fileId))
        .limit(1);
      if (!file || file.deletedAt) {
        return res.status(404).json({ error: "File not found" });
      }

      const access = await requireStudioAccess(
        file.projectId,
        { id: user.id, role: user.role as any },
        canEditFiles,
        "rename or move files"
      );

      if (parsed.data.folderId !== undefined && parsed.data.folderId !== null) {
        const [folder] = await db
          .select({ id: studioFolders.id, projectId: studioFolders.projectId })
          .from(studioFolders)
          .where(eq(studioFolders.id, parsed.data.folderId))
          .limit(1);
        if (!folder || folder.projectId !== file.projectId) {
          return res.status(400).json({ error: "Folder not in this project" });
        }
      }

      const patch: Partial<typeof studioFiles.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.folderId !== undefined) patch.folderId = parsed.data.folderId;
      if (parsed.data.position !== undefined) patch.position = parsed.data.position;

      const [updated] = await db
        .update(studioFiles)
        .set(patch)
        .where(eq(studioFiles.id, fileId))
        .returning();

      if (access.project.conversationId != null) {
        const changes: string[] = [];
        if (parsed.data.name !== undefined) changes.push(`renamed to "${updated.name}"`);
        if (parsed.data.folderId !== undefined) changes.push("moved to a new folder");
        if (changes.length > 0) {
          await db.insert(dmMessages).values({
            conversationId: access.project.conversationId,
            senderId: user.id,
            content: `File ${changes.join(" and ")}.`,
            messageType: "studio_system",
            metadata: {
              eventKey:
                parsed.data.name !== undefined
                  ? "studio.file_renamed"
                  : "studio.file_moved",
              studioProjectId: file.projectId,
              studioFileId: fileId,
            },
          });
          await db
            .update(dmConversations)
            .set({ lastMessageAt: new Date(), updatedAt: new Date() })
            .where(eq(dmConversations.id, access.project.conversationId));
        }
      }

      broadcastStudioEvent(file.projectId, "studio_file_updated", {
        fileId: updated.id,
        folderId: updated.folderId,
        name: updated.name,
        position: updated.position,
        actorId: user.id,
      });

      res.json({
        id: updated.id,
        folderId: updated.folderId,
        name: updated.name,
        mimeType: updated.mimeType,
        sizeBytes: updated.sizeBytes,
        position: updated.position,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] update file failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Delete (soft) ──────────────────────────────────────── */

router.delete(
  "/api/studio/files/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    const user = req.user as { id: number; role: string };

    try {
      const [file] = await db
        .select()
        .from(studioFiles)
        .where(and(eq(studioFiles.id, fileId), isNull(studioFiles.deletedAt)))
        .limit(1);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const access = await requireStudioAccess(
        file.projectId,
        { id: user.id, role: user.role as any },
        canEditFiles,
        "delete files"
      );

      const { driver, context } = resolveDriverForProject(access.project);

      // Mark deleted first so stream handlers 404 while we purge bytes.
      await db
        .update(studioFiles)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(studioFiles.id, fileId));

      // Best-effort deletion from storage driver; failures are logged
      // but don't block the DB tombstone.
      for (const uri of [file.sourceUri, file.previewUri, file.thumbnailUri]) {
        if (!uri) continue;
        try {
          await driver.remove(context, uri);
        } catch (err) {
          console.warn("[studio] driver remove failed for", uri, err);
        }
      }

      await releaseStorage(file.projectId, file.sizeBytes);

      if (access.project.conversationId != null) {
        await db.insert(dmMessages).values({
          conversationId: access.project.conversationId,
          senderId: user.id,
          content: `File "${file.name}" deleted.`,
          messageType: "studio_system",
          metadata: {
            eventKey: "studio.file_deleted",
            studioProjectId: file.projectId,
            studioFileId: fileId,
          },
        });
        await db
          .update(dmConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(dmConversations.id, access.project.conversationId));
      }

      broadcastStudioEvent(file.projectId, "studio_file_deleted", {
        fileId,
        actorId: user.id,
      });

      res.status(204).end();
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] delete file failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Export ─────────────────────────────────────────────── */

export default router;

// Unused import guards to keep the linter quiet if paths are trimmed.
void users;
