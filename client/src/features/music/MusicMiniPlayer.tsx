import { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import type { useMusicPlayer } from "./useMusicPlayer";

type PlayerState = ReturnType<typeof useMusicPlayer>;

interface Props {
  player: PlayerState;
}

export function MusicMiniPlayer({ player }: Props) {
  const { currentTrack, isPlaying, volume, togglePlay, changeVolume } = player;
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!volumeOpen) return;
    const handler = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [volumeOpen]);

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
      <VolumeWrap ref={volumeRef}>
        <MiniBtn
          onClick={() => setVolumeOpen((v) => !v)}
          title={`Volume: ${Math.round(volume * 100)}%`}
        >
          {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
        </MiniBtn>
        {volumeOpen && (
          <VolumePopup>
            <VolumeSlider
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
            />
            <VolumeLabel>{Math.round(volume * 100)}%</VolumeLabel>
          </VolumePopup>
        )}
      </VolumeWrap>
      {isPlaying && <MiniDot />}
    </MiniBar>
  );
}

const MiniBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
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
  flex-shrink: 0;
`;

const MiniInfo = styled.div`
  flex: 1;
  min-width: 0;
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

const VolumeWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const VolumePopup = styled.div`
  position: absolute;
  bottom: 28px;
  right: -4px;
  background: #1e293b;
  border: 2px outset #555;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 300;
`;

const VolumeSlider = styled.input`
  width: 80px;
  cursor: pointer;
  accent-color: #22d3ee;
`;

const VolumeLabel = styled.span`
  font-size: 9px;
  color: #94a3b8;
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
