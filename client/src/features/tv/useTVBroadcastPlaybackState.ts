import { useMemo } from "react";
import {
  queueItemKey,
  resolveSelectedChannelPlaybackState,
} from "../../lib/tv-playback";
import type { StreamQueueItem } from "./types";

type UseTVBroadcastPlaybackStateArgs = {
  selectedChannelId: number | null;
  streamChannelId: number | null | undefined;
  streamMatchesSelectedChannel: boolean;
  streamQueue: StreamQueueItem[] | null | undefined;
  streamCurrent: StreamQueueItem | null | undefined;
  clientQueueIdx: number;
  authoritativeAdvancePending: boolean;
  playbackTargetKey: string;
  currentKey: string;
  currentPlaybackItem: StreamQueueItem | null;
  playbackChannelId: number | null;
  preloadLookahead: number;
};

export function useTVBroadcastPlaybackState({
  selectedChannelId,
  streamChannelId,
  streamMatchesSelectedChannel,
  streamQueue,
  streamCurrent,
  clientQueueIdx,
  authoritativeAdvancePending,
  playbackTargetKey,
  currentKey,
  currentPlaybackItem,
  playbackChannelId,
  preloadLookahead,
}: UseTVBroadcastPlaybackStateArgs) {
  const suppressCurrentStreamPlayback =
    authoritativeAdvancePending && streamMatchesSelectedChannel;
  const activePlayback = resolveSelectedChannelPlaybackState({
    selectedChannelId,
    streamChannelId,
    queue: suppressCurrentStreamPlayback ? [] : streamQueue || [],
    currentItem: suppressCurrentStreamPlayback ? null : streamCurrent || null,
    requestedIdx: clientQueueIdx,
    pinnedKey: suppressCurrentStreamPlayback
      ? ""
      : playbackTargetKey || currentKey,
    fallbackItem: suppressCurrentStreamPlayback ? null : currentPlaybackItem,
    fallbackChannelId: suppressCurrentStreamPlayback ? null : playbackChannelId,
  });
  const queueItems = activePlayback.streamMatchesSelectedChannel
    ? streamQueue || []
    : [];
  const playbackCursorIdx =
    activePlayback.activeQueueIdx >= 0
      ? activePlayback.activeQueueIdx
      : clientQueueIdx;
  const activeItem: StreamQueueItem | null = activePlayback.activeItem;
  const activeKey = activePlayback.activeKey;

  const upcomingItems = useMemo(() => {
    const queue = queueItems;
    if (queue.length === 0) return [] as StreamQueueItem[];
    const seen = new Set<string>();
    const out: StreamQueueItem[] = [];
    for (let i = 1; i <= preloadLookahead; i++) {
      const idx = (playbackCursorIdx + i) % queue.length;
      const item = queue[idx];
      if (!item) continue;
      const key = queueItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [queueItems, playbackCursorIdx, preloadLookahead]);

  return {
    suppressCurrentStreamPlayback,
    activePlayback,
    queueItems,
    playbackCursorIdx,
    activeItem,
    activeKey,
    upcomingItems,
  };
}
