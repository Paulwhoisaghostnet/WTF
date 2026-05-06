import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import {
  tvChannels,
  tvChannelVideos,
  tvPlaylistItems,
  tvPlaylists,
  tvWtfChannelConfig,
  walletHoldings,
  tokenMetadata,
  users,
} from "@shared/schema";
import { pickPreferredWtfChannelConfig } from "../../lib/tv-wtf-config";
import { resolveWtfSourceScope } from "../../lib/tv-policy";
import { warmChannelAsync } from "./cache-runtime";
import {
  extractPlayableAssetFromTokenMetadata,
  extractTokenMetaFields,
} from "./media-metadata";

/* ─── WTF TV Auto-Playlist ──────────────────────────────── */

type WtfChannelConfigRow = typeof tvWtfChannelConfig.$inferSelect;

export async function refreshWtfPlaylist(
  configOverride?: WtfChannelConfigRow
): Promise<{ ok: boolean; count: number; message: string }> {
  const config =
    configOverride ??
    pickPreferredWtfChannelConfig(await db.select().from(tvWtfChannelConfig));
  if (!config || !config.channelId || !config.enabled) {
    return { ok: false, count: 0, message: "WTF TV channel not configured or disabled" };
  }

  const [configuredChannel] = await db
    .select({
      id: tvChannels.id,
      ownerUserId: tvChannels.ownerUserId,
      slug: tvChannels.slug,
      dialNumber: tvChannels.dialNumber,
      ownerUsername: users.username,
    })
    .from(tvChannels)
    .leftJoin(users, eq(tvChannels.ownerUserId, users.id))
    .where(eq(tvChannels.id, config.channelId))
    .limit(1);

  if (!configuredChannel) {
    return { ok: false, count: 0, message: "Configured WTF TV channel no longer exists" };
  }

  const [activePlaylist] = await db
    .select()
    .from(tvPlaylists)
    .where(and(eq(tvPlaylists.channelId, config.channelId), eq(tvPlaylists.isActive, true)))
    .orderBy(asc(tvPlaylists.id))
    .limit(1);

  if (!activePlaylist) {
    return { ok: false, count: 0, message: "No active playlist on WTF TV channel" };
  }

  const sourceScope = resolveWtfSourceScope({
    sourceMode: config.sourceMode,
    sourceUserIds: config.sourceUserIds,
    sourceWalletAddresses: config.sourceWalletAddresses,
    channelOwnerUserId: configuredChannel.ownerUserId,
    channelOwnerUsername: configuredChannel.ownerUsername,
    channelSlug: configuredChannel.slug,
    channelDialNumber: configuredChannel.dialNumber,
  });
  const sourceMode = sourceScope.mode;
  const sourceUserIds = sourceScope.sourceUserIds;
  const sourceWallets = sourceScope.sourceWalletAddresses;
  const tokensPerWallet = config.tokensPerWalletPerHour || 5;
  const playlistSize = Math.max(5, Math.min(500, config.playlistSize || 100));
  const defaultDuration = Math.max(3, Math.min(300, config.defaultDurationSeconds || 15));

  const conditions = [sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`];
  if (sourceMode === "selected_users" && sourceUserIds.length > 0) {
    conditions.push(inArray(walletHoldings.userId, sourceUserIds));
  } else if (sourceMode === "specific_wallets" && sourceWallets.length > 0) {
    conditions.push(inArray(walletHoldings.walletAddress, sourceWallets));
  }

  const tokenRows = await db
    .select({
      id: walletHoldings.id,
      userId: walletHoldings.userId,
      walletAddress: walletHoldings.walletAddress,
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
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(playlistSize * 3);

  const deduped = new Map<string, typeof tokenRows[0]>();
  const walletCounts = new Map<string, number>();
  for (const row of tokenRows) {
    const key = `${row.tokenContract}:${row.tokenId}`;
    if (deduped.has(key)) continue;
    const walletCount = walletCounts.get(row.walletAddress) || 0;
    if (walletCount >= tokensPerWallet) continue;
    const asset = extractPlayableAssetFromTokenMetadata(
      (row.metadata as any) || null,
      row.tokenName || null
    );
    if (!asset) continue;
    deduped.set(key, row);
    walletCounts.set(row.walletAddress, walletCount + 1);
    if (deduped.size >= playlistSize) break;
  }

  // Do NOT delete the current playlist until we've confirmed we have
  // replacement content to swap in.  The old code wiped the channel
  // first and then asked "is there anything new?" — if the answer was
  // "no" (TzKT down, metadata-sync lagging, everyone's wallets empty,
  // a config bug that shrinks the eligible set to zero, etc.) the
  // channel went dark until the *next* refresh cycle succeeded.  The
  // audit calls this out as a P1: an upstream hiccup should never be
  // able to black-screen WTF TV.
  if (deduped.size === 0) {
    await db
      .update(tvWtfChannelConfig)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(tvWtfChannelConfig.id, config.id));
    return {
      ok: true,
      count: 0,
      message:
        "No playable tokens found this cycle — keeping existing playlist online",
    };
  }

  const entries = Array.from(deduped.values());
  const videoInserts = entries.map((row) => {
    const asset = extractPlayableAssetFromTokenMetadata(
      (row.metadata as any) || null,
      row.tokenName || null
    )!;
    const metaFields = extractTokenMetaFields(row.metadata, row.tokenName || null);
    return {
      channelId: config.channelId!,
      tokenContract: row.tokenContract,
      tokenId: row.tokenId,
      sourceUri: asset.sourceUri,
      mimeType: asset.mimeType,
      title: asset.title || row.tokenName || `#${row.tokenId}`,
      thumbnailUri: asset.thumbnailUri,
      metadata: row.metadata,
      creatorName: metaFields.creatorName,
      creatorAddress: metaFields.creatorAddress,
      collectionName: metaFields.collectionName,
      mintedAt: metaFields.mintedAt,
    };
  });

  // Swap atomically: tear down the old content *and* insert the new
  // batch in the same transaction so we never have a window where the
  // channel is empty.  Playlist items are deleted first because of the
  // FK onto tv_channel_videos.
  await db.transaction(async (tx) => {
    await tx
      .delete(tvPlaylistItems)
      .where(eq(tvPlaylistItems.playlistId, activePlaylist.id));
    await tx
      .delete(tvChannelVideos)
      .where(eq(tvChannelVideos.channelId, config.channelId!));

    const insertedVideos = await tx
      .insert(tvChannelVideos)
      .values(videoInserts)
      .returning({ id: tvChannelVideos.id });

    const playlistInserts = insertedVideos.map((v, idx) => ({
      playlistId: activePlaylist.id,
      videoId: v.id,
      sortOrder: idx,
      durationSeconds: defaultDuration,
    }));

    await tx.insert(tvPlaylistItems).values(playlistInserts);

    await tx
      .update(tvWtfChannelConfig)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(tvWtfChannelConfig.id, config.id));
  });

  // The auto-refresh just replaced every video on the WTF TV channel.
  // Warm the new list in the background so the next viewer plays
  // smoothly instead of priming IPFS one item at a time.
  warmChannelAsync(config.channelId);

  return { ok: true, count: deduped.size, message: `Playlist refreshed with ${deduped.size} tokens` };
}

