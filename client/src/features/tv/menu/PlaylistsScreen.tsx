import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { ChannelDetailResponse, ScreenView, TVPlaylist } from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
};

type MutationLike<TVariables> = {
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type PlaylistsScreenProps = {
  createPlaylistMutation: MutationLike<{ channelId: number; name: string }>;
  detailQuery: QueryLike<ChannelDetailResponse>;
  editablePlaylist: TVPlaylist | null;
  playlistNameDraft: string;
  playlistRenameDraft: string;
  renamePlaylistMutation: MutationLike<{ playlistId: number; name: string }>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
  setPlaylistActiveMutation: MutationLike<{ playlistId: number }>;
  setPlaylistNameDraft: StateSetter<string>;
  setPlaylistRenameDraft: StateSetter<string>;
  setScreenView: StateSetter<ScreenView>;
  setSelectedPlaylistEditorId: StateSetter<number | null>;
};

export function PlaylistsScreen({
  createPlaylistMutation,
  detailQuery,
  editablePlaylist,
  playlistNameDraft,
  playlistRenameDraft,
  renamePlaylistMutation,
  renderBackBtn,
  selectedOwnChannelId,
  setPlaylistActiveMutation,
  setPlaylistNameDraft,
  setPlaylistRenameDraft,
  setScreenView,
  setSelectedPlaylistEditorId,
}: PlaylistsScreenProps) {
  const playlists = detailQuery.data?.playlists || [];

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>PLAYLISTS</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuScrollList>
        {playlists.map((pl) => (
          <MenuItem
            key={pl.id}
            $selected={editablePlaylist?.id === pl.id}
            onClick={() => setSelectedPlaylistEditorId(pl.id)}
          >
            <MenuRow>
              <span style={{ flex: 1 }}>{pl.name}</span>
              {pl.isActive && (
                <MenuLabel style={{ color: "#ccff66" }}>ACTIVE</MenuLabel>
              )}
              {editablePlaylist?.id === pl.id && (
                <MenuLabel style={{ color: "#88ffaa" }}>EDITING</MenuLabel>
              )}
            </MenuRow>
          </MenuItem>
        ))}
        {playlists.length === 0 && <MenuItem $disabled>No playlists</MenuItem>}
      </MenuScrollList>
      {editablePlaylist && (
        <>
          <MenuLabel style={{ marginTop: 8 }}>
            Editing: {editablePlaylist.name}
          </MenuLabel>
          <MenuRow style={{ marginTop: 6 }}>
            <MenuInput
              value={playlistRenameDraft}
              onChange={(e) => setPlaylistRenameDraft(e.target.value)}
              placeholder="Rename selected playlist..."
            />
            <MenuBtn
              $accent
              disabled={
                !playlistRenameDraft.trim() ||
                playlistRenameDraft.trim() === editablePlaylist.name ||
                renamePlaylistMutation.isPending
              }
              onClick={() =>
                renamePlaylistMutation.mutate({
                  playlistId: editablePlaylist.id,
                  name: playlistRenameDraft.trim(),
                })
              }
            >
              SAVE NAME
            </MenuBtn>
          </MenuRow>
          <MenuRow style={{ marginTop: 6 }}>
            <MenuBtn
              disabled={editablePlaylist.isActive}
              onClick={() =>
                setPlaylistActiveMutation.mutate({
                  playlistId: editablePlaylist.id,
                })
              }
            >
              {editablePlaylist.isActive ? "ON AIR" : "AIR THIS"}
            </MenuBtn>
            <MenuBtn $accent onClick={() => setScreenView("playlist-order")}>
              EDIT CONTENTS
            </MenuBtn>
          </MenuRow>
        </>
      )}
      <MenuRow style={{ marginTop: 8 }}>
        <MenuInput
          value={playlistNameDraft}
          onChange={(e) => setPlaylistNameDraft(e.target.value)}
          placeholder="New playlist name..."
        />
        <MenuBtn
          $accent
          disabled={
            !playlistNameDraft.trim() ||
            !selectedOwnChannelId ||
            createPlaylistMutation.isPending
          }
          onClick={() =>
            selectedOwnChannelId &&
            createPlaylistMutation.mutate({
              channelId: selectedOwnChannelId,
              name: playlistNameDraft.trim(),
            })
          }
        >
          ADD
        </MenuBtn>
      </MenuRow>
      <MenuLabel style={{ marginTop: 6 }}>
        Pick a playlist to edit. "AIR THIS" changes the live fallback loop;
        "EDIT CONTENTS" changes that playlist without forcing it on air.
      </MenuLabel>
    </MenuOverlay>
  );
}
