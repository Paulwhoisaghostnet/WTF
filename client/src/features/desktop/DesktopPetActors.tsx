import { useCallback, useRef, type PointerEvent, type RefObject } from "react";
import styled from "styled-components";
import { Pill, Shovel } from "lucide-react";
import { clampFloatingPosition } from "./geometry";
import {
  clamp01,
  pointInRect,
  type DesktopObstacle,
} from "./DesktopPetModel";
import {
  FOOD_SERVINGS,
  WATER_ABSORB_MS,
  getDropSize,
  type PetDrop,
} from "./drops";
import type { PetTool } from "./DesktopPetTypes";

type ToolCursorPosition = {
  x: number;
  y: number;
  visible: boolean;
};

export function CareToolCursor({
  tool,
  position,
}: {
  tool: Exclude<PetTool, null>;
  position: ToolCursorPosition;
}) {
  return (
    <CareToolCursorRoot
      aria-hidden="true"
      $x={position.x}
      $y={position.y}
      $visible={position.visible}
    >
      <CareToolCursorIcon $tool={tool}>
        {tool === "food" ? (
          <img src="/desktop/hamster-food.png" alt="" draggable={false} />
        ) : tool === "water" ? (
          <ToolWaterDroplet />
        ) : tool === "scoop" ? (
          <Shovel />
        ) : tool === "pet" ? (
          <ToolEmojiCursor>✋</ToolEmojiCursor>
        ) : tool === "medicine" ? (
          <Pill />
        ) : tool === "ball" ? (
          <CareBallIcon />
        ) : (
          <PillowIcon />
        )}
      </CareToolCursorIcon>
    </CareToolCursorRoot>
  );
}

export function DesktopDropItem({
  drop,
  activeTool,
  bounds,
  trashRect,
  careTrayRef,
  now,
  onMove,
  onScoop,
  onTrash,
  onPutAwayPillow,
  onRemoveRemains,
}: {
  drop: PetDrop;
  activeTool: PetTool;
  bounds: { width: number; height: number };
  trashRect: DesktopObstacle | null;
  careTrayRef: RefObject<HTMLDivElement | null>;
  now: number;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onScoop: (id: string) => void;
  onTrash: (id: string) => void;
  onPutAwayPillow: (id: string) => void;
  onRemoveRemains: (id: string) => void;
}) {
  const dragRef = useRef({
    dragging: false,
    moved: false,
    ox: 0,
    oy: 0,
  });

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        drop.kind !== "poop" &&
        drop.kind !== "food" &&
        drop.kind !== "pillow" &&
        drop.kind !== "skeleton"
      ) {
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        dragging: true,
        moved: false,
        ox: e.clientX - drop.x,
        oy: e.clientY - drop.y,
      };
    },
    [drop.kind, drop.x, drop.y]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (
        !drag.dragging ||
        (drop.kind !== "poop" &&
          drop.kind !== "food" &&
          drop.kind !== "pillow" &&
          drop.kind !== "skeleton")
      ) {
        return;
      }
      drag.moved = true;
      const size = getDropSize(drop.kind);
      onMove(
        drop.id,
        clampFloatingPosition(
          { x: e.clientX - drag.ox, y: e.clientY - drag.oy },
          bounds,
          size,
          size
        )
      );
    },
    [bounds, drop.id, drop.kind, onMove]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const drag = dragRef.current;
      dragRef.current.dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if ((drop.kind === "food" || drop.kind === "skeleton") && drag.moved && trashRect) {
        const size = getDropSize(drop.kind);
        const dropCenter = { x: drop.x + size / 2, y: drop.y + size / 2 };
        if (pointInRect(dropCenter, trashRect)) {
          if (drop.kind === "skeleton") {
            onRemoveRemains(drop.id);
          } else {
            onTrash(drop.id);
          }
          return;
        }
      }
      if (drop.kind === "pillow" && drag.moved) {
        const careRect = careTrayRef.current?.getBoundingClientRect();
        if (
          careRect &&
          pointInRect(
            { x: e.clientX, y: e.clientY },
            {
              x: careRect.left,
              y: careRect.top,
              width: careRect.width,
              height: careRect.height,
            }
          )
        ) {
          onPutAwayPillow(drop.id);
          return;
        }
      }
      if (drop.kind === "poop" && activeTool === "scoop" && !drag.moved) {
        onScoop(drop.id);
      }
      if (drop.kind === "skeleton" && activeTool === "scoop" && !drag.moved) {
        onRemoveRemains(drop.id);
      }
    },
    [
      activeTool,
      careTrayRef,
      drop.id,
      drop.kind,
      drop.x,
      drop.y,
      onPutAwayPillow,
      onRemoveRemains,
      onScoop,
      onTrash,
      trashRect,
    ]
  );

  const fullness = drop.kind === "food" ? clamp01((drop.servings ?? FOOD_SERVINGS) / FOOD_SERVINGS) : 1;
  const waterProgress =
    drop.kind === "water" ? clamp01((now - (drop.createdAt ?? now)) / WATER_ABSORB_MS) : 0;
  const draggable =
    drop.kind === "food" ||
    drop.kind === "poop" ||
    drop.kind === "pillow" ||
    drop.kind === "skeleton";

  return (
    <DesktopDrop
      $x={drop.x}
      $y={drop.y}
      $kind={drop.kind}
      $armed={activeTool === "scoop" && (drop.kind === "poop" || drop.kind === "skeleton")}
      $draggable={draggable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={
        drop.kind === "poop"
          ? "Pet poop"
          : drop.kind === "food"
            ? `Pet food (${drop.servings ?? FOOD_SERVINGS}/20)`
            : drop.kind === "water"
              ? "Water soaking into the desktop"
              : drop.kind === "pillow"
                ? "Pet pillow"
                : "Skeletal remains"
      }
    >
      {drop.kind === "food" ? (
        <FoodDishIcon
          src="/desktop/hamster-food.png"
          alt=""
          draggable={false}
          $fullness={fullness}
        />
      ) : drop.kind === "water" ? (
        <>
          <WaterSoakHalo aria-hidden="true" $progress={waterProgress} />
          <WaterDropIcon aria-hidden="true" $progress={waterProgress} />
        </>
      ) : drop.kind === "pillow" ? (
        <PillowIcon aria-hidden="true" />
      ) : drop.kind === "skeleton" ? (
        <SkeletalRemainsIcon aria-hidden="true">
          <span />
          <span />
          <i />
        </SkeletalRemainsIcon>
      ) : (
        <PoopIcon aria-hidden="true">💩</PoopIcon>
      )}
    </DesktopDrop>
  );
}

