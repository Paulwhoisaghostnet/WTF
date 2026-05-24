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
    <GroupBox label="Playlists">
      <PlaylistWrap>
        {playlistsQ.isLoading ? (
          <LoadRow><Hourglass size={18} /> Loading...</LoadRow>
        ) : playlists.length === 0 ? (
          <EmptyNote>No playlists yet.</EmptyNote>
        ) : (
          playlists.map((pl: MusicPlaylist) => (
            <PlaylistRow
              key={pl.id}
              $active={pl.id === selectedPlaylistId}
              onClick={() => onPlaylistSelect(pl.id)}
            >
              {pl.name}
              {pl.isPublic && <Badge>public</Badge>}
            </PlaylistRow>
          ))
        )}

        {creating ? (
          <CreateRow>
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
          <Button size="sm" onClick={() => setCreating(true)}>+ New Playlist</Button>
        )}
      </PlaylistWrap>
    </GroupBox>
  );
}

const PlaylistWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
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
`;

const Badge = styled.span`
  font-size: 9px;
  background: #0000aa;
  color: #fff;
  padding: 1px 4px;
`;

const LoadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
`;

const EmptyNote = styled.div`
  font-size: 11px;
  color: #555;
  padding: 6px 0;
`;

const CreateRow = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`;
