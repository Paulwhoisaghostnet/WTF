import type { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { isAuthenticated } from "../../auth/passport";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylistItems,
  tvPlaylists,
  tvScheduleEntries,
  userMediaLibrary,
  users,
} from "@shared/schema";
import { resolveTvBroadcastQueue } from "../../lib/tv-broadcast";
import { resolveTvOverlayMetadata } from "../../lib/tv-overlay-metadata";
import { resolveTvChannelPlaybackSource } from "../../lib/tv-policy";
import {
  canViewChannel,
  ensureChannelEditable,
  isStaffRole,
  type TvAuthUser as AuthUser,
} from "./channel-service";
import { normalizeMediaUri, resolveCacheUrl } from "./media-urls";
import { maybeAutoRefreshWtfChannel } from "./wtf-refresh";

export function registerTvLiveStateRoutes(router: Router): void {
  // ─── /now – live channel state ──────────────────────────
  
  router.get("/api/tv/channels/:channelId/now", async (req, res) => {
    try {
      const channelId = Number(req.params.channelId);
      if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: "Invalid channel id" });
      }
  
      const nowMs = Date.now();
  
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
        .where(eq(tvChannels.id, channelId));
  
      if (!channel) return res.status(404).json({ error: "Channel not found or inactive" });
      // Respect channel visibility the same way the /stream handler does.
      const nowViewer = (req as any).user as AuthUser | undefined;
      const nowViewerIsStaff = nowViewer ? await isStaffRole(nowViewer.role) : false;
      if (!canViewChannel(channel, nowViewer ?? null, { isStaff: nowViewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found or inactive" });
      }
  
      const scheduleEntries = await db
        .select({
          id: tvScheduleEntries.id,
          mediaItemId: tvScheduleEntries.mediaItemId,
          startsAt: tvScheduleEntries.startsAt,
          endsAt: tvScheduleEntries.endsAt,
          sortOrder: tvScheduleEntries.sortOrder,
          mediaTitle: userMediaLibrary.title,
          mediaSourceUrl: userMediaLibrary.sourceUrl,
          mediaPlaybackUrl: userMediaLibrary.playbackUrl,
          mediaMimeType: userMediaLibrary.mimeType,
          mediaPosterUrl: userMediaLibrary.posterUrl,
          mediaDuration: userMediaLibrary.durationSeconds,
          mediaSourceType: userMediaLibrary.sourceType,
        })
        .from(tvScheduleEntries)
        .innerJoin(userMediaLibrary, eq(tvScheduleEntries.mediaItemId, userMediaLibrary.id))
        .where(
          and(
            eq(tvScheduleEntries.channelId, channelId),
            sql`${tvScheduleEntries.endsAt} > NOW()`,
            eq(userMediaLibrary.status, "ready")
          )
        )
        .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder))
        .limit(10);
  
      const now = new Date(nowMs);
      const currentScheduled = scheduleEntries.find(
        (e) => e.startsAt && e.endsAt && new Date(e.startsAt) <= now && new Date(e.endsAt) > now
      );
      const upcoming = scheduleEntries.filter((e) => e.startsAt && new Date(e.startsAt) > now).slice(0, 5);
  
      if (currentScheduled) {
        const playbackSource = resolveTvChannelPlaybackSource({
          channelId,
          mediaItemId: currentScheduled.mediaItemId,
          sourceType: currentScheduled.mediaSourceType,
          sourceUri: currentScheduled.mediaSourceUrl,
          playbackUrl: currentScheduled.mediaPlaybackUrl,
        });
        const sourceUrl = normalizeMediaUri(playbackSource) || playbackSource;
        const cacheUrl = resolveCacheUrl(sourceUrl);
        const elapsedSec = currentScheduled.startsAt ? Math.floor((nowMs - new Date(currentScheduled.startsAt).getTime()) / 1000) : 0;
  
        return res.json({
          channel,
          mode: "schedule",
          current: {
            ...currentScheduled,
            sourceUrl,
            cacheUrl,
            offsetSeconds: elapsedSec,
            kind: currentScheduled.mediaMimeType === "image/gif" ? "gif" : "video",
          },
          upcoming,
          offline: false,
        });
      }
  
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
          mode: "idle",
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
          mediaItemId: tvChannelVideos.mediaItemId,
          tokenContract: tvChannelVideos.tokenContract,
          tokenId: tvChannelVideos.tokenId,
          title: tvChannelVideos.title,
          mimeType: tvChannelVideos.mimeType,
          sourceUri: tvChannelVideos.sourceUri,
          mediaSourceType: userMediaLibrary.sourceType,
          mediaPlaybackUrl: userMediaLibrary.playbackUrl,
          thumbnailUri: tvChannelVideos.thumbnailUri,
          creatorName: tvChannelVideos.creatorName,
          creatorAddress: tvChannelVideos.creatorAddress,
          collectionName: tvChannelVideos.collectionName,
          mintedAt: tvChannelVideos.mintedAt,
          metadata: tvChannelVideos.metadata,
        })
        .from(tvPlaylistItems)
        .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
        .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
        .where(eq(tvPlaylistItems.playlistId, activePlaylist.id))
        .orderBy(asc(tvPlaylistItems.sortOrder), asc(tvPlaylistItems.id));
  
      if (playlistRows.length === 0) {
        return res.json({
          channel,
          mode: "playlist",
          current: null,
          upcoming,
          offline: true,
          message: "Playlist is empty",
        });
      }
  
      const queue = playlistRows.map((row, idx) => {
        const playbackSource = resolveTvChannelPlaybackSource({
          channelId,
          mediaItemId: row.mediaItemId,
          sourceType: row.mediaSourceType,
          sourceUri: row.sourceUri,
          playbackUrl: row.mediaPlaybackUrl,
        });
        const sourceUri = normalizeMediaUri(playbackSource) || playbackSource;
        const cacheUrl = resolveCacheUrl(sourceUri);
        const overlay = resolveTvOverlayMetadata({
          metadata: row.metadata,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          storedCreatorName: row.creatorName,
          storedCreatorAddress: row.creatorAddress,
          storedCollectionName: row.collectionName,
          storedMintedAt: row.mintedAt,
          channelOwnerUsername: channel.ownerUsername,
        });
        return {
          queueIndex: idx,
          playlistIndex: idx,
          itemId: row.itemId,
          videoId: row.videoId,
          title: row.title || `Video ${row.videoId}`,
          mimeType: row.mimeType,
          thumbnailUri: row.thumbnailUri,
          sourceUri,
          cacheUrl,
          durationSeconds: Math.max(1, Number(row.durationSeconds || 1)),
          offsetSeconds: 0,
          kind: row.mimeType === "image/gif" ? "gif" : "video",
          creatorName: overlay.creatorName,
          creatorAddress: overlay.creatorAddress,
          collectionName: overlay.collectionName,
          mintedAtIso:
            overlay.mintedAt && !Number.isNaN(overlay.mintedAt.getTime())
              ? overlay.mintedAt.toISOString()
              : null,
          objktUrl: overlay.objktUrl,
          addedByUsername: overlay.addedByUsername,
        };
      });
      const broadcast = resolveTvBroadcastQueue(queue, nowMs);
      const previewQueue = broadcast.queue.slice(0, Math.min(3, broadcast.queue.length));
  
      res.json({
        channel,
        mode: "playlist",
        current: broadcast.current,
        queue: previewQueue,
        playlist: {
          id: activePlaylist.id,
          name: activePlaylist.name,
          transitionSeconds: activePlaylist.transitionSeconds,
          totalItems: playlistRows.length,
        },
        loopDurationSeconds: broadcast.loopDurationSeconds,
        upcoming,
        offline: false,
      });
    } catch (err) {
      console.error("[tv] /now endpoint failed:", err);
      res.status(500).json({ error: "Failed to resolve channel state" });
    }
  });
  
  // ─── Schedule Entries (recurring daily playlist time-slots) ───────────
  
  router.get("/api/tv/channels/:channelId/schedule", async (req, res) => {
    try {
      const channelId = Number(req.params.channelId);
      if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: "Invalid channel id" });
      }
  
      const [channel] = await db
        .select({
          id: tvChannels.id,
          isActive: tvChannels.isActive,
          isPublic: tvChannels.isPublic,
          ownerUserId: tvChannels.ownerUserId,
        })
        .from(tvChannels)
        .where(eq(tvChannels.id, channelId));
  
      if (!channel || !channel.isActive) {
        return res.status(404).json({ error: "Channel not found" });
      }
      // Schedule metadata also needs the visibility gate — otherwise a
      // guessed id reveals when a private channel is programmed.
      const scheduleViewer = (req as any).user as AuthUser | undefined;
      const scheduleViewerIsStaff = scheduleViewer
        ? await isStaffRole(scheduleViewer.role)
        : false;
      if (!canViewChannel(channel, scheduleViewer ?? null, { isStaff: scheduleViewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found" });
      }
  
      const rows = await db
        .select({
          id: tvScheduleEntries.id,
          channelId: tvScheduleEntries.channelId,
          playlistId: tvScheduleEntries.playlistId,
          label: tvScheduleEntries.label,
          startMinuteOfDay: tvScheduleEntries.startMinuteOfDay,
          endMinuteOfDay: tvScheduleEntries.endMinuteOfDay,
          sortOrder: tvScheduleEntries.sortOrder,
          createdAt: tvScheduleEntries.createdAt,
          playlistName: tvPlaylists.name,
        })
        .from(tvScheduleEntries)
        .leftJoin(tvPlaylists, eq(tvScheduleEntries.playlistId, tvPlaylists.id))
        .where(
          and(
            eq(tvScheduleEntries.channelId, channelId),
            sql`${tvScheduleEntries.playlistId} IS NOT NULL`
          )
        )
        .orderBy(asc(tvScheduleEntries.startMinuteOfDay), asc(tvScheduleEntries.sortOrder));
  
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
  
      const playlistId = Number(req.body?.playlistId);
      if (!Number.isInteger(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "playlistId is required" });
      }
  
      const [playlist] = await db
        .select({ id: tvPlaylists.id, channelId: tvPlaylists.channelId })
        .from(tvPlaylists)
        .where(eq(tvPlaylists.id, playlistId));
      if (!playlist || playlist.channelId !== channelId) {
        return res.status(404).json({ error: "Playlist not found or doesn't belong to this channel" });
      }
  
      const startMinute = Math.floor(Number(req.body?.startMinuteOfDay ?? -1));
      const endMinute = Math.floor(Number(req.body?.endMinuteOfDay ?? -1));
      if (startMinute < 0 || startMinute >= 1440 || endMinute < 0 || endMinute > 1440) {
        return res.status(400).json({ error: "startMinuteOfDay (0–1439) and endMinuteOfDay (1–1440) are required" });
      }
      if (endMinute <= startMinute) {
        return res.status(400).json({ error: "endMinuteOfDay must be after startMinuteOfDay" });
      }
  
      const overlaps = await db
        .select({ id: tvScheduleEntries.id })
        .from(tvScheduleEntries)
        .where(
          and(
            eq(tvScheduleEntries.channelId, channelId),
            sql`${tvScheduleEntries.playlistId} IS NOT NULL`,
            sql`${tvScheduleEntries.startMinuteOfDay} < ${endMinute}`,
            sql`${tvScheduleEntries.endMinuteOfDay} > ${startMinute}`
          )
        )
        .limit(1);
  
      if (overlaps.length > 0) {
        return res.status(409).json({ error: "Time slot overlaps with an existing schedule entry" });
      }
  
      const label = String(req.body?.label || "").trim().slice(0, 120) || null;
  
      const [entry] = await db
        .insert(tvScheduleEntries)
        .values({
          channelId,
          playlistId,
          label,
          startMinuteOfDay: startMinute,
          endMinuteOfDay: endMinute,
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
        .where(eq(tvChannels.slug, slug));
  
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      const slugViewer = (req as any).user as AuthUser | undefined;
      const slugViewerIsStaff = slugViewer ? await isStaffRole(slugViewer.role) : false;
      if (!canViewChannel(channel, slugViewer ?? null, { isStaff: slugViewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found" });
      }
  
      const nowMs = Date.now();
  
      const scheduleEntries = await db
        .select({
          id: tvScheduleEntries.id,
          mediaItemId: tvScheduleEntries.mediaItemId,
          startsAt: tvScheduleEntries.startsAt,
          endsAt: tvScheduleEntries.endsAt,
          sortOrder: tvScheduleEntries.sortOrder,
          mediaTitle: userMediaLibrary.title,
          mediaSourceUrl: userMediaLibrary.sourceUrl,
          mediaPlaybackUrl: userMediaLibrary.playbackUrl,
          mediaMimeType: userMediaLibrary.mimeType,
          mediaPosterUrl: userMediaLibrary.posterUrl,
          mediaDuration: userMediaLibrary.durationSeconds,
          mediaSourceType: userMediaLibrary.sourceType,
        })
        .from(tvScheduleEntries)
        .innerJoin(userMediaLibrary, eq(tvScheduleEntries.mediaItemId, userMediaLibrary.id))
        .where(
          and(
            eq(tvScheduleEntries.channelId, channel.id),
            sql`${tvScheduleEntries.endsAt} > NOW()`,
            eq(userMediaLibrary.status, "ready")
          )
        )
        .orderBy(asc(tvScheduleEntries.startsAt), asc(tvScheduleEntries.sortOrder))
        .limit(10);
  
      const now = new Date(nowMs);
      const currentEntry = scheduleEntries.find(
        (e) => e.startsAt && e.endsAt && new Date(e.startsAt) <= now && new Date(e.endsAt) > now
      );
      const upcoming = scheduleEntries.filter(
        (e) => e.startsAt && new Date(e.startsAt) > now
      ).slice(0, 5);
  
      if (currentEntry) {
        const playbackSource = resolveTvChannelPlaybackSource({
          channelId: channel.id,
          mediaItemId: currentEntry.mediaItemId,
          sourceType: currentEntry.mediaSourceType,
          sourceUri: currentEntry.mediaSourceUrl,
          playbackUrl: currentEntry.mediaPlaybackUrl,
        });
        const sourceUrl = normalizeMediaUri(playbackSource) || playbackSource;
        const cacheUrl = resolveCacheUrl(sourceUrl);
        const elapsedSec = currentEntry.startsAt ? Math.floor((nowMs - new Date(currentEntry.startsAt).getTime()) / 1000) : 0;
  
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
          mediaItemId: tvChannelVideos.mediaItemId,
          title: tvChannelVideos.title,
          mimeType: tvChannelVideos.mimeType,
          sourceUri: tvChannelVideos.sourceUri,
          mediaSourceType: userMediaLibrary.sourceType,
          mediaPlaybackUrl: userMediaLibrary.playbackUrl,
          thumbnailUri: tvChannelVideos.thumbnailUri,
        })
        .from(tvPlaylistItems)
        .innerJoin(tvChannelVideos, eq(tvPlaylistItems.videoId, tvChannelVideos.id))
        .leftJoin(userMediaLibrary, eq(tvChannelVideos.mediaItemId, userMediaLibrary.id))
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
  
      const queue = playlistRows.map((row, index) => {
        const playbackSource = resolveTvChannelPlaybackSource({
          channelId: channel.id,
          mediaItemId: row.mediaItemId,
          sourceType: row.mediaSourceType,
          sourceUri: row.sourceUri,
          playbackUrl: row.mediaPlaybackUrl,
        });
        const sourceUri = normalizeMediaUri(playbackSource) || playbackSource;
        const cacheUrl = resolveCacheUrl(sourceUri);
        return {
          queueIndex: index,
          playlistIndex: index,
          itemId: row.itemId,
          videoId: row.videoId,
          title: row.title || `Video ${row.videoId}`,
          mimeType: row.mimeType,
          thumbnailUri: row.thumbnailUri,
          sourceUri,
          cacheUrl,
          durationSeconds: Math.max(1, Number(row.durationSeconds || 1)),
          offsetSeconds: 0,
          kind: row.mimeType === "image/gif" ? "gif" : "video",
        };
      });
      const broadcast = resolveTvBroadcastQueue(queue, nowMs);
  
      res.json({
        channel,
        mode: "playlist",
        current: broadcast.current,
        upcoming,
        offline: false,
      });
    } catch (err) {
      console.error("[tv] failed to resolve slug current:", err);
      res.status(500).json({ error: "Failed to resolve channel" });
    }
  });
}
