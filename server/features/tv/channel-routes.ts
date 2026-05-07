import type { Router } from "express";
import { createHash } from "crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { type UserRole } from "@shared/types";
import { db } from "../../db";
import { isAuthenticated } from "../../auth/passport";
import { hasPermission } from "../../lib/permissions";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylists,
  tvPlaylistItems,
  userMediaLibrary,
  walletHoldings,
  tokenMetadata,
  users,
} from "@shared/schema";
import {
  isPlayableMimeType,
  guessMimeTypeFromUri,
} from "../../lib/media-utils";
import {
  buildTvChannelMediaPath,
  resolveTvChannelPlaybackSource,
} from "../../lib/tv-policy";
import {
  paginationMeta,
  parseBoundedQueryInt,
} from "./pagination";
import { normalizeMediaUri } from "./media-urls";
import {
  allocateNextDialNumber,
  ensureChannelEditable,
  findExistingChannelVideo,
  isStaffRole,
  isUniqueConstraintError,
  slugify,
  uniqueChannelSlug,
  type TvAuthUser as AuthUser,
} from "./channel-service";
import {
  DEFAULT_GIF_DURATION_SEC,
  DEFAULT_VIDEO_DURATION_SEC,
  MAX_STORED_DURATION_SEC,
  prefetchMediaAsync,
  probePlaylistItemAsync,
} from "./cache-runtime";
import {
  compareTokenIds,
  extractPlayableAssetFromTokenMetadata,
  hydrateChannelVideoMetadata,
  resolveTokenMetaFields,
} from "./media-metadata";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../../lib/tezos-identity";

