import { useState } from "react";
import { Button, GroupBox, Hourglass, TextInput } from "react95";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { fetchPlaylists, createPlaylist, type MusicPlaylist, type MusicPlaylistTrack } from "./api";

interface Props {
  onTrackSelect: (track: MusicPlaylistTrack) => void;
  selectedPlaylistId?: number | null;
  onPlaylistSelect: (id: number) => void;
}

export function MusicPlaylist({ onTrackSelect, selectedPlaylistId, onPlaylistSelect }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const playlistsQ = useQuery({
    queryKey: ["music", "playlists"],
    queryFn: fetchPlaylists,
  });

  const createMut = useMutation({
    mutationFn: () => createPlaylist({ name: newName.trim() }),
    onSuccess: () => {
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["music", "playlists"] });
    },
  });

  const playlists = playlistsQ.data ?? [];

  return (
    <div data-music-region="playlist-panel">
      <GroupBox label="Playlists">
      <PlaylistWrap data-music-region="playlist-list">
        {playlistsQ.isLoading ? (
          <LoadRow data-music-region="playlist-loading"><Hourglass size={18} /> Loading...</LoadRow>
        ) : playlists.length === 0 ? (
          <EmptyNote data-music-region="playlist-empty">No playlists yet.</EmptyNote>
        ) : (
          playlists.map((pl: MusicPlaylist) => (
            <PlaylistRow
              key={pl.id}
              data-music-region="playlist-row"
              $active={pl.id === selectedPlaylistId}
              onClick={() => onPlaylistSelect(pl.id)}
            >
              {pl.name}
              {pl.isPublic && <Badge data-music-region="playlist-badge">public</Badge>}
            </PlaylistRow>
          ))
        )}

        {creating ? (
          <CreateRow data-music-region="playlist-create">
            <TextInput
              value={newName}
              onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
              placeholder="Playlist name"
              style={{ flex: 1 }}
            />
            <Button
              size="sm"
              onClick={() => { if (newName.trim()) createMut.mutate(); }}
              disabled={createMut.isPending}
            >
              Save
            </Button>
            <Button size="sm" onClick={() => setCreating(false)}>✕</Button>
          </CreateRow>
        ) : (
          <Button size="sm" data-music-region="playlist-create-button" onClick={() => setCreating(true)}>+ New Playlist</Button>
        )}
      </PlaylistWrap>
      </GroupBox>
    </div>
  );
}

const gammaMusicScope = `[data-music-presentation-host="gamma"]`;

const PlaylistWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;

  ${gammaMusicScope} & {
    gap: 6px;
    padding: 2px;
  }
`;

const PlaylistRow = styled.button<{ $active: boolean }>`
  border: 2px ${(p) => (p.$active ? "inset" : "outset")} #dfdfdf;
  background: ${(p) => (p.$active ? "#9fd4d4" : "#c0c0c0")};
  color: #111;
  text-align: left;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;

  ${gammaMusicScope} & {
    min-height: 38px;
    border: 1px solid ${(p) => (p.$active ? "rgba(0, 210, 255, 0.8)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 6px;
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.14)" : "rgba(17, 17, 15, 0.92)")};
    color: #f2ead9;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const Badge = styled.span`
  font-size: 9px;
  background: #0000aa;
  color: #fff;
  padding: 1px 4px;

  ${gammaMusicScope} & {
    border: 1px solid rgba(0, 210, 255, 0.5);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: 12px;
  }
`;

const LoadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;

  ${gammaMusicScope} & {
    color: #f2ead9;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const EmptyNote = styled.div`
  font-size: 11px;
  color: #555;
  padding: 6px 0;

  ${gammaMusicScope} & {
    color: rgba(242, 234, 217, 0.72);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const CreateRow = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;

  ${gammaMusicScope} & {
    gap: 6px;
  }
`;
