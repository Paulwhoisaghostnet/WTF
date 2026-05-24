import { useState } from "react";
import { GroupBox } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { GallerySlideshow } from "../features/gallery/GallerySlideshow";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`;

const ArtCard = styled(GroupBox)`
  text-align: center;
`;

const Placeholder = styled.div`
  width: 100%;
  height: 160px;
  background: linear-gradient(135deg, #008080 0%, #000080 50%, #800080 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  border: 2px inset #c0c0c0;
  margin-bottom: 8px;
`;

const survivalTokens = [
  { id: 1, name: "Season 1 - Round 1 Survivor", artist: "MariMigraine", displayUri: null },
  { id: 2, name: "Did You Sleep?", artist: "MariMigraine", displayUri: null },
  { id: 3, name: "The Heckler", artist: "TransparentArt", displayUri: null },
];

export function Gallery() {
  const [slideshowMode, setSlideshowMode] = useState(false);

  return (
    <AppWindow title="Gallery - Survival Tokens & Art">
      <p style={{ marginBottom: 12 }}>
        Exclusive artwork and survival tokens from WTF Gameshow.
        Survivors of each round receive commemorative NFTs.
      </p>

      {slideshowMode ? (
        <>
          <GallerySlideshow
            tokens={survivalTokens}
            intervalMs={4000}
          />
          <p style={{ marginTop: 8, fontSize: 11, color: "#555" }}>
            <button
              onClick={() => setSlideshowMode(false)}
              style={{ fontSize: 11, cursor: "pointer" }}
            >
              ← Back to grid view
            </button>
          </p>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setSlideshowMode(true)}
              style={{ fontSize: 11, cursor: "pointer", padding: "3px 8px" }}
            >
              ▶ Slideshow
            </button>
          </div>

          <h3 style={{ marginTop: 4, marginBottom: 12 }}>Survival Tokens</h3>
          <Grid>
            {survivalTokens.map((token) => (
              <ArtCard key={token.id} label={token.name}>
                <Placeholder>NFT Preview</Placeholder>
                <p style={{ fontSize: 11 }}>by {token.artist}</p>
              </ArtCard>
            ))}
          </Grid>
        </>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: "#808080" }}>
        Gallery will be populated with on-chain token data from survival
        rounds and art auctions.
      </p>
    </AppWindow>
  );
}
