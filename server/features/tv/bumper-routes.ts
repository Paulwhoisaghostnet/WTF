import type { Router } from "express";
import { createReadStream, promises as fsPromises } from "fs";
import path from "path";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { hasAtLeastRole } from "@shared/types";
import { db } from "../../db";
import { isAuthenticated } from "../../auth/passport";
import { tvBumpers, tvChannels, userMediaLibrary, users } from "@shared/schema";
import { serveStoredMediaFile } from "../../lib/storage/media-file-serve";
import {
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_COMMUNITY,
  BUMPER_CATEGORY_PERSONAL,
} from "./daypart";
import {
  BUMPER_ALLOWED_MIME,
  BUMPER_MAX_DURATION_MS,
  BUMPER_MAX_FILE_BYTES,
  BUMPER_UPLOADS_DIR,
  bumperFilename,
  bumperUpload,
  ensureBumperDir,
} from "./bumper-upload";
import {
  canViewChannel,
  isStaffRole,
  type TvAuthUser as AuthUser,
} from "./channel-service";
import { decodeStoredBumperData } from "./media-metadata";
import { normalizeMediaUri } from "./media-urls";
import {
  BUMPER_MAX_PER_USER_COMMUNITY,
  BUMPER_MAX_PER_USER_PERSONAL,
  parseBumperCategory,
  setMediaBumperAssignment,
} from "./media-bumper-service";

