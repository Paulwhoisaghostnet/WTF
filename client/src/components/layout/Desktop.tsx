import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Matter from "matter-js";
import { Button, Panel } from "react95";
import { Apple, Droplets, Heart, Moon, Palette, Shovel, X } from "lucide-react";
import { Taskbar } from "./Taskbar";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { DesktopAppKey } from "@shared/types";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  getHamsterColorScheme,
  type DesktopAppearance,
  type DesktopIconLayout,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import { HamsterPixelSprite } from "./HamsterPixelSprite";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
};

type PetResponse = {
  pet: HamsterState;
  events: Array<{ id: number; action: string; xpAmount: number; createdAt: string }>;
};

const ICON_W = 68;
const ICON_H = 66;
const PET_W = 88;
const PET_H = 70;
const PET_STORAGE_PREFIX = "wtf.desktop.hamster.v2";
const FOOD_SERVINGS = 20;
const WATER_ABSORB_MS = 110_000;
const PHEROMONE_LIFETIME_MS = 24_000;
const MAX_PHEROMONES = 180;
const MAX_DESKTOP_ANTS = 18;
const ANT_SIZE = 12;

const DesktopContainer = styled.div<{
  $appearance: DesktopAppearance;
  $cursorHidden: boolean;
}>`
  --wtf-desktop-color: ${(p) => p.$appearance.desktopColor};
  --wtf-window-color: ${(p) => p.$appearance.windowColor};
  --wtf-active-title: ${(p) => p.$appearance.activeTitleColor};
  --wtf-active-title-text: ${(p) => p.$appearance.activeTitleTextColor};
  --wtf-inactive-title: ${(p) => p.$appearance.inactiveTitleColor};
  --wtf-inactive-title-text: ${(p) => p.$appearance.inactiveTitleTextColor};
  --wtf-text-color: ${(p) => p.$appearance.textColor};
  --wtf-highlight-color: ${(p) => p.$appearance.highlightColor};
  --wtf-button-face: ${(p) => p.$appearance.buttonFace};

  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background-color: var(--wtf-desktop-color);
  color: var(--wtf-text-color);
  cursor: ${(p) => (p.$cursorHidden ? "none" : "auto")};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  ${(p) =>
    p.$cursorHidden
      ? `
        &,
        * {
          cursor: none !important;
        }
      `
      : ""}

  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea {
    cursor: ${(p) => (p.$cursorHidden ? "none" : "text")};
  }

  button,
  [role="button"] {
    color: var(--wtf-text-color);
  }

  button:not([data-compact-control="true"]),
  select {
    background-color: var(--wtf-button-face);
  }
`;

const ContentArea = styled.div<{
  $appearance: DesktopAppearance;
}>`
  flex: 1;
  overflow: hidden;
  position: relative;
  background-color: var(--wtf-desktop-color);
  ${(p) => {
    const url = p.$appearance.backgroundImageUrl;
    if (!url) return "";
    if (p.$appearance.backgroundFit === "tile") {
      return `background-image: url("${url}"); background-repeat: repeat; background-size: auto;`;
    }
    if (p.$appearance.backgroundFit === "center") {
      return `background-image: url("${url}"); background-repeat: no-repeat; background-position: center; background-size: auto;`;
    }
    return `background-image: url("${url}"); background-repeat: no-repeat; background-position: center; background-size: ${p.$appearance.backgroundFit};`;
  }}
`;

const DesktopSurface = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
`;

const WallpaperCenter = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
`;

const WtfLogo = styled.div`
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  font-size: 72px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.1);
  letter-spacing: 12px;
  user-select: none;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.08);

  ${MOBILE} {
    font-size: 48px;
    letter-spacing: 8px;
  }
`;

const RouteLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  & > * {
    pointer-events: auto;
  }
`;

const WDeskIcon = styled.div`
  width: 30px;
  height: 30px;
  border: 1px solid #0f0f0f;
  background: #0f0f0f;
  color: #ffffff;
  font-weight: 700;
  font-size: 18px;
  line-height: 28px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  margin-bottom: 2px;
`;

const ConsoleDeskIcon = styled.div`
  width: 30px;
  height: 22px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #2a2a50 0%, #1a1a3a 100%);
  color: #7b8fff;
  font-weight: 700;
  font-size: 9px;
  line-height: 18px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  margin-bottom: 4px;
  border-radius: 4px 4px 2px 2px;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(123, 143, 255, 0.2);

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: -5px;
    width: 10px;
    height: 5px;
    margin-left: -5px;
    background: #2a2a50;
    border-radius: 2px 2px 0 0;
    border: 1px solid #101010;
    border-bottom: none;
  }
`;

const TVDeskIcon = styled.div`
  width: 30px;
  height: 24px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #c8d0d8 0%, #9aa7b3 100%);
  color: #101010;
  font-weight: 700;
  font-size: 8px;
  line-height: 20px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  margin-bottom: 4px;
  border-radius: 2px;
  position: relative;
  box-shadow: inset 0 0 0 1px #e9eef2;

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 2px;
    height: 8px;
    top: -8px;
    background: #2a2a2a;
  }

  &::before {
    left: 5px;
    transform: rotate(-25deg);
  }

  &::after {
    right: 5px;
    transform: rotate(25deg);
  }
`;

const DickswordDeskIcon = styled.div`
  width: 34px;
  height: 34px;
  color: #101010;
  font-weight: 900;
  font-size: 27px;
  line-height: 32px;
  text-align: center;
  font-family: "Arial Black", "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  margin-bottom: 0;
  position: relative;
  text-shadow: 1px 1px 0 #ffffff, -1px -1px 0 #7289da;

  span {
    position: relative;
    z-index: 1;
  }

  &::before {
    content: "";
    position: absolute;
    left: 15px;
    top: -4px;
    width: 4px;
    height: 42px;
    background: linear-gradient(180deg, #f8fbff 0%, #9aa6b8 55%, #4a5568 100%);
    border: 1px solid #202020;
    border-radius: 3px 3px 1px 1px;
    transform: rotate(45deg);
    transform-origin: center;
    z-index: 2;
    box-shadow: 1px 1px 0 rgba(255, 255, 255, 0.45);
  }

  &::after {
    content: "";
    position: absolute;
    left: 2px;
    bottom: 5px;
    width: 18px;
    height: 6px;
    background: #5b3314;
    border: 1px solid #1f1208;
    border-radius: 2px;
    transform: rotate(45deg);
    z-index: 3;
  }
`;

const StudioDeskIcon = styled.div`
  width: 30px;
  height: 26px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #fff8d8 0%, #e8c86a 100%);
  border-radius: 14px 14px 10px 16px / 14px 14px 10px 22px;
  position: relative;
  margin-bottom: 2px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);

  &::before {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #d43b3b;
    box-shadow: 9px -1px 0 0 #2e6fd6, 3px 9px 0 0 #2ea14c,
      13px 8px 0 0 #7d3bd4;
  }

  &::after {
    content: "";
    position: absolute;
    right: -2px;
    top: 9px;
    width: 8px;
    height: 4px;
    background: #1a1a1a;
    border-radius: 2px;
    transform: rotate(-20deg);
  }
`;

const GalleryDeskIcon = styled.div`
  width: 30px;
  height: 30px;
  border: 2px solid #3a2612;
  background: linear-gradient(180deg, #b78a4a 0%, #7a5226 100%);
  box-sizing: border-box;
  margin-bottom: 2px;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);

  &::before {
    content: "";
    position: absolute;
    inset: 4px;
    background: radial-gradient(circle at 72% 32%, #ffe27a 0 2.2px, transparent 2.6px),
      linear-gradient(180deg, #6fbfe6 0%, #b5e8f5 55%, #3f8a4a 55%, #2e6e37 100%);
    box-shadow: inset 0 0 0 1px #2a1a08;
  }
`;

const DesktopIconRoot = styled.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  pointer-events: auto;
  width: ${ICON_W}px;
  height: ${ICON_H}px;
  touch-action: none;
  color: #fff;
  text-shadow: 1px 1px 1px #000;
`;

const IconGlyph = styled.div`
  font-size: 32px;
  line-height: 1;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
  margin-bottom: 2px;
  min-height: 34px;
  display: flex;
  align-items: center;
`;

const IconLabel = styled.div`
  font-size: 11px;
  color: #fff;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  max-width: 66px;
`;

const PetLayer = styled.div<{ $dropMode: boolean }>`
  position: absolute;
  inset: 0;
  z-index: ${(p) => (p.$dropMode ? 2 : 0)};
  pointer-events: ${(p) => (p.$dropMode ? "auto" : "none")};
`;

const HamsterActor = styled.button<{
  $x: number;
  $y: number;
  $facing: "left" | "right";
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
`;

const HamsterNameLabel = styled.span`
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

const CareTray = styled(Panel)`
  position: absolute;
  right: 12px;
  bottom: 8px;
  z-index: 2;
  width: 266px;
  padding: 8px;
  color: var(--wtf-text-color);
  background: var(--wtf-window-color);
  pointer-events: auto;

  ${MOBILE} {
    left: 8px;
    right: 8px;
    width: auto;
  }
`;

const CareTrayHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-weight: bold;

  button {
    min-width: 24px;
    height: 24px;
    padding: 0;
  }
`;

const CareToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    min-width: 0;
    min-height: 34px;
    font-size: 10px;
    line-height: 1;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 2px;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const MiniStatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 7px 0;
  font-size: 10px;

  span {
    padding: 2px 3px;
    border: 1px solid #7f7f7f;
    background: rgba(255, 255, 255, 0.42);
    text-align: center;
  }
`;

const DesktopDrop = styled.div<{
  $x: number;
  $y: number;
  $kind: "food" | "water" | "poop";
  $armed: boolean;
  $draggable: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) => (p.$kind === "poop" ? 30 : 36)}px;
  height: ${(p) => (p.$kind === "poop" ? 30 : 36)}px;
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
  width: 28px;
  height: 28px;
  border: 2px solid #0a3971;
  border-radius: 50% 50% 56% 44% / 60% 60% 40% 40%;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.9) 0 4px, transparent 4.4px),
    linear-gradient(180deg, #93c5fd 0%, #2563eb 100%);
  transform: rotate(45deg);
  opacity: ${(p) => Math.max(0.12, 1 - p.$progress * 1.2)};
  filter: saturate(${(p) => Math.max(0.4, 1 - p.$progress * 0.58)});
`;

const PoopIcon = styled.span`
  width: 30px;
  height: 30px;
  font-size: 27px;
  line-height: 30px;
  text-align: center;
`;

const PheromoneDot = styled.span<{ $x: number; $y: number; $age: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(96, 64, 28, ${(p) => Math.max(0, 0.42 * (1 - p.$age))});
  box-shadow: 0 0 4px rgba(159, 112, 46, ${(p) => Math.max(0, 0.2 * (1 - p.$age))});
  pointer-events: none;
  z-index: 0;
`;

const AntActor = styled.span<{
  $x: number;
  $y: number;
  $angle: number;
  $dancing: boolean;
  $carrying: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${ANT_SIZE}px;
  height: 8px;
  transform: translate(-50%, -50%) rotate(${(p) => p.$angle}rad);
  transform-origin: center;
  pointer-events: none;
  z-index: 1;
  animation: ${(p) => (p.$dancing ? "ant-dance 520ms steps(2, end) infinite" : "none")};

  &::before {
    content: "";
    position: absolute;
    left: 1px;
    top: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #16120f;
    box-shadow: 4px 0 0 #211915, 8px 0 0 #16120f;
  }

  &::after {
    content: "";
    position: absolute;
    left: 1px;
    top: 0;
    width: 2px;
    height: 2px;
    background: #16120f;
    box-shadow:
      2px 7px 0 #16120f,
      5px 0 0 #16120f,
      6px 7px 0 #16120f,
      9px 0 0 #16120f,
      10px 7px 0 #16120f;
  }

  span {
    display: ${(p) => (p.$carrying ? "block" : "none")};
    position: absolute;
    right: -3px;
    top: -1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #c68d43;
    box-shadow: inset -1px -1px 0 rgba(68, 34, 12, 0.45);
  }

  @keyframes ant-dance {
    0% {
      margin-left: -2px;
      margin-top: 1px;
    }
    50% {
      margin-left: 2px;
      margin-top: -1px;
    }
    100% {
      margin-left: -2px;
      margin-top: 1px;
    }
  }
`;

const ScreenSaver = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5000;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.22) 0 1px, transparent 2px),
    radial-gradient(circle at 76% 64%, rgba(255, 255, 255, 0.2) 0 1px, transparent 2px),
    #020008;
  overflow: hidden;
  pointer-events: auto;
`;

const SaverLogo = styled.div`
  position: absolute;
  width: 220px;
  height: 82px;
  left: 8%;
  top: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  background: #000080;
  color: #ffff00;
  font-weight: 900;
  font-size: 42px;
  letter-spacing: 8px;
  box-shadow: 4px 4px 0 #ff00ff;
  animation: saver-bounce 9s linear infinite alternate;

  @keyframes saver-bounce {
    0% {
      transform: translate(0, 0);
    }
    28% {
      transform: translate(58vw, 15vh);
    }
    55% {
      transform: translate(18vw, 58vh);
    }
    82% {
      transform: translate(68vw, 48vh);
    }
    100% {
      transform: translate(4vw, 70vh);
    }
  }
`;

const CustomCursorRoot = styled.div<{
  $x: number;
  $y: number;
  $visible: boolean;
}>`
  position: fixed;
  left: 0;
  top: 0;
  z-index: 7000;
  pointer-events: none;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translate3d(${(p) => p.$x}px, ${(p) => p.$y}px, 0);
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.35));
`;

const CrosshairImpact = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 22px;
  height: 22px;
  z-index: 6999;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: crosshair-hole 920ms ease-out forwards;

  &::before {
    content: "";
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background:
      radial-gradient(circle, #050505 0 3px, #3a2414 3.5px 5px, transparent 5.5px),
      radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.85) 0 1px, transparent 1.6px);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.8),
      5px 0 0 -3px #111,
      -6px 2px 0 -4px #111,
      1px 6px 0 -4px #111;
  }

  &::after {
    content: "";
    position: absolute;
    left: -15px;
    top: 9px;
    width: 22px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #fff200, #ff4a00);
    box-shadow: 0 0 4px #ff4a00;
    animation: crosshair-spark 180ms ease-out forwards;
  }

  @keyframes crosshair-hole {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.45);
    }
    12% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.92);
    }
  }

  @keyframes crosshair-spark {
    from {
      opacity: 1;
      transform: translateX(-8px) scaleX(1);
    }
    to {
      opacity: 0;
      transform: translateX(10px) scaleX(0.2);
    }
  }
