import { useEffect } from "react";
import type { useMusicPlayer } from "./useMusicPlayer";

type PlayerState = ReturnType<typeof useMusicPlayer>;

interface Props {
  player: PlayerState;
}

/**
 * Invisible component that manages the Audio element lifecycle.
 * Visible playback controls live in MusicMiniPlayer (system tray)
 * and MusicPlayer (full app window).
 */
export function MusicPlayback({ player }: Props) {
  const { audioRef, volume } = player;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }
  }, []);

  return null;
}
