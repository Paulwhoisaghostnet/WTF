import styled from "styled-components";
import type { useMusicPlayer } from "./useMusicPlayer";

type PlayerState = ReturnType<typeof useMusicPlayer>;

interface Props {
  player: PlayerState;
}

export function MusicMiniPlayer({ player }: Props) {
  const { currentTrack, isPlaying, togglePlay } = player;

  if (!currentTrack) return null;

  return (
    <MiniBar>
      <MiniBtn onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? "⏸" : "▶"}
      </MiniBtn>
      <MiniInfo>
        <MiniTitle>{currentTrack.title ?? "Unknown"}</MiniTitle>
        <MiniArtist>{currentTrack.artist ?? "—"}</MiniArtist>
      </MiniInfo>
      {isPlaying && <MiniDot />}
    </MiniBar>
  );
}

const MiniBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  background: #101820;
  border: 2px inset #808080;
  color: #f8fafc;
  font-size: 10px;
`;

const MiniBtn = styled.button`
  background: transparent;
  border: 1px outset #555;
  color: #f8fafc;
  cursor: pointer;
  padding: 1px 4px;
  font-size: 12px;
`;

const MiniInfo = styled.div`
  flex: 1;
  overflow: hidden;
`;

const MiniTitle = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
  font-size: 10px;
`;

const MiniArtist = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #94a3b8;
  font-size: 9px;
`;

const MiniDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  flex-shrink: 0;
  animation: blink 1s step-start infinite;

  @keyframes blink {
    50% { opacity: 0; }
  }
`;
