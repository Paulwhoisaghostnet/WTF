import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { PlaylistDraftItem, TVPlaylist, TVVideo } from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type MutationLike<TVariables> = {
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type PlaylistOrderScreenProps = {
  availablePlaylistVideos: TVVideo[];
  editablePlaylist: TVPlaylist | null;
  playlistDraft: PlaylistDraftItem[];
  playlistVideoMap: Map<number, TVVideo>;
  renderBackBtn: (label?: string) => ReactElement;
  savePlaylistMutation: MutationLike<{
    playlistId: number;
    items: Array<{ videoId: number; durationSeconds: number }>;
  }>;
  setPlaylistDraft: StateSetter<PlaylistDraftItem[]>;
};

export function PlaylistOrderScreen({
  availablePlaylistVideos,
  editablePlaylist,
  playlistDraft,
  playlistVideoMap,
  renderBackBtn,
  savePlaylistMutation,
  setPlaylistDraft,
}: PlaylistOrderScreenProps) {
  return (
    <MenuOverlay>
      <MenuTitle>
        <span>PLAYLIST EDITOR</span>
        {renderBackBtn("PLAYLISTS")}
      </MenuTitle>
      <MenuLabel>
        {editablePlaylist
          ? `Editing "${editablePlaylist.name}". Reorder clips, remove them, or add any channel media below.`
          : "Pick a playlist first."}
      </MenuLabel>
      <MenuScrollList>
        {playlistDraft.map((item, idx) => {
          const video = playlistVideoMap.get(item.videoId);
          return (
            <MenuItem key={`${item.videoId}-${idx}`}>
              <MenuRow>
                <span style={{ flex: 1, fontSize: "var(--wtf-type-caption, 13px)" }}>
                  {video?.title || `Video #${item.videoId}`}
                </span>
                <MenuInput
                  value={String(item.durationSeconds)}
                  onChange={(e) => {
                    const next = [...playlistDraft];
                    next[idx] = {
                      ...next[idx]!,
                      durationSeconds: Math.max(
                        1,
                        Math.floor(Number(e.target.value) || 1)
                      ),
                    };
                    setPlaylistDraft(next);
                  }}
                  style={{ width: 44 }}
                />
                <MenuLabel>s</MenuLabel>
                <MenuBtn
                  disabled={idx === 0}
                  onClick={() => {
                    const next = [...playlistDraft];
                    [next[idx - 1], next[idx]] = [
                      next[idx]!,
                      next[idx - 1]!,
                    ];
                    setPlaylistDraft(next);
                  }}
                >
                  UP
                </MenuBtn>
                <MenuBtn
                  disabled={idx === playlistDraft.length - 1}
                  onClick={() => {
                    const next = [...playlistDraft];
                    [next[idx + 1], next[idx]] = [
                      next[idx]!,
                      next[idx + 1]!,
                    ];
                    setPlaylistDraft(next);
                  }}
                >
                  DN
                </MenuBtn>
                <MenuBtn
                  onClick={() =>
                    setPlaylistDraft((current) =>
                      current.filter((_, currentIdx) => currentIdx !== idx)
                    )
                  }
                >
                  REM
                </MenuBtn>
              </MenuRow>
            </MenuItem>
          );
        })}
        {playlistDraft.length === 0 && (
          <MenuItem $disabled>No videos in this playlist yet</MenuItem>
        )}
      </MenuScrollList>
      <MenuDivider />
      <MenuLabel>
        AVAILABLE CHANNEL MEDIA ({availablePlaylistVideos.length})
      </MenuLabel>
      <MenuScrollList>
        {availablePlaylistVideos.map((video) => (
          <MenuItem key={`available-${video.id}`}>
            <MenuRow>
              <span style={{ flex: 1, fontSize: "var(--wtf-type-caption, 13px)" }}>
                {video.title || `Video #${video.id}`}
              </span>
              <MenuLabel>{video.mimeType}</MenuLabel>
              <MenuBtn
                $accent
                onClick={() =>
                  setPlaylistDraft((current) => [
                    ...current,
                    {
                      videoId: video.id,
                      durationSeconds: Math.max(
                        1,
                        Math.floor(
                          Number(video.metadata?.wtfTvDurationSeconds) || 30
                        )
                      ),
                    },
                  ])
                }
              >
                ADD
              </MenuBtn>
            </MenuRow>
          </MenuItem>
        ))}
        {availablePlaylistVideos.length === 0 && (
          <MenuItem $disabled>
            Every channel video is already in this playlist
          </MenuItem>
        )}
      </MenuScrollList>
      <div style={{ marginTop: 8 }}>
        <MenuBtn
          $accent
          disabled={!editablePlaylist || savePlaylistMutation.isPending}
          onClick={() =>
            editablePlaylist &&
            savePlaylistMutation.mutate({
              playlistId: editablePlaylist.id,
              items: playlistDraft,
            })
          }
        >
          SAVE PLAYLIST CONTENTS
        </MenuBtn>
      </div>
    </MenuOverlay>
  );
}
