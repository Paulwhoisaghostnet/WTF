import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  PlayableToken,
  ScreenView,
  TVBumper,
  TVChannel,
  TVPlaylist,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type ScheduleFormDraft = {
  playlistId: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  label: string;
};

type UseTVMutationsArgs = {
  qc: QueryClient;
  selectedOwnChannelId: number | null;
  selectedChannelId: number | null;
  setChannelTitleDraft: StateSetter<string>;
  setPlaylistNameDraft: StateSetter<string>;
  setSelectedPlaylistEditorId: StateSetter<number | null>;
  setPlaylistRenameDraft: StateSetter<string>;
  setBumperTitleDraft: StateSetter<string>;
  bumperFileRef: MutableRefObject<HTMLInputElement | null>;
  setScreenView: StateSetter<ScreenView>;
  setScheduleFormDraft: StateSetter<ScheduleFormDraft>;
};

export function useTVMutations(args: UseTVMutationsArgs) {
  const {
    qc,
    selectedOwnChannelId,
    selectedChannelId,
    setChannelTitleDraft,
    setPlaylistNameDraft,
    setSelectedPlaylistEditorId,
    setPlaylistRenameDraft,
    setBumperTitleDraft,
    bumperFileRef,
    setScreenView,
    setScheduleFormDraft,
  } = args;


  const createChannelMutation = useMutation({
    mutationFn: (title: string) =>
      api.post<{ channel: TVChannel }>("/api/tv/channels", { title }),
    onSuccess: () => {
      setChannelTitleDraft("");
      qc.invalidateQueries({ queryKey: ["tv", "channels"] });
      qc.invalidateQueries({ queryKey: ["tv", "channels", "mine"] });
    },
  });

  const refreshSourcesMutation = useMutation({
    mutationFn: (channelId: number) =>
      api.post<{ ok: boolean; total: number; updated: number }>(
        `/api/tv/channels/${channelId}/refresh-sources`
    ),
    onSuccess: (data) => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
      alert(`Refreshed: ${data.updated}/${data.total} videos updated with correct source URIs.`);
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: ({
      channelId,
      name,
    }: {
      channelId: number;
      name: string;
    }) =>
      api.post<TVPlaylist>(`/api/tv/channels/${channelId}/playlists`, {
        name,
        isActive: false,
      }),
    onSuccess: (playlist) => {
      setPlaylistNameDraft("");
      setSelectedPlaylistEditorId(playlist.id);
      setPlaylistRenameDraft(playlist.name);
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
    },
  });

  const setPlaylistActiveMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: number }) =>
      api.put(`/api/tv/playlists/${playlistId}`, { isActive: true }),
    onSuccess: (_data, vars) => {
      setSelectedPlaylistEditorId(vars.playlistId);
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const renamePlaylistMutation = useMutation({
    mutationFn: ({
      playlistId,
      name,
    }: {
      playlistId: number;
      name: string;
    }) => api.put<TVPlaylist>(`/api/tv/playlists/${playlistId}`, { name }),
    onSuccess: (playlist) => {
      setPlaylistRenameDraft(playlist.name);
      setSelectedPlaylistEditorId(playlist.id);
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
    },
  });

  const savePlaylistMutation = useMutation({
    mutationFn: ({
      playlistId,
      items,
    }: {
      playlistId: number;
      items: Array<{ videoId: number; durationSeconds: number }>;
    }) =>
      api.put(`/api/tv/playlists/${playlistId}/items`, {
        items: items.map((item, idx) => ({
          videoId: item.videoId,
          durationSeconds: Math.max(1, Math.floor(item.durationSeconds || 1)),
          sortOrder: idx,
        })),
      }),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const addVideoMutation = useMutation({
    mutationFn: ({
      channelId,
      token,
    }: {
      channelId: number;
      token: PlayableToken;
    }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, {
        tokenContract: token.tokenContract,
        tokenId: token.tokenId,
        sourceUri: token.sourceUri,
        mimeType: token.mimeType,
        title: token.title || token.tokenName,
        thumbnailUri: token.tokenThumbnail,
      }),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  /**
   * Add a personal media-library item to one of the user's own TV
   * channels.  Mirrors the token-based addVideoMutation but sends
   * `mediaItemId` so the server establishes the FK link directly.
   * Cascades from DELETE on the library item will then sweep the
   * channel-video + playlist items automatically.
   */
  const addMediaToChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, {
        mediaItemId,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tv", "channel", vars.channelId] });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const removeVideoMutation = useMutation({
    mutationFn: ({
      channelId,
      videoId,
    }: {
      channelId: number;
      videoId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/videos/${videoId}`),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const detachMediaFromChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/media/${mediaItemId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["media-library", "usage", vars.mediaItemId],
      });
      qc.invalidateQueries({ queryKey: ["tv"] });
      if (selectedOwnChannelId) {
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
      }
    },
  });

  const uploadBumperMutation = useMutation({
    mutationFn: async ({
      file,
      title,
      durationMs,
      category,
    }: {
      file: File;
      title: string;
      durationMs: number;
      category: "personal" | "community";
    }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("durationMs", String(durationMs));
      form.append("category", category);
      const resp = await fetch("/api/tv/bumpers", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      setBumperTitleDraft("");
      if (bumperFileRef.current) bumperFileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
    },
  });

  const deleteBumperMutation = useMutation({
    mutationFn: (bumperId: number) =>
      api.delete(`/api/tv/bumpers/${bumperId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
    },
  });

  const updateBumperMutation = useMutation({
    mutationFn: ({
      bumperId,
      category,
    }: {
      bumperId: number;
      category: "personal" | "community";
    }) =>
      api.patch<TVBumper>(`/api/tv/bumpers/${bumperId}`, {
        category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
    },
  });

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId: number) => api.delete(`/api/media/${mediaId}`),
    onSuccess: () => {
      // Cascade FK on tv_channel_videos.media_item_id will have
      // already swept the server; mirror that on the client by
      // nuking every cached TV query so the user sees the new
      // "safe" state instantly.
      qc.invalidateQueries({ queryKey: ["media-library"] });
      qc.invalidateQueries({ queryKey: ["tv"] });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: number;
      data: Record<string, any>;
    }) => api.put(`/api/tv/channels/${channelId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "channels"] });
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      setScreenView("creator");
    },
  });

  const createScheduleEntryMutation = useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: number;
      data: { playlistId: number; startMinuteOfDay: number; endMinuteOfDay: number; label?: string };
    }) => api.post(`/api/tv/channels/${channelId}/schedule`, data),
    onSuccess: () => {
      setScheduleFormDraft({ playlistId: "", startHour: "0", startMinute: "0", endHour: "1", endMinute: "0", label: "" });
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "schedule", selectedOwnChannelId],
        });
    },
  });

  const deleteScheduleEntryMutation = useMutation({
    mutationFn: ({
      channelId,
      entryId,
    }: {
      channelId: number;
      entryId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/schedule/${entryId}`),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "schedule", selectedOwnChannelId],
        });
    },
  });


  return {
    createChannelMutation,
    refreshSourcesMutation,
    createPlaylistMutation,
    setPlaylistActiveMutation,
    renamePlaylistMutation,
    savePlaylistMutation,
    addVideoMutation,
    addMediaToChannelMutation,
    removeVideoMutation,
    detachMediaFromChannelMutation,
    uploadBumperMutation,
    deleteBumperMutation,
    updateBumperMutation,
    deleteMediaMutation,
    updateChannelMutation,
    createScheduleEntryMutation,
    deleteScheduleEntryMutation,
  };
}