`;

const BowShot = styled.div<{
  $fromX: number;
  $fromY: number;
  $distance: number;
  $angle: number;
}>`
  position: fixed;
  left: ${(p) => p.$fromX}px;
  top: ${(p) => p.$fromY}px;
  width: ${(p) => p.$distance}px;
  height: 12px;
  z-index: 6999;
  pointer-events: none;
  transform: translate(0, -6px) rotate(${(p) => p.$angle}rad);
  transform-origin: 0 50%;
`;

const BowShotArrow = styled.div<{ $distance: number }>`
  position: absolute;
  left: 0;
  top: 0;
  width: 38px;
  height: 12px;
  animation: bow-arrow-shot 560ms cubic-bezier(0.12, 0.78, 0.18, 1) forwards;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 5px;
    width: 29px;
    height: 3px;
    background: #6b3f1d;
    box-shadow: 0 1px 0 #d7aa5c;
  }

  &::after {
    content: "";
    position: absolute;
    left: 28px;
    top: 0;
    border-left: 10px solid #1d2227;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    filter: drop-shadow(1px 1px 0 rgba(255, 255, 255, 0.65));
  }

  span {
    position: absolute;
    left: -5px;
    top: 1px;
    width: 10px;
    height: 10px;
    background:
      linear-gradient(135deg, transparent 0 42%, #fff 42% 58%, transparent 58%),
      linear-gradient(45deg, transparent 0 42%, #fff 42% 58%, transparent 58%);
  }

  @keyframes bow-arrow-shot {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    82% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: translateX(${(p) => Math.max(0, p.$distance - 32)}px);
    }
  }
`;

const BowHitMark = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 20px;
  height: 20px;
  z-index: 6998;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: bow-hit-fade 840ms ease-out forwards;

  &::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 9px;
    width: 16px;
    height: 2px;
    background: #6b3f1d;
    transform: rotate(-18deg);
    box-shadow: 10px -3px 0 -4px #1d2227;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 1px dashed #111111;
    border-radius: 50%;
    opacity: 0.8;
  }

  @keyframes bow-hit-fade {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.7);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.08);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.94);
    }
  }
`;

const EmojiCursor = styled.div<{ $dx: number; $dy: number }>`
  transform: translate(${(p) => p.$dx}px, ${(p) => p.$dy}px);
  font-size: 31px;
  line-height: 1;
  user-select: none;
`;

const BlangCursor = styled.img<{ $pressed: boolean }>`
  width: ${(p) => (p.$pressed ? "60px" : "56px")};
  height: auto;
  display: block;
  transform: translate(${(p) => (p.$pressed ? "-30px, -37px" : "-28px, -34px")})
    rotate(${(p) => (p.$pressed ? "-5deg" : "-2deg")});
  transform-origin: 32px 38px;
  user-select: none;
`;

const TezosLogoCursor = styled.img`
  width: 38px;
  height: 46px;
  object-fit: contain;
  display: block;
  transform: translate(-19px, -23px);
  user-select: none;
`;

const HatchetCursor = styled.div<{ $pressed: boolean }>`
  display: block;
  width: 42px;
  height: 42px;
  transform: translate(-9px, -22px) rotate(0deg);
  transform-origin: 28px 31px;
  animation: ${(p) =>
    p.$pressed ? "hatchet-attack-swing 360ms cubic-bezier(0.16, 0.88, 0.2, 1) both" : "none"};

  @keyframes hatchet-attack-swing {
    0% {
      transform: translate(-9px, -22px) rotate(-36deg);
    }
    46% {
      transform: translate(-12px, -19px) rotate(32deg);
    }
    66% {
      transform: translate(-9px, -22px) rotate(8deg);
    }
    100% {
      transform: translate(-9px, -22px) rotate(0deg);
    }
  }
`;

type CursorDirection = 1 | -1;

interface CursorGlyphProps {
  style: DesktopAppearance["cursorStyle"];
  pressed: boolean;
  direction: CursorDirection;
  speed: number;
}

function CursorGlyph({ style, pressed, direction, speed }: CursorGlyphProps) {
  if (style === "pixel-arrow") {
    return (
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <polygon points="1,1 1,31 10,22 16,33 23,30 17,20 30,20" fill="#111111" />
        <polygon points="5,6 5,23 10,18 16,29 18,28 12,17 22,17" fill="#ffffff" />
        <polygon points="7,10 7,18 10,15 14,22 16,21 11,13 16,13" fill="#d7d7d7" />
        <rect x="5" y="6" width="2" height="2" fill="#f4fbff" />
      </svg>
    );
  }
  if (style === "crosshair") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: `translate(-21px, -21px) scale(${pressed ? 0.9 : 1})` }}
      >
        <circle cx="21" cy="21" r="8" fill="none" stroke="#ffffff" strokeWidth="5" />
        <circle cx="21" cy="21" r="8" fill="none" stroke="#111111" strokeWidth="2" />
        <path
          d="M21 2v12M21 28v12M2 21h12M28 21h12"
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinecap="square"
        />
        <path
          d="M21 2v12M21 28v12M2 21h12M28 21h12"
          stroke="#111111"
          strokeWidth="2"
          strokeLinecap="square"
        />
        <circle cx="21" cy="21" r={pressed ? "2.4" : "1.6"} fill="#ff2a00" stroke="#111111" strokeWidth="1" />
      </svg>
    );
  }
  if (style === "bow-arrow") {
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-45px" : "-5px"}, -16px)` }}>
        <svg width="50" height="33" viewBox="0 0 64 42" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <path
              d="M13 5c-11 9-11 23 0 32"
              fill="none"
              stroke="#6b3f1d"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M14 6c8 10 8 20 0 30"
              fill="none"
              stroke={pressed ? "#fff8d8" : "#f3e0ad"}
              strokeWidth={pressed ? "2.5" : "1.5"}
              strokeLinecap="round"
            />
            <path d="M11 21h45" stroke="#6b3f1d" strokeWidth="3" strokeLinecap="round" />
            <path d="M56 21 45 15v12z" fill="#1d2227" stroke="#111111" strokeWidth="1.5" />
            <path d="M8 17 0 14M8 21 0 21M8 25 0 28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="57" cy="21" r="2" fill="#fff200" stroke="#111111" strokeWidth="1" />
          </g>
        </svg>
      </div>
    );
  }
  if (style === "carrot") {
    return (
      <svg
        width="46"
        height="46"
        viewBox="0 0 46 46"
        aria-hidden="true"
        style={{ transform: `translate(-9px, -37px) rotate(${pressed ? 7 : -4}deg)` }}
      >
        <path
          d="M28 5c3-5 7-3 6 2 5-2 8 2 3 5 4 2 3 6-3 5"
          fill="none"
          stroke="#2e9a47"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 39C12 26 18 14 29 8c6 8 6 17 2 25-8 2-15 4-22 6z"
          fill="#ff8a22"
          stroke="#111111"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M17 25h10M14 31h12M22 18h6" stroke="#c95a12" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 39c4-2 6-3 9-7" stroke="#ffd17a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "horse-runner") {
    const gait = speed > 560 ? "0.16s" : speed > 160 ? "0.26s" : "0.52s";
    const farHindLeg = "M32 34l7 8-2 8";
    const farHindLegValues =
      "M32 34l7 8-2 8;M32 34l-7 8-9 4;M32 34l7 8-2 8";
    const nearHindLeg = "M25 34l-6 8-10 5";
    const nearHindLegValues =
      "M25 34l-6 8-10 5;M25 34l8 8-2 8;M25 34l-6 8-10 5";
    const farFrontLeg = "M58 34l-8 8-8 5";
    const farFrontLegValues =
      "M58 34l-8 8-8 5;M58 34l7 8 9 4;M58 34l-8 8-8 5";
    const nearFrontLeg = "M64 33l7 8 10 4";
    const nearFrontLegValues =
      "M64 33l7 8 10 4;M64 33l-6 9-3 8;M64 33l7 8 10 4";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-82px" : "-5px"}, -21px)` }}>
        <svg
          width="88"
          height="54"
          viewBox="0 0 88 54"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <g transform={direction > 0 ? undefined : "translate(88 0) scale(-1 1)"}>
            <g strokeLinecap="square" strokeLinejoin="miter">
              <path d={farHindLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={farHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farHindLeg} fill="none" stroke="#6f3b1d" strokeWidth="2.5">
                <animate attributeName="d" values={farHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farFrontLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={farFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farFrontLeg} fill="none" stroke="#6f3b1d" strokeWidth="2.5">
                <animate attributeName="d" values={farFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
            </g>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 -1;0 0"
                dur={gait}
                repeatCount="indefinite"
              />
              <polygon points="17,22 6,18 1,12 13,15 22,18" fill="#111111" />
              <polygon points="16,22 7,19 4,15 14,17 21,19" fill="#2b160b" />
              <polygon points="15,22 23,16 29,13 56,13 66,18 65,28 57,36 28,36 18,31" fill="#111111" />
              <polygon points="18,22 26,17 31,15 54,15 62,19 61,28 54,33 29,33 21,29" fill="#8a4e25" />
              <polygon points="26,18 37,16 54,16 59,19 44,21 28,21" fill="#b8753a" />
              <polygon points="31,30 52,30 47,33 30,33" fill="#6f3b1d" />
              <polygon points="56,15 66,8 73,10 68,25 59,27" fill="#111111" />
              <polygon points="59,16 67,10 71,12 65,23 60,24" fill="#9a5a2c" />
              <polygon points="67,8 81,10 87,15 83,21 72,21 65,15" fill="#111111" />
              <polygon points="69,10 80,12 84,15 82,18 73,19 68,15" fill="#a86431" />
              <polygon points="65,8 68,1 71,10" fill="#111111" />
              <polygon points="67,8 69,3 70,9" fill="#9a5a2c" />
              <polygon points="73,10 76,4 78,12" fill="#111111" />
              <polygon points="74,10 76,6 77,11" fill="#9a5a2c" />
              <rect x="56" y="15" width="4" height="4" fill="#2b160b" />
              <rect x="59" y="12" width="4" height="5" fill="#2b160b" />
              <rect x="62" y="10" width="4" height="5" fill="#2b160b" />
              <rect x="76" y="13" width="2" height="2" fill="#111111" />
              <rect x="84" y="16" width="3" height="2" fill="#111111" />
            </g>
            <g strokeLinecap="square" strokeLinejoin="miter">
              <path d={nearHindLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={nearHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearHindLeg} fill="none" stroke="#9a5a2c" strokeWidth="2.5">
                <animate attributeName="d" values={nearHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearFrontLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={nearFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearFrontLeg} fill="none" stroke="#9a5a2c" strokeWidth="2.5">
                <animate attributeName="d" values={nearFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "horf") {
    const gait = speed > 560 ? "0.18s" : speed > 160 ? "0.28s" : "0.55s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-78px" : "-4px"}, -23px)` }}>
        <svg width="82" height="52" viewBox="0 0 82 52" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(82 0) scale(-1 1)"}>
            <path
              d="M15 24c-7-1-11-5-13-10"
              fill="none"
              stroke="#4b2c18"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M14 25c4-12 27-15 43-8 8 4 10 12 4 18-11 8-35 7-46-1-4-3-4-6-1-9z"
              fill="#8f5630"
              stroke="#111111"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              d="M54 18c3-9 14-14 22-8 2 6-1 13-9 17-5-1-9-4-13-9z"
              fill="#a36236"
              stroke="#111111"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path d="M69 9 72 2l4 8" fill="#a36236" stroke="#111111" strokeWidth="2" strokeLinejoin="round" />
            <path d="M55 16c-5-2-14-3-24-2" stroke="#25140b" strokeWidth="5" strokeLinecap="round" />
            <path d="M74 19h3" stroke="#111111" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="68" cy="14" r="1.8" fill="#111111" />
            <path
              d="M16 26c5 4 18 6 33 3"
              fill="none"
              stroke="#c88a56"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.75"
            />
            <g stroke="#111111" strokeWidth="3" strokeLinecap="round">
              <path d="M24 34l-9 14">
                <animate attributeName="d" values="M24 34l-9 14;M24 34l10 13;M24 34l-9 14" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M36 35l9 13">
                <animate attributeName="d" values="M36 35l9 13;M36 35l-11 12;M36 35l9 13" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M54 33l-2 15">
                <animate attributeName="d" values="M54 33l-2 15;M54 33l13 10;M54 33l-2 15" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
            <path d="M78 23c-2 2-4 2-6 1" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }
  if (style === "guinea-pig-runner") {
    const gait = speed > 520 ? "0.16s" : speed > 150 ? "0.25s" : "0.48s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-57px" : "-5px"}, -20px)` }}>
        <svg width="64" height="42" viewBox="0 0 64 42" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <ellipse cx="30" cy="24" rx="24" ry="13" fill="#d7a05f" stroke="#111111" strokeWidth="2.2" />
            <path d="M12 18c8-10 25-9 37-2" fill="none" stroke="#fff3d8" strokeWidth="8" strokeLinecap="round" />
            <ellipse cx="51" cy="20" rx="10" ry="9" fill="#c98a47" stroke="#111111" strokeWidth="2" />
            <circle cx="47" cy="12" r="4" fill="#c98a47" stroke="#111111" strokeWidth="1.5" />
            <circle cx="54" cy="18" r="1.5" fill="#111111" />
            <circle cx="59" cy="22" r="2" fill="#f0b0a2" stroke="#111111" strokeWidth="1" />
            <path d="M58 23h4M58 25h4" stroke="#111111" strokeWidth="1" strokeLinecap="round" />
            <g stroke="#111111" strokeWidth="2.3" strokeLinecap="round">
              <path d="M22 34l-4 5">
                <animate attributeName="d" values="M22 34l-4 5;M22 34l5 4;M22 34l-4 5" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M39 34l5 5">
                <animate attributeName="d" values="M39 34l5 5;M39 34l-5 4;M39 34l5 5" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "ant-runner") {
    const gait = speed > 520 ? "0.13s" : speed > 150 ? "0.22s" : "0.44s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-58px" : "-5px"}, -19px)` }}>
        <svg width="64" height="38" viewBox="0 0 64 38" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <ellipse cx="17" cy="20" rx="10" ry="8" fill="#111111" />
            <ellipse cx="33" cy="19" rx="9" ry="7" fill="#202020" />
            <circle cx="48" cy="18" r="8" fill="#111111" />
            <circle cx="51" cy="16" r="1.4" fill="#ffffff" />
            <path d="M53 13c4-7 7-7 9-5M54 16c5-3 7-2 9 1" stroke="#111111" strokeWidth="2" strokeLinecap="round" />
            <g stroke="#111111" strokeWidth="2.4" strokeLinecap="round">
              <path d="M17 20 7 8">
                <animate attributeName="d" values="M17 20 7 8;M17 20 4 25;M17 20 7 8" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M19 22 7 33">
                <animate attributeName="d" values="M19 22 7 33;M19 22 10 9;M19 22 7 33" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M33 20 25 7">
                <animate attributeName="d" values="M33 20 25 7;M33 20 22 31;M33 20 25 7" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M36 21 29 34">
                <animate attributeName="d" values="M36 21 29 34;M36 21 41 7;M36 21 29 34" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M47 21 56 33">
                <animate attributeName="d" values="M47 21 56 33;M47 21 39 7;M47 21 56 33" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "a11-rocket") {
    return (
      <svg
        width="46"
        height="54"
        viewBox="0 0 46 54"
        aria-hidden="true"
        style={{ transform: `translate(-23px, -6px) rotate(${pressed ? 6 : 0}deg)` }}
      >
        <path
          d="M23 3c9 9 10 28 6 40H17C13 31 14 12 23 3z"
          fill="#f4f2e7"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M17 20h12M17 29h12" stroke="#111111" strokeWidth="1.4" />
        <path d="M17 33 8 44l9-2zM29 33l9 11-9-2z" fill="#d7d7d7" stroke="#111111" strokeWidth="2" />
        <path d="M20 11h6v23h-6z" fill="#111111" opacity="0.12" />
        <text x="23" y="27" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontSize="7" fill="#111111">
          A11
        </text>
        <path
          d={pressed ? "M17 43c4 9 8 9 12 0 2 7-1 10-6 10s-8-3-6-10z" : "M18 43c3 6 7 6 10 0 1 5-1 8-5 8s-6-3-5-8z"}
          fill="#ff7a00"
          stroke="#111111"
          strokeWidth="1.5"
        />
        <path d="M21 44c1.5 4 2.5 4 4 0" stroke="#fff200" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "hatchet") {
    return (
      <HatchetCursor $pressed={pressed}>
        <svg
          width="42"
          height="42"
          viewBox="0 0 42 42"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <polygon points="6,14 16,7 25,10 26,15 18,21 9,18" fill="#111111" />
          <polygon points="9,14 17,9 23,11 23,14 17,18 11,16" fill="#cfd4d8" />
          <polygon points="9,14 17,9 15,13 10,16" fill="#f4f7f8" />
          <polygon points="17,18 23,14 23,16 18,21 13,18" fill="#8e969c" />
          <polygon points="20,15 25,17 37,32 34,36 22,20 18,19" fill="#111111" />
          <polygon points="22,17 24,18 34,31 33,33 23,20 21,19" fill="#9a5a2c" />
          <polygon points="24,19 25,20 32,29 31,30" fill="#d49a54" />
          <rect x="20" y="14" width="5" height="5" fill="#111111" />
          <rect x="21" y="15" width="3" height="3" fill="#5a321b" />
          {pressed ? (
            <g>
              <path
                d="M5 29c6 5 13 8 22 8"
                fill="none"
                stroke="#fff200"
                strokeWidth="2"
                strokeLinecap="square"
              />
              <path
                d="M4 33c5 3 10 5 17 6"
                fill="none"
                stroke="#ff4a00"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </g>
          ) : null}
        </svg>
      </HatchetCursor>
    );
  }
  if (style === "tezos-classic") {
    return (
      <svg
        width="36"
        height="49"
        viewBox="0 0 47 64"
        aria-hidden="true"
        style={{ transform: `translate(-18px, -24px) rotate(${pressed ? -5 : 0}deg)` }}
      >
        <path
          fill="#2c7df7"
          d="M30.252 63.441c-4.55 0-7.864-1.089-9.946-3.267-2.08-2.177-3.121-4.525-3.121-7.041 0-.92.181-1.694.544-2.323a3.993 3.993 0 0 1 1.489-1.489c.629-.363 1.403-.544 2.323-.544.92 0 1.693.181 2.323.544.629.363 1.125.86 1.488 1.489.363.629.544 1.403.544 2.323 0 1.113-.266 2.02-.798 2.722-.533.702-1.162 1.161-1.888 1.38.63.87 1.622 1.487 2.977 1.85 1.355.388 2.71.581 4.065.581 1.887 0 3.593-.508 5.118-1.524 1.524-1.017 2.65-2.517 3.376-4.501.726-1.984 1.089-4.235 1.089-6.752 0-2.734-.4-5.07-1.198-7.005-.775-1.96-1.924-3.412-3.449-4.356a9.21 9.21 0 0 0-4.936-1.415c-1.162 0-2.613.484-4.356 1.452l-3.194 1.597v-1.597L37.076 16.4H17.185v19.89c0 1.646.363 3.001 1.089 4.066s1.839 1.597 3.34 1.597c1.16 0 2.274-.387 3.339-1.162a11.803 11.803 0 0 0 2.758-2.83c.097-.219.218-.376.363-.473a.723.723 0 0 1 .472-.181c.266 0 .58.133.944.4.339.386.508.834.508 1.342a9.243 9.243 0 0 1-.182 1.017c-.822 1.839-1.96 3.242-3.412 4.21a8.457 8.457 0 0 1-4.79 1.452c-4.308 0-7.285-.847-8.93-2.54-1.645-1.695-2.468-3.994-2.468-6.897V16.4H.052v-3.703h10.164v-8.42L7.893 1.952V.066h6.751l2.54 1.306v11.325l26.28-.072 2.614 2.613-16.116 16.116a10.807 10.807 0 0 1 3.049-.726c1.742 0 3.702.557 5.88 1.67 2.202 1.089 3.896 2.59 5.081 4.5 1.186 1.888 1.948 3.703 2.287 5.445.363 1.743.545 3.291.545 4.646 0 3.098-.654 5.977-1.96 8.64-1.307 2.661-3.291 4.645-5.953 5.952-2.662 1.307-5.542 1.96-8.639 1.96z"
        />
      </svg>
    );
  }
  if (style === "tezos-current") {
    return <TezosLogoCursor src="/cursors/tezos-current-logo.png" alt="" draggable={false} />;
  }
  if (style === "blang-side-eye") {
    return (
      <BlangCursor
        src={pressed ? "/cursors/blang-facepalm.png" : "/cursors/blang-side-eye.png"}
        alt=""
        draggable={false}
        $pressed={pressed}
      />
    );
  }
  if (style === "middle-finger") {
    return <EmojiCursor $dx={-9} $dy={-5}>🖕</EmojiCursor>;
  }
  if (style === "eggplant") {
    return <EmojiCursor $dx={-8} $dy={-4}>🍆</EmojiCursor>;
  }
  if (style === "paintbrush") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-5px, -31px)" }}
      >
        <path
          d="M21 17 33 5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L26 22z"
          fill="#c2382b"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M15 23 21 17l7 7-6 6z"
          fill="#d7d7d7"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M5 31c2-5 6-9 10-8 4 1 6 4 6 7-4 4-10 6-17 5 0 0 0-2 1-4z"
          fill="#5a321b"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M7 32c3 0 6-1 9-4"
          fill="none"
          stroke="#9a6130"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="5" cy="31" r="2.3" fill="#ff3b8d">
          <animate attributeName="cy" values="31;34;31" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <path d="M33 7 36 10" stroke="#ffb1aa" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "rainbow-hitbox") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-21px, -21px)" }}
      >
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 21 21"
            to="360 21 21"
            dur="1.6s"
            repeatCount="indefinite"
          />
          <path d="M21 2v11M21 29v11M2 21h11M29 21h11" stroke="#111111" strokeWidth="6" strokeLinecap="square" />
          <path d="M21 2v11M21 29v11M2 21h11M29 21h11" stroke="#ff004d" strokeWidth="3" strokeLinecap="square" />
          <path d="M7 7l8 8M27 27l8 8M35 7l-8 8M15 27l-8 8" stroke="#fff200" strokeWidth="3" />
        </g>
        <circle cx="21" cy="21" r="5" fill="#00f0ff" stroke="#111111" strokeWidth="2">
          <animate attributeName="r" values="4;7;4" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (style === "spinning-slice") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-7px, -34px)" }}
      >
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 19 20; 8 19 20; -8 19 20; 0 19 20"
            dur="0.9s"
            repeatCount="indefinite"
          />
          <path
            d="M7 34 34 8c-7-5-18-5-25 0z"
            fill="#ffd45a"
            stroke="#111111"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 8c7-4 16-4 24 0" fill="none" stroke="#c2382b" strokeWidth="5" strokeLinecap="round" />
          <circle cx="19" cy="17" r="2.7" fill="#c2382b" />
          <circle cx="25" cy="23" r="2.5" fill="#c2382b" />
          <circle cx="15" cy="26" r="2.3" fill="#c2382b" />
          <path d="M7 34c6-3 11-7 14-13" stroke="#fff0a0" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  if (style === "floppy-spinner") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-5px, -5px)" }}
      >
        <path
          d="M6 5h25l5 5v27H6z"
          fill="#252a34"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 5h16v12H12z" fill="#9ad7ff" stroke="#111111" strokeWidth="2" />
        <path d="M12 27h18v10H12z" fill="#f2f2f2" stroke="#111111" strokeWidth="2" />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 21 22"
            to="360 21 22"
            dur="1s"
            repeatCount="indefinite"
          />
          <path d="M21 16a6 6 0 0 1 6 6h-4a2 2 0 0 0-2-2z" fill="#ff3b8d" />
          <path d="M21 28a6 6 0 0 1-6-6h4a2 2 0 0 0 2 2z" fill="#fff200" />
        </g>
      </svg>
    );
  }
  return (
    <svg
      width="54"
      height="54"
      viewBox="0 0 54 54"
      aria-hidden="true"
      style={{ transform: `translate(-8px, -6px) rotate(${pressed ? -5 : 0}deg)` }}
    >
      <path
        d="M15 41h20v9c-5 2-15 2-20 0z"
        fill="#5ab4ff"
        stroke="#111111"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 7c2-4 8-4 10 0l8 15 1-6c1-4 7-4 8 0l1 6 2-4c2-4 8-3 8 2 0 7-2 13-6 18-4 5-9 7-16 7h-2c-9 0-15-5-17-13L3 22c-1-5 5-7 8-3l5 6z"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M18 25c5 4 12 5 20 2M26 22l-1 11M35 23l-4 10"
        fill="none"
        stroke="#d7d7d7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 8c2 1 5 1 8 0M9 14c3 1 6 1 10-1"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface CustomCursorState {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
  clickFlash: boolean;
  direction: CursorDirection;
  speed: number;
}

interface CrosshairImpactMark {
  id: number;
  x: number;
  y: number;
}

interface ArrowShotMark {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distance: number;
  angle: number;
}

function CustomCursor({ style }: { style: DesktopAppearance["cursorStyle"] }) {
  const [state, setState] = useState<CustomCursorState>({
    x: 0,
    y: 0,
    visible: false,
    pressed: false,
    clickFlash: false,
    direction: 1,
    speed: 0,
  });
  const [impacts, setImpacts] = useState<CrosshairImpactMark[]>([]);
  const [arrowShots, setArrowShots] = useState<ArrowShotMark[]>([]);
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0, direction: 1 as CursorDirection });
  const impactIdRef = useRef(0);
  const impactTimeoutsRef = useRef<number[]>([]);
  const clickFlashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (style === "system") return;
    const clearClickFlashTimeout = () => {
      if (clickFlashTimeoutRef.current != null) {
        window.clearTimeout(clickFlashTimeoutRef.current);
        clickFlashTimeoutRef.current = null;
      }
    };
    const move = (event: PointerEvent) => {
      const now = performance.now();
      const last = lastPointerRef.current;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const dt = last.t > 0 ? Math.max(16, now - last.t) : 16;
      const direction = Math.abs(dx) > 1 ? (dx >= 0 ? 1 : -1) : last.direction;
      const speed = last.t > 0 ? Math.min(1200, (Math.hypot(dx, dy) / dt) * 1000) : 0;
      lastPointerRef.current = { x: event.clientX, y: event.clientY, t: now, direction };
      setState((prev) => ({
        ...prev,
        x: event.clientX,
        y: event.clientY,
        visible: true,
        direction,
        speed,
      }));
    };
    const press = (event: PointerEvent) => {
      if (event.button !== 0) return;
      clearClickFlashTimeout();
      setState((prev) => ({
        ...prev,
        x: event.clientX,
        y: event.clientY,
        visible: true,
        pressed: true,
        clickFlash: true,
      }));
      clickFlashTimeoutRef.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, clickFlash: false }));
        clickFlashTimeoutRef.current = null;
      }, 420);
      if (style === "crosshair") {
        const id = impactIdRef.current + 1;
        impactIdRef.current = id;
        setImpacts((prev) => [...prev.slice(-7), { id, x: event.clientX, y: event.clientY }]);
        const timeout = window.setTimeout(() => {
          setImpacts((prev) => prev.filter((impact) => impact.id !== id));
        }, 920);
        impactTimeoutsRef.current.push(timeout);
      }
      if (style === "bow-arrow") {
        const iconTarget =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-desktop-icon-root='true']")
            : null;
        const rect = iconTarget?.getBoundingClientRect();
        const fallbackDirection = lastPointerRef.current.direction;
        const toX = rect ? rect.left + rect.width / 2 : event.clientX + fallbackDirection * 86;
        const toY = rect ? rect.top + rect.height / 2 : event.clientY;
        const dx = toX - event.clientX;
        const dy = toY - event.clientY;
        const id = impactIdRef.current + 1;
        impactIdRef.current = id;
        setArrowShots((prev) => [
          ...prev.slice(-5),
          {
            id,
            fromX: event.clientX,
            fromY: event.clientY,
            toX,
            toY,
            distance: Math.max(30, Math.hypot(dx, dy)),
            angle: Math.atan2(dy, dx),
          },
        ]);
        const timeout = window.setTimeout(() => {
          setArrowShots((prev) => prev.filter((shot) => shot.id !== id));
        }, 900);
        impactTimeoutsRef.current.push(timeout);
      }
    };
    const release = () => {
      setState((prev) => ({ ...prev, pressed: false }));
    };
    const hide = () => {
      clearClickFlashTimeout();
      setState((prev) => ({
        ...prev,
        visible: false,
        pressed: false,
        clickFlash: false,
        speed: 0,
      }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      clearClickFlashTimeout();
      impactTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      impactTimeoutsRef.current = [];
    };
  }, [style]);

  if (style === "system") return null;
  return (
    <>
      {style === "crosshair" &&
        impacts.map((impact) => (
          <CrosshairImpact key={impact.id} $x={impact.x} $y={impact.y} />
        ))}
      {style === "bow-arrow" &&
        arrowShots.map((shot) => (
          <Fragment key={shot.id}>
            <BowShot
              $fromX={shot.fromX}
              $fromY={shot.fromY}
              $distance={shot.distance}
              $angle={shot.angle}
            >
              <BowShotArrow $distance={shot.distance}>
                <span />
              </BowShotArrow>
            </BowShot>
            <BowHitMark $x={shot.toX} $y={shot.toY} />
          </Fragment>
        ))}
      <CustomCursorRoot
        data-desktop-cursor={style}
        $x={state.x}
        $y={state.y}
        $visible={state.visible}
      >
        <CursorGlyph
          style={style}
          pressed={state.pressed || state.clickFlash}
          direction={state.direction}
          speed={state.speed}
        />
      </CustomCursorRoot>
    </>
  );
}

interface DesktopIconDef {
  key: string;
  label: string;
  icon: ReactNode;
  defaultX: number;
  defaultY: number;
  enabled: boolean;
  openPath?: string;
}

interface DraggableIconProps {
  def: DesktopIconDef;
  position: { x: number; y: number };
  bounds: { width: number; height: number };
  onMove: (key: string, position: { x: number; y: number }) => void;
  onRelease: (
    key: string,
    position: { x: number; y: number },
    velocity: { x: number; y: number }
  ) => void;
  onOpen?: () => void;
  onDragStart: (key: string) => void;
}

function clampIconPosition(
  position: { x: number; y: number },
  bounds: { width: number; height: number }
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - ICON_W), position.x)),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - ICON_H), position.y)),
  };
}

function DraggableIcon({
  def,
  position,
  bounds,
  onMove,
  onRelease,
  onOpen,
  onDragStart,
}: DraggableIconProps) {
  const dragRef = useRef({
    dragging: false,
    moved: false,
    ox: 0,
    oy: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vx: 0,
    vy: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const dr = dragRef.current;
      dr.dragging = true;
      dr.moved = false;
      dr.ox = e.clientX - position.x;
      dr.oy = e.clientY - position.y;
      dr.lastX = e.clientX;
      dr.lastY = e.clientY;
      dr.lastT = performance.now();
      dr.vx = 0;
      dr.vy = 0;
      onDragStart(def.key);
    },
    [def.key, onDragStart, position.x, position.y]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dr = dragRef.current;
      if (!dr.dragging) return;
      const now = performance.now();
      const dt = Math.max(16, now - dr.lastT);
      dr.vx = ((e.clientX - dr.lastX) / dt) * 1000;
      dr.vy = ((e.clientY - dr.lastY) / dt) * 1000;
      dr.lastX = e.clientX;
      dr.lastY = e.clientY;
      dr.lastT = now;
      dr.moved = true;
      onMove(
        def.key,
        clampIconPosition(
          {
            x: e.clientX - dr.ox,
            y: e.clientY - dr.oy,
          },
          bounds
        )
      );
    },
    [bounds, def.key, onMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const dr = dragRef.current;
      dr.dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (dr.moved) {
        onRelease(def.key, position, { x: dr.vx, y: dr.vy });
      } else {
        onOpen?.();
      }
    },
    [def.key, onOpen, onRelease, position]
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!dragRef.current.moved) onOpen?.();
    },
    [onOpen]
  );

  return (
    <DesktopIconRoot
      data-desktop-icon-root="true"
      data-desktop-icon-key={def.key}
      style={{
        left: position.x,
        top: position.y,
      }}
      title={def.label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDblClick}
    >
      <IconGlyph>{def.icon}</IconGlyph>
      <IconLabel>{def.label}</IconLabel>
    </DesktopIconRoot>
  );
}

type PetTool = "food" | "water" | "scoop" | null;
type PetDropKind = "food" | "water" | "poop";
type AntPhase = "seeking" | "dancing" | "harvesting" | "returning";

interface PetDrop {
  id: string;
  kind: PetDropKind;
  x: number;
  y: number;
  servings?: number;
  createdAt?: number;
}

interface DesktopObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PheromonePoint {
  id: string;
  foodId: string;
  x: number;
  y: number;
  foodDistance: number;
  createdAt: number;
}

interface AntState {
  id: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  targetFoodId: string | null;
  phase: AntPhase;
  phaseStartedAt: number;
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  angle: number;
  carrying: boolean;
  lastTrailAt: number;
  lastRetargetAt: number;
}

function clampFloatingPosition(
  position: { x: number; y: number },
  bounds: { width: number; height: number },
  width: number,
  height: number
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - width), Math.round(position.x))),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - height), Math.round(position.y))),
  };
}

function randomHamsterTarget(bounds: { width: number; height: number }) {
  return clampFloatingPosition(
    {
      x: 96 + Math.random() * Math.max(1, bounds.width - PET_W - 160),
      y: 58 + Math.random() * Math.max(1, bounds.height - PET_H - 140),
    },
    bounds,
    PET_W,
    PET_H + 22
  );
}

function getDropSize(kind: PetDropKind) {
  return kind === "poop" ? 30 : 36;
}

function getDropCenter(drop: PetDrop) {
  const size = getDropSize(drop.kind);
  return { x: drop.x + size / 2, y: drop.y + size / 2 };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function inflateRect(rect: DesktopObstacle, amount: number) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function segmentHitsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: DesktopObstacle,
  padding = 10
) {
  const padded = inflateRect(rect, padding);
  if (pointInRect(a, padded) || pointInRect(b, padded)) return true;
  for (let i = 1; i < 14; i += 1) {
    const t = i / 14;
    if (
      pointInRect(
        {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        },
        padded
      )
    ) {
      return true;
    }
  }
  return false;
}

function chooseObstacleDetour(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacle: DesktopObstacle,
  bounds: { width: number; height: number }
) {
  const padded = inflateRect(obstacle, 16);
  const candidates = [
    { x: padded.x, y: padded.y },
    { x: padded.x + padded.width, y: padded.y },
    { x: padded.x, y: padded.y + padded.height },
    { x: padded.x + padded.width, y: padded.y + padded.height },
    { x: padded.x - 10, y: a.y },
    { x: padded.x + padded.width + 10, y: a.y },
    { x: a.x, y: padded.y - 10 },
    { x: a.x, y: padded.y + padded.height + 10 },
  ]
    .map((point) => ({
      x: Math.max(2, Math.min(Math.max(2, bounds.width - 2), point.x)),
      y: Math.max(2, Math.min(Math.max(2, bounds.height - 2), point.y)),
    }))
    .filter((point) => !pointInRect(point, padded));

  return candidates.reduce((best, candidate) => {
    const bestScore = distance(a, best) + distance(best, b);
    const candidateScore = distance(a, candidate) + distance(candidate, b);
    return candidateScore < bestScore ? candidate : best;
  }, candidates[0] ?? a);
}

function buildAntRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const route = [start, end];
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const obstacle = obstacles.find((candidate) => segmentHitsRect(a, b, candidate));
      if (!obstacle) continue;
      route.splice(i + 1, 0, chooseObstacleDetour(a, b, obstacle, bounds));
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return route.slice(1);
}

function randomEdgePoint(bounds: { width: number; height: number }) {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: Math.random() * bounds.width, y: -ANT_SIZE };
  if (side === 1) return { x: bounds.width + ANT_SIZE, y: Math.random() * bounds.height };
  if (side === 2) return { x: Math.random() * bounds.width, y: bounds.height + ANT_SIZE };
  return { x: -ANT_SIZE, y: Math.random() * bounds.height };
}

function buildTrailRoute(
  start: { x: number; y: number },
  food: PetDrop,
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const foodCenter = getDropCenter(food);
  const trail = trails
    .filter((point) => point.foodId === food.id)
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .slice(0, 24);

  if (trail.length < 4) return buildAntRoute(start, foodCenter, obstacles, bounds);

  const closestIndex = trail.reduce((bestIndex, point, index) => {
    const best = trail[bestIndex];
    return distance(start, point) < distance(start, best) ? index : bestIndex;
  }, 0);
  const trailPoints = trail
    .slice(closestIndex)
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .map((point) => ({ x: point.x, y: point.y }));
  const firstLeg = buildAntRoute(start, trailPoints[0] ?? foodCenter, obstacles, bounds);
  return [...firstLeg, ...trailPoints.slice(1), foodCenter];
}

function chooseAntFoodTarget(foods: PetDrop[], trails: PheromonePoint[]) {
  const trailedFoods = foods.filter((food) => trails.some((trail) => trail.foodId === food.id));
  const pool = trailedFoods.length > 0 && Math.random() < 0.72 ? trailedFoods : foods;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function spawnDesktopAnt(
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
): AntState | null {
  const targetFood = chooseAntFoodTarget(foods, trails);
  if (!targetFood) return null;
  const spawn = randomEdgePoint(bounds);
  const path = buildTrailRoute(spawn, targetFood, trails, obstacles, bounds);
  const now = Date.now();
  return {
    id: `ant-${now}-${Math.round(Math.random() * 99999)}`,
    x: spawn.x,
    y: spawn.y,
    spawnX: spawn.x,
    spawnY: spawn.y,
    targetFoodId: targetFood.id,
    phase: "seeking",
    phaseStartedAt: now,
    path,
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: 0,
  };
}

function petStorageKey(userId: number | null) {
  return `${PET_STORAGE_PREFIX}.${userId ?? "guest"}`;
}

function normalizePetDrops(value: unknown, bounds: { width: number; height: number }) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is PetDrop => {
      if (!item || typeof item !== "object") return false;
      const drop = item as Partial<PetDrop>;
      return (
        typeof drop.id === "string" &&
        (drop.kind === "food" || drop.kind === "water" || drop.kind === "poop") &&
        Number.isFinite(Number(drop.x)) &&
        Number.isFinite(Number(drop.y))
      );
    })
    .slice(0, 36)
    .map((drop) => {
      const size = getDropSize(drop.kind);
      return {
        id: drop.id.slice(0, 80),
        kind: drop.kind,
        servings:
          drop.kind === "food"
            ? Math.max(1, Math.min(FOOD_SERVINGS, Math.round(Number(drop.servings) || FOOD_SERVINGS)))
            : undefined,
        createdAt:
          drop.kind === "food" || drop.kind === "water"
            ? Number.isFinite(Number(drop.createdAt))
              ? Number(drop.createdAt)
              : now
            : undefined,
        ...clampFloatingPosition({ x: drop.x, y: drop.y }, bounds, size, size),
      };
    });
}

function DesktopDropItem({
  drop,
  activeTool,
  bounds,
  trashRect,
  now,
  onMove,
  onScoop,
  onTrash,
}: {
  drop: PetDrop;
  activeTool: PetTool;
  bounds: { width: number; height: number };
  trashRect: DesktopObstacle | null;
  now: number;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onScoop: (id: string) => void;
  onTrash: (id: string) => void;
}) {
  const dragRef = useRef({
    dragging: false,
    moved: false,
    ox: 0,
    oy: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (drop.kind !== "poop" && drop.kind !== "food") return;
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
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.dragging || (drop.kind !== "poop" && drop.kind !== "food")) return;
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
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const drag = dragRef.current;
      dragRef.current.dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (drop.kind === "food" && drag.moved && trashRect) {
        const size = getDropSize(drop.kind);
        const dropCenter = { x: drop.x + size / 2, y: drop.y + size / 2 };
        if (pointInRect(dropCenter, trashRect)) {
          onTrash(drop.id);
          return;
        }
      }
      if (drop.kind === "poop" && activeTool === "scoop" && !drag.moved) {
        onScoop(drop.id);
      }
    },
    [activeTool, drop.id, drop.kind, drop.x, drop.y, onScoop, onTrash, trashRect]
  );

  const fullness = drop.kind === "food" ? clamp01((drop.servings ?? FOOD_SERVINGS) / FOOD_SERVINGS) : 1;
  const waterProgress =
    drop.kind === "water" ? clamp01((now - (drop.createdAt ?? now)) / WATER_ABSORB_MS) : 0;
  const draggable = drop.kind === "food" || drop.kind === "poop";

  return (
    <DesktopDrop
      $x={drop.x}
      $y={drop.y}
      $kind={drop.kind}
      $armed={activeTool === "scoop" && drop.kind === "poop"}
      $draggable={draggable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={
        drop.kind === "poop"
          ? "Hamster poop"
          : drop.kind === "food"
            ? `Hamster food (${drop.servings ?? FOOD_SERVINGS}/20)`
            : "Water soaking into the desktop"
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
      ) : (
        <PoopIcon aria-hidden="true">💩</PoopIcon>
      )}
    </DesktopDrop>
  );
}

function DesktopPet({
  enabled,
  bounds,
  userId,
  careOpen,
  onCareOpenChange,
  obstacles,
  trashRect,
}: {
  enabled: boolean;
  bounds: { width: number; height: number };
  userId: number | null;
  careOpen: boolean;
  onCareOpenChange: (open: boolean) => void;
  obstacles: DesktopObstacle[];
  trashRect: DesktopObstacle | null;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });

  const actionMutation = useMutation({
    mutationFn: (action: HamsterAction) =>
      api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_pet" },
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
    },
  });

  const [activeTool, setActiveTool] = useState<PetTool>(null);
  const [drops, setDrops] = useState<PetDrop[]>([]);
  const [ants, setAnts] = useState<AntState[]>([]);
  const [pheromones, setPheromones] = useState<PheromonePoint[]>([]);
  const [desktopNow, setDesktopNow] = useState(() => Date.now());
  const [position, setPosition] = useState(() => randomHamsterTarget(bounds));
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [moving, setMoving] = useState(false);
  const dropsRef = useRef<PetDrop[]>([]);
  const antsRef = useRef<AntState[]>([]);
  const pheromonesRef = useRef<PheromonePoint[]>([]);
  const obstaclesRef = useRef<DesktopObstacle[]>([]);
  const nextAntSpawnAtRef = useRef(0);
  const positionRef = useRef(position);
  const wanderTargetRef = useRef(randomHamsterTarget(bounds));
  const digestionRef = useRef({ pendingPoops: 0, nextPoopAt: 0 });
  const mutatePetActionRef = useRef(actionMutation.mutate);

  useEffect(() => {
    mutatePetActionRef.current = actionMutation.mutate;
  }, [actionMutation.mutate]);

  useEffect(() => {
    dropsRef.current = drops;
  }, [drops]);

  useEffect(() => {
    antsRef.current = ants;
  }, [ants]);

  useEffect(() => {
    pheromonesRef.current = pheromones;
  }, [pheromones]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = window.localStorage.getItem(petStorageKey(userId));
      if (!raw) {
        const next = randomHamsterTarget(bounds);
        positionRef.current = next;
        setPosition(next);
        setDrops([]);
        return;
      }
      const parsed = JSON.parse(raw) as {
        position?: { x: number; y: number };
        drops?: unknown;
      };
      const nextPosition = clampFloatingPosition(
        parsed.position ?? randomHamsterTarget(bounds),
        bounds,
        PET_W,
        PET_H + 22
      );
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      setDrops(normalizePetDrops(parsed.drops, bounds));
    } catch {
      const next = randomHamsterTarget(bounds);
      positionRef.current = next;
      setPosition(next);
      setDrops([]);
    }
  }, [bounds.height, bounds.width, enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(
        petStorageKey(userId),
        JSON.stringify({ position, drops })
      );
    } catch {
      // Desktop toys should never break the desktop if storage is unavailable.
    }
  }, [drops, enabled, position, userId]);

  useEffect(() => {
    if (enabled) return;
    antsRef.current = [];
    pheromonesRef.current = [];
    setAnts([]);
    setPheromones([]);
    setActiveTool(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setDesktopNow(now);
      const currentDrops = dropsRef.current;
      const nextDrops = currentDrops.filter(
        (drop) => drop.kind !== "water" || now - (drop.createdAt ?? now) < WATER_ABSORB_MS
      );
      if (nextDrops.length !== currentDrops.length) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !data?.pet?.alive || bounds.width <= 1 || bounds.height <= 1) {
      setMoving(false);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.01, (now - last) / 1000));
      last = now;
      const pet = data.pet;
      const current = positionRef.current;
      const liveDrops = dropsRef.current;
      const hungryDrop =
        pet.hunger < 92 ? liveDrops.find((drop) => drop.kind === "food") : undefined;
      const thirstyDrop =
        pet.thirst < 92 ? liveDrops.find((drop) => drop.kind === "water") : undefined;
      const pursuit = hungryDrop ?? thirstyDrop;
      const target = pursuit
        ? { x: pursuit.x - PET_W * 0.22, y: pursuit.y - PET_H * 0.35 }
        : wanderTargetRef.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);

      if (pursuit && distance < 18) {
        const remainingDrops = liveDrops.filter((drop) => drop.id !== pursuit.id);
        dropsRef.current = remainingDrops;
        setDrops(remainingDrops);
        const action: HamsterAction = pursuit.kind === "food" ? "feed" : "water";
        mutatePetActionRef.current(action);
        if (pursuit.kind === "food") {
          const digestion = digestionRef.current;
          digestion.pendingPoops += 1;
          digestion.nextPoopAt =
            digestion.nextPoopAt || Date.now() + 24_000 + Math.random() * 46_000;
        }
      } else if (!pursuit && distance < 12) {
        wanderTargetRef.current = randomHamsterTarget(bounds);
      } else if (distance > 0.5) {
        const speed = pursuit ? 74 : 28 + pet.energy * 0.24;
        const step = Math.min(distance, speed * dt);
        const next = clampFloatingPosition(
          {
            x: current.x + (dx / distance) * step,
            y: current.y + (dy / distance) * step,
          },
          bounds,
          PET_W,
          PET_H + 22
        );
        positionRef.current = next;
        frame += 1;
        if (frame % 2 === 0) setPosition(next);
        setFacing(dx < 0 ? "left" : "right");
        setMoving(true);
      } else {
        setMoving(false);
      }

      const digestion = digestionRef.current;
      if (digestion.pendingPoops > 0 && digestion.nextPoopAt && Date.now() >= digestion.nextPoopAt) {
        const poopPosition = clampFloatingPosition(
          {
            x: positionRef.current.x + 26 + Math.random() * 16,
            y: positionRef.current.y + 42 + Math.random() * 12,
          },
          bounds,
          30,
          30
        );
        const nextDrops = [
          ...dropsRef.current.slice(-31),
          {
            id: `poop-${Date.now()}-${Math.round(Math.random() * 9999)}`,
            kind: "poop" as const,
            ...poopPosition,
          },
        ];
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
        digestion.pendingPoops -= 1;
        digestion.nextPoopAt =
          digestion.pendingPoops > 0
            ? Date.now() + 30_000 + Math.random() * 60_000
            : 0;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    bounds,
    bounds.height,
    bounds.width,
    data?.pet,
    data?.pet?.alive,
    data?.pet?.energy,
    data?.pet?.hunger,
    data?.pet?.thirst,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) {
      return;
    }

    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const takeFoodServing = (foodId: string) => {
      let tookServing = false;
      const nextDrops = dropsRef.current.flatMap((drop) => {
        if (drop.id !== foodId || drop.kind !== "food") return [drop];
        const servings = Math.max(0, (drop.servings ?? FOOD_SERVINGS) - 1);
        tookServing = true;
        return servings > 0 ? [{ ...drop, servings }] : [];
      });
      if (tookServing) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
      return tookServing;
    };

    const retargetAnt = (ant: AntState, foods: PetDrop[], now: number) => {
      const targetFood = chooseAntFoodTarget(foods, pheromonesRef.current);
      if (!targetFood) {
        return {
          ...ant,
          targetFoodId: null,
          carrying: false,
          phase: "returning" as const,
          phaseStartedAt: now,
          path: buildAntRoute(
            { x: ant.x, y: ant.y },
            { x: ant.spawnX, y: ant.spawnY },
            obstaclesRef.current,
            bounds
          ),
          pathIndex: 0,
          lastRetargetAt: now,
        };
      }
      return {
        ...ant,
        targetFoodId: targetFood.id,
        phase: "seeking" as const,
        phaseStartedAt: now,
        path: buildTrailRoute(
          { x: ant.x, y: ant.y },
          targetFood,
          pheromonesRef.current,
          obstaclesRef.current,
          bounds
        ),
        pathIndex: 0,
        carrying: false,
        lastRetargetAt: now,
      };
    };

    const moveAlongPath = (ant: AntState, speed: number, dt: number) => {
      const target = ant.path[ant.pathIndex];
      if (!target) return ant;
      const dx = target.x - ant.x;
      const dy = target.y - ant.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining < 2.2) {
        return { ...ant, x: target.x, y: target.y, pathIndex: ant.pathIndex + 1 };
      }
      const step = Math.min(remaining, speed * dt);
      return {
        ...ant,
        x: ant.x + (dx / remaining) * step,
        y: ant.y + (dy / remaining) * step,
        angle: Math.atan2(dy, dx),
      };
    };

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;

      const foods = dropsRef.current.filter(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      let nextPheromones = pheromonesRef.current.filter(
        (point) => now - point.createdAt < PHEROMONE_LIFETIME_MS
      );
      let nextAnts = antsRef.current;

      if (foods.length > 0 && nextAnts.length < MAX_DESKTOP_ANTS && now >= nextAntSpawnAtRef.current) {
        const spawned = spawnDesktopAnt(foods, nextPheromones, obstaclesRef.current, bounds);
        if (spawned) nextAnts = [...nextAnts, spawned];
        nextAntSpawnAtRef.current = now + 2600 + Math.random() * 6200;
      } else if (foods.length === 0) {
        nextAntSpawnAtRef.current = now + 3000 + Math.random() * 5000;
      }

      const currentFoodsById = new Map(
        dropsRef.current
          .filter((drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0)
          .map((drop) => [drop.id, drop])
      );

      nextAnts = nextAnts
        .map((currentAnt) => {
          let ant = currentAnt;
          const targetFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;

          if ((ant.phase === "seeking" || ant.phase === "dancing" || ant.phase === "harvesting") && !targetFood) {
            ant = retargetAnt(ant, [...currentFoodsById.values()], now);
          }

          const liveFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;
          if (ant.phase === "seeking" && liveFood) {
            const foodCenter = getDropCenter(liveFood);
            const routeEnd = ant.path[ant.path.length - 1];
            if (
              routeEnd &&
              distance(routeEnd, foodCenter) > 28 &&
              now - ant.lastRetargetAt > 1200
            ) {
              ant = {
                ...ant,
                path: buildTrailRoute(
                  { x: ant.x, y: ant.y },
                  liveFood,
                  nextPheromones,
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
                lastRetargetAt: now,
              };
            }

            ant = moveAlongPath(ant, 42 + Math.random() * 10, dt);

            if (now - ant.lastTrailAt > 560) {
              nextPheromones = [
                ...nextPheromones,
                {
                  id: `trail-${now}-${Math.round(Math.random() * 99999)}`,
                  foodId: liveFood.id,
                  x: ant.x,
                  y: ant.y,
                  foodDistance: distance({ x: ant.x, y: ant.y }, foodCenter),
                  createdAt: now,
                },
              ].slice(-MAX_PHEROMONES);
              ant = { ...ant, lastTrailAt: now };
            }

            if (distance({ x: ant.x, y: ant.y }, foodCenter) < 10) {
              ant = {
                ...ant,
                x: foodCenter.x,
                y: foodCenter.y,
                phase: "dancing",
                phaseStartedAt: now,
                path: [],
                pathIndex: 0,
              };
            }
          } else if (ant.phase === "dancing") {
            if (now - ant.phaseStartedAt > 1500) {
              ant = { ...ant, phase: "harvesting", phaseStartedAt: now };
            }
          } else if (ant.phase === "harvesting") {
            if (liveFood) {
              const foodCenter = getDropCenter(liveFood);
              ant = { ...ant, x: foodCenter.x, y: foodCenter.y };
            }
            if (now - ant.phaseStartedAt > 15_000) {
              const carrying = liveFood ? takeFoodServing(liveFood.id) : false;
              ant = {
                ...ant,
                carrying,
                phase: "returning",
                phaseStartedAt: now,
                path: buildAntRoute(
                  { x: ant.x, y: ant.y },
                  { x: ant.spawnX, y: ant.spawnY },
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
              };
            }
          } else if (ant.phase === "returning") {
            ant = moveAlongPath(ant, ant.carrying ? 32 : 46, dt);
            if (ant.carrying && ant.targetFoodId && now - ant.lastTrailAt > 620) {
              const food = currentFoodsById.get(ant.targetFoodId);
              const foodCenter = food ? getDropCenter(food) : { x: ant.x, y: ant.y };
              nextPheromones = [
                ...nextPheromones,
                {
                  id: `trail-${now}-${Math.round(Math.random() * 99999)}`,
                  foodId: ant.targetFoodId,
                  x: ant.x,
                  y: ant.y,
                  foodDistance: distance({ x: ant.x, y: ant.y }, foodCenter),
                  createdAt: now,
                },
              ].slice(-MAX_PHEROMONES);
              ant = { ...ant, lastTrailAt: now };
            }
          }

          return ant;
        })
        .filter((ant) => {
          if (ant.phase !== "returning") return true;
          const target = { x: ant.spawnX, y: ant.spawnY };
          return distance({ x: ant.x, y: ant.y }, target) > 5;
        });

      frame += 1;
      antsRef.current = nextAnts;
      pheromonesRef.current = nextPheromones;
      if (frame % 2 === 0) {
        setAnts(nextAnts);
        setPheromones(nextPheromones);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bounds, bounds.height, bounds.width, enabled]);

  const addDrop = useCallback(
    (kind: "food" | "water", x: number, y: number) => {
      const now = Date.now();
      const nextDrops = [
        ...dropsRef.current.slice(-35),
        {
          id: `${kind}-${Date.now()}-${Math.round(Math.random() * 9999)}`,
          kind,
          createdAt: now,
          servings: kind === "food" ? FOOD_SERVINGS : undefined,
          ...clampFloatingPosition({ x: x - 18, y: y - 18 }, bounds, 36, 36),
        },
      ];
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
    },
    [bounds]
  );

  const handleLayerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool !== "food" && activeTool !== "water") return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      addDrop(activeTool, e.clientX - rect.left, e.clientY - rect.top);
    },
    [activeTool, addDrop]
  );

  const moveDrop = useCallback((id: string, next: { x: number; y: number }) => {
    const nextDrops = dropsRef.current.map((drop) =>
      drop.id === id ? { ...drop, ...next } : drop
    );
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
  }, []);

  const trashFood = useCallback((id: string) => {
    const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
    const nextAnts = antsRef.current.map((ant) =>
      ant.targetFoodId === id
        ? {
            ...ant,
            targetFoodId: null,
            carrying: false,
            phase: "returning" as const,
            phaseStartedAt: Date.now(),
            path: buildAntRoute(
              { x: ant.x, y: ant.y },
              { x: ant.spawnX, y: ant.spawnY },
              obstaclesRef.current,
              bounds
            ),
            pathIndex: 0,
          }
        : ant
    );
    antsRef.current = nextAnts;
    setAnts(nextAnts);
    const nextPheromones = pheromonesRef.current.filter((trail) => trail.foodId !== id);
    pheromonesRef.current = nextPheromones;
    setPheromones(nextPheromones);
  }, [bounds]);

  const scoopDrop = useCallback(
    (id: string) => {
      const remainingDrops = dropsRef.current.filter((drop) => drop.id !== id);
      dropsRef.current = remainingDrops;
      setDrops(remainingDrops);
      mutatePetActionRef.current("scoop");
    },
    []
  );

  if (!enabled || !data?.pet) return null;
  const pet = data.pet;
  const scheme = getHamsterColorScheme(pet.colorSchemeKey);
  const dropMode = activeTool === "food" || activeTool === "water";
  const toolHint =
    activeTool === "food"
      ? "Click the desktop to drop food."
      : activeTool === "water"
        ? "Click the desktop to drop water."
        : activeTool === "scoop"
          ? "Click a poop to scoop it. Drag it if you must."
          : "Pick a care tool.";

  return (
    <>
      <PetLayer $dropMode={dropMode} onPointerDown={handleLayerPointerDown}>
        {pheromones.map((trail) => (
          <PheromoneDot
            key={trail.id}
            $x={trail.x}
            $y={trail.y}
            $age={clamp01((desktopNow - trail.createdAt) / PHEROMONE_LIFETIME_MS)}
          />
        ))}
        {drops.map((drop) => (
          <DesktopDropItem
            key={drop.id}
            drop={drop}
            activeTool={activeTool}
            bounds={bounds}
            trashRect={trashRect}
            now={desktopNow}
            onMove={moveDrop}
            onScoop={scoopDrop}
            onTrash={trashFood}
          />
        ))}
        {ants.map((ant) => (
          <AntActor
            key={ant.id}
            $x={ant.x}
            $y={ant.y}
            $angle={ant.angle}
            $dancing={ant.phase === "dancing"}
            $carrying={ant.carrying}
          >
            <span />
          </AntActor>
        ))}
        <HamsterActor
          type="button"
          data-compact-control="true"
          $x={position.x}
          $y={position.y}
          $facing={facing}
          aria-label={pet.alive ? `Pet ${pet.name}` : `Revive ${pet.name}`}
          onClick={(e) => {
            e.stopPropagation();
            actionMutation.mutate(pet.alive ? "pet" : "revive");
          }}
          style={{ "--label-flip": facing === "left" ? -1 : 1 } as React.CSSProperties}
        >
          <HamsterPixelSprite
            alive={pet.alive}
            moving={moving && pet.alive}
            scheme={scheme}
            width={90}
            height={60}
          />
          <HamsterNameLabel>{pet.name}</HamsterNameLabel>
        </HamsterActor>
      </PetLayer>

      {careOpen && (
        <CareTray variant="outside">
          <CareTrayHeader>
            <span>{pet.name} care</span>
            <Button size="sm" onClick={() => onCareOpenChange(false)} title="Close hamster care">
              <X />
            </Button>
          </CareTrayHeader>
          <MiniStatGrid>
            <span>Food {pet.hunger}</span>
            <span>Water {pet.thirst}</span>
            <span>Clean {pet.hygiene}</span>
            <span>Care {pet.carePoints}</span>
          </MiniStatGrid>
          <CareToolGrid>
            <Button
              size="sm"
              active={activeTool === "food" ? true : undefined}
              onClick={() => setActiveTool((tool) => (tool === "food" ? null : "food"))}
            >
              <Apple /> Food
            </Button>
            <Button
              size="sm"
              active={activeTool === "water" ? true : undefined}
              onClick={() => setActiveTool((tool) => (tool === "water" ? null : "water"))}
            >
              <Droplets /> Water
            </Button>
            <Button
              size="sm"
              active={activeTool === "scoop" ? true : undefined}
              onClick={() => setActiveTool((tool) => (tool === "scoop" ? null : "scoop"))}
            >
              <Shovel /> Scoop
            </Button>
            <Button
              size="sm"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate(pet.alive ? "pet" : "revive")}
            >
              <Heart /> {pet.alive ? "Pet" : "Adopt"}
            </Button>
            <Button
              size="sm"
              disabled={!pet.alive || actionMutation.isPending}
              onClick={() => actionMutation.mutate("nap")}
            >
              <Moon /> Nap
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveTool(null)}
              active={!activeTool ? true : undefined}
            >
              <Palette /> Idle
            </Button>
          </CareToolGrid>
          <div style={{ marginTop: 7, fontSize: 10 }}>{toolHint}</div>
        </CareTray>
      )}
    </>
  );
}

export function Desktop({ children }: { children: ReactNode }) {
  const wm = useWindowManager();
  const { user } = useAuth();
  const qc = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const hotCornerTimer = useRef<number | null>(null);
  const saveIconLayoutRef = useRef<(layout: DesktopIconLayout) => void>(() => {});
  const positionsRef = useRef<DesktopIconLayout>({});
  const physicsRef = useRef<{
    engine: Matter.Engine;
    bodies: Map<string, Matter.Body>;
    raf: number;
    dragging: string | null;
    dirty: boolean;
    stillFrames: number;
  } | null>(null);

  const [surfaceSize, setSurfaceSize] = useState({ width: 1024, height: 768 });
  const [iconPositions, setIconPositions] = useState<DesktopIconLayout>({});
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [hamsterCareOpen, setHamsterCareOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["desktop", "settings"],
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: Partial<DesktopSettingsResponse>) =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", payload),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "settings"], result);
    },
  });

  const appearance = settingsQuery.data?.appearance ?? DEFAULT_DESKTOP_APPEARANCE;
  const customCursorEnabled = appearance.cursorStyle !== "system";
  const desktopPetEnabled = !!user && appearance.desktopPetEnabled;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--wtf-desktop-color", appearance.desktopColor);
    root.style.setProperty("--wtf-window-color", appearance.windowColor);
    root.style.setProperty("--wtf-active-title", appearance.activeTitleColor);
    root.style.setProperty("--wtf-active-title-text", appearance.activeTitleTextColor);
    root.style.setProperty("--wtf-inactive-title", appearance.inactiveTitleColor);
    root.style.setProperty("--wtf-inactive-title-text", appearance.inactiveTitleTextColor);
    root.style.setProperty("--wtf-text-color", appearance.textColor);
    root.style.setProperty("--wtf-highlight-color", appearance.highlightColor);
    root.style.setProperty("--wtf-button-face", appearance.buttonFace);
  }, [appearance]);

  useEffect(() => {
    if (!desktopPetEnabled) setHamsterCareOpen(false);
  }, [desktopPetEnabled]);

  const apps = {
    hoard: data?.apps?.hoard ?? true,
    w: data?.apps?.w ?? true,
    tv: data?.apps?.tv ?? true,
    dicksword: data?.apps?.dicksword ?? true,
    console: data?.apps?.console ?? true,
    studio: data?.apps?.studio ?? true,
    gallery: data?.apps?.gallery ?? true,
  };

  const iconDefs = useMemo<DesktopIconDef[]>(
    () => [
      {
        key: "recycle-bin",
        label: "Recycle Bin",
        icon: "🗑️",
        defaultX: 12,
        defaultY: 12,
        enabled: true,
      },
      {
        key: "hoard",
        label: "HOARD!",
        icon: "🐉",
        defaultX: 12,
        defaultY: 100,
        enabled: apps.hoard,
        openPath: "/hoard",
      },
      {
        key: "w",
        label: "W",
        icon: <WDeskIcon>W</WDeskIcon>,
        defaultX: 12,
        defaultY: 188,
        enabled: apps.w,
        openPath: "/w",
      },
      {
        key: "tv",
        label: "WTF TV",
        icon: <TVDeskIcon>TV</TVDeskIcon>,
        defaultX: 12,
        defaultY: 276,
        enabled: apps.tv,
        openPath: "/tv",
      },
      {
        key: "dicksword",
        label: "Dicksword",
        icon: (
          <DickswordDeskIcon>
            <span>D</span>
          </DickswordDeskIcon>
        ),
        defaultX: 92,
        defaultY: 276,
        enabled: apps.dicksword,
        openPath: "/dicksword",
      },
      {
        key: "console",
        label: "WTF Console",
        icon: <ConsoleDeskIcon>&#9654;</ConsoleDeskIcon>,
        defaultX: 12,
        defaultY: 364,
        enabled: apps.console,
        openPath: "/console",
      },
      {
        key: "studio",
        label: "Studio",
        icon: <StudioDeskIcon />,
        defaultX: 12,
        defaultY: 452,
        enabled: apps.studio,
        openPath: "/studio",
      },
      {
        key: "my-gallery",
        label: "My Gallery",
        icon: <GalleryDeskIcon />,
        defaultX: 12,
        defaultY: 540,
        enabled: apps.gallery,
        openPath: "/my-gallery",
      },
    ],
    [apps.console, apps.dicksword, apps.gallery, apps.hoard, apps.studio, apps.tv, apps.w]
  );

  const visibleIcons = useMemo(() => iconDefs.filter((icon) => icon.enabled), [iconDefs]);
  const visibleIconKey = useMemo(
    () => visibleIcons.map((icon) => icon.key).join("|"),
    [visibleIcons]
  );
  const desktopObstacles = useMemo<DesktopObstacle[]>(
    () =>
      visibleIcons.map((def) => {
        const position =
          iconPositions[def.key] ??
          clampIconPosition({ x: def.defaultX, y: def.defaultY }, surfaceSize);
        return {
          id: def.key,
          x: position.x,
          y: position.y,
          width: ICON_W,
          height: ICON_H,
        };
      }),
    [iconPositions, surfaceSize, visibleIcons]
  );
  const trashRect = useMemo(
    () => desktopObstacles.find((obstacle) => obstacle.id === "recycle-bin") ?? null,
    [desktopObstacles]
  );

  const saveIconLayout = useCallback(
    (layout: DesktopIconLayout) => {
      if (!user) return;
      settingsMutation.mutate({ iconLayout: layout });
    },
    [settingsMutation, user]
  );

  useEffect(() => {
    saveIconLayoutRef.current = saveIconLayout;
  }, [saveIconLayout]);

  useEffect(() => {
    positionsRef.current = iconPositions;
  }, [iconPositions]);

  useEffect(() => {
    const next: DesktopIconLayout = {};
    for (const def of visibleIcons) {
      const saved = settingsQuery.data?.iconLayout?.[def.key];
      next[def.key] = clampIconPosition(
        saved ?? { x: def.defaultX, y: def.defaultY },
        surfaceSize
      );
    }
    setIconPositions(next);
  }, [settingsQuery.data?.iconLayout, surfaceSize, visibleIcons]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSurfaceSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const syncBodyPosition = useCallback((key: string, pos: { x: number; y: number }) => {
    const body = physicsRef.current?.bodies.get(key);
    if (!body) return;
    Matter.Body.setPosition(body, {
      x: pos.x + ICON_W / 2,
      y: pos.y + ICON_H / 2,
    });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
  }, []);

  const handleIconMove = useCallback(
    (key: string, pos: { x: number; y: number }) => {
      setIconPositions((prev) => ({ ...prev, [key]: pos }));
      syncBodyPosition(key, pos);
    },
    [syncBodyPosition]
  );

  const handleIconRelease = useCallback(
    (key: string, pos: { x: number; y: number }, velocity: { x: number; y: number }) => {
      const next = { ...iconPositions, [key]: pos };
      setIconPositions(next);
      const physics = physicsRef.current;
      if (physics) {
        const body = physics.bodies.get(key);
        physics.dragging = null;
        if (body) {
          const speed = Math.hypot(velocity.x, velocity.y);
          const flingScale = speed > 420 ? 1 / 55 : 1 / 160;
          Matter.Body.setVelocity(body, {
            x: Math.max(-24, Math.min(24, velocity.x * flingScale)),
            y: Math.max(-24, Math.min(24, velocity.y * flingScale)),
          });
          physics.dirty = true;
          saveIconLayout(next);
          return;
        }
      }
      saveIconLayout(next);
    },
    [iconPositions, saveIconLayout]
  );

  const handleIconDragStart = useCallback((key: string) => {
    if (physicsRef.current) physicsRef.current.dragging = key;
  }, []);

  useEffect(() => {
    if (!appearance.desktopPhysicsEnabled || surfaceSize.width <= 1 || surfaceSize.height <= 1) {
      if (physicsRef.current) {
        cancelAnimationFrame(physicsRef.current.raf);
        physicsRef.current = null;
      }
      return;
    }

    const engine = Matter.Engine.create({ enableSleeping: true });
    engine.gravity.y = appearance.desktopGravityMode === "on" ? 0.95 : 0;
    engine.gravity.x = 0;
    const bodies = new Map<string, Matter.Body>();
    const wallThickness = 80;
    const walls = [
      Matter.Bodies.rectangle(surfaceSize.width / 2, -wallThickness / 2, surfaceSize.width, wallThickness, { isStatic: true }),
      Matter.Bodies.rectangle(surfaceSize.width / 2, surfaceSize.height + wallThickness / 2, surfaceSize.width, wallThickness, { isStatic: true }),
      Matter.Bodies.rectangle(-wallThickness / 2, surfaceSize.height / 2, wallThickness, surfaceSize.height, { isStatic: true }),
      Matter.Bodies.rectangle(surfaceSize.width + wallThickness / 2, surfaceSize.height / 2, wallThickness, surfaceSize.height, { isStatic: true }),
    ];

    for (const def of visibleIcons) {
      const pos = positionsRef.current[def.key] ?? { x: def.defaultX, y: def.defaultY };
      const body = Matter.Bodies.rectangle(
        pos.x + ICON_W / 2,
        pos.y + ICON_H / 2,
        ICON_W,
        ICON_H,
        {
          restitution: 0.82,
          friction: 0.08,
          frictionAir: appearance.desktopGravityMode === "zero" ? 0.008 : 0.045,
          label: def.key,
        }
      );
      bodies.set(def.key, body);
    }

    Matter.Composite.add(engine.world, [...walls, ...bodies.values()]);

    const physics = {
      engine,
      bodies,
      raf: 0,
      dragging: null as string | null,
      dirty: false,
      stillFrames: 0,
    };
    physicsRef.current = physics;

    const tick = () => {
      Matter.Engine.update(engine, 1000 / 60);
      let maxSpeed = 0;
      const nextLayout: DesktopIconLayout = {};

      for (const [key, body] of bodies.entries()) {
        if (physics.dragging === key) continue;
        const pos = clampIconPosition(
          {
            x: body.position.x - ICON_W / 2,
            y: body.position.y - ICON_H / 2,
          },
          surfaceSize
        );
        nextLayout[key] = pos;
        maxSpeed = Math.max(maxSpeed, Math.hypot(body.velocity.x, body.velocity.y));
      }

      if (Object.keys(nextLayout).length > 0) {
        setIconPositions((prev) => {
          let changed = false;
          const merged = { ...prev };
          for (const [key, pos] of Object.entries(nextLayout)) {
            const old = prev[key];
            if (!old || Math.abs(old.x - pos.x) > 0.5 || Math.abs(old.y - pos.y) > 0.5) {
              merged[key] = pos;
              changed = true;
            }
          }
          if (changed) physics.dirty = true;
          return changed ? merged : prev;
        });
      }

      if (physics.dirty && !physics.dragging) {
        physics.stillFrames = maxSpeed < 0.06 ? physics.stillFrames + 1 : 0;
        if (physics.stillFrames > 45) {
          const settled: DesktopIconLayout = {};
          for (const [key, body] of bodies.entries()) {
            settled[key] = clampIconPosition(
              {
                x: body.position.x - ICON_W / 2,
                y: body.position.y - ICON_H / 2,
              },
              surfaceSize
            );
          }
          physics.dirty = false;
          physics.stillFrames = 0;
          saveIconLayoutRef.current(settled);
        }
      }

      physics.raf = requestAnimationFrame(tick);
    };

    physics.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(physics.raf);
      Matter.Composite.clear(engine.world, false);
      if (physicsRef.current === physics) physicsRef.current = null;
    };
  }, [
    appearance.desktopGravityMode,
    appearance.desktopPhysicsEnabled,
    surfaceSize,
    visibleIconKey,
    visibleIcons,
  ]);

  const resetHotCorner = useCallback(() => {
    if (hotCornerTimer.current) {
      window.clearTimeout(hotCornerTimer.current);
      hotCornerTimer.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (screensaverActive || e.buttons !== 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hot =
        (x < 20 && y < 20) ||
        (x > rect.width - 20 && y < 20) ||
        (x < 20 && y > rect.height - 20) ||
        (x > rect.width - 20 && y > rect.height - 20);
      if (!hot) {
        resetHotCorner();
        return;
      }
      if (!hotCornerTimer.current) {
        hotCornerTimer.current = window.setTimeout(() => {
          hotCornerTimer.current = null;
          setScreensaverActive(true);
        }, 2200);
      }
    },
    [resetHotCorner, screensaverActive]
  );

  useEffect(() => {
    if (!screensaverActive) return;
    const close = () => setScreensaverActive(false);
    window.addEventListener("mousemove", close, { once: true });
    window.addEventListener("keydown", close, { once: true });
    window.addEventListener("pointerdown", close, { once: true });
    return () => {
      window.removeEventListener("mousemove", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [screensaverActive]);

  return (
    <DesktopContainer
      data-wtf-desktop="true"
      $appearance={appearance}
      $cursorHidden={customCursorEnabled}
    >
      <ContentArea
        data-wtf-desktop-content="true"
        ref={contentRef}
        $appearance={appearance}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetHotCorner}
      >
        <WallpaperCenter>
          {!appearance.backgroundImageUrl && <WtfLogo>W T F</WtfLogo>}
        </WallpaperCenter>
        <DesktopSurface>
          {visibleIcons.map((def) => (
            <DraggableIcon
              key={def.key}
              def={def}
              position={
                iconPositions[def.key] ??
                clampIconPosition({ x: def.defaultX, y: def.defaultY }, surfaceSize)
              }
              bounds={surfaceSize}
              onDragStart={handleIconDragStart}
              onMove={handleIconMove}
              onRelease={handleIconRelease}
              onOpen={def.openPath ? () => wm.openPage(def.openPath!) : undefined}
            />
          ))}
        </DesktopSurface>
        <RouteLayer>{children}</RouteLayer>
        <DesktopPet
          enabled={desktopPetEnabled}
          bounds={surfaceSize}
          userId={user?.id ?? null}
          careOpen={hamsterCareOpen}
          onCareOpenChange={setHamsterCareOpen}
          obstacles={desktopObstacles}
          trashRect={trashRect}
        />
      </ContentArea>
      <Taskbar
        hamsterCareEnabled={desktopPetEnabled}
        hamsterCareOpen={hamsterCareOpen}
        onToggleHamsterCare={() => setHamsterCareOpen((open) => !open)}
      />
      {screensaverActive && (
        <ScreenSaver aria-hidden="true">
          <SaverLogo>WTF</SaverLogo>
        </ScreenSaver>
      )}
      <CustomCursor style={appearance.cursorStyle} />
    </DesktopContainer>
  );
}
