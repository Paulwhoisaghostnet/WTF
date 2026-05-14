import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { tvPlaylists, tvScheduleEntries } from "@shared/schema";

export type TvPlaylistRow = typeof tvPlaylists.$inferSelect;

export type TvPlaylistSelection =
  | {
      playlist: TvPlaylistRow;
      source: "schedule";
      scheduleLabel: string | null;
    }
  | {
      playlist: TvPlaylistRow;
      source: "active";
      scheduleLabel: null;
    }
  | {
      playlist: null;
      source: "none";
      scheduleLabel: null;
    };

export function utcMinuteOfDay(nowMs: number): number {
  const now = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

export async function resolveTvPlaylistForChannel(params: {
  channelId: number;
  nowMs: number;
}): Promise<TvPlaylistSelection> {
  const { channelId, nowMs } = params;
  const currentMinuteOfDay = utcMinuteOfDay(nowMs);

  const [scheduled] = await db
    .select({
      playlist: tvPlaylists,
      label: tvScheduleEntries.label,
    })
    .from(tvScheduleEntries)
    .innerJoin(
      tvPlaylists,
      and(
        eq(tvScheduleEntries.playlistId, tvPlaylists.id),
        eq(tvPlaylists.channelId, channelId)
      )
    )
    .where(
      and(
        eq(tvScheduleEntries.channelId, channelId),
        sql`${tvScheduleEntries.playlistId} IS NOT NULL`,
        sql`${tvScheduleEntries.startMinuteOfDay} <= ${currentMinuteOfDay}`,
        sql`${tvScheduleEntries.endMinuteOfDay} > ${currentMinuteOfDay}`
      )
    )
    .orderBy(asc(tvScheduleEntries.sortOrder), asc(tvScheduleEntries.id))
    .limit(1);

  if (scheduled?.playlist) {
    return {
      playlist: scheduled.playlist,
      source: "schedule",
      scheduleLabel: scheduled.label || null,
    };
  }

  const [activePlaylist] = await db
    .select()
    .from(tvPlaylists)
    .where(and(eq(tvPlaylists.channelId, channelId), eq(tvPlaylists.isActive, true)))
    .orderBy(asc(tvPlaylists.id))
    .limit(1);

  if (!activePlaylist) {
    return { playlist: null, source: "none", scheduleLabel: null };
  }

  return {
    playlist: activePlaylist,
    source: "active",
    scheduleLabel: null,
  };
}
