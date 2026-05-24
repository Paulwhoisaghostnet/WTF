import { api } from "../../lib/api";

export interface MusicPlaylist {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MusicPlaylistTrack {
  id: number;
  playlistId: number;
  tokenContract: string;
  tokenId: string;
  title: string | null;
  artist: string | null;
  audioUrl: string | null;
  position: number;
  addedAt: string;
}

export interface MusicNowPlaying {
  userId: number;
  tokenContract: string | null;
  tokenId: string | null;
  title: string | null;
  artist: string | null;
  isPlaying: boolean;
  updatedAt: string;
}

export interface AddTrackPayload {
  tokenContract: string;
  tokenId: string;
  title?: string;
  artist?: string;
  audioUrl?: string;
}

export interface NowPlayingPayload extends AddTrackPayload {
  isPlaying?: boolean;
}

export function fetchPlaylists() {
  return api.get<MusicPlaylist[]>("/api/music/playlists");
}

export function createPlaylist(body: {
  name: string;
  description?: string;
  isPublic?: boolean;
}) {
  return api.post<MusicPlaylist>("/api/music/playlists", body);
}

export function addTrackToPlaylist(playlistId: number, body: AddTrackPayload) {
  return api.post<MusicPlaylistTrack>(
    `/api/music/playlists/${playlistId}/tracks`,
    body
  );
}

export function fetchNowPlaying() {
  return api.get<MusicNowPlaying | null>("/api/music/now-playing");
}

export function setNowPlaying(body: NowPlayingPayload) {
  return api.put<MusicNowPlaying>("/api/music/now-playing", body);
}
