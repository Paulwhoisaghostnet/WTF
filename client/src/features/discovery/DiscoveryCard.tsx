import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const Thumb = styled.div`
  width: 100%;
  height: 80px;
  background: linear-gradient(135deg, #008080 0%, #000080 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  margin-bottom: 6px;
  overflow: hidden;
`;

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const Meta = styled.p`
  font-size: 11px;
  color: #444;
  margin: 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Label = styled.span`
  font-weight: bold;
  font-size: 11px;
`;

interface RandomArtistResult {
  address: string;
  domain: string | null;
  displayName: string | null;
  avatarUri: string | null;
  collectionCount: number;
  source: string;
}

interface RandomNftResult {
  contractAddress: string;
  tokenId: string;
  title: string | null;
  description: string | null;
  artifactUri: string | null;
  displayUri: string | null;
  creatorAddress: string | null;
  source: string;
}

function addrShort(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function DiscoveryCard() {
  const { data: artist, isLoading: artistLoading, refetch: refetchArtist } =
    useQuery<RandomArtistResult>({
      queryKey: ["discovery", "random-artist"],
      queryFn: () => api.get<RandomArtistResult>("/api/discovery/random-artist"),
      staleTime: 5 * 60_000,
    });

  const { data: nft, isLoading: nftLoading, refetch: refetchNft } =
    useQuery<RandomNftResult>({
      queryKey: ["discovery", "random-nft"],
      queryFn: () => api.get<RandomNftResult>("/api/discovery/random-nft"),
      staleTime: 5 * 60_000,
    });

  return (
    <GroupBox label="✦ Discovery">
      <CardGrid>
        {/* Random Artist */}
        <GroupBox label="Random Artist">
          {artistLoading ? (
            <Hourglass size={18} />
          ) : artist ? (
            <>
              <Thumb>
                {artist.avatarUri ? (
                  <ThumbImg
                    src={artist.avatarUri}
                    alt={artist.displayName ?? artist.address}
                  />
                ) : (
                  <span>👤</span>
                )}
              </Thumb>
              <Meta>
                <Label>{artist.displayName ?? artist.domain ?? addrShort(artist.address)}</Label>
              </Meta>
              <Meta>{artist.collectionCount} collection{artist.collectionCount !== 1 ? "s" : ""}</Meta>
              <Meta style={{ color: "#888" }}>{addrShort(artist.address)}</Meta>
            </>
          ) : (
            <Meta>No artist found</Meta>
          )}
          <Button
            size="sm"
            style={{ marginTop: 6, fontSize: 11 }}
            onClick={() => { void refetchArtist(); }}
          >
            Shuffle
          </Button>
        </GroupBox>

        {/* Random NFT */}
        <GroupBox label="Random NFT">
          {nftLoading ? (
            <Hourglass size={18} />
          ) : nft ? (
            <>
              <Thumb>
                {nft.displayUri || nft.artifactUri ? (
                  <ThumbImg
                    src={nft.displayUri ?? nft.artifactUri ?? ""}
                    alt={nft.title ?? "NFT"}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span>🎨</span>
                )}
              </Thumb>
              <Meta>
                <Label>{nft.title ?? "Untitled"}</Label>
              </Meta>
              <Meta>Token #{nft.tokenId}</Meta>
              <Meta style={{ color: "#888" }}>{addrShort(nft.contractAddress)}</Meta>
            </>
          ) : (
            <Meta>No NFT found</Meta>
          )}
          <Button
            size="sm"
            style={{ marginTop: 6, fontSize: 11 }}
            onClick={() => { void refetchNft(); }}
          >
            Shuffle
          </Button>
        </GroupBox>
      </CardGrid>
    </GroupBox>
  );
}