const DesktopDrop = styled.div<{
  $x: number;
  $y: number;
  $kind: "food" | "water" | "poop" | "pillow" | "skeleton";
  $armed: boolean;
  $draggable: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) =>
    p.$kind === "poop" ? 30 : p.$kind === "pillow" ? 46 : p.$kind === "skeleton" ? 48 : 36}px;
  height: ${(p) =>
    p.$kind === "poop" ? 30 : p.$kind === "pillow" ? 34 : p.$kind === "skeleton" ? 36 : 36}px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  overflow: visible;
  cursor: ${(p) => (p.$armed ? "crosshair" : p.$draggable ? "grab" : "default")};
  filter: drop-shadow(1px 2px 1px rgba(0, 0, 0, 0.42));

  &:active {
    cursor: ${(p) => (p.$draggable ? "grabbing" : "default")};
  }
`;

const FoodDishIcon = styled.img<{ $fullness: number }>`
  width: 36px;
  height: 36px;
  object-fit: contain;
  image-rendering: auto;
  transform: scale(${(p) => 0.66 + p.$fullness * 0.34});
  opacity: ${(p) => 0.68 + p.$fullness * 0.32};
  transition: transform 180ms ease, opacity 180ms ease;
`;

const WaterSoakHalo = styled.span<{ $progress: number }>`
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${(p) => 28 + p.$progress * 88}px;
  height: ${(p) => 22 + p.$progress * 72}px;
  transform: translate(-50%, -50%) rotate(${(p) => -8 + p.$progress * 16}deg);
  border-radius: 50%;
  background:
    radial-gradient(
      ellipse at 50% 50%,
      rgba(3, 19, 38, ${(p) => 0.12 + p.$progress * 0.3}) 0%,
      rgba(4, 31, 60, ${(p) => 0.08 + p.$progress * 0.22}) 44%,
      rgba(4, 31, 60, 0) 76%
    );
  filter: blur(${(p) => 0.5 + p.$progress * 2.4}px);
  mix-blend-mode: multiply;
  pointer-events: none;
