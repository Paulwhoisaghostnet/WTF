import type { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylistItems,
  tvScheduleEntries,
  userMediaLibrary,
  users,
} from "@shared/schema";
import { serveStoredMediaFile } from "../../lib/storage/media-file-serve";
import { resolveTvBroadcastQueue } from "../../lib/tv-broadcast";
import { daypartForMs } from "./daypart";
import {
  buildTvStreamSnapshot,
  buildTvStreamSnapshotCacheKey,
  loadTvStreamSnapshotRevision,
  streamShuffleSeed,
  tvStreamSnapshotCache,
} from "./stream-snapshot";
import { maybeAutoRefreshWtfChannel } from "./wtf-refresh";
import { videoIdsCurrentlyBlacklisted } from "./telemetry";
import {
  canViewChannel,
  isStaffRole,
  type TvAuthUser as AuthUser,
} from "./channel-service";
import { resolveTvPlaylistForChannel } from "./playlist-selection";

export function registerTvPlaybackRoutes(router: Router): void {
  router.get("/api/tv/channels/:channelId/media/:mediaItemId/file", async (req, res) => {
    try {
      const channelId = Number(req.params.channelId);
      const mediaItemId = Number(req.params.mediaItemId);
      if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: "Invalid channel id" });
      }
      if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
        return res.status(400).json({ error: "Invalid media item id" });
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
      if (!channel) return res.status(404).json({ error: "Channel not found" });
  
      const viewer = (req as any).user as AuthUser | undefined;
      const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
      if (!canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found" });
      }
  
      const [playlistBindings, scheduleBindings] = await Promise.all([
        db
          .select({ id: tvChannelVideos.id })
          .from(tvChannelVideos)
          .where(
            and(
              eq(tvChannelVideos.channelId, channelId),
              eq(tvChannelVideos.mediaItemId, mediaItemId)
            )
          )
          .limit(1),
        db
          .select({ id: tvScheduleEntries.id })
          .from(tvScheduleEntries)
          .where(
            and(
              eq(tvScheduleEntries.channelId, channelId),
              eq(tvScheduleEntries.mediaItemId, mediaItemId)
            )
          )
          .limit(1),
      ]);
  
      if (playlistBindings.length === 0 && scheduleBindings.length === 0) {
        return res.status(404).json({ error: "Media not found on channel" });
      }
  
      const [item] = await db
        .select({
          id: userMediaLibrary.id,
          mimeType: userMediaLibrary.mimeType,
          sourceUrl: userMediaLibrary.sourceUrl,
          fileData: userMediaLibrary.fileData,
          sourceType: userMediaLibrary.sourceType,
          objectStorageBucket: userMediaLibrary.objectStorageBucket,
          objectStorageKey: userMediaLibrary.objectStorageKey,
          safeFilename: userMediaLibrary.safeFilename,
          hotCachePath: userMediaLibrary.hotCachePath,
        })
        .from(userMediaLibrary)
        .where(and(eq(userMediaLibrary.id, mediaItemId), eq(userMediaLibrary.status, "ready")));
  
      if (!item || item.sourceType !== "upload") {
        return res.status(404).json({ error: "File not found" });
      }
  
      const served = await serveStoredMediaFile(req, res, item);
      if (!served) {
        res.status(404).json({ error: "File not found" });
      }
    } catch (err) {
      console.error("[tv] failed to serve channel media:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to serve media" });
      }
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
          logoUrl: tvChannels.logoUrl,
          bannerUrl: tvChannels.bannerUrl,
          isPublic: tvChannels.isPublic,
          isActive: tvChannels.isActive,
          dialNumber: tvChannels.dialNumber,
          videosPerBumper: tvChannels.videosPerBumper,
          updatedAt: tvChannels.updatedAt,
          ownerUsername: users.username,
          ownerDisplayName: users.displayName,
        })
        .from(tvChannels)
        .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
        .where(eq(tvChannels.id, channelId));
  
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      // Visibility gate: private channels are owner/staff only even when
      // active.  Returning 404 (not 403) so callers can't confirm the
      // existence of a private channel by guessing numeric ids.
      const viewer = (req as any).user as AuthUser | undefined;
      const viewerIsStaff = viewer ? await isStaffRole(viewer.role) : false;
      if (!canViewChannel(channel, viewer ?? null, { isStaff: viewerIsStaff })) {
        return res.status(404).json({ error: "Channel not found" });
      }
  
      await maybeAutoRefreshWtfChannel(channelId);
  
      const playlistSelection = await resolveTvPlaylistForChannel({ channelId, nowMs });
      const activePlaylist = playlistSelection.playlist;
      const scheduleLabel = playlistSelection.scheduleLabel;
  
      const playlistId = activePlaylist?.id ?? 0;
      const shuffleSeed = streamShuffleSeed(channelId, playlistId, nowMs);
      const blacklistedVideoIds = videoIdsCurrentlyBlacklisted();
      const blacklistSignature = Array.from(blacklistedVideoIds)
        .sort((a, b) => a - b)
        .join(",");
      const revision = await loadTvStreamSnapshotRevision({
        ownerUserId: channel.ownerUserId,
        activePlaylistId: activePlaylist?.id ?? null,
        channelUpdatedAt: channel.updatedAt,
        videosPerBumper: channel.videosPerBumper,
      });
      const cacheKey = buildTvStreamSnapshotCacheKey({
        channelId,
        activePlaylistId: activePlaylist?.id ?? null,
        shuffleSeed,
        revision,
        blacklistSignature,
      });
      const { value: snapshot, status: cacheStatus } = await tvStreamSnapshotCache.getOrLoad(
        cacheKey,
        () =>
          buildTvStreamSnapshot({
            channelId,
            ownerUserId: channel.ownerUserId,
            ownerUsername: channel.ownerUsername,
            videosPerBumper: channel.videosPerBumper,
            activePlaylist,
            nowMs,
            blacklistedVideoIds,
          })
      );
  
      const daypart = daypartForMs(nowMs);
      const baseCadence = Math.max(0, Math.min(20, Number(channel.videosPerBumper ?? 4)));
      const cadence =
        baseCadence === 0
          ? 0
          : Math.max(1, Math.min(20, Math.round(baseCadence * daypart.cadenceMultiplier)));
  
      const broadcast = resolveTvBroadcastQueue(snapshot.queue, nowMs);
      const broadcastQueue = broadcast.queue.map((item, index) => ({
        ...item,
        queueIndex: index,
      }));
  
      res.setHeader("X-WTF-TV-Stream-Cache", cacheStatus.toUpperCase());
      res.json({
        channel,
        playlist: activePlaylist
          ? {
              id: activePlaylist.id,
              name: activePlaylist.name,
              transitionSeconds: activePlaylist.transitionSeconds,
            }
          : null,
        scheduleLabel,
        generatedAt: new Date(nowMs).toISOString(),
        shuffleSeed,
        videosPerBumper: cadence,
        baseCadence,
        daypart: {
          name: daypart.name,
          displayName: daypart.displayName,
          preferredCategory: daypart.preferredCategory,
          cadenceMultiplier: daypart.cadenceMultiplier,
        },
        ...snapshot,
        queue: broadcastQueue,
        current: broadcast.current
          ? {
              ...broadcast.current,
              queueIndex: 0,
            }
          : null,
        loopDurationSeconds: broadcast.loopDurationSeconds,
      });
    } catch (err) {
      console.error("[tv] failed to build stream queue:", err);
      res.status(500).json({ error: "Failed to build stream queue" });
    }
  });
}
