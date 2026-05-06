import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import type { ChannelDetailResponse, PlaylistDraftItem } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseTVPlaylistDraftSyncArgs = {
  detail: ChannelDetailResponse | undefined;
  selectedPlaylistEditorId: number | null;
  setSelectedPlaylistEditorId: StateSetter<number | null>;
  setPlaylistDraft: StateSetter<PlaylistDraftItem[]>;
  setPlaylistRenameDraft: StateSetter<string>;
};

export function useTVPlaylistDraftSync(args: UseTVPlaylistDraftSyncArgs) {
  const {
    detail,
    selectedPlaylistEditorId,
    setSelectedPlaylistEditorId,
    setPlaylistDraft,
    setPlaylistRenameDraft,
  } = args;

  useEffect(() => {
    if (!detail) return;
    if (detail.playlists.length === 0) {
      if (selectedPlaylistEditorId !== null) {
        setSelectedPlaylistEditorId(null);
      }
      return;
    }
    if (
      selectedPlaylistEditorId !== null &&
      detail.playlists.some(
        (playlist) => playlist.id === selectedPlaylistEditorId
      )
    ) {
      return;
    }
    const fallbackId =
      detail.playlists.find((playlist) => playlist.isActive)?.id ??
      detail.playlists[0]?.id ??
      null;
    if (fallbackId !== selectedPlaylistEditorId) {
      setSelectedPlaylistEditorId(fallbackId);
    }
  }, [detail, selectedPlaylistEditorId, setSelectedPlaylistEditorId]);

  useEffect(() => {
    if (!detail) {
      setPlaylistDraft([]);
      return;
    }
    const selectedPlaylist =
      (selectedPlaylistEditorId
        ? detail.playlists.find(
            (playlist) => playlist.id === selectedPlaylistEditorId
          )
        : null) ||
      detail.playlists.find((playlist) => playlist.isActive) ||
      detail.playlists[0] ||
      null;
    if (!selectedPlaylist) {
      setPlaylistDraft([]);
      return;
    }
    const items = detail.playlistItems
      .filter((item) => item.playlistId === selectedPlaylist.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    setPlaylistDraft(
      items.map((item) => ({
        videoId: item.videoId,
        durationSeconds: Math.max(1, Number(item.durationSeconds || 1)),
      }))
    );
  }, [detail, selectedPlaylistEditorId, setPlaylistDraft]);

  useEffect(() => {
    if (!detail) {
      setPlaylistRenameDraft("");
      return;
    }
    const selectedPlaylist =
      (selectedPlaylistEditorId
        ? detail.playlists.find(
            (playlist) => playlist.id === selectedPlaylistEditorId
          )
        : null) ||
      detail.playlists.find((playlist) => playlist.isActive) ||
      detail.playlists[0] ||
      null;
    setPlaylistRenameDraft(selectedPlaylist?.name || "");
  }, [detail, selectedPlaylistEditorId, setPlaylistRenameDraft]);
}
