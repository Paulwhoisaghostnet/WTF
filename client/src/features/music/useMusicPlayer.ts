import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setNowPlaying, type MusicPlaylistTrack } from "./api";

export interface TrackRef {
  tokenContract: string;
  tokenId: string;
  title: string | null;
  artist: string | null;
  audioUrl: string | null;
}

export function useMusicPlayer() {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackRef | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);

  const nowPlayingMutation = useMutation({
    mutationFn: setNowPlaying,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["music", "now-playing"] });
    },
  });

  const play = useCallback(
    (track: TrackRef) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (currentTrack?.tokenId !== track.tokenId || currentTrack?.tokenContract !== track.tokenContract) {
        audio.src = track.audioUrl ?? "";
        setCurrentTrack(track);
      }

      audio.volume = volume;
      audio.play().catch(() => {});
      setIsPlaying(true);

      nowPlayingMutation.mutate({
        tokenContract: track.tokenContract,
        tokenId: track.tokenId,
        title: track.title ?? undefined,
        artist: track.artist ?? undefined,
        isPlaying: true,
      });
    },
    [currentTrack, volume, nowPlayingMutation]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    if (currentTrack) {
      nowPlayingMutation.mutate({
        tokenContract: currentTrack.tokenContract,
        tokenId: currentTrack.tokenId,
        title: currentTrack.title ?? undefined,
        artist: currentTrack.artist ?? undefined,
        isPlaying: false,
      });
    }
  }, [currentTrack, nowPlayingMutation]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      play(currentTrack);
    }
  }, [isPlaying, currentTrack, pause, play]);

  const playFromPlaylist = useCallback(
    (track: MusicPlaylistTrack) => {
      play({
        tokenContract: track.tokenContract,
        tokenId: track.tokenId,
        title: track.title,
        artist: track.artist,
        audioUrl: track.audioUrl,
      });
    },
    [play]
  );

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  return {
    audioRef,
    currentTrack,
    isPlaying,
    volume,
    play,
    pause,
    togglePlay,
    playFromPlaylist,
    changeVolume,
  };
}
