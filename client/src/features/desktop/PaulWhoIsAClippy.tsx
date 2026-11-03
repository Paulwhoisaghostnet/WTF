import { useEffect, useMemo, useState } from "react";
import styled, { keyframes } from "styled-components";
import { paulAssetUrl } from "../../lib/paul-assets";
import type { DesktopObstacle } from "./DesktopPetModel";

const GHOST_WIDTH = 112;
const GHOST_HEIGHT = 116;
const GHOST_MARGIN = 12;
const GHOST_CLEARANCE = 14;

type Bounds = { width: number; height: number };
type Position = { x: number; y: number };

const WHISPERS = [
  "Boo. I'm paulwhoisaclippy. The desktop has secrets.",
  "I haunt the gaps between your windows.",
  "If you lose your way, the Stuffs menu is still there.",
] as const;

function intersects(
  position: Position,
  obstacle: Pick<DesktopObstacle, "x" | "y" | "width" | "height">
) {
  return (
    position.x < obstacle.x + obstacle.width + GHOST_CLEARANCE &&
    position.x + GHOST_WIDTH + GHOST_CLEARANCE > obstacle.x &&
    position.y < obstacle.y + obstacle.height + GHOST_CLEARANCE &&
    position.y + GHOST_HEIGHT + GHOST_CLEARANCE > obstacle.y
  );
}

export function findPaulWhoIsAClippyPosition(
  bounds: Bounds,
  obstacles: DesktopObstacle[]
): Position | null {
  const maxX = bounds.width - GHOST_WIDTH - GHOST_MARGIN;
  const maxY = bounds.height - GHOST_HEIGHT - GHOST_MARGIN;
  if (maxX < GHOST_MARGIN || maxY < GHOST_MARGIN) return null;

  const reservedForReggie = {
    x: Math.max(0, bounds.width - 160),
    y: Math.max(0, bounds.height - 140),
    width: 160,
    height: 140,
  };
  const blocked = [...obstacles, reservedForReggie];
  const clamp = (value: number, max: number) =>
    Math.max(GHOST_MARGIN, Math.min(max, Math.round(value)));
  const preferred = [
    [0.62, 0.42],
    [0.74, 0.63],
    [0.43, 0.56],
    [0.76, 0.23],
    [0.3, 0.72],
    [0.48, 0.24],
  ];

  for (const [xFraction, yFraction] of preferred) {
    const position = {
      x: clamp(bounds.width * xFraction - GHOST_WIDTH / 2, maxX),
      y: clamp(bounds.height * yFraction - GHOST_HEIGHT / 2, maxY),
    };
    if (blocked.every((obstacle) => !intersects(position, obstacle))) return position;
  }

  let best: Position | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = GHOST_MARGIN; y <= maxY; y += GHOST_HEIGHT / 2) {
    for (let x = GHOST_MARGIN; x <= maxX; x += GHOST_WIDTH / 2) {
      const position = { x, y };
      if (blocked.some((obstacle) => intersects(position, obstacle))) continue;
      const distance = Math.hypot(x - bounds.width * 0.62, y - bounds.height * 0.42);
      if (distance < bestDistance) {
        best = position;
        bestDistance = distance;
      }
    }
  }
  return best;
}

const floatLikeASecret = keyframes`
  0%, 100% { transform: translate(0, 3px); opacity: 0.76; }
  35% { transform: translate(7px, -7px); opacity: 1; }
  70% { transform: translate(-5px, -3px); opacity: 0.88; }
`;

const GhostLayer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const GhostButton = styled.button<{ $x: number; $y: number; $interactive: boolean }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${GHOST_WIDTH}px;
  height: ${GHOST_HEIGHT}px;
  padding: 0;
  border: 0;
  background: transparent !important;
  box-shadow: none;
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  pointer-events: ${(p) => (p.$interactive ? "auto" : "none")};
  cursor: pointer;
  user-select: none;

  img {
    display: block;
    width: 80px;
    height: 100px;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.35));
    animation: ${floatLikeASecret} 6s ease-in-out infinite;
  }

  &:focus-visible {
    outline: 2px dashed #ff5965;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    img {
      animation: none;
      opacity: 1;
    }
  }
`;

const NameTag = styled.span`
  display: block;
  max-width: 100%;
  padding: 1px 3px;
  border: 1px solid #172334;
  background: #2d314b;
  color: #fff;
  font-family: var(--wtf-shell-font, "MS Sans Serif", sans-serif);
  font-size: 9px;
  font-weight: 700;
  line-height: 12px;
  text-shadow: 1px 1px 0 #111;
  white-space: nowrap;
`;

const Whisper = styled.div<{ $x: number; $y: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 206px;
  box-sizing: border-box;
  border: 2px solid #172334;
  background: #eef7f4;
  color: #172334;
  padding: 7px 9px;
  font-family: var(--wtf-shell-font, "MS Sans Serif", sans-serif);
  font-size: 11px;
  line-height: 1.35;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.32);
  pointer-events: none;
`;

export function PaulWhoIsAClippy({
  bounds,
  obstacles,
  interactive = true,
  onInteract,
}: {
  bounds: Bounds;
  obstacles: DesktopObstacle[];
  interactive?: boolean;
  onInteract?: () => void;
}) {
  const [whisperIndex, setWhisperIndex] = useState<number | null>(null);
  const position = useMemo(
    () => findPaulWhoIsAClippyPosition(bounds, obstacles),
    [bounds, obstacles]
  );

  useEffect(() => {
    if (interactive) return;
    setWhisperIndex(null);
  }, [interactive]);

  if (!position) return null;

  const bubbleX = Math.max(8, Math.min(bounds.width - 214, position.x - 46));
  const bubbleY = position.y > 90
    ? position.y - 77
    : Math.min(bounds.height - 66, position.y + GHOST_HEIGHT + 4);

  return (
    <GhostLayer data-desktop-ambient="paulwhoisaclippy">
      {whisperIndex !== null && (
        <Whisper $x={bubbleX} $y={bubbleY} role="status">
          {WHISPERS[whisperIndex]}
        </Whisper>
      )}
      <GhostButton
        type="button"
        $x={position.x}
        $y={position.y}
        $interactive={interactive}
        aria-label="paulwhoisaclippy, the desktop ghost"
        aria-expanded={whisperIndex !== null}
        title="paulwhoisaclippy"
        tabIndex={interactive ? 0 : -1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!interactive) return;
          setWhisperIndex((index) => index === null ? 0 : (index + 1) % WHISPERS.length);
          onInteract?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setWhisperIndex(null);
            event.stopPropagation();
          }
        }}
        onBlur={() => setWhisperIndex(null)}
      >
        <img src={paulAssetUrl("/desktop/paulwhoisaclippy.svg")} alt="" draggable={false} />
        <NameTag>paulwhoisaclippy</NameTag>
      </GhostButton>
    </GhostLayer>
  );
}
