import { useState } from "react";
import { GroupBox, Tab, TabBody, Tabs } from "react95";
import styled from "styled-components";
import { useSharedMusicPlayer } from "./MusicPlayerContext";
import { useMusicNfts, useMyMediaAudio } from "./useMusicNfts";
import { MusicNowPlaying } from "./MusicNowPlaying";
import { MusicPlaylist } from "./MusicPlaylist";
import { useWallet } from "../../lib/wallet-context";
import { Hourglass } from "react95";

export function MusicPlayer() {
  const player = useSharedMusicPlayer();
  const nftsQ = useMusicNfts();
  const mediaQ = useMyMediaAudio();
  const { address } = useWallet();
  const [tab, setTab] = useState<"nfts" | "library" | "playlists">("nfts");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const { currentTrack, isPlaying, playFromPlaylist } = player;

  return (
    <PlayerLayout>
      <DeckPanel>
        <MusicNowPlaying track={currentTrack} isPlaying={isPlaying} />
        <Credit>TezosBeats · by skllzrmy / FAFOlab</Credit>
      </DeckPanel>

      <QueuePanel>
        <Tabs value={tab} onChange={(v: any) => setTab(v as any)}>
          <Tab value="nfts">NFTs</Tab>
          <Tab value="library">My Music</Tab>
          <Tab value="playlists">Playlists</Tab>
        </Tabs>
        <TabBody>
          {tab === "nfts" && (
            <ScrollList>
              {!address && (
                <InfoNote>Connect a Tezos wallet to see audio NFTs.</InfoNote>
              )}
              {nftsQ.isLoading && <LoadRow><Hourglass size={18} /> Loading NFTs...</LoadRow>}
              {(nftsQ.data ?? []).map((nft) => (
                <TrackRow
                  key={`${nft.contract}:${nft.tokenId}`}
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
            <ScrollList>
              {mediaQ.isLoading && <LoadRow><Hourglass size={18} /> Loading...</LoadRow>}
              {(mediaQ.data ?? []).length === 0 && !mediaQ.isLoading && (
                <InfoNote>No audio in My Music yet.</InfoNote>
              )}
              {(mediaQ.data ?? []).map((item) => (
                <TrackRow
                  key={item.id}
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

const PlayerLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 1.2fr) minmax(220px, 0.8fr);
  gap: 10px;
  min-height: 0;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DeckPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const QueuePanel = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const ScrollList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: min(50vh, 380px);
  overflow-y: auto;
  padding: 4px;
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
`;

const TrackTitle = styled.span`
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TrackArtist = styled.span`
  font-size: 10px;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LoadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px;
`;

const InfoNote = styled.div`
  font-size: 11px;
  color: #555;
  padding: 8px 4px;
`;

const Credit = styled.div`
  font-size: 9px;
  color: #94a3b8;
  text-align: right;
  padding: 2px 4px;
  background: #101820;
`;
