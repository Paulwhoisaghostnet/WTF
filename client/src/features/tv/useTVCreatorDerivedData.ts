import { useMemo } from "react";
import type {
  ChannelDetailResponse,
  PlayableToken,
  PlaylistDraftItem,
  TokenSortMode,
  TVVideo,
} from "./types";

type UseTVCreatorDerivedDataArgs = {
  detail: ChannelDetailResponse | undefined;
  selectedPlaylistEditorId: number | null;
  playlistDraft: PlaylistDraftItem[];
  playableItems: PlayableToken[] | undefined;
  playableSearch: string;
  playableSort: TokenSortMode;
};

export function useTVCreatorDerivedData(args: UseTVCreatorDerivedDataArgs) {
  const {
    detail,
    selectedPlaylistEditorId,
    playlistDraft,
    playableItems,
    playableSearch,
    playableSort,
  } = args;

  const editablePlaylist = useMemo(() => {
    const channelDetail = detail;
    if (!channelDetail) return null;
    if (selectedPlaylistEditorId) {
      const selected = channelDetail.playlists.find(
        (playlist) => playlist.id === selectedPlaylistEditorId
      );
      if (selected) return selected;
    }
    return (
      channelDetail.playlists.find((playlist) => playlist.isActive) ||
      channelDetail.playlists[0] ||
      null
    );
  }, [detail, selectedPlaylistEditorId]);

  const playlistVideoMap = useMemo(() => {
    const map = new Map<number, TVVideo>();
    for (const video of detail?.videos || [])
      map.set(video.id, video);
    return map;
  }, [detail?.videos]);

  const availablePlaylistVideos = useMemo(() => {
    const selectedIds = new Set(playlistDraft.map((item) => item.videoId));
    return (detail?.videos || []).filter(
      (video) => !selectedIds.has(video.id)
    );
  }, [detail?.videos, playlistDraft]);

  const playableTokens = useMemo(() => {
    const q = playableSearch.trim().toLowerCase();
    const filtered = (playableItems || []).filter((token) => {
      if (!q) return true;
      const meta = token.metadata || {};
      const creators = Array.isArray(meta.creators) ? meta.creators : [];
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      return (
        token.tokenName.toLowerCase().includes(q) ||
        token.tokenContract.toLowerCase().includes(q) ||
        token.tokenId.toLowerCase().includes(q) ||
        token.mimeType.toLowerCase().includes(q) ||
        token.walletAddress.toLowerCase().includes(q) ||
        (token.creatorAddress || "").toLowerCase().includes(q) ||
        creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
        tags.some((t: string) => String(t).toLowerCase().includes(q))
      );
    });
    return filtered.sort((a, b) => {
      if (playableSort === "name-asc") {
        return a.tokenName.localeCompare(b.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      if (playableSort === "name-desc") {
        return b.tokenName.localeCompare(a.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      if (playableSort === "contract") {
        const contractOrder = a.tokenContract.localeCompare(
          b.tokenContract,
          undefined,
          {
            sensitivity: "base",
          }
        );
        if (contractOrder !== 0) return contractOrder;
        return a.tokenId.localeCompare(b.tokenId, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (playableSort === "mime") {
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
  }, [playableItems, playableSearch, playableSort]);


  return {
    editablePlaylist,
    playlistVideoMap,
    availablePlaylistVideos,
    playableTokens,
  };
}