const TV_WTF_REFRESH_LOCK_NAMESPACE = 0x575446;

export async function withTvWtfRefreshLock<T>(
  channelId: number,
  task: () => Promise<T>
): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [TV_WTF_REFRESH_LOCK_NAMESPACE, channelId]
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) return null;
    return await task();
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [
          TV_WTF_REFRESH_LOCK_NAMESPACE,
          channelId,
        ])
        .catch(() => undefined);
    }
    client.release();
  }
}

export async function maybeAutoRefreshWtfChannel(channelId: number): Promise<void> {
  const configRows = await db
    .select()
    .from(tvWtfChannelConfig)
    .where(eq(tvWtfChannelConfig.channelId, channelId))
    .orderBy(desc(tvWtfChannelConfig.updatedAt), desc(tvWtfChannelConfig.id));
  const config = pickPreferredWtfChannelConfig(configRows);

  if (!config || !config.enabled) return;

  const intervalMs = (config.refreshIntervalMinutes || 30) * 60 * 1000;
  const lastRefresh = config.lastRefreshedAt ? new Date(config.lastRefreshedAt).getTime() : 0;
  if (Date.now() - lastRefresh < intervalMs) return;

  try {
    await withTvWtfRefreshLock(channelId, async () => {
      const freshConfigRows = await db
        .select()
        .from(tvWtfChannelConfig)
        .where(eq(tvWtfChannelConfig.channelId, channelId))
        .orderBy(desc(tvWtfChannelConfig.updatedAt), desc(tvWtfChannelConfig.id));
      const freshConfig = pickPreferredWtfChannelConfig(freshConfigRows);
      if (!freshConfig || !freshConfig.enabled) return;

      const freshIntervalMs =
        (freshConfig.refreshIntervalMinutes || 30) * 60 * 1000;
      const freshLastRefresh = freshConfig.lastRefreshedAt
        ? new Date(freshConfig.lastRefreshedAt).getTime()
        : 0;
      if (Date.now() - freshLastRefresh < freshIntervalMs) return;

      await refreshWtfPlaylist(freshConfig);
    });
  } catch (err) {
    console.error("[tv] auto-refresh WTF playlist failed:", err);
  }
}