`;

const WaterDropIcon = styled.span<{ $progress: number }>`
  position: relative;
  width: ${(p) => Math.max(9, 28 - p.$progress * 18)}px;
  height: ${(p) => Math.max(8, 28 - p.$progress * 19)}px;
  border: ${(p) => Math.max(0.7, 2 - p.$progress * 1.3)}px solid
    rgba(10, 57, 113, ${(p) => Math.max(0.12, 1 - p.$progress * 1.05)});
  border-radius:
    ${(p) => 50 + Math.sin(p.$progress * Math.PI * 4) * 4}%
    ${(p) => 50 + Math.cos(p.$progress * Math.PI * 3) * 5}%
    ${(p) => 56 - p.$progress * 9}%
    ${(p) => 44 + p.$progress * 11}% /
    ${(p) => 60 - p.$progress * 8}%
    ${(p) => 60 - p.$progress * 4}%
    ${(p) => 40 + p.$progress * 8}%
    ${(p) => 40 + p.$progress * 6}%;
  background:
    radial-gradient(
      circle at ${(p) => 60 - p.$progress * 18}% ${(p) => 72 - p.$progress * 20}%,
      rgba(2, 35, 76, ${(p) => 0.16 + p.$progress * 0.2}) 0 22%,
      transparent 48%
    ),
    linear-gradient(
      ${(p) => 180 + Math.sin(p.$progress * Math.PI * 5) * 16}deg,
      rgba(147, 197, 253, ${(p) => Math.max(0.14, 1 - p.$progress * 0.72)}) 0%,
      rgba(37, 99, 235, ${(p) => Math.max(0.08, 1 - p.$progress * 0.92)}) 100%
    );
  transform:
    rotate(${(p) => 45 + Math.sin(p.$progress * Math.PI * 7) * 5}deg)
    translate(
      ${(p) => Math.sin(p.$progress * Math.PI * 9) * 2}px,
      ${(p) => p.$progress * 3 + Math.cos(p.$progress * Math.PI * 6) * 1.2}px
    )
    scaleX(${(p) => 1 - p.$progress * 0.1});
  opacity: ${(p) => Math.max(0.12, 1 - p.$progress * 1.2)};
  filter: saturate(${(p) => Math.max(0.4, 1 - p.$progress * 0.58)});
  overflow: hidden;
  animation: water-drop-wobble 2600ms ease-in-out infinite;

  &::before {
    content: "";
    position: absolute;
    left: ${(p) => 6 + p.$progress * 7 + Math.sin(p.$progress * Math.PI * 8) * 2}px;
    top: ${(p) => 4 + p.$progress * 6 + Math.cos(p.$progress * Math.PI * 7) * 2}px;
    width: ${(p) => Math.max(2.4, 7 - p.$progress * 4)}px;
    height: ${(p) => Math.max(2, 5.5 - p.$progress * 3.4)}px;
    border-radius: 50%;
    background: rgba(255, 255, 255, ${(p) => Math.max(0.08, 0.92 - p.$progress * 0.82)});
    filter: blur(${(p) => p.$progress * 0.8}px);
    animation: water-highlight-wobble 1500ms ease-in-out infinite alternate;
  }

  @keyframes water-drop-wobble {
    0%,
    100% {
      margin-left: -1px;
      margin-top: 0;
    }
    45% {
      margin-left: 1px;
      margin-top: 1px;
    }
  }

  @keyframes water-highlight-wobble {
    0% {
      transform: translate(-1px, 0);
    }
    100% {
      transform: translate(1.5px, 1px);
    }
  }
`;

const PoopIcon = styled.span`
  width: 30px;
  height: 30px;
  font-size: 27px;
  line-height: 30px;
  text-align: center;
