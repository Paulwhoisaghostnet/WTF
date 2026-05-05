import styled from "styled-components";
import type { DesktopWorldEdge } from "@shared/desktop";
import { PET_H, PET_W } from "./DesktopPetModel";

export const PetLayer = styled.div<{ $dropMode: boolean }>`
  position: absolute;
  inset: 0;
  z-index: ${(p) => (p.$dropMode ? 2 : 0)};
  pointer-events: ${(p) => (p.$dropMode ? "auto" : "none")};
`;

export const HamsterActor = styled.button<{
  $x: number;
  $y: number;
  $facing: "left" | "right";
  $glow: boolean;
  $stealth: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${PET_W}px;
  height: ${PET_H + 22}px;
  border: 0;
  padding: 0;
  min-height: 0;
  appearance: none;
  background: transparent !important;
  box-shadow: none;
  pointer-events: auto;
  touch-action: none;
  color: #fff;
  text-shadow: 1px 1px 1px #000;
  transform: ${(p) => (p.$facing === "left" ? "scaleX(-1)" : "none")};
  opacity: ${(p) => (p.$stealth ? 0.78 : 1)};
  filter: ${(p) => (p.$glow ? "drop-shadow(0 0 6px #39ff14) drop-shadow(0 0 10px #ff00a8)" : "none")};
`;

export const VisitingPetActor = styled.span<{
  $x: number;
  $y: number;
  $facing: "left" | "right";
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${PET_W}px;
  height: ${PET_H + 22}px;
  pointer-events: none;
  color: #fff;
  text-shadow: 1px 1px 1px #000;
  transform: ${(p) => (p.$facing === "left" ? "scaleX(-1)" : "none")};
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.35));
`;

export const WalkaboutSignpost = styled.span<{ $x: number; $y: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 42px;
  height: 38px;
  pointer-events: none;
  color: #111111;
  font-family: "Pixelated MS Sans Serif", "MS Sans Serif", sans-serif;
  font-size: 10px;
  font-weight: 900;
  line-height: 18px;
  text-align: center;
  text-shadow: none;
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.32));

  &::before {
    content: "BRB";
    position: absolute;
    left: 1px;
    top: 0;
    width: 36px;
    height: 19px;
    border: 2px solid #4f2d14;
    background: #f8df9c;
    box-shadow: inset -3px -3px 0 #d49b55, inset 2px 2px 0 #fff4c4;
  }

  &::after {
    content: "";
    position: absolute;
    left: 18px;
    top: 20px;
    width: 5px;
    height: 18px;
    background: #7a431d;
    box-shadow: inset -2px 0 0 rgba(0, 0, 0, 0.22);
  }
`;

export const TunnelScratchCue = styled.span<{
  $x: number;
  $y: number;
  $edge: DesktopWorldEdge;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 34px;
  height: 24px;
  pointer-events: none;
  opacity: 0.9;
  transform: ${(p) =>
    p.$edge === "left"
      ? "rotate(90deg)"
      : p.$edge === "right"
        ? "rotate(-90deg)"
        : p.$edge === "bottom"
          ? "rotate(180deg)"
          : "none"};

  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 4px;
    top: 7px;
    width: 24px;
    height: 2px;
    background: rgba(255, 255, 190, 0.88);
    box-shadow:
      0 5px 0 rgba(255, 255, 190, 0.72),
      0 10px 0 rgba(255, 255, 190, 0.54);
    animation: tunnel-scratch-fade 900ms ease-out forwards;
  }

  &::after {
    left: 8px;
    top: 2px;
    width: 2px;
    height: 18px;
    background: rgba(180, 255, 135, 0.65);
    box-shadow:
      7px 1px 0 rgba(180, 255, 135, 0.46),
      14px -1px 0 rgba(180, 255, 135, 0.35);
  }

  @keyframes tunnel-scratch-fade {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
`;

export const HamsterNameLabel = styled.span`
  position: absolute;
  left: -6px;
  top: ${PET_H}px;
  width: ${PET_W + 12}px;
  transform: scaleX(var(--label-flip, 1));
  display: block;
  text-align: center;
  font-size: 11px;
  line-height: 14px;
  color: #fff;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;
