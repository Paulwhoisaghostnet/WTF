import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export type WatchedVideo = {
  videoId: string;
  title: string;
  watchedAt: string;
};

export type WatchedVideosResponse = { videos: WatchedVideo[] };

export const watchedVideosQueryKey = (userId: number) =>
  ["profile", "watched-videos", userId] as const;

export function useRecordWatchedVideo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null);
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const recordWatchedVideo = useCallback(async (videoId: string) => {
    if (userId === null) return false;
    setFailedVideoId(null);
    setSavedVideoId(null);
    setSavingVideoId(videoId);
    try {
      await api.post<WatchedVideo>("/api/profile/watched-videos", { videoId });
      void queryClient.invalidateQueries({ queryKey: watchedVideosQueryKey(userId) });
      setSavedVideoId(videoId);
      return true;
    } catch {
      setFailedVideoId(videoId);
      return false;
    } finally {
      setSavingVideoId((current) => current === videoId ? null : current);
    }
  }, [queryClient, userId]);

  return { recordWatchedVideo, failedVideoId, savingVideoId, savedVideoId, canRecord: userId !== null };
}
