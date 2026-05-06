import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Category, Channel, ChannelDetail, Message } from "./types";

function getAdaptiveInterval(activeMs: number, idleMs: number) {
  return typeof document !== "undefined" && document.visibilityState === "visible"
    ? activeMs
    : idleMs;
}

export function useBoardData(activeChannelId: number | null) {
  const { data: categories } = useQuery({
    queryKey: ["board", "categories"],
    queryFn: () => api.get<Category[]>("/api/board/categories"),
  });

  const { data: channelList, isLoading } = useQuery({
    queryKey: ["board", "channels"],
    queryFn: () => api.get<Channel[]>("/api/board/channels"),
    refetchInterval: () => getAdaptiveInterval(12_000, 45_000),
    refetchIntervalInBackground: false,
  });

  const { data: channelData } = useQuery({
    queryKey: ["board", "channel", activeChannelId],
    queryFn: () =>
      api.get<ChannelDetail>(`/api/board/channels/${activeChannelId}/messages`),
    enabled: !!activeChannelId,
    refetchInterval: () => getAdaptiveInterval(8_000, 30_000),
    refetchIntervalInBackground: false,
  });

  const ch = channelData?.channel;
  const messages = channelData?.messages ?? [];
  const messageById = useMemo(() => {
    const map = new Map<number, Message>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);

  const catList = useMemo(() => categories ?? [], [categories]);
  const channels = useMemo(() => channelList ?? [], [channelList]);

  const uncategorized = useMemo(
    () => channels.filter((channel) => !channel.categoryId),
    [channels]
  );

  const catChannels = useMemo(() => {
    const map = new Map<number, Channel[]>();
    for (const channel of channels) {
      if (channel.categoryId) {
        const list = map.get(channel.categoryId) || [];
        list.push(channel);
        map.set(channel.categoryId, list);
      }
    }
    return map;
  }, [channels]);

  return {
    catChannels,
    catList,
    channelData,
    channelList,
    channels,
    ch,
    isLoading,
    messageById,
    messages,
    uncategorized,
  };
}
