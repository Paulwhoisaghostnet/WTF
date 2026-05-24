import { createContext, useContext, type ReactNode } from "react";
import { useMusicPlayer } from "./useMusicPlayer";
import { MusicPlayback } from "./MusicPlayback";

type MusicPlayerState = ReturnType<typeof useMusicPlayer>;

const MusicPlayerContext = createContext<MusicPlayerState | null>(null);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const player = useMusicPlayer();

  return (
    <MusicPlayerContext.Provider value={player}>
      <MusicPlayback player={player} />
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useSharedMusicPlayer(): MusicPlayerState {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error("useSharedMusicPlayer must be used within MusicPlayerProvider");
  }
  return ctx;
}
