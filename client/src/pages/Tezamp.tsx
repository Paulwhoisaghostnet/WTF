import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled, { keyframes } from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { useWindowManager } from "../lib/window-context";
import { resolveArtifactUri } from "../lib/media-resolve";

interface MusicItem {
  id: number;
  title: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  mimeType: string;
}

export function Tezamp() {
  const wm = useWindowManager();
  const presentation = usePresentationShell();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const musicQuery = useQuery({
    queryKey: ["media-library", "audio"],
    queryFn: () => api.get<MusicItem[]>("/api/media/mine?category=audio"),
    staleTime: 30_000,
  });

  const tracks = musicQuery.data ?? [];
  const selected = useMemo(
    () => tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null,
    [selectedId, tracks]
  );
  const resolvedAudio = useMemo(
    () => resolveArtifactUri(selected?.playbackUrl || selected?.sourceUrl),
    [selected]
  );

  return (
    <AppWindow title="Tezamp">
      <TezampLayout
        data-tezamp-surface="player"
        data-tezamp-presentation-host={presentation.host}
        data-tezamp-region="layout"
      >
        <Deck data-tezamp-region="deck">
          <Visualizer data-tezamp-region="visualizer">
            {Array.from({ length: 20 }, (_, index) => (
              <Bar key={index} data-tezamp-region="visualizer-bar" $index={index} />
            ))}
          </Visualizer>
          <NowPlaying data-tezamp-region="now-playing">
            <strong>{selected?.title ?? "No track loaded"}</strong>
            <span>Tezos playlist engine stub</span>
          </NowPlaying>
          {selected ? (
            <audio data-tezamp-region="audio-player" controls src={resolvedAudio?.src || ""} />
          ) : (
            <Button data-tezamp-region="open-library-button" onClick={() => wm.openPage("/my-music")}>Open My Music</Button>
          )}
        </Deck>
        <GroupBox label="My Music Queue" data-tezamp-region="queue-panel">
          {musicQuery.isLoading ? (
            <LoadingLine data-tezamp-region="loading-row"><Hourglass size={22} /> Loading audio...</LoadingLine>
          ) : tracks.length === 0 ? (
            <EmptyLine data-tezamp-region="empty-state">No audio files in My Music yet.</EmptyLine>
          ) : (
            <QueueList data-tezamp-region="queue-list">
              {tracks.map((track) => (
                <QueueButton
                  key={track.id}
                  type="button"
                  data-compact-control="true"
                  data-tezamp-region="queue-button"
                  $active={track.id === selected?.id}
                  onClick={() => setSelectedId(track.id)}
                >
                  <span>{track.title}</span>
                  <i>{track.mimeType}</i>
                </QueueButton>
              ))}
            </QueueList>
          )}
        </GroupBox>
      </TezampLayout>
    </AppWindow>
  );
}

const gammaTezampScope = `[data-tezamp-presentation-host="gamma"]`;

const pulse = keyframes`
  0%, 100% { transform: scaleY(0.24); }
  50% { transform: scaleY(1); }
`;

const TezampLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 1.2fr) minmax(220px, 0.8fr);
  gap: 10px;
  min-height: 0;

  &[data-tezamp-presentation-host="gamma"] {
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 4px;
  }

  &[data-tezamp-presentation-host="gamma"] [data-tezamp-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-tezamp-presentation-host="gamma"] button,
  &[data-tezamp-presentation-host="gamma"] input {
    font-family: inherit;
  }

  &[data-tezamp-presentation-host="gamma"] fieldset {
    background: rgba(17, 17, 15, 0.96);
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-tezamp-presentation-host="gamma"] legend {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Deck = styled.div`
  display: grid;
  grid-template-rows: minmax(150px, 1fr) auto auto;
  gap: 8px;
  min-height: 280px;
  border: 2px inset #dfdfdf;
  padding: 8px;
  background: #101820;
  color: #f8fafc;

  ${gammaTezampScope} & {
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #11110f;
    color: #f2ead9;
  }

  audio {
    width: 100%;
  }
`;

const Visualizer = styled.div`
  display: flex;
  align-items: end;
  gap: 5px;
  min-height: 150px;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(34, 211, 238, 0.14), transparent),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 18px),
    #05070a;
  border: 1px solid #334155;
  overflow: hidden;

  ${gammaTezampScope} & {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    background: #070706;
  }
`;

const Bar = styled.span<{ $index: number }>`
  flex: 1;
  min-width: 3px;
  height: ${(p) => 34 + ((p.$index * 19) % 92)}%;
  transform-origin: bottom;
  background: linear-gradient(180deg, #facc15, #22d3ee 58%, #a78bfa);
  animation: ${pulse} ${(p) => 0.8 + (p.$index % 6) * 0.13}s ease-in-out infinite;
  animation-delay: ${(p) => p.$index * -0.06}s;

  ${gammaTezampScope} & {
    border-radius: 1px;
    background: #00d2ff;
  }
`;

const NowPlaying = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  ${gammaTezampScope} & {
    color: #f2ead9;
  }

  span {
    font-size: 10px;
    color: #cbd5e1;
  }

  ${gammaTezampScope} & span {
    color: rgba(242, 234, 217, 0.68);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const QueueList = styled.div`
  display: grid;
  gap: 4px;
  max-height: min(56vh, 420px);
  overflow-y: auto;

  ${gammaTezampScope} & {
    gap: 6px;
    padding: 2px;
  }
`;

const QueueButton = styled.button<{ $active: boolean }>`
  min-height: 36px;
  border: 2px ${(p) => (p.$active ? "inset" : "outset")} #dfdfdf;
  background: ${(p) => (p.$active ? "#9fd4d4" : "#c0c0c0")};
  color: #111111;
  text-align: left;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  ${gammaTezampScope} & {
    min-height: 44px;
    border: 1px solid ${(p) => (p.$active ? "rgba(0, 210, 255, 0.8)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 6px;
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.14)" : "rgba(17, 17, 15, 0.92)")};
    color: #f2ead9;
    padding: 7px 9px;
  }

  span,
  i {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  i {
    font-size: 10px;
    color: #555555;
  }

  ${gammaTezampScope} & i {
    color: rgba(242, 234, 217, 0.68);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const LoadingLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  ${gammaTezampScope} & {
    color: #f2ead9;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const EmptyLine = styled.div`
  font-size: 12px;
  padding: 12px 0;

  ${gammaTezampScope} & {
    color: rgba(242, 234, 217, 0.74);
    font-size: var(--wtf-type-caption, 13px);
  }
`;
