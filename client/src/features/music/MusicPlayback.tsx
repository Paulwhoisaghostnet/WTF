import { useEffect } from "react";
import styled from "styled-components";
import type { useMusicPlayer } from "./useMusicPlayer";

type PlayerState = ReturnType<typeof useMusicPlayer>;

interface Props {
  player: PlayerState;
}

export function MusicPlayback({ player }: Props) {
  const { audioRef, isPlaying, volume, togglePlay, changeVolume } = player;

  // Hidden audio element — controlled imperatively by useMusicPlayer
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }
  }, []);

  return (
    <PlaybackBar>
      <ControlButton onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? "⏸" : "▶"}
      </ControlButton>
      <VolumeWrap>
        <span title="Volume">🔊</span>
        <VolumeSlider
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => changeVolume(Number((e.target as HTMLInputElement).value))}
        />
        <VolumeLabel>{Math.round(volume * 100)}%</VolumeLabel>
      </VolumeWrap>
    </PlaybackBar>
  );
}

const PlaybackBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
`;

const ControlButton = styled.button`
  width: 36px;
  height: 28px;
  border: 2px outset #dfdfdf;
  background: #c0c0c0;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active {
    border-style: inset;
  }
`;

const VolumeWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
`;

const VolumeSlider = styled.input`
  width: 80px;
  cursor: pointer;
`;

const VolumeLabel = styled.span`
  font-size: 10px;
  min-width: 28px;
`;
