import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  BumperPoolItem,
  ChannelDetailResponse,
  CommunityBumper,
  MediaUsageResponse,
  PlayableToken,
  ScreenView,
  StreamPayload,
  TVBumper,
  TVChannel,
  TVMediaItem,
  TVScheduleEntry,
} from "./types";

type UseTVDataQueriesArgs = {
  powerOn: boolean;
  selectedChannelId: number | null;
  streamTick: number;
  user: unknown;
  screenView: ScreenView;
  selectedOwnChannelId: number | null;
  mediaDeleteTargetId: number | null;
  mediaManageTargetId: number | null;
};

export function useTVDataQueries(args: UseTVDataQueriesArgs) {
  const {
    powerOn,
    selectedChannelId,
    streamTick,
    user,
    screenView,
    selectedOwnChannelId,
    mediaDeleteTargetId,
    mediaManageTargetId,
  } = args;


  const channelsQuery = useQuery({
    queryKey: ["tv", "channels"],
    queryFn: () => api.get<TVChannel[]>("/api/tv/channels"),
    refetchInterval: 60_000,
  });

  const myChannelsQuery = useQuery({
    queryKey: ["tv", "channels", "mine"],
    queryFn: () => api.get<TVChannel[]>("/api/tv/channels?mine=1"),
    enabled: Boolean(user),
  });

  const streamQuery = useQuery({
    queryKey: ["tv", "stream", selectedChannelId, streamTick],
    queryFn: () =>
      api.get<StreamPayload>(
        `/api/tv/channels/${selectedChannelId}/stream`
      ),
    enabled: Boolean(powerOn && selectedChannelId),
    // Natural media boundaries explicitly refetch the server's
    // wall-clock broadcast cursor. This background refresh only picks
    // up playlist metadata changes and must not interrupt an item that
    // is already playing.
    refetchInterval: powerOn ? 5 * 60_000 : false,
    staleTime: 30_000,
  });
  const streamChannelId = streamQuery.data?.channel?.id ?? null;
  const streamMatchesSelectedChannel =
    selectedChannelId !== null && streamChannelId === selectedChannelId;

  const detailQuery = useQuery({
    queryKey: ["tv", "channel", selectedOwnChannelId],
    queryFn: () =>
      api.get<ChannelDetailResponse>(
        `/api/tv/channels/${selectedOwnChannelId}`
      ),
    enabled: Boolean(selectedOwnChannelId),
  });

  const playableTokensQuery = useQuery({
    queryKey: ["tv", "playable"],
    queryFn: () =>
      api.get<{ items: PlayableToken[] }>(
        "/api/tv/me/playable-tokens?limit=500&sort=recent"
      ),
    enabled: Boolean(screenView === "add-tokens" && user),
    staleTime: 30_000,
  });

  const myBumpersQuery = useQuery({
    queryKey: ["tv", "bumpers", "mine"],
    queryFn: () => api.get<TVBumper[]>("/api/tv/bumpers"),
    enabled: Boolean(
      user &&
        (screenView === "bumpers" ||
          screenView === "my-media" ||
          screenView === "channel-videos")
    ),
  });

  const communityBumpersQuery = useQuery({
    queryKey: ["tv", "bumpers", "community"],
    queryFn: () => api.get<CommunityBumper[]>("/api/tv/bumpers/community"),
    enabled: Boolean(screenView === "bumpers"),
    staleTime: 60_000,
  });

  const bumperPoolQuery = useQuery({
    queryKey: ["tv", "bumpers", "pool", selectedChannelId],
    queryFn: () =>
      api.get<BumperPoolItem[]>(
        `/api/tv/bumpers/pool${selectedChannelId ? `?channelId=${selectedChannelId}` : ""}`
      ),
    enabled: powerOn,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  const myMediaQuery = useQuery({
    queryKey: ["media-library", "video"],
    queryFn: () => api.get<TVMediaItem[]>("/api/media/mine?category=video"),
    enabled: Boolean(user && (screenView === "my-media" || screenView === "media-form" || screenView === "schedule")),
  });

  /**
   * Cascade-preview query used by the DELETE confirmation dialog in
   * MY MEDIA.  Lists every channel/playlist that currently uses this
   * library item, so the user knows exactly what will be swept if
   * they confirm the delete (channel_videos.media_item_id FK is
   * ON DELETE CASCADE, which also cascades through playlist_items).
   */
  const mediaUsageQuery = useQuery({
    queryKey: ["media-library", "usage", mediaDeleteTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${mediaDeleteTargetId}/usage`),
    enabled: Boolean(mediaDeleteTargetId),
  });

  const mediaManageUsageQuery = useQuery({
    queryKey: ["media-library", "usage", mediaManageTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${mediaManageTargetId}/usage`),
    enabled: Boolean(mediaManageTargetId),
  });

  const scheduleQuery = useQuery({
    queryKey: ["tv", "schedule", selectedOwnChannelId],
    queryFn: () =>
      api.get<TVScheduleEntry[]>(`/api/tv/channels/${selectedOwnChannelId}/schedule`),
    enabled: Boolean(selectedOwnChannelId && screenView === "schedule"),
  });


  return {
    channelsQuery,
    myChannelsQuery,
    streamQuery,
    streamChannelId,
    streamMatchesSelectedChannel,
    detailQuery,
    playableTokensQuery,
    myBumpersQuery,
    communityBumpersQuery,
    bumperPoolQuery,
    myMediaQuery,
    mediaUsageQuery,
    mediaManageUsageQuery,
    scheduleQuery,
  };
}