export function registerTvChannelRoutes(router: Router): void {
  const lastSeenTv = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;
  
  const TV_MAX_STAFF_CHANNELS = 3;
  const TV_MAX_USER_CHANNELS = 1;
  const TV_CHANNEL_LIST_DEFAULT_LIMIT = 100;
  const TV_CHANNEL_LIST_MAX_LIMIT = 200;
  const TV_CHANNEL_DETAIL_DEFAULT_VIDEO_LIMIT = 500;
  const TV_CHANNEL_DETAIL_MAX_VIDEO_LIMIT = 1000;
  const TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_LIMIT = 100;
  const TV_CHANNEL_DETAIL_MAX_PLAYLIST_LIMIT = 200;
  const TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_ITEM_LIMIT = 2000;
  const TV_CHANNEL_DETAIL_MAX_PLAYLIST_ITEM_LIMIT = 5000;
  // TV playback is broadcast-style again: the server resolves the
  // currently airing queue item and offset from wall clock, then each
  // viewer joins that feed at the same point.  The client is only
  // responsible for rendering what the server says is on-air, not for
  // inventing its own per-viewer playlist cursor.
  
  router.get("/api/tv/channels", async (req, res) => {
    try {
      const user = (req.user as AuthUser | undefined) || null;
      const mine = String(req.query.mine || "") === "1";
      const includeMeta = String(req.query.includeMeta || "") === "1";
      const limit = parseBoundedQueryInt(
        req.query.limit,
        TV_CHANNEL_LIST_DEFAULT_LIMIT,
        { min: 1, max: TV_CHANNEL_LIST_MAX_LIMIT }
      );
      const offset = parseBoundedQueryInt(req.query.offset, 0, {
        min: 0,
        max: 100_000,
      });
  
      const whereParts = [eq(tvChannels.isActive, true)];
      if (mine) {
        if (!user) return res.status(401).json({ error: "Not authenticated" });
        whereParts.push(eq(tvChannels.ownerUserId, user.id));
      } else {
        whereParts.push(eq(tvChannels.isPublic, true));
      }
  
      const [countRow, rows] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tvChannels)
          .where(and(...whereParts))
          .then(([row]) => row ?? { count: 0 }),
        db
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
            sortOrder: tvChannels.sortOrder,
            dialNumber: tvChannels.dialNumber,
            videosPerBumper: tvChannels.videosPerBumper,
            createdAt: tvChannels.createdAt,
            updatedAt: tvChannels.updatedAt,
            ownerUsername: users.username,
            ownerDisplayName: users.displayName,
          })
          .from(tvChannels)
          .innerJoin(users, eq(tvChannels.ownerUserId, users.id))
          .where(and(...whereParts))
          // Ordered by the stable dial number first — so "root channel"
          // sits on dial 1, WTF TV on dial 3, the platform channel on 69,
          // and new channels append from 4+.  Legacy rows without a dial
          // yet fall back to sort_order / id so the list never jumps
          // around mid-boot while the backfill runs.
          .orderBy(
            sql`${tvChannels.dialNumber} IS NULL`,
            asc(tvChannels.dialNumber),
            asc(tvChannels.sortOrder),
            asc(tvChannels.id)
          )
          .limit(limit)
          .offset(offset),
      ]);
  
      const meta = paginationMeta(Number(countRow?.count || 0), limit, offset);
      res.setHeader("X-WTF-Total-Count", String(meta.total));
      res.setHeader("X-WTF-Limit", String(meta.limit));
      res.setHeader("X-WTF-Offset", String(meta.offset));
      res.setHeader("X-WTF-Has-More", meta.hasMore ? "1" : "0");
  
      if (includeMeta) {
        return res.json({ items: rows, pagination: meta });
      }
      res.json(rows);
    } catch (err) {
      console.error("[tv] failed to list channels:", err);
      res.status(500).json({ error: "Failed to load channels" });
    }
  });
  
  router.get("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const channelId = Number(req.params.channelId);
      const videoLimit = parseBoundedQueryInt(
        req.query.videoLimit,
        TV_CHANNEL_DETAIL_DEFAULT_VIDEO_LIMIT,
        { min: 1, max: TV_CHANNEL_DETAIL_MAX_VIDEO_LIMIT }
      );
      const videoOffset = parseBoundedQueryInt(req.query.videoOffset, 0, {
        min: 0,
        max: 100_000,
      });
      const playlistLimit = parseBoundedQueryInt(
        req.query.playlistLimit,
        TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_LIMIT,
        { min: 1, max: TV_CHANNEL_DETAIL_MAX_PLAYLIST_LIMIT }
      );
      const playlistOffset = parseBoundedQueryInt(req.query.playlistOffset, 0, {
        min: 0,
        max: 100_000,
      });
      const playlistItemLimit = parseBoundedQueryInt(
        req.query.playlistItemLimit,
        TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_ITEM_LIMIT,
        { min: 1, max: TV_CHANNEL_DETAIL_MAX_PLAYLIST_ITEM_LIMIT }
      );
      const playlistItemOffset = parseBoundedQueryInt(req.query.playlistItemOffset, 0, {
        min: 0,
        max: 100_000,
      });
      if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: "Invalid channel id" });
      }
  
      const editable = await ensureChannelEditable(channelId, user);
      if (editable.error || !editable.channel) {
        return res.status(editable.status).json({ error: editable.error });
      }
      const channel = editable.channel;
      const canManage = true;
  
      const [videoCountRow, playlistCountRow, videos, playlists] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tvChannelVideos)
          .where(eq(tvChannelVideos.channelId, channelId))
          .then(([row]) => row ?? { count: 0 }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tvPlaylists)
          .where(eq(tvPlaylists.channelId, channelId))
          .then(([row]) => row ?? { count: 0 }),
        db
          .select()
          .from(tvChannelVideos)
          .where(eq(tvChannelVideos.channelId, channelId))
          .orderBy(desc(tvChannelVideos.updatedAt))
          .limit(videoLimit)
          .offset(videoOffset),
        db
          .select()
          .from(tvPlaylists)
          .where(eq(tvPlaylists.channelId, channelId))
          .orderBy(desc(tvPlaylists.isActive), asc(tvPlaylists.name))
          .limit(playlistLimit)
          .offset(playlistOffset),
      ]);
  
      const playlistIds = playlists.map((p) => p.id);
      const [playlistItems, playlistItemsCountRow] = await Promise.all([
        playlistIds.length === 0
          ? []
          : db
              .select()
              .from(tvPlaylistItems)
              .where(inArray(tvPlaylistItems.playlistId, playlistIds))
              .orderBy(
                asc(tvPlaylistItems.playlistId),
                asc(tvPlaylistItems.sortOrder),
                asc(tvPlaylistItems.id)
              )
              .limit(playlistItemLimit)
              .offset(playlistItemOffset),
        playlistIds.length === 0
          ? [{ count: 0 }]
          : db
              .select({ count: sql<number>`count(*)::int` })
              .from(tvPlaylistItems)
              .where(inArray(tvPlaylistItems.playlistId, playlistIds))
              .then(([row]) => [row ?? { count: 0 }]),
      ]);
  
      const pagination = {
        videos: paginationMeta(Number(videoCountRow?.count || 0), videoLimit, videoOffset),
        playlists: paginationMeta(Number(playlistCountRow?.count || 0), playlistLimit, playlistOffset),
        playlistItems: {
          ...paginationMeta(
            Number((playlistItemsCountRow as Array<{ count: number }>)[0]?.count || 0),
            playlistItemLimit,
            playlistItemOffset
          ),
          scopePlaylistIds: playlistIds,
        },
      };
  
      res.json({
        channel,
        canManage,
        videos,
        playlists,
        playlistItems,
        pagination,
      });
    } catch (err) {
      console.error("[tv] failed to fetch channel detail:", err);
      res.status(500).json({ error: "Failed to load channel detail" });
    }
  });
  
  router.post("/api/tv/channels", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      if (!(await hasPermission(user.role, "create_tv_channel"))) {
        return res.status(403).json({ error: "Role cannot create TV channels" });
      }
  
      const staff = await isStaffRole(user.role);
      const maxChannels = staff ? TV_MAX_STAFF_CHANNELS : TV_MAX_USER_CHANNELS;
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tvChannels)
        .where(eq(tvChannels.ownerUserId, user.id));
      const channelCount = Number(countRow?.count || 0);
      if (channelCount >= maxChannels) {
        return res.status(400).json({
          error: `Channel limit reached for your role (${maxChannels})`,
        });
      }
  
      const title = String(req.body?.title || "").trim();
      const description = String(req.body?.description || "").trim();
      if (!title) return res.status(400).json({ error: "Title is required" });
  
      const slugInput = String(req.body?.slug || "").trim();
      const generatedSlug = await uniqueChannelSlug(
        slugInput || `${user.username}-${title}`
      );
  
      const logoUrl = String(req.body?.logoUrl || "").trim() || null;
      const bannerUrl = String(req.body?.bannerUrl || "").trim() || null;
      const isPublic = req.body?.isPublic !== false;
  
      // Append to the end of this owner's channel list so an existing
      // channel never gets renumbered when a new one is created.
      // `sort_order` is scoped to the owner, matching the list query
      // which only shows a single owner's channels at a time.
      const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(${tvChannels.sortOrder}), 0)::int` })
        .from(tvChannels)
        .where(eq(tvChannels.ownerUserId, user.id));
      const nextSortOrder = Number(maxRow?.max || 0) + 1;
  
      // Allocate the lowest free dial number ≥ 4 — dials 1, 2, 3, 69 are
      // reserved for the pinned channels (opeculiar, yoeshi, WTF TV,
      // platform).  Even if those pins are not yet assigned, we skip
      // them here so a new user-created channel can't accidentally
      // squat the pinned dials.  The boot backfill later claims the
      // pins once the pinned users sign up / create their channels.
      const nextDial = await allocateNextDialNumber();
  
      const [channel] = await db
        .insert(tvChannels)
        .values({
          ownerUserId: user.id,
          title,
          description: description || null,
          slug: generatedSlug,
          logoUrl,
          bannerUrl,
          isPublic,
          isActive: true,
          sortOrder: nextSortOrder,
          dialNumber: nextDial,
        })
        .returning();
  
      const [playlist] = await db
        .insert(tvPlaylists)
        .values({
          channelId: channel.id,
          name: "Main Loop",
          isActive: true,
          transitionSeconds: 1,
        })
        .returning();
  
      res.status(201).json({ channel, playlist });
    } catch (err) {
      console.error("[tv] failed to create channel:", err);
      res.status(500).json({ error: "Failed to create channel" });
    }
  });
  
  router.put("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
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
  
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body?.title === "string") {
        const title = req.body.title.trim();
        if (!title) return res.status(400).json({ error: "Title cannot be empty" });
        updates.title = title;
      }
      if (typeof req.body?.description === "string") {
        updates.description = req.body.description.trim() || null;
      }
      if (typeof req.body?.isActive === "boolean") {
        updates.isActive = req.body.isActive;
      }
      if (typeof req.body?.slug === "string") {
        const clean = slugify(req.body.slug.trim());
        if (!clean) return res.status(400).json({ error: "Invalid slug" });
        if (clean !== editable.channel.slug) {
          updates.slug = await uniqueChannelSlug(clean);
        }
      }
      if (typeof req.body?.logoUrl === "string") {
        updates.logoUrl = req.body.logoUrl.trim() || null;
      }
      if (typeof req.body?.bannerUrl === "string") {
        updates.bannerUrl = req.body.bannerUrl.trim() || null;
      }
      if (typeof req.body?.isPublic === "boolean") {
        updates.isPublic = req.body.isPublic;
      }
      // Channel owner picks how often bumpers interrupt the stream.
      // 0 disables bumpers.  The server clamps the value into a sane
      // range ([0, 20]) so an exuberant edit can't starve the queue.
      if (req.body?.videosPerBumper !== undefined) {
        const n = Number(req.body.videosPerBumper);
        if (!Number.isFinite(n) || n < 0 || n > 20) {
          return res.status(400).json({
            error: "videosPerBumper must be between 0 and 20",
          });
        }
        updates.videosPerBumper = Math.floor(n);
      }
  
      const [updated] = await db
        .update(tvChannels)
        .set(updates)
        .where(eq(tvChannels.id, channelId))
        .returning();
  
      res.json(updated);
    } catch (err) {
      console.error("[tv] failed to update channel:", err);
      res.status(500).json({ error: "Failed to update channel" });
    }
  });
  
  router.delete("/api/tv/channels/:channelId", isAuthenticated, async (req, res) => {
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
  
      await db.delete(tvChannels).where(eq(tvChannels.id, channelId));
      res.json({ ok: true });
    } catch (err) {
      console.error("[tv] failed to delete channel:", err);
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });
  
  router.get("/api/tv/me/playable-tokens", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const limit = Math.max(1, Math.min(Number(req.query.limit || 500), 1000));
      const q = String(req.query.q || "").trim().toLowerCase();
      const sortInput = String(req.query.sort || "recent").trim().toLowerCase();
      const sortMode: "recent" | "name" | "contract" | "mime" =
        sortInput === "name" ||
        sortInput === "contract" ||
        sortInput === "mime"
          ? sortInput
          : "recent";
  
      const rows = await db
        .select({
          id: walletHoldings.id,
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          tokenName: tokenMetadata.name,
          tokenThumbnail: tokenMetadata.thumbnail,
          metadata: tokenMetadata.raw,
          walletAddress: walletHoldings.walletAddress,
          creatorAddress: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
          lastSeenAt: lastSeenTv,
        })
        .from(walletHoldings)
        .leftJoin(
          tokenMetadata,
          and(
            eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
            eq(tokenMetadata.tokenId, walletHoldings.tokenId)
          )
        )
        .where(
          and(
            eq(walletHoldings.userId, user.id),
            sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
          )
        )
        .orderBy(desc(lastSeenTv))
        .limit(5000);
  
      const deduped = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = `${row.tokenContract}:${row.tokenId}`;
        if (!deduped.has(key)) deduped.set(key, row);
      }
  
      const playable = Array.from(deduped.values())
        .map((row) => {
          const asset = extractPlayableAssetFromTokenMetadata(
            (row.metadata as any) || null,
            row.tokenName || null
          );
          if (!asset) return null;
          const normalizedThumb = normalizeMediaUri(String(row.tokenThumbnail || ""));
          return {
            id: row.id,
            tokenContract: row.tokenContract,
            tokenId: row.tokenId,
            tokenName: row.tokenName || `#${row.tokenId}`,
            tokenThumbnail: normalizedThumb || asset.thumbnailUri,
            walletAddress: row.walletAddress,
            creatorAddress: row.creatorAddress || null,
            mimeType: asset.mimeType,
            sourceUri: asset.sourceUri,
            title: asset.title,
            metadata: row.metadata,
            lastSeenAt: (() => {
              const ls = row.lastSeenAt as string | Date | null | undefined;
              if (ls == null) return null;
              const d = ls instanceof Date ? ls : new Date(String(ls));
              return Number.isNaN(d.getTime()) ? null : d.toISOString();
            })(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const tokenIdentities = await resolveTokenDisplayIdentities(
        playable.map((row) => ({
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.tokenName,
          metadata: row.metadata,
          creatorAddress: row.creatorAddress,
        }))
      );
      const enrichedPlayable = playable.map((row) => {
        const identity = tokenIdentities.get(
          tokenIdentityKey(row.tokenContract, row.tokenId)
        );
        return {
          ...row,
          creatorName: identity?.creatorName ?? null,
          creatorAddress: identity?.creatorAddress ?? row.creatorAddress,
          collectionName: identity?.collectionName ?? null,
        };
      });
  
      const filtered = enrichedPlayable.filter((row) => {
        if (!q) return true;
        const meta = (row.metadata as any) || {};
        const creators = Array.isArray(meta.creators) ? meta.creators : [];
        const tags = Array.isArray(meta.tags) ? meta.tags : [];
        return (
          row.tokenName.toLowerCase().includes(q) ||
          row.tokenContract.toLowerCase().includes(q) ||
          row.tokenId.toLowerCase().includes(q) ||
          row.mimeType.toLowerCase().includes(q) ||
          (row.creatorName || "").toLowerCase().includes(q) ||
          (row.creatorAddress || "").toLowerCase().includes(q) ||
          (row.collectionName || "").toLowerCase().includes(q) ||
          creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
          tags.some((t: string) => String(t).toLowerCase().includes(q))
        );
      });
  
      filtered.sort((a, b) => {
        if (sortMode === "name") {
          return a.tokenName.localeCompare(b.tokenName, undefined, {
            sensitivity: "base",
          });
        }
        if (sortMode === "contract") {
          const contractOrder = a.tokenContract.localeCompare(b.tokenContract, undefined, {
            sensitivity: "base",
          });
          if (contractOrder !== 0) return contractOrder;
          return compareTokenIds(a.tokenId, b.tokenId);
        }
        if (sortMode === "mime") {
          const mimeOrder = a.mimeType.localeCompare(b.mimeType, undefined, {
            sensitivity: "base",
          });
          if (mimeOrder !== 0) return mimeOrder;
          return a.tokenName.localeCompare(b.tokenName, undefined, {
            sensitivity: "base",
          });
        }
        return (
          new Date(b.lastSeenAt || 0).getTime() -
          new Date(a.lastSeenAt || 0).getTime()
        );
      });
  
      res.json({ items: filtered.slice(0, limit), sort: sortMode });
    } catch (err) {
      console.error("[tv] failed to fetch playable tokens:", err);
      res.status(500).json({ error: "Failed to fetch playable tokens" });
    }
  });
  
  router.post("/api/tv/channels/:channelId/videos", isAuthenticated, async (req, res) => {
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
  
      const tokenContract = String(req.body?.tokenContract || "").trim();
      const tokenId = String(req.body?.tokenId || "").trim();
      const manualSourceUri = String(req.body?.sourceUri || "").trim();
      const manualMimeType = String(req.body?.mimeType || "").trim().toLowerCase();
      const manualTitle = String(req.body?.title || "").trim();
      const manualThumb = String(req.body?.thumbnailUri || "").trim();
      const mediaItemIdRaw = req.body?.mediaItemId;
      const mediaItemId =
        mediaItemIdRaw === undefined || mediaItemIdRaw === null
          ? null
          : Number(mediaItemIdRaw);
  
      let sourceUri = "";
      let mimeType = "";
      let title = "";
      let thumbnailUri = "";
      let metadata: any = null;
      let resolvedMediaItemId: number | null = null;
      let resolvedTokenContract: string | null = null;
      let resolvedTokenId: string | null = null;
      let mediaDurationSeconds: number | null = null;
      let mediaOwnerUsername: string | null = null;
  
      if (mediaItemId !== null) {
        if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
          return res.status(400).json({ error: "mediaItemId must be a positive integer" });
        }
        // Adding a library item directly — same owner guard the media
        // library itself enforces, so a user can't graft someone else's
        // uploads onto their channel.  Staff can still operate on
        // anyone's channel via ensureChannelEditable() above.
        const [libItem] = await db
          .select({
            id: userMediaLibrary.id,
            ownerUserId: userMediaLibrary.ownerUserId,
            title: userMediaLibrary.title,
            sourceType: userMediaLibrary.sourceType,
            sourceUrl: userMediaLibrary.sourceUrl,
            playbackUrl: userMediaLibrary.playbackUrl,
            posterUrl: userMediaLibrary.posterUrl,
            mimeType: userMediaLibrary.mimeType,
            metadata: userMediaLibrary.metadata,
            tokenContract: userMediaLibrary.tokenContract,
            tokenId: userMediaLibrary.tokenId,
            durationSeconds: userMediaLibrary.durationSeconds,
            ownerUsername: users.username,
          })
          .from(userMediaLibrary)
          .innerJoin(users, eq(userMediaLibrary.ownerUserId, users.id))
          .where(eq(userMediaLibrary.id, mediaItemId));
  
        if (!libItem) {
          return res.status(404).json({ error: "Media library item not found" });
        }
        const canUseLibraryItem =
          libItem.ownerUserId === user.id ||
          (await isStaffRole(user.role)) ||
          libItem.ownerUserId === editable.channel.ownerUserId;
        if (!canUseLibraryItem) {
          return res.status(403).json({
            error: "You can only add your own media-library items to a channel",
          });
        }
  
        // Upload-backed media stores a `disk://<filename>` pseudo-URL in
        // `sourceUrl`.  That is an internal token — the TV cache proxy
        // explicitly rejects any scheme that isn't public HTTP(S) — so
        // for uploads we route playback through the same-origin media
        // file endpoint instead.  Legacy rows that were inserted before
        // the upload route started stamping `playbackUrl` are handled
        // here by reading the id, not the stored string.
        let rawUri: string;
        if (
          libItem.sourceType === "upload" ||
          String(libItem.sourceUrl || "").startsWith("disk://")
        ) {
          rawUri = buildTvChannelMediaPath(channelId, libItem.id);
        } else {
          rawUri = libItem.playbackUrl || libItem.sourceUrl;
        }
        // Same-origin paths are already playable — only token/URL
        // sources need to go through the public-HTTP normalizer.
        const isSameOriginPath =
          typeof rawUri === "string" && rawUri.startsWith("/");
        const normalized = isSameOriginPath
          ? rawUri
          : (normalizeMediaUri(rawUri) || rawUri);
        if (!normalized) {
          return res.status(422).json({ error: "Media item has no playable URL" });
        }
        sourceUri = normalized;
        mimeType = libItem.mimeType;
        title = manualTitle || libItem.title || `Media ${libItem.id}`;
        thumbnailUri = manualThumb || libItem.posterUrl || "";
        metadata = await hydrateChannelVideoMetadata({
          tokenContract: libItem.tokenContract,
          tokenId: libItem.tokenId,
          metadata: libItem.metadata || null,
        });
        mediaOwnerUsername = libItem.ownerUsername || null;
        resolvedMediaItemId = libItem.id;
        resolvedTokenContract = libItem.tokenContract || `media:${libItem.id}`;
        resolvedTokenId = libItem.tokenId || String(libItem.id);
        mediaDurationSeconds = libItem.durationSeconds || null;
      } else if (tokenContract && tokenId) {
        const [owned] = await db
          .select({
            tokenContract: walletHoldings.tokenContract,
            tokenId: walletHoldings.tokenId,
            tokenName: tokenMetadata.name,
            tokenThumbnail: tokenMetadata.thumbnail,
            metadata: tokenMetadata.raw,
          })
          .from(walletHoldings)
          .leftJoin(
            tokenMetadata,
            and(
              eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
              eq(tokenMetadata.tokenId, walletHoldings.tokenId)
            )
          )
          .where(
            and(
              eq(walletHoldings.userId, user.id),
              eq(walletHoldings.tokenContract, tokenContract),
              eq(walletHoldings.tokenId, tokenId),
              sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
            )
          );
  
        if (!owned) {
          return res.status(400).json({
            error: "Token not found in your owned token index. Sync profile tokens first.",
          });
        }
  
        const asset = extractPlayableAssetFromTokenMetadata(
          (owned.metadata as any) || null,
          owned.tokenName || null
        );
        if (!asset) {
          return res.status(400).json({
            error: "Token metadata does not expose a playable video or gif asset",
          });
        }
  
        sourceUri = asset.sourceUri;
        mimeType = asset.mimeType;
        title = manualTitle || asset.title || owned.tokenName || `#${owned.tokenId}`;
        thumbnailUri = manualThumb || asset.thumbnailUri || owned.tokenThumbnail || "";
        metadata = owned.metadata;
        resolvedTokenContract = tokenContract;
        resolvedTokenId = tokenId;
  
        // When a user adds a token they own directly to a channel, mirror
        // the same token into their media library if it's not there yet.
        // This way the single delete button in MyVideos is *always* the
        // authoritative removal point, and the ON DELETE CASCADE chain
        // sweeps the channel video + playlist item when the media row
        // goes away.
        if (editable.channel.ownerUserId === user.id) {
          const [existingLib] = await db
            .select({ id: userMediaLibrary.id })
            .from(userMediaLibrary)
            .where(
              and(
                eq(userMediaLibrary.ownerUserId, user.id),
                eq(userMediaLibrary.tokenContract, tokenContract),
                eq(userMediaLibrary.tokenId, tokenId)
              )
            );
          if (existingLib) {
            resolvedMediaItemId = existingLib.id;
          } else {
            const [libCreated] = await db
              .insert(userMediaLibrary)
              .values({
                ownerUserId: user.id,
                title,
                sourceType: "ipfs",
                sourceUrl: sourceUri,
                playbackUrl: sourceUri,
                posterUrl: thumbnailUri || null,
                mimeType,
                tokenContract,
                tokenId,
                metadata,
                status: "ready",
              })
              .onConflictDoNothing()
              .returning({ id: userMediaLibrary.id });
            if (libCreated?.id) resolvedMediaItemId = libCreated.id;
          }
        }
      } else {
        const normalized = normalizeMediaUri(manualSourceUri);
        if (!normalized) {
          return res.status(400).json({ error: "A valid sourceUri is required" });
        }
        const resolvedMime = manualMimeType || guessMimeTypeFromUri(normalized);
        if (!isPlayableMimeType(resolvedMime)) {
          return res.status(400).json({ error: "Only video/* or image/gif are allowed" });
        }
        sourceUri = normalized;
        mimeType = resolvedMime;
        title = manualTitle || "Untitled TV Asset";
        thumbnailUri = manualThumb || "";
      }
  
      const effectiveTokenContract = resolvedTokenContract || "manual";
      const effectiveTokenId =
        resolvedTokenId || createHash("md5").update(sourceUri).digest("hex");
  
      const tokenMetaFields = await resolveTokenMetaFields(metadata, title, {
        tokenContract: effectiveTokenContract,
        tokenId: effectiveTokenId,
        uploaderUsername: mediaOwnerUsername,
      });
      const videoValues = {
        channelId,
        tokenContract: effectiveTokenContract,
        tokenId: effectiveTokenId,
        sourceUri,
        mimeType,
        title,
        thumbnailUri: thumbnailUri || null,
        metadata,
        mediaItemId: resolvedMediaItemId,
        creatorName: tokenMetaFields.creatorName,
        creatorAddress: tokenMetaFields.creatorAddress,
        collectionName: tokenMetaFields.collectionName,
        mintedAt: tokenMetaFields.mintedAt,
      } as const;
      const videoUpdateValues = {
        tokenContract: effectiveTokenContract,
        tokenId: effectiveTokenId,
        sourceUri,
        mimeType,
        title,
        thumbnailUri: thumbnailUri || null,
        metadata,
        mediaItemId: resolvedMediaItemId,
        creatorName: tokenMetaFields.creatorName,
        creatorAddress: tokenMetaFields.creatorAddress,
        collectionName: tokenMetaFields.collectionName,
        mintedAt: tokenMetaFields.mintedAt,
        updatedAt: new Date(),
      } as const;
  
      let videoRow: any;
      try {
        if (resolvedMediaItemId !== null) {
          [videoRow] = await db
            .insert(tvChannelVideos)
            .values(videoValues)
            .onConflictDoUpdate({
              target: [tvChannelVideos.channelId, tvChannelVideos.mediaItemId],
              targetWhere: sql`${tvChannelVideos.mediaItemId} IS NOT NULL`,
              set: videoUpdateValues,
            })
            .returning();
        } else {
          [videoRow] = await db
            .insert(tvChannelVideos)
            .values(videoValues)
            .onConflictDoUpdate({
              target: [
                tvChannelVideos.channelId,
                tvChannelVideos.tokenContract,
                tvChannelVideos.tokenId,
              ],
              set: videoUpdateValues,
            })
            .returning();
        }
      } catch (err) {
        if (
          isUniqueConstraintError(err, "tv_video_unique_token_per_channel_idx") ||
          isUniqueConstraintError(err, "tv_channel_videos_channel_media_unique_idx")
        ) {
          const existing = await findExistingChannelVideo(
            db,
            channelId,
            resolvedMediaItemId,
            effectiveTokenContract,
            effectiveTokenId
          );
          if (existing) {
            [videoRow] = await db
              .update(tvChannelVideos)
              .set(videoUpdateValues)
              .where(eq(tvChannelVideos.id, existing.id))
              .returning();
          }
        }
        if (!videoRow) throw err;
      }
  
      const [activePlaylist] = await db
        .select({ id: tvPlaylists.id })
        .from(tvPlaylists)
        .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
        .orderBy(asc(tvPlaylists.id))
        .limit(1);
  
      if (activePlaylist) {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tvPlaylistItems)
          .where(eq(tvPlaylistItems.playlistId, activePlaylist.id));
        const nextOrder = Number(countRow?.count || 0);
  
        const clientDuration = Number(req.body?.durationSeconds);
        const hasClientDuration = Number.isFinite(clientDuration) && clientDuration > 0;
        const seedDuration = hasClientDuration
          ? Math.min(Math.round(clientDuration), MAX_STORED_DURATION_SEC)
          : mediaDurationSeconds && mediaDurationSeconds > 0
            ? Math.min(mediaDurationSeconds, MAX_STORED_DURATION_SEC)
            : mimeType === "image/gif"
              ? DEFAULT_GIF_DURATION_SEC
              : DEFAULT_VIDEO_DURATION_SEC;
  
        const [inserted] = await db
          .insert(tvPlaylistItems)
          .values({
            playlistId: activePlaylist.id,
            videoId: videoRow.id,
            mediaItemId: resolvedMediaItemId,
            sortOrder: nextOrder,
            durationSeconds: seedDuration,
          })
          .onConflictDoNothing()
          .returning({ id: tvPlaylistItems.id });
  
        // Fire-and-forget probe: real duration will overwrite the seed.
        if (inserted?.id && !hasClientDuration) {
          probePlaylistItemAsync(inserted.id, sourceUri);
        }
        // Eagerly warm the cache so the first playback of this item
        // never hits IPFS.  Idempotent: returns immediately if the file
        // is already cached or an in-flight fetch exists.
        prefetchMediaAsync(sourceUri);
      }
  
      res.status(201).json(videoRow);
    } catch (err) {
      console.error("[tv] failed to add channel video:", err);
      res.status(500).json({ error: "Failed to add video to channel" });
    }
  });
  
  router.post("/api/tv/channels/:channelId/refresh-sources", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      const channelId = Number(req.params.channelId);
      await ensureChannelEditable(channelId, user);
  
      const videos = await db
        .select({
          id: tvChannelVideos.id,
          mediaItemId: tvChannelVideos.mediaItemId,
          tokenContract: tvChannelVideos.tokenContract,
          tokenId: tvChannelVideos.tokenId,
          sourceUri: tvChannelVideos.sourceUri,
        })
        .from(tvChannelVideos)
        .where(eq(tvChannelVideos.channelId, channelId));
  
      let updated = 0;
      for (const video of videos) {
        if (video.tokenContract === "manual") continue;
        const [owned] = await db
          .select({ metadata: tokenMetadata.raw, tokenName: tokenMetadata.name })
          .from(walletHoldings)
          .leftJoin(
            tokenMetadata,
            and(
              eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
              eq(tokenMetadata.tokenId, walletHoldings.tokenId)
            )
          )
          .where(
            and(
              eq(walletHoldings.userId, user.id),
              eq(walletHoldings.tokenContract, video.tokenContract),
              eq(walletHoldings.tokenId, video.tokenId)
            )
          );
        if (!owned) continue;
        const asset = extractPlayableAssetFromTokenMetadata((owned.metadata as any) || null, owned.tokenName || null);
        if (!asset) continue;
        const [libraryItem] =
          video.mediaItemId != null
            ? await db
                .select({ metadata: userMediaLibrary.metadata })
                .from(userMediaLibrary)
                .where(eq(userMediaLibrary.id, video.mediaItemId))
                .limit(1)
            : [];
        const mergedMetadata = await hydrateChannelVideoMetadata({
          tokenContract: video.tokenContract,
          tokenId: video.tokenId,
          metadata: libraryItem?.metadata ?? owned.metadata ?? null,
        });
        const tokenMetaFields = await resolveTokenMetaFields(mergedMetadata, owned.tokenName || null, {
          tokenContract: video.tokenContract,
          tokenId: video.tokenId,
        });
        if (asset.sourceUri !== video.sourceUri) {
          await db
            .update(tvChannelVideos)
            .set({
              sourceUri: asset.sourceUri,
              mimeType: asset.mimeType,
              thumbnailUri: asset.thumbnailUri || undefined,
              metadata: mergedMetadata,
              creatorName: tokenMetaFields.creatorName,
              creatorAddress: tokenMetaFields.creatorAddress,
              collectionName: tokenMetaFields.collectionName,
              mintedAt: tokenMetaFields.mintedAt,
              updatedAt: new Date(),
            })
            .where(eq(tvChannelVideos.id, video.id));
          updated++;
          prefetchMediaAsync(asset.sourceUri);
        } else {
          // Source unchanged — still refresh metadata columns so changes
          // to creator/collection flow through, and warm the cache in
          // case the file fell out of our LRU.
          await db
            .update(tvChannelVideos)
            .set({
              metadata: mergedMetadata,
              creatorName: tokenMetaFields.creatorName,
              creatorAddress: tokenMetaFields.creatorAddress,
              collectionName: tokenMetaFields.collectionName,
              mintedAt: tokenMetaFields.mintedAt,
              updatedAt: new Date(),
            })
            .where(eq(tvChannelVideos.id, video.id));
          prefetchMediaAsync(video.sourceUri);
        }
      }
  
      res.json({ ok: true, total: videos.length, updated });
    } catch (err: any) {
      if (err?.status) return res.status(err.status).json({ error: err.message });
      console.error("[tv] failed to refresh sources:", err);
      res.status(500).json({ error: "Failed to refresh sources" });
    }
  });
  
  router.put(
    "/api/tv/channels/:channelId/videos/:videoId",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as AuthUser;
        const channelId = Number(req.params.channelId);
        const videoId = Number(req.params.videoId);
        if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(videoId) || videoId <= 0) {
          return res.status(400).json({ error: "Invalid channel/video id" });
        }
  
        const editable = await ensureChannelEditable(channelId, user);
        if (editable.error || !editable.channel) {
          return res.status(editable.status).json({ error: editable.error });
        }
  
        const updates: Record<string, any> = { updatedAt: new Date() };
        if (typeof req.body?.title === "string") {
          updates.title = req.body.title.trim() || null;
        }
        if (typeof req.body?.thumbnailUri === "string") {
          updates.thumbnailUri = normalizeMediaUri(req.body.thumbnailUri) || null;
        }
        if (typeof req.body?.sourceUri === "string") {
          const normalized = normalizeMediaUri(req.body.sourceUri);
          if (!normalized) return res.status(400).json({ error: "Invalid sourceUri" });
          updates.sourceUri = normalized;
        }
        if (typeof req.body?.mimeType === "string") {
          const mime = req.body.mimeType.trim().toLowerCase();
          if (!isPlayableMimeType(mime)) {
            return res.status(400).json({ error: "Only video/* or image/gif are allowed" });
          }
          updates.mimeType = mime;
        }
  
        const [updated] = await db
          .update(tvChannelVideos)
          .set(updates)
          .where(and(eq(tvChannelVideos.id, videoId), eq(tvChannelVideos.channelId, channelId)))
          .returning();
  
        if (!updated) return res.status(404).json({ error: "Video not found" });
        res.json(updated);
      } catch (err) {
        console.error("[tv] failed to update channel video:", err);
        res.status(500).json({ error: "Failed to update channel video" });
      }
    }
  );
  
  router.delete(
    "/api/tv/channels/:channelId/videos/:videoId",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as AuthUser;
        const channelId = Number(req.params.channelId);
        const videoId = Number(req.params.videoId);
        if (!Number.isInteger(channelId) || channelId <= 0 || !Number.isInteger(videoId) || videoId <= 0) {
          return res.status(400).json({ error: "Invalid channel/video id" });
        }
  
        const editable = await ensureChannelEditable(channelId, user);
        if (editable.error || !editable.channel) {
          return res.status(editable.status).json({ error: editable.error });
        }
  
        await db
          .delete(tvChannelVideos)
          .where(and(eq(tvChannelVideos.id, videoId), eq(tvChannelVideos.channelId, channelId)));
        res.json({ ok: true });
      } catch (err) {
        console.error("[tv] failed to delete channel video:", err);
        res.status(500).json({ error: "Failed to delete channel video" });
      }
    }
  );
  
  router.delete(
    "/api/tv/channels/:channelId/media/:mediaItemId",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as AuthUser;
        const channelId = Number(req.params.channelId);
        const mediaItemId = Number(req.params.mediaItemId);
        if (
          !Number.isInteger(channelId) ||
          channelId <= 0 ||
          !Number.isInteger(mediaItemId) ||
          mediaItemId <= 0
        ) {
          return res.status(400).json({ error: "Invalid channel/media id" });
        }
  
        const editable = await ensureChannelEditable(channelId, user);
        if (editable.error || !editable.channel) {
          return res.status(editable.status).json({ error: editable.error });
        }
  
        const removed = await db
          .delete(tvChannelVideos)
          .where(
            and(
              eq(tvChannelVideos.channelId, channelId),
              eq(tvChannelVideos.mediaItemId, mediaItemId)
            )
          )
          .returning({ id: tvChannelVideos.id });
  
        if (removed.length === 0) {
          return res
            .status(404)
            .json({ error: "Media item is not attached to this channel" });
        }
  
        res.json({ ok: true, removed: removed.length });
      } catch (err) {
        console.error("[tv] failed to detach media from channel:", err);
        res.status(500).json({ error: "Failed to remove media from channel" });
      }
    }
  );
}
