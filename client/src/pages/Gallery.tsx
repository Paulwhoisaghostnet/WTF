import { useState } from "react";
import { GroupBox } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiNotice } from "../components/wtfos-ui";
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
  background: var(--wtf-app-surface-raised, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-body-strong, 15px);
  border: 1px dashed var(--wtf-app-border, #808080);
  margin-bottom: 8px;
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--wtf-space-2, 8px);
  margin-bottom: var(--wtf-space-2, 8px);
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
          <ActionRow style={{ marginTop: 8 }}>
            <UiButton onClick={() => setSlideshowMode(false)}>
              Back to grid view
            </UiButton>
          </ActionRow>
        </>
      ) : (
        <>
          <ActionRow>
            <UiButton onClick={() => setSlideshowMode(true)} uiVariant="primary">
              Slideshow
            </UiButton>
          </ActionRow>

          <h3 style={{ marginTop: 4, marginBottom: 12 }}>Survival Tokens</h3>
          <Grid>
            {survivalTokens.map((token) => (
              <ArtCard key={token.id} label={token.name}>
                <Placeholder>NFT Preview</Placeholder>
                <p className="wtf-caption">by {token.artist}</p>
              </ArtCard>
            ))}
          </Grid>
        </>
      )}

      <UiNotice tone="info" style={{ marginTop: 16 }}>
        Gallery will be populated with on-chain token data from survival
        rounds and art auctions.
      </UiNotice>
    </AppWindow>
  );
}
