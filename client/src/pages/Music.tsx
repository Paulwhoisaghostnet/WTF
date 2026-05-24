import { AppWindow } from "../components/layout/AppWindow";
import { MusicPlayer } from "../features/music/MusicPlayer";

export function Music() {
  return (
    <AppWindow title="TezosBeats — Music Player">
      <MusicPlayer />
    </AppWindow>
  );
}
