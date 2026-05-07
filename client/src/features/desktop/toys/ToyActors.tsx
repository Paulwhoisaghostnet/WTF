import { useCallback, useRef, type PointerEvent } from "react";
import styled from "styled-components";
import { clampFloatingPosition } from "../geometry";
import { BALL_SIZE, type PetToyState } from "./model";

export function DesktopBallToy({
  toy,
  bounds,
  onMove,
  onFling,
}: {
  toy: PetToyState;
  bounds: { width: number; height: number };
  onMove: (id: string, position: { x: number; y: number }) => void;
  onFling: (id: string, velocity: { vx: number; vy: number }) => void;
}) {
  const dragRef = useRef({
    dragging: false,
    ox: 0,
    oy: 0,
    lastX: 0,
    lastY: 0,
    lastAt: 0,
    vx: 0,
    vy: 0,
  });

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        dragging: true,
        ox: e.clientX - toy.x,
        oy: e.clientY - toy.y,
        lastX: e.clientX,
        lastY: e.clientY,
        lastAt: performance.now(),
        vx: 0,
        vy: 0,
      };
      onFling(toy.id, { vx: 0, vy: 0 });
    },
    [onFling, toy.id, toy.x, toy.y]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.dragging) return;
      const now = performance.now();
      const dt = Math.max(0.016, (now - drag.lastAt) / 1000);
      drag.vx = (e.clientX - drag.lastX) / dt;
      drag.vy = (e.clientY - drag.lastY) / dt;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.lastAt = now;
      onMove(
        toy.id,
        clampFloatingPosition(
          { x: e.clientX - drag.ox, y: e.clientY - drag.oy },
          bounds,
          BALL_SIZE,
          BALL_SIZE
        )
      );
    },
    [bounds, onMove, toy.id]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const drag = dragRef.current;
      dragRef.current.dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      onFling(toy.id, {
        vx: Math.max(-360, Math.min(360, drag.vx * 0.28)),
        vy: Math.max(-360, Math.min(360, drag.vy * 0.28)),
      });
    },
    [onFling, toy.id]
  );

  return (
    <ToyBallActor
      type="button"
      aria-label={toy.owner === "visitor" ? "Neighbor pet ball" : "Pet ball"}
      $x={toy.x}
      $y={toy.y}
      $color={toy.color}
      $visitor={toy.owner === "visitor"}
      $dirtiness={toy.dirtiness ?? 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

const ToyBallActor = styled.button<{
  $x: number;
  $y: number;
  $color: string;
  $visitor: boolean;
  $dirtiness: number;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${BALL_SIZE}px;
  height: ${BALL_SIZE}px;
  border: 2px solid #111111;
  border-radius: 50%;
  padding: 0;
  min-height: 0;
  appearance: none;
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
  background:
    radial-gradient(circle at 55% 62%, rgba(76, 56, 38, ${(p) => p.$dirtiness * 0.5}) 0 7px, transparent 7.5px),
    radial-gradient(circle at 25% 72%, rgba(76, 56, 38, ${(p) => p.$dirtiness * 0.42}) 0 4px, transparent 4.5px),
    radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.92) 0 4px, transparent 4.5px),
    radial-gradient(circle at 66% 72%, rgba(0, 0, 0, 0.22) 0 6px, transparent 6.5px),
    linear-gradient(135deg, ${(p) => p.$color} 0%, ${(p) => p.$color} 54%, #111111 56%, #111111 62%, #ffffff 64%);
  box-shadow:
    inset -4px -5px 0 rgba(0, 0, 0, 0.25),
    inset 4px 4px 0 rgba(255, 255, 255, 0.35),
    2px 3px 0 rgba(0, 0, 0, 0.32);
  filter: ${(p) => {
    const effects = [
      p.$visitor ? "saturate(0.9) drop-shadow(0 0 3px rgba(255,255,255,0.45))" : "",
      p.$dirtiness > 0.05 ? `sepia(${p.$dirtiness * 0.5}) brightness(${1 - p.$dirtiness * 0.12})` : "",
    ].filter(Boolean);
    return effects.length > 0 ? effects.join(" ") : "none";
  }};

  &:active {
    cursor: grabbing;
  }
`;
