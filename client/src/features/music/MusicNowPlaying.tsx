import styled, { keyframes } from "styled-components";
import type { TrackRef } from "./useMusicPlayer";

interface Props {
  track: TrackRef | null;
  isPlaying: boolean;
}

export function MusicNowPlaying({ track, isPlaying }: Props) {
  return (
    <NowPlayingWrap>
      <Visualizer $active={isPlaying}>
        {Array.from({ length: 16 }, (_, i) => (
          <Bar key={i} $index={i} $active={isPlaying} />
        ))}
      </Visualizer>
      <TrackInfo>
        <Title>{track?.title ?? "No track selected"}</Title>
        <Artist>{track?.artist ?? "—"}</Artist>
        {isPlaying && <StatusBadge>▶ Now Playing</StatusBadge>}
      </TrackInfo>
    </NowPlayingWrap>
  );
}

const pulse = keyframes`
  0%, 100% { transform: scaleY(0.2); }
  50% { transform: scaleY(1); }
`;

const NowPlayingWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: #101820;
  border: 2px inset #808080;
  min-height: 120px;
`;

const Visualizer = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 56px;
  padding: 4px;
  background: #05070a;
  border: 1px solid #334155;
  opacity: ${(p) => (p.$active ? 1 : 0.4)};
`;

const Bar = styled.span<{ $index: number; $active: boolean }>`
  flex: 1;
  min-width: 4px;
  height: ${(p) => 20 + ((p.$index * 17) % 78)}%;
  transform-origin: bottom;
  background: linear-gradient(180deg, #facc15, #22d3ee 60%, #a78bfa);
  animation: ${(p) =>
    p.$active
      ? `${pulse} ${0.7 + (p.$index % 5) * 0.15}s ease-in-out infinite`
      : "none"};
  animation-delay: ${(p) => p.$index * -0.05}s;
`;

const TrackInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #f8fafc;
`;

const Title = styled.span`
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Artist = styled.span`
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusBadge = styled.span`
  font-size: 10px;
  color: #22d3ee;
  letter-spacing: 0.04em;
`;
