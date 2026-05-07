import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled, { keyframes } from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useWindowManager } from "../lib/window-context";

interface MusicItem {
  id: number;
  title: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  mimeType: string;
}

type TezampMode = "library" | "winamp-bootloader";

export function Tezamp({ mode = "library" }: { mode?: TezampMode }) {
  const wm = useWindowManager();
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

  if (mode === "winamp-bootloader") {
    return (
      <AppWindow title="Winamp Bootloader">
        <BootloaderFrame
          title="Winamp Bootloader"
          src="/tezamp/winamp-bootloader/index.html"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
          allow="clipboard-read; clipboard-write; autoplay"
        />
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Tezamp">
      <TezampLayout>
        <Deck>
          <Visualizer>
            {Array.from({ length: 20 }, (_, index) => (
              <Bar key={index} $index={index} />
            ))}
          </Visualizer>
          <NowPlaying>
            <strong>{selected?.title ?? "No track loaded"}</strong>
            <span>Tezos playlist engine stub</span>
          </NowPlaying>
          {selected ? (
            <audio controls src={selected.playbackUrl || selected.sourceUrl} />
          ) : (
            <Button onClick={() => wm.openPage("/my-music")}>Open My Music</Button>
          )}
          <Button onClick={() => wm.openPage("/tezamp/winamp-bootloader")}>
            Open Winamp Bootloader
          </Button>
        </Deck>
        <GroupBox label="My Music Queue">
          {musicQuery.isLoading ? (
            <LoadingLine><Hourglass size={22} /> Loading audio...</LoadingLine>
          ) : tracks.length === 0 ? (
            <EmptyLine>No audio files in My Music yet.</EmptyLine>
          ) : (
            <QueueList>
              {tracks.map((track) => (
                <QueueButton
                  key={track.id}
                  type="button"
                  data-compact-control="true"
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

const pulse = keyframes`
  0%, 100% { transform: scaleY(0.24); }
  50% { transform: scaleY(1); }
`;

const TezampLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 1.2fr) minmax(220px, 0.8fr);
  gap: 10px;
  min-height: 0;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const BootloaderFrame = styled.iframe`
  width: 100%;
  height: min(72vh, 720px);
  min-height: 520px;
  border: 0;
  background: #000;
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
`;

const Bar = styled.span<{ $index: number }>`
  flex: 1;
  min-width: 3px;
  height: ${(p) => 34 + ((p.$index * 19) % 92)}%;
  transform-origin: bottom;
  background: linear-gradient(180deg, #facc15, #22d3ee 58%, #a78bfa);
  animation: ${pulse} ${(p) => 0.8 + (p.$index % 6) * 0.13}s ease-in-out infinite;
  animation-delay: ${(p) => p.$index * -0.06}s;
`;

const NowPlaying = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-size: 10px;
    color: #cbd5e1;
  }
`;

const QueueList = styled.div`
  display: grid;
  gap: 4px;
  max-height: min(56vh, 420px);
  overflow-y: auto;
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
`;

const LoadingLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`;

const EmptyLine = styled.div`
  font-size: 12px;
  padding: 12px 0;
`;
