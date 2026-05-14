import type { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { isAuthenticated } from "../../auth/passport";
import { tvChannels, tvChannelVideos, tvPlaylistItems, tvPlaylists } from "@shared/schema";
import { canEditTvChannelPolicy } from "../../lib/tv-policy";
import { warmChannelAsync } from "./cache-runtime";
import {
  ensureChannelEditable,
  isUniqueConstraintError,
  lockTvChannelRow,
  type TvAuthUser as AuthUser,
} from "./channel-service";

function duplicateIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return Array.from(duplicates).sort((a, b) => a - b);
}

export function registerTvPlaylistRoutes(router: Router): void {
  router.post("/api/tv/channels/:channelId/playlists", isAuthenticated, async (req, res) => {
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
  
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Playlist name is required" });
      const transitionSeconds = Math.max(
        0,
        Math.min(10, Number(req.body?.transitionSeconds ?? 1))
      );
      const setActive = Boolean(req.body?.isActive);
  
      const [playlist] = await db.transaction(async (tx) => {
        await lockTvChannelRow(tx, channelId);
  
        if (setActive) {
          await tx
            .update(tvPlaylists)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(tvPlaylists.channelId, channelId));
        }
  
        return tx
          .insert(tvPlaylists)
          .values({
            channelId,
            name,
            transitionSeconds,
            isActive: setActive,
          })
          .returning();
      });
  
      res.status(201).json(playlist);
    } catch (err) {
      if (isUniqueConstraintError(err, "tv_playlist_one_active_per_channel_idx")) {
        return res.status(409).json({ error: "Another active playlist update won the race. Retry." });
      }
      console.error("[tv] failed to create playlist:", err);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });
  
  router.put("/api/tv/playlists/:playlistId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const playlistId = Number(req.params.playlistId);
      if (!Number.isInteger(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist id" });
      }
  
      const [playlist] = await db
        .select()
        .from(tvPlaylists)
        .where(eq(tvPlaylists.id, playlistId));
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  
      const editable = await ensureChannelEditable(playlist.channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }
  
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body?.name === "string") {
        const name = req.body.name.trim();
        if (!name) return res.status(400).json({ error: "Playlist name cannot be empty" });
        updates.name = name;
      }
      if (typeof req.body?.transitionSeconds === "number") {
        updates.transitionSeconds = Math.max(0, Math.min(10, req.body.transitionSeconds));
      }
      if (req.body?.isActive === false) {
        return res.status(400).json({
          error: "A channel must keep one active playlist. Promote another playlist instead.",
        });
      }
      const [updated] = await db.transaction(async (tx) => {
        await lockTvChannelRow(tx, playlist.channelId);
  
        if (req.body?.isActive === true) {
          await tx
            .update(tvPlaylists)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(tvPlaylists.channelId, playlist.channelId));
          updates.isActive = true;
        }
  
        return tx
          .update(tvPlaylists)
          .set(updates)
          .where(eq(tvPlaylists.id, playlistId))
          .returning();
      });
  
      res.json(updated);
    } catch (err) {
      if (isUniqueConstraintError(err, "tv_playlist_one_active_per_channel_idx")) {
        return res.status(409).json({ error: "Another active playlist update won the race. Retry." });
      }
      console.error("[tv] failed to update playlist:", err);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });
  
  router.put("/api/tv/playlists/:playlistId/items", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const playlistId = Number(req.params.playlistId);
      if (!Number.isInteger(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist id" });
      }
  
      const [playlist] = await db
        .select()
        .from(tvPlaylists)
        .where(eq(tvPlaylists.id, playlistId));
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  
      const editable = await ensureChannelEditable(playlist.channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }
  
      const items = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!items) return res.status(400).json({ error: "items must be an array" });
      if (items.length > 500) return res.status(400).json({ error: "Playlist is too large" });
  
      const videoIds = items
        .map((item: any) => Number(item.videoId))
        .filter((id: number) => Number.isInteger(id) && id > 0);
      if (videoIds.length !== items.length) {
        return res.status(400).json({ error: "Each item requires a valid videoId" });
      }
      const duplicates = duplicateIds(videoIds);
      if (duplicates.length > 0) {
        return res.status(400).json({
          error: `Playlist cannot contain duplicate video ids: ${duplicates.join(", ")}`,
        });
      }
  
      if (videoIds.length === 0) {
        await db.transaction(async (tx) => {
          await lockTvChannelRow(tx, playlist.channelId);
          await tx.delete(tvPlaylistItems).where(eq(tvPlaylistItems.playlistId, playlistId));
        });
        return res.json({ ok: true, items: [] });
      }
  
      const videos = await db
        .select({ id: tvChannelVideos.id })
        .from(tvChannelVideos)
        .where(
          and(
            eq(tvChannelVideos.channelId, playlist.channelId),
            inArray(tvChannelVideos.id, videoIds)
          )
        );
      const videoSet = new Set(videos.map((v) => v.id));
      for (const id of videoIds) {
        if (!videoSet.has(id)) {
          return res.status(400).json({ error: `Video ${id} is not in this channel` });
        }
      }
  
      const rows = items.map((item: any, index: number) => ({
        playlistId,
        videoId: Number(item.videoId),
        sortOrder:
          typeof item.sortOrder === "number"
            ? Math.max(0, Math.floor(item.sortOrder))
            : index,
        durationSeconds: Math.max(
          1,
          Math.min(24 * 60 * 60, Math.floor(Number(item.durationSeconds) || 30))
        ),
        updatedAt: new Date(),
      }));
  
      const inserted = await db.transaction(async (tx) => {
        await lockTvChannelRow(tx, playlist.channelId);
        await tx
          .delete(tvPlaylistItems)
          .where(eq(tvPlaylistItems.playlistId, playlistId));
        return tx.insert(tvPlaylistItems).values(rows).returning();
      });
      // A playlist replace may have just introduced brand-new items that
      // aren't in the disk cache yet.  Warm the whole channel in the
      // background so the first viewer after the save still hits hot
      // cache instead of paying the IPFS cold-fetch penalty.
      warmChannelAsync(playlist.channelId);
      res.json({ ok: true, items: inserted });
    } catch (err) {
      console.error("[tv] failed to update playlist items:", err);
      res.status(500).json({ error: "Failed to update playlist items" });
    }
  });
  
  // Duration mutation is now owner/wtf-admin-only.  Earlier this endpoint
  // was unauthenticated so the client could opportunistically persist
  // metadata-probe results — but that also let any anonymous caller
  // rewrite playlist-item durations (slot timing) by id.  Server-side
  // duration probing (see `probePlaylistItemAsync` / `probeMediaDuration`)
  // is the authoritative path now; this endpoint stays for explicit
  // creator overrides.
  router.patch(
    "/api/tv/playlist-items/:itemId/duration",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as AuthUser;
        const itemId = Number(req.params.itemId);
        const durationSeconds = Math.max(
          1,
          Math.min(86400, Math.round(Number(req.body?.durationSeconds)))
        );
        if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(durationSeconds)) {
          return res.status(400).json({ error: "Invalid params" });
        }
  
        const [owned] = await db
          .select({
            itemId: tvPlaylistItems.id,
            channelId: tvPlaylists.channelId,
            ownerUserId: tvChannels.ownerUserId,
          })
          .from(tvPlaylistItems)
          .innerJoin(tvPlaylists, eq(tvPlaylists.id, tvPlaylistItems.playlistId))
          .innerJoin(tvChannels, eq(tvChannels.id, tvPlaylists.channelId))
          .where(eq(tvPlaylistItems.id, itemId));
  
        if (!owned) {
          return res.status(404).json({ error: "Playlist item not found" });
        }
  
        const canEdit = canEditTvChannelPolicy(owned, user);
        if (!canEdit) {
          return res.status(403).json({ error: "Not authorized" });
        }
  
        await db
          .update(tvPlaylistItems)
          .set({ durationSeconds, updatedAt: new Date() })
          .where(eq(tvPlaylistItems.id, itemId));
        res.json({ ok: true });
      } catch (err) {
        console.error("[tv] failed to update item duration:", err);
        res.status(500).json({ error: "Failed to update duration" });
      }
    }
  );
}