`;

const PillowIcon = styled.span`
  position: relative;
  width: 42px;
  height: 27px;
  border: 2px solid #26325a;
  border-radius: 9px;
  background:
    radial-gradient(circle at 22% 34%, rgba(255, 255, 255, 0.98) 0 5px, transparent 5.5px),
    linear-gradient(135deg, #f8fbff 0%, #d7e7ff 54%, #a9c7f3 100%);
  box-shadow:
    inset -4px -4px 0 rgba(69, 93, 155, 0.28),
    inset 3px 3px 0 rgba(255, 255, 255, 0.85),
    2px 2px 0 rgba(0, 0, 0, 0.28);

  &::after {
    content: "";
    position: absolute;
    left: 6px;
    right: 6px;
    top: 12px;
    border-top: 1px dashed rgba(57, 78, 139, 0.42);
  }
`;

const CareBallIcon = styled.span`
  width: 28px;
  height: 28px;
  border: 2px solid #111111;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.92) 0 4px, transparent 4.5px),
    linear-gradient(135deg, #f047a6 0%, #f047a6 54%, #111111 56%, #111111 62%, #ffffff 64%);
  box-shadow:
    inset -4px -4px 0 rgba(0, 0, 0, 0.24),
    2px 2px 0 rgba(0, 0, 0, 0.32);
`;

const SkeletalRemainsIcon = styled.span`
  position: relative;
  width: 46px;
  height: 34px;
  display: block;

  &::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 8px;
    width: 16px;
    height: 14px;
    border: 2px solid #111111;
    border-radius: 8px 8px 7px 7px;
    background:
      radial-gradient(circle at 5px 6px, #111111 0 2px, transparent 2.4px),
      radial-gradient(circle at 11px 6px, #111111 0 2px, transparent 2.4px),
      linear-gradient(180deg, #f7f2df 0%, #d8d0aa 100%);
    box-shadow: inset -2px -2px 0 rgba(95, 86, 54, 0.28);
  }

  &::after {
    content: "";
    position: absolute;
    left: 17px;
    top: 15px;
    width: 24px;
    height: 5px;
    border: 2px solid #111111;
    border-radius: 6px;
    background: #efe8cb;
    transform: rotate(-8deg);
  }

  span {
    position: absolute;
    left: 20px;
    top: 21px;
    width: 24px;
    height: 5px;
    border: 2px solid #111111;
    border-radius: 6px;
    background: #efe8cb;
    transform: rotate(18deg);
  }

  span + span {
    left: 14px;
    top: 26px;
    width: 18px;
    height: 4px;
    transform: rotate(-22deg);
  }

  i {
    position: absolute;
    left: 21px;
    top: 11px;
    width: 16px;
    height: 14px;
    border-left: 2px solid #111111;
    transform: rotate(-8deg);

    &::before,
    &::after {
      content: "";
      position: absolute;
      left: 0;
      width: 12px;
      border-top: 2px solid #111111;
      transform-origin: left center;
    }

    &::before {
      top: 3px;
      transform: rotate(18deg);
    }

    &::after {
      top: 9px;
      transform: rotate(-14deg);
    }
  }
`;

const CareToolCursorRoot = styled.div<{ $x: number; $y: number; $visible: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  z-index: 7100;
  pointer-events: none;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translate3d(${(p) => p.$x}px, ${(p) => p.$y}px, 0);
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.45));
`;

const CareToolCursorIcon = styled.div<{ $tool: Exclude<PetTool, null> }>`
  transform: translate(${(p) => (p.$tool === "scoop" ? "-6px, -4px" : "-11px, -10px")});
  min-width: 26px;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 31px;
    height: 31px;
    object-fit: contain;
  }

  svg {
    width: 30px;
    height: 30px;
    color: ${(p) => (p.$tool === "medicine" ? "#d7266f" : "#5b371f")};
    stroke-width: 2.6;
    transform: rotate(${(p) => (p.$tool === "medicine" ? "-9deg" : "-24deg")});
  }
`;

const ToolWaterDroplet = styled.span`
  width: 24px;
  height: 24px;
  border: 2px solid #0a3971;
  border-radius: 50% 50% 56% 44% / 60% 60% 40% 40%;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.9) 0 4px, transparent 4.4px),
    linear-gradient(180deg, #9ed8ff 0%, #1f70ff 100%);
  transform: rotate(45deg);
`;

const ToolEmojiCursor = styled.span`
  font-size: 27px;
  line-height: 1;
`;
