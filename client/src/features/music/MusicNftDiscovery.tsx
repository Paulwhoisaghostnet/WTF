import type { ReactElement } from "react";
import { GroupBox, Hourglass } from "react95";
import type { MusicNft } from "./useMusicNfts";

export function MusicNftDiscovery({
  nfts,
  loading,
  onPlay,
}: {
  nfts: MusicNft[];
  loading: boolean;
  onPlay: (nft: MusicNft) => void;
}): ReactElement {
  return (
    <GroupBox label="Your Music NFTs">
      {loading ? (
        <Hourglass size={28} />
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {nfts.map((nft) => (
            <li key={nft.id}>
              <button type="button" onClick={() => onPlay(nft)} style={{ cursor: "pointer" }}>
                {nft.title}
              </button>
              {nft.artist ? ` — ${nft.artist}` : null}
            </li>
          ))}
          {nfts.length === 0 ? <li>No audio NFTs found in connected wallet.</li> : null}
        </ul>
      )}
    </GroupBox>
  );
}