export function registerTvBumperRoutes(router: Router): void {
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
          mediaItemId: tvBumpers.mediaItemId,
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
            mediaItemId: tvBumpers.mediaItemId,
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
        const viewer = (req as any).user as AuthUser | undefined;
        const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
        const [channel] = await db
          .select({
            id: tvChannels.id,
            ownerUserId: tvChannels.ownerUserId,
            isPublic: tvChannels.isPublic,
            isActive: tvChannels.isActive,
          })
          .from(tvChannels)
          .where(eq(tvChannels.id, channelId));
        if (!channel || !canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
          return res.status(404).json({ error: "Channel not found" });
        }
        ownerUserId = channel.ownerUserId;
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
          mediaItemId: tvBumpers.mediaItemId,
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
          mediaItemId: r.mediaItemId,
          mediaUrl:
            r.category === BUMPER_CATEGORY_PERSONAL && ownerUserId !== null
              ? `/api/tv/bumpers/${r.id}/media?channelId=${channelId}`
              : `/api/tv/bumpers/${r.id}/media`,
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
          mediaItemId: tvBumpers.mediaItemId,
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
          mediaItemId: r.mediaItemId,
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

  router.put("/api/tv/media/:mediaItemId/bumper", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const mediaItemId = Number(req.params.mediaItemId);
      if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
        return res.status(400).json({ error: "Invalid media item id" });
      }

      const category = parseBumperCategory(req.body?.category);
      if (!category) {
        return res.status(400).json({ error: "Invalid bumper category" });
      }

      const result = await setMediaBumperAssignment({
        user,
        mediaItemId,
        category,
        enabled: req.body?.enabled !== false,
      });
      if ("error" in result) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.status(result.status).json(result.data);
    } catch (err) {
      console.error("[tv] failed to update media bumper assignment:", err);
      res.status(500).json({ error: "Failed to update bumper assignment" });
    }
  });
  
  router.patch("/api/tv/bumpers/:bumperId", isAuthenticated, async (req, res) => {
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
          title: tvBumpers.title,
          category: tvBumpers.category,
        })
        .from(tvBumpers)
        .where(eq(tvBumpers.id, bumperId));
  
      if (!bumper) return res.status(404).json({ error: "Bumper not found" });
  
      const isOwner = bumper.ownerUserId === user.id;
      const isStaff = await isStaffRole(user.role);
      if (!isOwner && !isStaff) {
        return res.status(403).json({ error: "Not authorized" });
      }
  
      const updates: Record<string, any> = {};
  
      if (typeof req.body?.title === "string") {
        const title = req.body.title.trim();
        if (!title) {
          return res.status(400).json({ error: "Bumper title cannot be empty" });
        }
        updates.title = title.slice(0, 100);
      }
  
      if (typeof req.body?.category === "string") {
        const requestedCategory = req.body.category.trim().toLowerCase();
        if (!BUMPER_CATEGORIES.has(requestedCategory)) {
          return res.status(400).json({ error: "Invalid bumper category" });
        }
  
        const category = requestedCategory as
          | typeof BUMPER_CATEGORY_PERSONAL
          | typeof BUMPER_CATEGORY_COMMUNITY;
  
        if (category === BUMPER_CATEGORY_COMMUNITY) {
          const allowed = hasAtLeastRole(user.role, "contestant");
          if (!allowed) {
            return res.status(403).json({
              error:
                "Community bumpers are available to contestants and above. Keep this bumper personal or ask a host to promote your account.",
            });
          }
        }
  
        if (category !== bumper.category) {
          const [countRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(tvBumpers)
            .where(
              and(
                eq(tvBumpers.ownerUserId, bumper.ownerUserId),
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
                  ? `You can contribute at most ${maxForCategory} community bumpers. Pull one out first.`
                  : `You can keep at most ${maxForCategory} personal bumpers. Remove one first.`,
            });
          }
        }
  
        updates.category = category;
      }
  
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No bumper changes requested" });
      }
  
      const [updated] = await db
        .update(tvBumpers)
        .set(updates)
        .where(eq(tvBumpers.id, bumperId))
        .returning({
          id: tvBumpers.id,
          title: tvBumpers.title,
          mimeType: tvBumpers.mimeType,
          fileSize: tvBumpers.fileSize,
          durationMs: tvBumpers.durationMs,
          category: tvBumpers.category,
          mediaItemId: tvBumpers.mediaItemId,
          createdAt: tvBumpers.createdAt,
        });
  
      res.json(updated);
    } catch (err) {
      console.error("[tv] failed to update bumper:", err);
      res.status(500).json({ error: "Failed to update bumper" });
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
        .select({
          ownerUserId: tvBumpers.ownerUserId,
          category: tvBumpers.category,
          mimeType: tvBumpers.mimeType,
          data: tvBumpers.data,
          mediaItemId: tvBumpers.mediaItemId,
        })
        .from(tvBumpers)
        .where(eq(tvBumpers.id, bumperId));
  
      if (!bumper) return res.status(404).json({ error: "Bumper not found" });

      if (bumper.category === BUMPER_CATEGORY_PERSONAL) {
        const viewer = (req as any).user as AuthUser | undefined;
        const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
        const ownerOrStaff =
          Boolean(viewer && viewer.id === bumper.ownerUserId) || viewerIsStaff;

        if (!ownerOrStaff) {
          const channelId = Number(req.query.channelId);
          if (!Number.isInteger(channelId) || channelId <= 0) {
            return res.status(404).json({ error: "Bumper not found" });
          }

          const [channel] = await db
            .select({
              id: tvChannels.id,
              ownerUserId: tvChannels.ownerUserId,
              isPublic: tvChannels.isPublic,
              isActive: tvChannels.isActive,
            })
            .from(tvChannels)
            .where(eq(tvChannels.id, channelId));

          if (
            !channel ||
            channel.ownerUserId !== bumper.ownerUserId ||
            !canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })
          ) {
            return res.status(404).json({ error: "Bumper not found" });
          }
        }
      }
  
      const contentType = bumper.mimeType || "application/octet-stream";
      const dataStr = String(bumper.data || "");

      if (bumper.mediaItemId) {
        const [item] = await db
          .select({
            id: userMediaLibrary.id,
            mimeType: userMediaLibrary.mimeType,
            sourceUrl: userMediaLibrary.sourceUrl,
            playbackUrl: userMediaLibrary.playbackUrl,
            fileData: userMediaLibrary.fileData,
            sourceType: userMediaLibrary.sourceType,
            objectStorageBucket: userMediaLibrary.objectStorageBucket,
            objectStorageKey: userMediaLibrary.objectStorageKey,
            safeFilename: userMediaLibrary.safeFilename,
            hotCachePath: userMediaLibrary.hotCachePath,
            status: userMediaLibrary.status,
          })
          .from(userMediaLibrary)
          .where(eq(userMediaLibrary.id, bumper.mediaItemId))
          .limit(1);

        if (!item || item.status !== "ready") {
          return res.status(404).json({ error: "Bumper media not found" });
        }

        if (
          item.sourceType === "upload" ||
          String(item.sourceUrl || "").startsWith("disk://")
        ) {
          const served = await serveStoredMediaFile(req, res, item);
          if (!served) {
            return res.status(404).json({ error: "Bumper media file not found" });
          }
          return;
        }

        const redirectUrl =
          normalizeMediaUri(item.playbackUrl || item.sourceUrl) ||
          item.playbackUrl ||
          item.sourceUrl;
        if (!redirectUrl) {
          return res.status(404).json({ error: "Bumper media has no playable URL" });
        }
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.redirect(302, redirectUrl);
      }
  
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
}
