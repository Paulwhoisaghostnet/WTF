/**
 * GallerySlideshow — Auto-advancing gallery with slideshow toggle
 *
 * Renders a grid of gallery tokens and adds an optional auto-advancing
 * slideshow mode.  When the slideshow is active the component cycles through
 * tokens at a configurable interval and highlights the current item.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";

export interface GalleryToken {
  id: number | string;
  name: string;
  artist?: string | null;
  displayUri?: string | null;
  artifactUri?: string | null;
  contractAddress?: string;
  tokenId?: string;
}

interface GallerySlideshowProps {
  tokens: GalleryToken[];
  /** Auto-advance interval in ms. Defaults to 4000. */
  intervalMs?: number;
  /** Callback when user clicks a token. */
  onSelect?: (token: GalleryToken) => void;
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
`;

const CardWrapper = styled.div<{ $active?: boolean }>`
  cursor: pointer;
  outline: ${(p) => (p.$active ? "3px solid #00ffcc" : "2px solid transparent")};
  outline-offset: 2px;
  transition: outline 0.15s ease;
  &:hover {
    outline: 2px solid #0088ff;
  }
`;

const Thumb = styled.div`
  width: 100%;
  height: 130px;
  background: linear-gradient(135deg, #001a1a 0%, #000a1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px inset #808080;
  margin-bottom: 6px;
`;

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const TokenName = styled.p`
  font-size: 11px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 0 2px 0;
`;

const TokenMeta = styled.p`
  font-size: 10px;
  color: #666;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Controls = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const SlideshowIndicator = styled.span`
  font-size: 11px;
  color: #00ffcc;
  font-family: "Courier New", monospace;
`;

const Spotlight = styled.div`
  width: 100%;
  height: 280px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px inset #808080;
  margin-bottom: 10px;
`;

const SpotlightImg = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
`;

export function GallerySlideshow({
  tokens,
  intervalMs = 4_000,
  onSelect,
}: GallerySlideshowProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % Math.max(tokens.length, 1));
  }, [tokens.length]);

  const retreat = useCallback(() => {
    setCurrentIndex((i) =>
      i === 0 ? Math.max(tokens.length - 1, 0) : i - 1
    );
  }, [tokens.length]);

  useEffect(() => {
    if (isPlaying && tokens.length > 1) {
      timerRef.current = setInterval(advance, intervalMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, advance, intervalMs, tokens.length]);

  const current = tokens[currentIndex] ?? null;

  if (tokens.length === 0) {
    return (
      <GroupBox label="Gallery">
        <p style={{ fontSize: 11 }}>No tokens to display.</p>
      </GroupBox>
    );
  }

  return (
    <GroupBox label="Gallery">
      <Controls>
        <Button
          size="sm"
          onClick={retreat}
          disabled={tokens.length <= 1}
          title="Previous"
        >
          ◀
        </Button>
        <Button
          size="sm"
          onClick={() => setIsPlaying((p) => !p)}
          title={isPlaying ? "Pause slideshow" : "Start slideshow"}
        >
          {isPlaying ? "⏸ Pause" : "▶ Slideshow"}
        </Button>
        <Button
          size="sm"
          onClick={advance}
          disabled={tokens.length <= 1}
          title="Next"
        >
          ▶
        </Button>
        {isPlaying && (
          <SlideshowIndicator>
            [{currentIndex + 1} / {tokens.length}]
          </SlideshowIndicator>
        )}
      </Controls>

      {current && (
        <Spotlight>
          {current.displayUri || current.artifactUri ? (
            <SpotlightImg
              src={current.displayUri ?? current.artifactUri ?? ""}
              alt={current.name}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span style={{ color: "#444", fontSize: 14 }}>No preview</span>
          )}
        </Spotlight>
      )}

      <Grid>
        {tokens.map((token, idx) => (
          <CardWrapper
            key={token.id}
            $active={idx === currentIndex}
            onClick={() => {
              setCurrentIndex(idx);
              onSelect?.(token);
            }}
          >
            <Thumb>
              {token.displayUri || token.artifactUri ? (
                <ThumbImg
                  src={token.displayUri ?? token.artifactUri ?? ""}
                  alt={token.name}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span style={{ color: "#333", fontSize: 24 }}>🎨</span>
              )}
            </Thumb>
            <TokenName title={token.name}>{token.name}</TokenName>
            {token.artist && (
              <TokenMeta title={token.artist}>by {token.artist}</TokenMeta>
            )}
          </CardWrapper>
        ))}
      </Grid>
    </GroupBox>
  );
}
