import { useState } from "react";
import { GroupBox, Tab, TabBody, Tabs } from "react95";
import styled from "styled-components";
import { useSharedMusicPlayer } from "./MusicPlayerContext";
import { useMusicNfts, useMyMediaAudio } from "./useMusicNfts";
import { MusicNowPlaying } from "./MusicNowPlaying";
import { MusicPlaylist } from "./MusicPlaylist";
import { usePresentationShell } from "../../lib/presentation-shell";
import { useWallet } from "../../lib/wallet-context";
import { Hourglass } from "react95";

export function MusicPlayer() {
  const presentation = usePresentationShell();
  const player = useSharedMusicPlayer();
  const nftsQ = useMusicNfts();
  const mediaQ = useMyMediaAudio();
  const { address } = useWallet();
  const [tab, setTab] = useState<"nfts" | "library" | "playlists">("nfts");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const { currentTrack, isPlaying, playFromPlaylist } = player;

  return (
    <PlayerLayout
      data-music-surface="tezosbeats"
      data-music-presentation-host={presentation.host}
      data-music-region="layout"
    >
      <DeckPanel data-music-region="deck-panel">
        <MusicNowPlaying track={currentTrack} isPlaying={isPlaying} />
        <Credit data-music-region="credit">TezosBeats · by skllzrmy / FAFOlab</Credit>
      </DeckPanel>

      <QueuePanel data-music-region="queue-panel">
        <Tabs value={tab} onChange={(v: any) => setTab(v as any)}>
          <Tab value="nfts">NFTs</Tab>
          <Tab value="library">My Music</Tab>
          <Tab value="playlists">Playlists</Tab>
        </Tabs>
        <TabBody>
          {tab === "nfts" && (
            <ScrollList data-music-region="track-list">
              {!address && (
                <InfoNote data-music-region="info-note">Connect a Tezos wallet to see audio NFTs.</InfoNote>
              )}
              {nftsQ.isLoading && <LoadRow data-music-region="loading-row"><Hourglass size={18} /> Loading NFTs...</LoadRow>}
              {(nftsQ.data ?? []).map((nft) => (
                <TrackRow
                  key={`${nft.contract}:${nft.tokenId}`}
                  data-music-region="track-row"
                  $active={currentTrack?.tokenId === nft.tokenId && currentTrack?.tokenContract === nft.contract}
                  onClick={() =>
                    player.play({
                      tokenContract: nft.contract,
                      tokenId: nft.tokenId,
                      title: nft.title,
                      artist: nft.artist,
                      audioUrl: nft.artifactUri,
                    })
                  }
                >
                  <TrackTitle>{nft.title}</TrackTitle>
                  <TrackArtist>{nft.artist}</TrackArtist>
                </TrackRow>
              ))}
            </ScrollList>
          )}

          {tab === "library" && (
            <ScrollList data-music-region="track-list">
              {mediaQ.isLoading && <LoadRow data-music-region="loading-row"><Hourglass size={18} /> Loading...</LoadRow>}
              {(mediaQ.data ?? []).length === 0 && !mediaQ.isLoading && (
                <InfoNote data-music-region="info-note">No audio in My Music yet.</InfoNote>
              )}
              {(mediaQ.data ?? []).map((item) => (
                <TrackRow
                  key={item.id}
                  data-music-region="track-row"
                  $active={currentTrack?.tokenId === String(item.id) && currentTrack?.tokenContract === "media"}
                  onClick={() =>
                    player.play({
                      tokenContract: "media",
                      tokenId: String(item.id),
                      title: item.title,
                      artist: null,
                      audioUrl: item.playbackUrl ?? item.sourceUrl,
                    })
                  }
                >
                  <TrackTitle>{item.title}</TrackTitle>
                  <TrackArtist>{item.mimeType}</TrackArtist>
                </TrackRow>
              ))}
            </ScrollList>
          )}

          {tab === "playlists" && (
            <MusicPlaylist
              onTrackSelect={playFromPlaylist}
              selectedPlaylistId={selectedPlaylistId}
              onPlaylistSelect={setSelectedPlaylistId}
            />
          )}
        </TabBody>
      </QueuePanel>
    </PlayerLayout>
  );
}

const gammaMusicScope = `[data-music-presentation-host="gamma"]`;

const PlayerLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 1.2fr) minmax(220px, 0.8fr);
  gap: 10px;
  min-height: 0;

  &[data-music-presentation-host="gamma"] {
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 4px;
  }

  &[data-music-presentation-host="gamma"] [data-music-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-music-presentation-host="gamma"] button,
  &[data-music-presentation-host="gamma"] input {
    font-family: inherit;
  }

  &[data-music-presentation-host="gamma"] fieldset {
    background: rgba(17, 17, 15, 0.96);
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-music-presentation-host="gamma"] legend {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DeckPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  ${gammaMusicScope} & {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    padding: 6px;
    background: rgba(12, 12, 11, 0.86);
  }
`;

const QueuePanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;

  ${gammaMusicScope} & {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    padding: 6px;
    background: rgba(12, 12, 11, 0.86);
  }
`;

const ScrollList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: min(50vh, 380px);
  overflow-y: auto;
  padding: 4px;

  ${gammaMusicScope} & {
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    padding: 6px;
    background: #0d0d0c;
  }
`;

const TrackRow = styled.button<{ $active: boolean }>`
  border: 2px ${(p) => (p.$active ? "inset" : "outset")} #dfdfdf;
  background: ${(p) => (p.$active ? "#9fd4d4" : "#c0c0c0")};
  color: #111;
  text-align: left;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  cursor: pointer;

  ${gammaMusicScope} & {
    min-height: 44px;
    border: 1px solid ${(p) => (p.$active ? "rgba(0, 210, 255, 0.8)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 6px;
    background: ${(p) => (p.$active ? "rgba(0, 210, 255, 0.14)" : "rgba(17, 17, 15, 0.92)")};
    color: #f2ead9;
    padding: 7px 9px;
  }
`;

const TrackTitle = styled.span`
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaMusicScope} & {
    font-size: var(--wtf-type-body, 14px);
  }
`;

const TrackArtist = styled.span`
  font-size: 10px;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaMusicScope} & {
    color: rgba(242, 234, 217, 0.7);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const LoadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px;

  ${gammaMusicScope} & {
    color: #f2ead9;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const InfoNote = styled.div`
  font-size: 11px;
  color: #555;
  padding: 8px 4px;

  ${gammaMusicScope} & {
    color: rgba(242, 234, 217, 0.74);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const Credit = styled.div`
  font-size: 9px;
  color: #94a3b8;
  text-align: right;
  padding: 2px 4px;
  background: #101820;

  ${gammaMusicScope} & {
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.66);
    background: #11110f;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
    font-size: var(--wtf-type-caption, 13px);
    text-align: left;
  }
`;
