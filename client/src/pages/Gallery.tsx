import { useState } from "react";
import { GroupBox } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiNotice } from "../components/wtfos-ui";
import { GallerySlideshow } from "../features/gallery/GallerySlideshow";
import { usePresentationShell } from "../lib/presentation-shell";

const GalleryLayout = styled.div`
  display: grid;
  gap: 12px;

  &[data-gallery-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-gallery-presentation-host="gamma"] [data-gallery-region] {
    background-image: none;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-gallery-presentation-host="gamma"] fieldset {
    background: #11110f !important;
    border: 1px solid rgba(242, 234, 217, 0.24) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    color: #f2ead9;
  }

  &[data-gallery-presentation-host="gamma"] legend {
    background: #070706;
    color: #00d2ff;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    padding: 0 6px;
  }

  &[data-gallery-presentation-host="gamma"] button {
    background: #070706 !important;
    border: 1px solid rgba(0, 210, 255, 0.56) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    color: #00d2ff !important;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    min-height: 32px;
    text-shadow: none !important;
  }

  &[data-gallery-presentation-host="gamma"] [data-gallery-region="notice"] {
    background: #11110f !important;
    border: 1px solid rgba(0, 210, 255, 0.36) !important;
    border-radius: 6px !important;
    color: rgba(242, 234, 217, 0.84) !important;
  }
`;

const Intro = styled.p`
  margin: 0 0 12px;

  [data-gallery-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.82);
    line-height: 1.45;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`;

const ArtCard = styled(GroupBox)`
  text-align: center;

  [data-gallery-presentation-host="gamma"] & {
    min-height: 230px;
  }
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

  [data-gallery-presentation-host="gamma"] & {
    background: #070706;
    border-color: rgba(0, 210, 255, 0.48);
    border-radius: 4px;
    color: rgba(242, 234, 217, 0.74);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--wtf-space-2, 8px);
  margin-bottom: var(--wtf-space-2, 8px);
`;

const SectionTitle = styled.h3`
  margin: 4px 0 12px;

  [data-gallery-presentation-host="gamma"] & {
    color: #f2ead9;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.25;
  }
`;

const TokenArtist = styled.p`
  margin: 0;
`;

const SlideshowRegion = styled.div`
  [data-gallery-presentation-host="gamma"] & {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    padding: 10px;
  }
`;

const survivalTokens = [
  { id: 1, name: "Season 1 - Round 1 Survivor", artist: "MariMigraine", displayUri: null },
  { id: 2, name: "Did You Sleep?", artist: "MariMigraine", displayUri: null },
  { id: 3, name: "The Heckler", artist: "TransparentArt", displayUri: null },
];

export function Gallery() {
  const [slideshowMode, setSlideshowMode] = useState(false);
  const presentation = usePresentationShell();

  return (
    <AppWindow title="Gallery - Survival Tokens & Art">
      <GalleryLayout
        data-gallery-surface="survival-gallery"
        data-gallery-presentation-host={presentation.host}
        data-gallery-region="layout"
      >
        <Intro data-gallery-region="intro">
          Exclusive artwork and survival tokens from WTF Gameshow.
          Survivors of each round receive commemorative NFTs.
        </Intro>

        {slideshowMode ? (
          <>
            <SlideshowRegion data-gallery-region="slideshow">
              <GallerySlideshow
                tokens={survivalTokens}
                intervalMs={4000}
              />
            </SlideshowRegion>
            <ActionRow data-gallery-region="action-row" style={{ marginTop: 8 }}>
              <UiButton onClick={() => setSlideshowMode(false)}>
                Back to grid view
              </UiButton>
            </ActionRow>
          </>
        ) : (
          <>
            <ActionRow data-gallery-region="action-row">
              <UiButton onClick={() => setSlideshowMode(true)} uiVariant="primary">
                Slideshow
              </UiButton>
            </ActionRow>

            <SectionTitle data-gallery-region="section-title">Survival Tokens</SectionTitle>
            <Grid data-gallery-region="grid">
              {survivalTokens.map((token) => (
                <ArtCard key={token.id} label={token.name} data-gallery-region="token-card">
                  <Placeholder data-gallery-region="token-preview">NFT Preview</Placeholder>
                  <TokenArtist className="wtf-caption" data-gallery-region="artist">
                    by {token.artist}
                  </TokenArtist>
                </ArtCard>
              ))}
            </Grid>
          </>
        )}

        <UiNotice tone="info" style={{ marginTop: 16 }} data-gallery-region="notice">
          Gallery will be populated with on-chain token data from survival
          rounds and art auctions.
        </UiNotice>
      </GalleryLayout>
    </AppWindow>
  );
}
