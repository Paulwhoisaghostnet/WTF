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
import {
  Apple,
  Circle,
  Coins,
  Droplets,
  Heart,
  Minus,
  Moon,
  Package,
  Palette,
  Pill,
  Plus,
  Shovel,
  ShoppingCart,
  Ticket,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Taskbar } from "./Taskbar";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
import { formatWtf, type DesktopAppKey } from "@shared/types";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_SUNDAY_GRASS_MAX_STAGE,
  desktopSundayKey,
  getHamsterColorScheme,
  isDesktopSunday,
  projectDesktopSundayGrassState,
  type DesktopWorldEdge,
  type DesktopWorldEscapeResponse,
  type DesktopWorldFoodDrop,
  type DesktopWorldFoodSmell,
  type DesktopWorldHeartbeatResponse,
  type DesktopWorldToyEscapeResponse,
  type DesktopWorldVisitor,
  type DesktopAppearance,
  type DesktopIconLayout,
  type DesktopSundayGrassState,
  type HamsterAction,
  type HamsterColorSchemeKey,
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

type InAppMarketItem = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  kind: string | null;
  priceWtfUnits: string;
  priceWtfFormatted: string;
  priceExp: number;
  contractAddress: string | null;
  contractListingId: number | null;
  quantityOwned: number;
};

type MarketCurrency = "wtf" | "exp";

type InAppMarketResponse = {
  config: {
    configured: boolean;
    contractAddress: string | null;
    treasuryAddress: string;
    network: string;
  };
  balances: {
    exp: number;
  };
  items: InAppMarketItem[];
};

type InAppMarketIntentResponse = {
  ok: boolean;
  intent: {
    purchaseRef: string;
    currency: MarketCurrency;
    subtotalWtfUnits: string;
    subtotalWtfFormatted: string;
    subtotalExp: number;
    estimatedFeeTez: string;
    routerListingId: number;
  };
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
const BALL_SIZE = 30;
const MAX_TOY_BALLS = 3;
const TOY_WORLD_SLOT_RESERVE_MS = 120_000;
const MARKET_ESTIMATED_FEE_TEZ = "0.07";
const SUNDAY_GRASS_STORAGE_PREFIX = "wtf.desktop.sunday-grass.v1";
const SUNDAY_GRASS_W = 72;
const SUNDAY_GRASS_LABEL_H = 16;

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

const SundayGrassLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
`;

const SundayGrassRoot = styled.button<{
  $x: number;
  $y: number;
  $height: number;
  $stage: number;
  $touched: boolean;
  $pulse: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${SUNDAY_GRASS_W}px;
  height: ${(p) => p.$height + SUNDAY_GRASS_LABEL_H + 8}px;
  border: 0;
  padding: 0;
  min-height: 0;
  background: transparent !important;
  box-shadow: none;
  appearance: none;
  pointer-events: auto;
  touch-action: manipulation;
  cursor: pointer;
  color: #ffffff;
  text-shadow: 1px 1px 1px #000000;
  user-select: none;
  transform: ${(p) => (p.$pulse ? "translateY(-2px)" : "none")};
  transition: transform 140ms ease;

  &::after {
    content: "${(p) => (p.$touched ? "Touched" : "Touch Grass")}";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    font-size: 11px;
    line-height: 13px;
    text-align: center;
    color: #ffffff;
    text-shadow: 1px 1px 1px #000000, -1px 0 0 rgba(0, 0, 0, 0.55);
  }
`;

const SundayGrassClump = styled.span<{
  $height: number;
  $stage: number;
  $pulse: boolean;
}>`
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: ${SUNDAY_GRASS_LABEL_H + 4}px;
  height: ${(p) => p.$height}px;
  display: block;
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.28));
  animation: ${(p) => (p.$pulse ? "grass-touch 520ms steps(2, end)" : "none")};

  &::before {
    content: "";
    position: absolute;
    left: 2px;
    right: 2px;
    bottom: -4px;
    height: 12px;
    border: 2px solid #1d381a;
    border-radius: 50%;
    background:
      radial-gradient(ellipse at 34% 60%, #5f3b1f 0 24%, transparent 25%),
      linear-gradient(180deg, #7a5127 0%, #3d2411 100%);
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.18);
  }

  span {
    position: absolute;
    bottom: 3px;
    width: 5px;
    border: 1px solid #0f3a13;
    border-radius: 6px 6px 1px 1px;
    transform-origin: bottom center;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.3) 0 1px, transparent 1px),
      linear-gradient(180deg, #6cff4f 0%, #179a35 64%, #0b6126 100%);
    box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.18);
  }

  span:nth-child(1) {
    left: 7px;
    height: ${(p) => Math.max(17, p.$height * 0.78)}px;
    transform: rotate(-20deg);
  }

  span:nth-child(2) {
    left: 17px;
    height: ${(p) => Math.max(20, p.$height * 0.96)}px;
    transform: rotate(-6deg);
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.36) 0 1px, transparent 1px),
      linear-gradient(180deg, #9dff5e 0%, #28b23c 62%, #0e6e28 100%);
  }

  span:nth-child(3) {
    left: 29px;
    height: ${(p) => Math.max(18, p.$height * 1.05)}px;
    transform: rotate(8deg);
  }

  span:nth-child(4) {
    left: 41px;
    height: ${(p) => Math.max(15, p.$height * 0.72)}px;
    transform: rotate(23deg);
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.26) 0 1px, transparent 1px),
      linear-gradient(180deg, #56e34a 0%, #13852d 68%, #084f20 100%);
  }

  i {
    position: absolute;
    right: 3px;
    top: ${(p) => Math.max(0, p.$height * 0.12)}px;
    min-width: 17px;
    height: 13px;
    padding: 0 3px;
    border: 1px solid #12340d;
    background: #fff6a8;
    color: #14370d;
    font-style: normal;
    font-family: "Pixelated MS Sans Serif", "MS Sans Serif", sans-serif;
    font-size: 8px;
    font-weight: 900;
    line-height: 12px;
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.32);
  }

  @keyframes grass-touch {
    0%,
    100% {
      transform: rotate(0deg) scale(1);
    }
    50% {
      transform: rotate(-3deg) scale(1.06);
    }
  }
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

const VisitingPetActor = styled.span<{
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

const WalkaboutSignpost = styled.span<{ $x: number; $y: number }>`
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

const TunnelScratchCue = styled.span<{
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

const ToyBallActor = styled.button<{
  $x: number;
  $y: number;
  $color: string;
  $visitor: boolean;
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
    radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.92) 0 4px, transparent 4.5px),
    radial-gradient(circle at 66% 72%, rgba(0, 0, 0, 0.22) 0 6px, transparent 6.5px),
    linear-gradient(135deg, ${(p) => p.$color} 0%, ${(p) => p.$color} 54%, #111111 56%, #111111 62%, #ffffff 64%);
  box-shadow:
    inset -4px -5px 0 rgba(0, 0, 0, 0.25),
    inset 4px 4px 0 rgba(255, 255, 255, 0.35),
    2px 3px 0 rgba(0, 0, 0, 0.32);
  filter: ${(p) => (p.$visitor ? "saturate(0.9) drop-shadow(0 0 3px rgba(255,255,255,0.45))" : "none")};

  &:active {
    cursor: grabbing;
  }
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
  width: 316px;
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
  grid-template-columns: repeat(3, 1fr);
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

const CareMarketGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 6px 0;

  button {
    min-width: 0;
    min-height: 42px;
    font-size: 10px;
    line-height: 1.05;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 2px;
    white-space: normal;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const MarketPanel = styled.div`
  margin: 6px 0;
  padding: 6px;
  border: 1px solid #7f7f7f;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(232, 232, 232, 0.38)),
    var(--wtf-window-color);
`;

const MarketHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: bold;
`;

const MarketTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  svg {
    width: 13px;
    height: 13px;
  }
`;

const CurrencyTabs = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(2, 42px);
  gap: 2px;

  button {
    min-width: 0;
    height: 24px;
    padding: 0;
    font-size: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MarketTicketButton = styled(Button)`
  strong,
  span {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  strong {
    font-size: 10px;
  }

  span {
    font-size: 9px;
    opacity: 0.86;
  }
`;

const CartPanel = styled.div`
  margin-top: 5px;
  border-top: 1px solid #8f8f8f;
  padding-top: 5px;
  font-size: 10px;
`;

const CartLine = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 3px;
  min-height: 24px;
  border-bottom: 1px dotted rgba(0, 0, 0, 0.28);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    width: 22px;
    min-width: 22px;
    height: 20px;
    padding: 0;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const CartQty = styled.b`
  min-width: 24px;
  text-align: center;
`;

const MarketTotals = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  margin-top: 5px;
  font-size: 10px;

  strong {
    text-align: right;
  }
`;

const CheckoutButton = styled(Button)`
  width: 100%;
  min-height: 28px;
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const CareStatusLine = styled.div<{ $error?: boolean }>`
  min-height: 14px;
  margin-top: 5px;
  font-size: 10px;
  color: ${(p) => (p.$error ? "#a00000" : "#000080")};
  overflow-wrap: anywhere;
`;

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

const PheromoneDot = styled.span<{ $x: number; $y: number; $age: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(173, 255, 47, ${(p) => Math.max(0, 0.25 * (1 - p.$age))});
  box-shadow: 0 0 4px rgba(202, 255, 79, ${(p) => Math.max(0, 0.16 * (1 - p.$age))});
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

type PetTool = "food" | "water" | "scoop" | "pet" | "pillow" | "medicine" | "ball" | null;
type PetDropKind = "food" | "water" | "poop" | "pillow" | "skeleton";
type PetActionMutationInput =
  | HamsterAction
  | { action: HamsterAction; metadata?: Record<string, unknown> };
type AntPhase = "exploring" | "seeking" | "dancing" | "harvesting" | "returning" | "passing";
type AntColonySide = "top" | "right" | "bottom" | "left";

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
  worldVisitorId?: string;
}

interface VisitingPetState {
  id: string;
  x: number;
  y: number;
  facing: "left" | "right";
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  schemeKey: HamsterColorSchemeKey;
  label: string;
  createdAt: number;
  ttlMs: number;
  worldVisitorId: string;
}

interface PetToyState {
  id: string;
  kind: "ball";
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  owner: "local" | "visitor";
  createdAt: number;
  lastPetHitAt: number;
  lastMessAt: number;
  worldVisitorId?: string;
}

interface EscapedBallSlot {
  id: string;
  until: number;
}

interface EscapeTunnelState {
  edge: DesktopWorldEdge;
  openUntil: number;
}

interface WalkaboutSignpostState {
  x: number;
  y: number;
  until: number;
}

interface ScentScratchState {
  edge: DesktopWorldEdge;
  target: { x: number; y: number };
  focusUntil: number;
  nextScratchAt: number;
  nextEscapeAttemptAt: number;
}

type DefensiveTarget =
  | { kind: "ant"; id: string; x: number; y: number }
  | { kind: "toy"; id: string; x: number; y: number }
  | { kind: "visitor"; id: string; x: number; y: number };

interface AntColony {
  x: number;
  y: number;
  side: AntColonySide;
  boundsWidth: number;
  boundsHeight: number;
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
  if (kind === "poop") return 30;
  if (kind === "pillow") return 46;
  if (kind === "skeleton") return 48;
  return 36;
}

function getDropCenter(drop: PetDrop) {
  const size = getDropSize(drop.kind);
  return { x: drop.x + size / 2, y: drop.y + size / 2 };
}

function getToyCenter(toy: PetToyState) {
  return { x: toy.x + BALL_SIZE / 2, y: toy.y + BALL_SIZE / 2 };
}

function chooseDefensiveTarget(
  current: { x: number; y: number },
  trauma: number,
  ants: AntState[],
  toys: PetToyState[],
  visitors: VisitingPetState[]
): DefensiveTarget | null {
  if (trauma < 24) return null;
  const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.5 };
  const radius = 82 + trauma * 1.9;
  const candidates: DefensiveTarget[] = [
    ...ants.map((ant) => ({ kind: "ant" as const, id: ant.id, x: ant.x, y: ant.y })),
    ...toys
      .filter((toy) => Math.hypot(toy.vx, toy.vy) > 7)
      .map((toy) => {
        const center = getToyCenter(toy);
        return { kind: "toy" as const, id: toy.id, x: center.x, y: center.y };
      }),
    ...visitors.map((visitor) => ({
      kind: "visitor" as const,
      id: visitor.id,
      x: visitor.x + PET_W / 2,
      y: visitor.y + PET_H * 0.5,
    })),
  ];
  return candidates
    .map((candidate) => ({
      candidate,
      distance: distance(petCenter, candidate),
    }))
    .filter((entry) => entry.distance <= radius)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate ?? null;
}

function toyEscapeEdge(toy: PetToyState, bounds: { width: number; height: number }): DesktopWorldEdge | null {
  if (toy.x <= -BALL_SIZE * 0.38 && toy.vx < 0) return "left";
  if (toy.x >= bounds.width - BALL_SIZE * 0.62 && toy.vx > 0) return "right";
  if (toy.y <= -BALL_SIZE * 0.38 && toy.vy < 0) return "top";
  if (toy.y >= bounds.height - BALL_SIZE * 0.62 && toy.vy > 0) return "bottom";
  return null;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampHexColor(value: unknown, fallback = "#f047a6") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function seededBallColor(seed: number) {
  const colors = ["#f047a6", "#26c6da", "#ffe156", "#7bd88f", "#ff6b35", "#8b5cf6"];
  return colors[Math.abs(seed) % colors.length] ?? "#f047a6";
}

function seededUnit(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function edgePoint(
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number },
  seed: number,
  size: number,
  salt = 0
) {
  const t = seededUnit(seed, salt);
  if (edge === "top") return { x: t * Math.max(1, bounds.width - size), y: -size - 4 };
  if (edge === "bottom") return { x: t * Math.max(1, bounds.width - size), y: bounds.height + size + 4 };
  if (edge === "left") return { x: -size - 4, y: t * Math.max(1, bounds.height - size) };
  return { x: bounds.width + size + 4, y: t * Math.max(1, bounds.height - size) };
}

function visibleEdgePoint(
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number },
  seed: number,
  size: number,
  salt = 0
) {
  const t = seededUnit(seed, salt);
  if (edge === "top") return { x: t * Math.max(1, bounds.width - size), y: 2 };
  if (edge === "bottom") return { x: t * Math.max(1, bounds.width - size), y: Math.max(0, bounds.height - size - 2) };
  if (edge === "left") return { x: 2, y: t * Math.max(1, bounds.height - size) };
  return { x: Math.max(0, bounds.width - size - 2), y: t * Math.max(1, bounds.height - size) };
}

function randomWorldEdge(): DesktopWorldEdge {
  const edges: DesktopWorldEdge[] = ["top", "right", "bottom", "left"];
  return edges[Math.floor(Math.random() * edges.length)] ?? "right";
}

function offscreenTargetForEdge(edge: DesktopWorldEdge, bounds: { width: number; height: number }) {
  if (edge === "top") return { x: Math.random() * Math.max(1, bounds.width - PET_W), y: -PET_H * 1.2 };
  if (edge === "bottom") return { x: Math.random() * Math.max(1, bounds.width - PET_W), y: bounds.height + PET_H };
  if (edge === "left") return { x: -PET_W * 1.2, y: Math.random() * Math.max(1, bounds.height - PET_H) };
  return { x: bounds.width + PET_W, y: Math.random() * Math.max(1, bounds.height - PET_H) };
}

function sniffTargetForEdge(edge: DesktopWorldEdge, bounds: { width: number; height: number }) {
  const margin = 6;
  const jitter = 36;
  if (edge === "top") {
    return clampFloatingPosition(
      { x: 40 + Math.random() * Math.max(1, bounds.width - PET_W - 80), y: margin + Math.random() * jitter },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  if (edge === "bottom") {
    return clampFloatingPosition(
      {
        x: 40 + Math.random() * Math.max(1, bounds.width - PET_W - 80),
        y: bounds.height - PET_H - 30 - Math.random() * jitter,
      },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  if (edge === "left") {
    return clampFloatingPosition(
      { x: margin + Math.random() * jitter, y: 42 + Math.random() * Math.max(1, bounds.height - PET_H - 98) },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  return clampFloatingPosition(
    {
      x: bounds.width - PET_W - 12 - Math.random() * jitter,
      y: 42 + Math.random() * Math.max(1, bounds.height - PET_H - 98),
    },
    bounds,
    PET_W,
    PET_H + 22
  );
}

function scratchCuePosition(
  edge: DesktopWorldEdge,
  position: { x: number; y: number },
  bounds: { width: number; height: number }
) {
  if (edge === "top") return { x: position.x + PET_W * 0.32, y: 4 };
  if (edge === "bottom") return { x: position.x + PET_W * 0.32, y: Math.max(0, bounds.height - 28) };
  if (edge === "left") return { x: 4, y: position.y + PET_H * 0.34 };
  return { x: Math.max(0, bounds.width - 38), y: position.y + PET_H * 0.34 };
}

function isOffscreenTarget(target: { x: number; y: number }, bounds: { width: number; height: number }) {
  return target.x < 0 || target.y < 0 || target.x > bounds.width - PET_W || target.y > bounds.height - PET_H;
}

function isAtEdgeForTarget(
  position: { x: number; y: number },
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number }
) {
  if (edge === "top") return position.y <= 2;
  if (edge === "bottom") return position.y >= Math.max(0, bounds.height - PET_H - 24);
  if (edge === "left") return position.x <= 2;
  return position.x >= Math.max(0, bounds.width - PET_W - 2);
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

function createAntColony(bounds: { width: number; height: number }): AntColony {
  const sides: AntColonySide[] = ["top", "right", "bottom", "left"];
  const side = sides[Math.floor(Math.random() * sides.length)];
  const insetX = 24 + Math.random() * Math.max(1, bounds.width - 48);
  const insetY = 24 + Math.random() * Math.max(1, bounds.height - 48);
  if (side === "top") {
    return { x: insetX, y: -ANT_SIZE * 3, side, boundsWidth: bounds.width, boundsHeight: bounds.height };
  }
  if (side === "right") {
    return {
      x: bounds.width + ANT_SIZE * 3,
      y: insetY,
      side,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    };
  }
  if (side === "bottom") {
    return {
      x: insetX,
      y: bounds.height + ANT_SIZE * 3,
      side,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    };
  }
  return { x: -ANT_SIZE * 3, y: insetY, side, boundsWidth: bounds.width, boundsHeight: bounds.height };
}

function antColonyEntrance(colony: AntColony) {
  const spread = 34;
  const jitter = () => (Math.random() - 0.5) * spread;
  if (colony.side === "top" || colony.side === "bottom") {
    return { x: colony.x + jitter(), y: colony.y + (Math.random() - 0.5) * 8 };
  }
  return { x: colony.x + (Math.random() - 0.5) * 8, y: colony.y + jitter() };
}

function randomAntExploreTarget(bounds: { width: number; height: number }) {
  return {
    x: 20 + Math.random() * Math.max(1, bounds.width - 40),
    y: 20 + Math.random() * Math.max(1, bounds.height - 40),
  };
}

function buildAntExploreRoute(
  start: { x: number; y: number },
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const liveFoodIds = new Set(foods.map((food) => food.id));
  const liveTrails = trails
    .filter((trail) => liveFoodIds.has(trail.foodId))
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .slice(0, 12);
  const trailTarget =
    liveTrails.length > 0 && Math.random() < 0.68
      ? liveTrails[Math.floor(Math.random() * liveTrails.length)]
      : null;
  const target = trailTarget ? { x: trailTarget.x, y: trailTarget.y } : randomAntExploreTarget(bounds);
  return buildAntRoute(start, target, obstacles, bounds);
}

function chooseDiscoveredFood(
  ant: AntState,
  foods: PetDrop[],
  trails: PheromonePoint[]
) {
  const current = { x: ant.x, y: ant.y };
  const visibleFood = foods
    .map((food) => ({ food, distance: distance(current, getDropCenter(food)) }))
    .filter((item) => item.distance < 82)
    .sort((a, b) => a.distance - b.distance)[0]?.food;
  if (visibleFood) return visibleFood;

  const liveFoodById = new Map(foods.map((food) => [food.id, food]));
  const nearbyTrail = trails
    .filter((trail) => liveFoodById.has(trail.foodId))
    .map((trail) => ({ trail, distance: distance(current, trail) }))
    .filter((item) => item.distance < 48)
    .sort((a, b) => a.distance - b.distance)[0]?.trail;
  return nearbyTrail ? liveFoodById.get(nearbyTrail.foodId) ?? null : null;
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

function spawnDesktopAnt(
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number },
  colony: AntColony
): AntState | null {
  if (foods.length === 0) return null;
  const spawn = antColonyEntrance(colony);
  const path = buildAntExploreRoute(spawn, foods, trails, obstacles, bounds);
  const now = Date.now();
  return {
    id: `ant-${now}-${Math.round(Math.random() * 99999)}`,
    x: spawn.x,
    y: spawn.y,
    spawnX: colony.x,
    spawnY: colony.y,
    targetFoodId: null,
    phase: "exploring",
    phaseStartedAt: now,
    path,
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: 0,
  };
}

function spawnWorldAnt(
  visitor: DesktopWorldVisitor,
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
): AntState | null {
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, ANT_SIZE, 1);
  const exit = edgePoint(visitor.exitEdge, bounds, visitor.seed, ANT_SIZE, 2);
  const now = Date.now();
  const targetFood =
    visitor.role === "forage"
      ? foods.find((drop) => drop.id === visitor.targetDropId) ?? foods[0]
      : undefined;
  if (visitor.role === "forage" && targetFood) {
    return {
      id: `world-ant-${visitor.id}`,
      x: spawn.x,
      y: spawn.y,
      spawnX: exit.x,
      spawnY: exit.y,
      targetFoodId: targetFood.id,
      phase: "seeking",
      phaseStartedAt: now,
      path: buildTrailRoute(spawn, targetFood, trails, obstacles, bounds),
      pathIndex: 0,
      angle: 0,
      carrying: false,
      lastTrailAt: 0,
      lastRetargetAt: now,
      worldVisitorId: visitor.id,
    };
  }

  return {
    id: `world-ant-${visitor.id}`,
    x: spawn.x,
    y: spawn.y,
    spawnX: exit.x,
    spawnY: exit.y,
    targetFoodId: null,
    phase: "passing",
    phaseStartedAt: now,
    path: buildAntRoute(spawn, exit, obstacles, bounds),
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: now,
    worldVisitorId: visitor.id,
  };
}

function spawnVisitingPet(
  visitor: DesktopWorldVisitor,
  bounds: { width: number; height: number }
): VisitingPetState | null {
  if (visitor.kind !== "guinea-pig") return null;
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, PET_W, 3);
  const mid = clampFloatingPosition(
    visibleEdgePoint(visitor.entryEdge, bounds, visitor.seed, PET_W, 4),
    bounds,
    PET_W,
    PET_H + 22
  );
  const exit = edgePoint(visitor.exitEdge, bounds, visitor.seed, PET_W, 5);
  return {
    id: `world-pet-${visitor.id}`,
    x: spawn.x,
    y: spawn.y,
    facing: exit.x < spawn.x ? "left" : "right",
    path: [mid, exit],
    pathIndex: 0,
    schemeKey: visitor.colorSchemeKey ?? "golden",
    label: visitor.label ?? "wandering guinea pig",
    createdAt: Date.now(),
    ttlMs: visitor.ttlMs,
    worldVisitorId: visitor.id,
  };
}

function inwardVelocityForEdge(edge: DesktopWorldEdge, speed: number) {
  if (edge === "top") return { vx: 0, vy: speed };
  if (edge === "bottom") return { vx: 0, vy: -speed };
  if (edge === "left") return { vx: speed, vy: 0 };
  return { vx: -speed, vy: 0 };
}

function spawnWorldBall(
  visitor: DesktopWorldVisitor,
  bounds: { width: number; height: number }
): PetToyState | null {
  if (visitor.kind !== "ball" || visitor.toy?.kind !== "ball") return null;
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, BALL_SIZE, 7);
  const velocity = inwardVelocityForEdge(visitor.entryEdge, 135 + seededUnit(visitor.seed, 8) * 75);
  return {
    id: `world-ball-${visitor.id}`,
    kind: "ball",
    x: spawn.x,
    y: spawn.y,
    vx: velocity.vx,
    vy: velocity.vy,
    color: clampHexColor(visitor.toy.color, seededBallColor(visitor.seed)),
    owner: "visitor",
    createdAt: Date.now(),
    lastPetHitAt: 0,
    lastMessAt: 0,
    worldVisitorId: visitor.id,
  };
}

function petStorageKey(userId: number | null) {
  return `${PET_STORAGE_PREFIX}.${userId ?? "guest"}`;
}

function sundayGrassStorageKey(userId: number | null) {
  return `${SUNDAY_GRASS_STORAGE_PREFIX}.${userId ?? "guest"}`;
}

function sundayGrassHeight(stage: number) {
  return Math.max(24, Math.min(86, 22 + stage * 4));
}

function sundayGrassSeed(userId: number | null, sundayKey: string) {
  let hash = userId ?? 17;
  for (let i = 0; i < sundayKey.length; i += 1) {
    hash = (hash * 31 + sundayKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function defaultSundayGrassPosition(
  userId: number | null,
  sundayKey: string,
  bounds: { width: number; height: number }
) {
  const seed = sundayGrassSeed(userId, sundayKey);
  const safeWidth = Math.max(1, bounds.width - SUNDAY_GRASS_W - 24);
  const safeHeight = Math.max(1, bounds.height - sundayGrassHeight(DESKTOP_SUNDAY_GRASS_MAX_STAGE) - 34);
  return {
    x: 108 + seededUnit(seed, 13) * Math.max(1, safeWidth - 108),
    y: 46 + seededUnit(seed, 29) * Math.max(1, safeHeight - 46),
  };
}

function clampSundayGrassPosition(
  state: DesktopSundayGrassState,
  bounds: { width: number; height: number }
) {
  return {
    ...state,
    ...clampFloatingPosition(
      state,
      bounds,
      SUNDAY_GRASS_W,
      sundayGrassHeight(state.heightStage) + SUNDAY_GRASS_LABEL_H + 8
    ),
  };
}

function SundayGrass({
  userId,
  bounds,
}: {
  userId: number | null;
  bounds: { width: number; height: number };
}) {
  const [now, setNow] = useState(() => Date.now());
  const [grass, setGrass] = useState<DesktopSundayGrassState | null>(null);
  const [pulseUntil, setPulseUntil] = useState(0);
  const storageKey = sundayGrassStorageKey(userId);
  const todayKey = desktopSundayKey(new Date(now));

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pulseUntil <= now) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.max(80, pulseUntil - now));
    return () => window.clearTimeout(timeout);
  }, [now, pulseUntil]);

  useEffect(() => {
    if (bounds.width <= 1 || bounds.height <= 1) return;
    const date = new Date();
    const sundayKey = isDesktopSunday(date) ? desktopSundayKey(date) : todayKey;
    let raw: unknown = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      raw = stored ? JSON.parse(stored) : null;
    } catch {
      raw = null;
    }
    const projection = projectDesktopSundayGrassState(
      raw,
      date,
      defaultSundayGrassPosition(userId, sundayKey, bounds)
    );
    setGrass(projection.state ? clampSundayGrassPosition(projection.state, bounds) : null);
  }, [bounds, bounds.height, bounds.width, storageKey, todayKey, userId]);

  useEffect(() => {
    if (bounds.width <= 1 || bounds.height <= 1) return;
    try {
      if (grass) {
        window.localStorage.setItem(storageKey, JSON.stringify(grass));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ambient desktop rituals should not care if localStorage is unavailable.
    }
  }, [bounds.height, bounds.width, grass, storageKey]);

  const date = new Date(now);
  const visible = Boolean(grass && isDesktopSunday(date));
  if (!visible || !grass) return null;

  const currentSundayKey = desktopSundayKey(date);
  const touched = grass.touchedSundayKey === currentSundayKey;
  const pulse = now < pulseUntil;
  const height = sundayGrassHeight(grass.heightStage);
  return (
    <SundayGrassLayer>
      <SundayGrassRoot
        type="button"
        aria-label={touched ? "Sunday grass touched" : "Touch Sunday grass"}
        title={`Sunday grass, week ${grass.heightStage}`}
        $x={grass.x}
        $y={grass.y}
        $height={height}
        $stage={grass.heightStage}
        $touched={touched}
        $pulse={pulse}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const touchedAt = Date.now();
          setPulseUntil(touchedAt + 900);
          setNow(touchedAt);
          setGrass((current) =>
            current
              ? {
                  ...current,
                  touchedSundayKey: currentSundayKey,
                  touchedAt,
                }
              : current
          );
        }}
      >
        <SundayGrassClump
          aria-hidden="true"
          $height={height}
          $stage={grass.heightStage}
          $pulse={pulse}
        >
          <span />
          <span />
          <span />
          <span />
          <i>{grass.heightStage}</i>
        </SundayGrassClump>
      </SundayGrassRoot>
    </SundayGrassLayer>
  );
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
        (drop.kind === "food" ||
          drop.kind === "water" ||
          drop.kind === "poop" ||
          drop.kind === "pillow" ||
          drop.kind === "skeleton") &&
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

function normalizePetToys(value: unknown, bounds: { width: number; height: number }) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is Partial<PetToyState> => {
      if (!item || typeof item !== "object") return false;
      const toy = item as Partial<PetToyState>;
      return (
        toy.kind === "ball" &&
        typeof toy.id === "string" &&
        Number.isFinite(Number(toy.x)) &&
        Number.isFinite(Number(toy.y))
      );
    })
    .slice(0, MAX_TOY_BALLS * 3)
    .map((toy) => {
      const position = clampFloatingPosition(
        { x: Number(toy.x), y: Number(toy.y) },
        bounds,
        BALL_SIZE,
        BALL_SIZE
      );
      return {
        id: toy.id!.slice(0, 96),
        kind: "ball" as const,
        x: position.x,
        y: position.y,
        vx: Math.max(-260, Math.min(260, Number(toy.vx) || 0)),
        vy: Math.max(-260, Math.min(260, Number(toy.vy) || 0)),
        color: clampHexColor(toy.color),
        owner: toy.owner === "visitor" ? "visitor" as const : "local" as const,
        createdAt: Number.isFinite(Number(toy.createdAt)) ? Number(toy.createdAt) : now,
        lastPetHitAt: 0,
        lastMessAt: 0,
        worldVisitorId: typeof toy.worldVisitorId === "string" ? toy.worldVisitorId.slice(0, 120) : undefined,
      };
    });
}

function normalizeEscapedBallSlots(value: unknown) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is Partial<EscapedBallSlot> => {
      if (!item || typeof item !== "object") return false;
      return typeof item.id === "string" && Number.isFinite(Number(item.until));
    })
    .map((slot) => ({
      id: slot.id!.slice(0, 96),
      until: Number(slot.until),
    }))
    .filter((slot) => slot.until > now)
    .slice(0, MAX_TOY_BALLS);
}

function CareToolCursor({
  tool,
  position,
}: {
  tool: Exclude<PetTool, null>;
  position: { x: number; y: number; visible: boolean };
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

function DesktopDropItem({
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
  careTrayRef: React.RefObject<HTMLDivElement | null>;
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
    (e: React.PointerEvent) => {
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
    (e: React.PointerEvent) => {
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
    (e: React.PointerEvent) => {
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
          ? "Hamster poop"
          : drop.kind === "food"
            ? `Hamster food (${drop.servings ?? FOOD_SERVINGS}/20)`
            : drop.kind === "water"
              ? "Water soaking into the desktop"
              : drop.kind === "pillow"
                ? "Hamster pillow"
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

function DesktopBallToy({
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
    (e: React.PointerEvent) => {
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
    (e: React.PointerEvent) => {
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
    (e: React.PointerEvent) => {
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
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
  const { address, connect } = useWallet();
  const { data } = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
  const marketQuery = useQuery({
    queryKey: ["in-app-market", "desktop_pet"],
    queryFn: () => api.get<InAppMarketResponse>("/api/in-app-market?category=desktop_pet"),
    enabled,
    refetchInterval: enabled ? 45_000 : false,
  });

  const actionMutation = useMutation({
    mutationFn: (request: PetActionMutationInput) => {
      const action = typeof request === "string" ? request : request.action;
      const metadata = typeof request === "string" ? {} : request.metadata ?? {};
      return api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_pet", ...metadata },
      });
    },
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
  const [toolCursorPosition, setToolCursorPosition] = useState({
    x: 0,
    y: 0,
    visible: false,
  });
  const [drops, setDrops] = useState<PetDrop[]>([]);
  const [toys, setToys] = useState<PetToyState[]>([]);
  const [escapedBallSlots, setEscapedBallSlots] = useState<EscapedBallSlot[]>([]);
  const [ants, setAnts] = useState<AntState[]>([]);
  const [pheromones, setPheromones] = useState<PheromonePoint[]>([]);
  const [visitingPets, setVisitingPets] = useState<VisitingPetState[]>([]);
  const [petAwayUntil, setPetAwayUntil] = useState(0);
  const [escapeTunnel, setEscapeTunnel] = useState<EscapeTunnelState | null>(null);
  const [walkaboutSignpost, setWalkaboutSignpost] = useState<WalkaboutSignpostState | null>(null);
  const [scentScratchCue, setScentScratchCue] = useState<
    (WalkaboutSignpostState & { edge: DesktopWorldEdge }) | null
  >(null);
  const [desktopNow, setDesktopNow] = useState(() => Date.now());
  const [marketStatus, setMarketStatus] = useState<{
    text: string;
    error?: boolean;
  }>({ text: "" });
  const [marketCurrency, setMarketCurrency] = useState<MarketCurrency>("wtf");
  const [cartTickets, setCartTickets] = useState<Record<string, number>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [position, setPosition] = useState(() => randomHamsterTarget(bounds));
  const [homePosition, setHomePosition] = useState(() => randomHamsterTarget(bounds));
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [moving, setMoving] = useState(false);
  const dropsRef = useRef<PetDrop[]>([]);
  const toysRef = useRef<PetToyState[]>([]);
  const escapedBallSlotsRef = useRef<EscapedBallSlot[]>([]);
  const antsRef = useRef<AntState[]>([]);
  const visitingPetsRef = useRef<VisitingPetState[]>([]);
  const pheromonesRef = useRef<PheromonePoint[]>([]);
  const obstaclesRef = useRef<DesktopObstacle[]>([]);
  const nextAntSpawnAtRef = useRef(0);
  const antColonyRef = useRef<AntColony | null>(null);
  const spawnedWorldVisitorsRef = useRef(new Set<string>());
  const positionRef = useRef(position);
  const homePositionRef = useRef(homePosition);
  const wanderTargetRef = useRef(randomHamsterTarget(bounds));
  const escapeEdgeRef = useRef<DesktopWorldEdge | null>(null);
  const escapeTunnelRef = useRef<EscapeTunnelState | null>(null);
  const neighborFoodSmellRef = useRef<DesktopWorldFoodSmell | null>(null);
  const scentScratchRef = useRef<ScentScratchState | null>(null);
  const nextPetEscapeAtRef = useRef(Date.now() + 70_000 + Math.random() * 80_000);
  const nextHomeReturnAtRef = useRef(Date.now() + 55_000 + Math.random() * 55_000);
  const escapeRequestCooldownRef = useRef(0);
  const toyEscapeRequestIdsRef = useRef(new Set<string>());
  const defenseCooldownRef = useRef(0);
  const digestionRef = useRef({ pendingPoops: 0, nextPoopAt: 0 });
  const mutatePetActionRef = useRef(actionMutation.mutate);
  const careTrayRef = useRef<HTMLDivElement | null>(null);
  const sleepRef = useRef({ nextPillowSleepAt: 0, nextFloorRestAt: 0 });
  const sicknessExposureRef = useRef({ nextAt: 0 });
  const remainsClearedRef = useRef(false);
  const lastAliveRef = useRef<boolean | null>(null);
  const marketItemsBySku = useMemo(() => {
    return new Map((marketQuery.data?.items ?? []).map((item) => [item.sku, item]));
  }, [marketQuery.data?.items]);
  const foodItem = marketItemsBySku.get("pet-food") ?? null;
  const medicineItem = marketItemsBySku.get("pet-medicine") ?? null;
  const shoeboxItem = marketItemsBySku.get("shoebox") ?? null;
  const ballItem =
    marketItemsBySku.get("pet-ball") ??
    (marketQuery.data?.items ?? []).find(
      (item) => item.kind === "ball" || item.kind === "toy-ball"
    ) ??
    null;
  const foodQty = foodItem?.quantityOwned ?? 0;
  const medicineQty = medicineItem?.quantityOwned ?? 0;
  const shoeboxQty = shoeboxItem?.quantityOwned ?? 0;
  const ballQty = Math.min(ballItem?.quantityOwned ?? 0, MAX_TOY_BALLS);
  const marketConfigured = marketQuery.data?.config.configured ?? false;
  const expBalance = marketQuery.data?.balances.exp ?? 0;
  const marketListings = useMemo(
    () => [foodItem, medicineItem, shoeboxItem, ballItem].filter(Boolean) as InAppMarketItem[],
    [ballItem, foodItem, medicineItem, shoeboxItem]
  );
  const cartEntries = useMemo(
    () =>
      marketListings
        .map((item) => ({
          item,
          quantity: cartTickets[item.sku] ?? 0,
        }))
        .filter((entry) => entry.quantity > 0),
    [cartTickets, marketListings]
  );
  const cartTicketCount = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const cartSubtotalWtfUnits = cartEntries
    .reduce(
      (sum, entry) =>
        sum + BigInt(entry.item.priceWtfUnits) * BigInt(entry.quantity),
      0n
    )
    .toString();
  const cartSubtotalWtfFormatted = formatWtf(cartSubtotalWtfUnits);
  const cartSubtotalExp = cartEntries.reduce(
    (sum, entry) => sum + (entry.item.priceExp ?? 0) * entry.quantity,
    0
  );

  useEffect(() => {
    mutatePetActionRef.current = actionMutation.mutate;
  }, [actionMutation.mutate]);

  useEffect(() => {
    dropsRef.current = drops;
  }, [drops]);

  useEffect(() => {
    toysRef.current = toys;
  }, [toys]);

  useEffect(() => {
    escapedBallSlotsRef.current = escapedBallSlots;
  }, [escapedBallSlots]);

  useEffect(() => {
    antsRef.current = ants;
  }, [ants]);

  useEffect(() => {
    visitingPetsRef.current = visitingPets;
  }, [visitingPets]);

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
    homePositionRef.current = homePosition;
  }, [homePosition]);

  useEffect(() => {
    escapeTunnelRef.current = escapeTunnel;
  }, [escapeTunnel]);

  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = window.localStorage.getItem(petStorageKey(userId));
      if (!raw) {
        const next = randomHamsterTarget(bounds);
        positionRef.current = next;
        homePositionRef.current = next;
        setPosition(next);
        setHomePosition(next);
        setDrops([]);
        setToys([]);
        setEscapedBallSlots([]);
        return;
      }
      const parsed = JSON.parse(raw) as {
        position?: { x: number; y: number };
        home?: { x: number; y: number };
        drops?: unknown;
        toys?: unknown;
        escapedBallSlots?: unknown;
      };
      const nextPosition = clampFloatingPosition(
        parsed.position ?? randomHamsterTarget(bounds),
        bounds,
        PET_W,
        PET_H + 22
      );
      const nextHome = clampFloatingPosition(
        parsed.home ?? nextPosition,
        bounds,
        PET_W,
        PET_H + 22
      );
      positionRef.current = nextPosition;
      homePositionRef.current = nextHome;
      setPosition(nextPosition);
      setHomePosition(nextHome);
      setDrops(normalizePetDrops(parsed.drops, bounds));
      setToys(normalizePetToys(parsed.toys, bounds));
      setEscapedBallSlots(normalizeEscapedBallSlots(parsed.escapedBallSlots));
    } catch {
      const next = randomHamsterTarget(bounds);
      positionRef.current = next;
      homePositionRef.current = next;
      setPosition(next);
      setHomePosition(next);
      setDrops([]);
      setToys([]);
      setEscapedBallSlots([]);
    }
  }, [bounds.height, bounds.width, enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(
        petStorageKey(userId),
        JSON.stringify({ position, home: homePosition, drops, toys, escapedBallSlots })
      );
    } catch {
      // Desktop toys should never break the desktop if storage is unavailable.
    }
  }, [drops, enabled, escapedBallSlots, homePosition, position, toys, userId]);

  useEffect(() => {
    if (enabled) return;
    antsRef.current = [];
    toysRef.current = [];
    escapedBallSlotsRef.current = [];
    visitingPetsRef.current = [];
    pheromonesRef.current = [];
    antColonyRef.current = null;
    neighborFoodSmellRef.current = null;
    scentScratchRef.current = null;
    spawnedWorldVisitorsRef.current.clear();
    setAnts([]);
    setToys([]);
    setEscapedBallSlots([]);
    setVisitingPets([]);
    setPheromones([]);
    setPetAwayUntil(0);
    setEscapeTunnel(null);
    setWalkaboutSignpost(null);
    setScentScratchCue(null);
    setActiveTool(null);
  }, [enabled]);

  useEffect(() => {
    if (!careOpen) setActiveTool(null);
  }, [careOpen]);

  useEffect(() => {
    if (!activeTool) {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const root = document.documentElement;
    root.setAttribute("data-wtf-hamster-care-tool", activeTool);
    const style = document.createElement("style");
    style.setAttribute("data-wtf-hamster-care-tool-style", activeTool);
    style.textContent = `
      html[data-wtf-hamster-care-tool] body,
      html[data-wtf-hamster-care-tool] body * {
        cursor: none !important;
      }
      html[data-wtf-hamster-care-tool] [data-desktop-cursor] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const move = (event: PointerEvent) => {
      setToolCursorPosition({
        x: event.clientX,
        y: event.clientY,
        visible: true,
      });
    };
    const hide = () => {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move, true);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move, true);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      style.remove();
      if (root.getAttribute("data-wtf-hamster-care-tool") === activeTool) {
        root.removeAttribute("data-wtf-hamster-care-tool");
      }
    };
  }, [activeTool]);

  const addCartTicket = useCallback(
    (item: InAppMarketItem | null) => {
      if (!item) return;
      setCartTickets((prev) => {
        const current = prev[item.sku] ?? 0;
        if (item.sku === ballItem?.sku && ballQty + current >= MAX_TOY_BALLS) {
          setMarketStatus({ text: "Ball limit is 3 per user.", error: true });
          return prev;
        }
        setMarketStatus({ text: `${item.name} ticket added.` });
        return {
          ...prev,
          [item.sku]: Math.min(current + 1, 99),
        };
      });
    },
    [ballItem?.sku, ballQty]
  );

  const changeCartTicket = useCallback((sku: string, delta: number) => {
    setCartTickets((prev) => {
      const maxQty =
        sku === ballItem?.sku ? Math.max(0, MAX_TOY_BALLS - ballQty) : 99;
      const nextQty = Math.max(0, Math.min((prev[sku] ?? 0) + delta, maxQty));
      if (delta > 0 && sku === ballItem?.sku && nextQty === (prev[sku] ?? 0)) {
        setMarketStatus({ text: "Ball limit is 3 per user.", error: true });
      }
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[sku];
      } else {
        next[sku] = nextQty;
      }
      return next;
    });
  }, [ballItem?.sku, ballQty]);

  const checkoutMarketCart = useCallback(async () => {
    if (cartEntries.length === 0 || checkoutBusy) return;
    if (marketCurrency === "wtf" && !marketConfigured) {
      setMarketStatus({ text: "Market contract is not configured.", error: true });
      return;
    }
    if (marketCurrency === "exp" && cartSubtotalExp > expBalance) {
      setMarketStatus({ text: "Not enough EXP for that cart.", error: true });
      return;
    }

    try {
      setCheckoutBusy(true);
      setMarketStatus({ text: "Writing tickets..." });
      const cartItems = cartEntries.map((entry) => ({
        sku: entry.item.sku,
        quantity: entry.quantity,
      }));

      if (marketCurrency === "exp") {
        const intent = await api.post<InAppMarketIntentResponse>(
          "/api/in-app-market/intents",
          {
            currency: "exp",
            items: cartItems,
          }
        );
        setMarketStatus({ text: "Redeeming EXP..." });
        await api.post("/api/in-app-market/checkout-exp", {
          purchaseRef: intent.intent.purchaseRef,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] }),
          qc.invalidateQueries({ queryKey: ["auth", "user"] }),
        ]);
        setCartTickets({});
        setMarketStatus({ text: `${cartTicketCount} ticket(s) granted.` });
        return;
      }

      setMarketStatus({ text: "Opening wallet..." });
      let walletAddress = address;
      const tezos = await import("../../lib/tezos");
      if (!walletAddress) {
        await connect();
        walletAddress = (await tezos.getActiveAccount())?.address ?? null;
      }
      if (!walletAddress) {
        throw new Error("Connect a Tezos wallet first.");
      }

      const intent = await api.post<InAppMarketIntentResponse>(
        "/api/in-app-market/intents",
        {
          currency: "wtf",
          walletAddress,
          items: cartItems,
        }
      );
      setMarketStatus({ text: "Approving WTF..." });
      await tezos.approveInAppMarketForWtf(walletAddress);
      setMarketStatus({ text: "Sending WTF..." });
      const opHash = await tezos.purchaseInAppMarketListing({
        walletAddress,
        listingId: intent.intent.routerListingId,
        amountWtfUnits: intent.intent.subtotalWtfUnits,
        purchaseRef: intent.intent.purchaseRef,
      });
      setMarketStatus({ text: "Confirming purchase..." });
      await api.post("/api/in-app-market/verify", { opHash });
      await qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] });
      setCartTickets({});
      setMarketStatus({ text: `${cartTicketCount} ticket(s) granted.` });
    } catch (err) {
      setMarketStatus({
        text: err instanceof Error ? err.message : "Checkout failed.",
        error: true,
      });
    } finally {
      setCheckoutBusy(false);
    }
  }, [
    address,
    cartEntries,
    cartSubtotalExp,
    cartTicketCount,
    checkoutBusy,
    connect,
    expBalance,
    marketConfigured,
    marketCurrency,
    qc,
  ]);

  const consumeMarketItem = useCallback(
    async (sku: string): Promise<boolean> => {
      try {
        await api.post("/api/in-app-market/use", { sku });
        await qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] });
        setMarketStatus({ text: "" });
        return true;
      } catch (err) {
        setMarketStatus({
          text: err instanceof Error ? err.message : "Item unavailable.",
          error: true,
        });
        return false;
      }
    },
    [qc]
  );

  const receiveWorldVisitors = useCallback(
    (visitors: DesktopWorldVisitor[]) => {
      if (bounds.width <= 1 || bounds.height <= 1) return;
      const newVisitors = visitors.filter((visitor) => {
        if (spawnedWorldVisitorsRef.current.has(visitor.id)) return false;
        spawnedWorldVisitorsRef.current.add(visitor.id);
        return true;
      });
      if (newVisitors.length === 0) return;

      const foods = dropsRef.current.filter(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      const nextAnts = [...antsRef.current];
      const nextPets = [...visitingPetsRef.current];
      const nextToys = [...toysRef.current];
      for (const visitor of newVisitors) {
        if (visitor.kind === "ant") {
          const ant = spawnWorldAnt(
            visitor,
            foods,
            pheromonesRef.current,
            obstaclesRef.current,
            bounds
          );
          if (ant) nextAnts.push(ant);
        } else if (visitor.kind === "guinea-pig") {
          const petVisitor = spawnVisitingPet(visitor, bounds);
          if (petVisitor) nextPets.push(petVisitor);
        } else if (visitor.kind === "ball") {
          const ballVisitor = spawnWorldBall(visitor, bounds);
          if (ballVisitor) nextToys.push(ballVisitor);
        }
      }
      antsRef.current = nextAnts.slice(-MAX_DESKTOP_ANTS - 12);
      visitingPetsRef.current = nextPets.slice(-4);
      toysRef.current = nextToys.slice(-(MAX_TOY_BALLS * 3));
      setAnts(antsRef.current);
      setVisitingPets(visitingPetsRef.current);
      setToys(toysRef.current);
    },
    [bounds]
  );

  useEffect(() => {
    if (!enabled || !userId || bounds.width <= 1 || bounds.height <= 1) return;
    let cancelled = false;
    let timeout = 0;

    const sendHeartbeat = async () => {
      const foods: DesktopWorldFoodDrop[] = dropsRef.current
        .filter((drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0)
        .slice(0, 24)
        .map((drop) => ({
          id: drop.id,
          x: drop.x,
          y: drop.y,
          servings: drop.servings ?? FOOD_SERVINGS,
        }));
      try {
        const response = await api.post<DesktopWorldHeartbeatResponse>(
          "/api/desktop/world/heartbeat",
          {
            viewport: bounds,
            foods,
            pet: data?.pet
              ? {
                  x: positionRef.current.x,
                  y: positionRef.current.y,
                  alive: data.pet.alive,
                }
              : undefined,
          }
        );
        if (!cancelled) {
          neighborFoodSmellRef.current = response.activity.neighborFoodSmell ?? null;
          receiveWorldVisitors(response.visitors);
        }
      } catch {
        if (!cancelled) neighborFoodSmellRef.current = null;
        // World travel is ambient; a failed heartbeat should not break local care.
      } finally {
        if (!cancelled) timeout = window.setTimeout(sendHeartbeat, 5_000);
      }
    };

    sendHeartbeat();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bounds, data?.pet, enabled, receiveWorldVisitors, userId]);

  const requestPetWorldEscape = useCallback(
    async (edge: DesktopWorldEdge, pet: HamsterState) => {
      const now = Date.now();
      if (now < escapeRequestCooldownRef.current || now < petAwayUntil) return;
      escapeRequestCooldownRef.current = now + 35_000;
      try {
        const response = await api.post<DesktopWorldEscapeResponse>(
          "/api/desktop/world/escape",
          {
            edge,
            pet: {
              colorSchemeKey: pet.colorSchemeKey,
            },
          }
        );
        if (response.accepted) {
          const clock = Date.now();
          const leavingSpot = positionRef.current;
          const sign = clampFloatingPosition(
            { x: leavingSpot.x + PET_W * 0.32, y: leavingSpot.y + PET_H * 0.72 },
            bounds,
            42,
            38
          );
          setPetAwayUntil(clock + response.awayMs);
          setEscapeTunnel({ edge, openUntil: clock + response.awayMs });
          setWalkaboutSignpost({ ...sign, until: clock + response.awayMs });
          nextPetEscapeAtRef.current = clock + 95_000 + Math.random() * 120_000;
          const next = homePositionRef.current;
          positionRef.current = next;
          setPosition(next);
        } else {
          nextPetEscapeAtRef.current = Date.now() + 50_000 + Math.random() * 80_000;
        }
      } catch {
        nextPetEscapeAtRef.current = Date.now() + 60_000 + Math.random() * 80_000;
      }
    },
    [bounds, petAwayUntil]
  );

  const requestToyWorldEscape = useCallback(
    async (edge: DesktopWorldEdge, toy: PetToyState) => {
      if (toyEscapeRequestIdsRef.current.has(toy.id)) return;
      toyEscapeRequestIdsRef.current.add(toy.id);
      try {
        const response = await api.post<DesktopWorldToyEscapeResponse>(
          "/api/desktop/world/toy-escape",
          {
            edge,
            toy: {
              kind: "ball",
              color: toy.color,
              sourceVisitorId: toy.worldVisitorId,
            },
          }
        );
        if (response.accepted) {
          if (toy.owner === "local") {
            const until = Date.now() + Math.max(response.awayMs, TOY_WORLD_SLOT_RESERVE_MS);
            const nextSlots = [
              ...escapedBallSlotsRef.current.filter((slot) => slot.until > Date.now() && slot.id !== toy.id),
              { id: toy.id, until },
            ].slice(-MAX_TOY_BALLS);
            escapedBallSlotsRef.current = nextSlots;
            setEscapedBallSlots(nextSlots);
          }
          const nextToys = toysRef.current.filter((entry) => entry.id !== toy.id);
          toysRef.current = nextToys;
          setToys(nextToys);
          setMarketStatus({ text: "Ball went through the tunnel." });
          return;
        }
        const nextToys = toysRef.current.map((entry) => {
          if (entry.id !== toy.id) return entry;
          const clamped = clampFloatingPosition(entry, bounds, BALL_SIZE, BALL_SIZE);
          return {
            ...entry,
            ...clamped,
            vx: -entry.vx * 0.62,
            vy: -entry.vy * 0.62,
          };
        });
        toysRef.current = nextToys;
        setToys(nextToys);
      } catch {
        const nextToys = toysRef.current.map((entry) =>
          entry.id === toy.id
            ? {
                ...entry,
                ...clampFloatingPosition(entry, bounds, BALL_SIZE, BALL_SIZE),
                vx: -entry.vx * 0.5,
                vy: -entry.vy * 0.5,
              }
            : entry
        );
        toysRef.current = nextToys;
        setToys(nextToys);
      } finally {
        window.setTimeout(() => {
          toyEscapeRequestIdsRef.current.delete(toy.id);
        }, 2200);
      }
    },
    [bounds]
  );

  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;
      let changed = false;
      const nextPets = visitingPetsRef.current
        .map((petVisitor) => {
          const target = petVisitor.path[petVisitor.pathIndex];
          if (!target || now - petVisitor.createdAt > petVisitor.ttlMs + 4_000) {
            changed = true;
            return null;
          }
          const dx = target.x - petVisitor.x;
          const dy = target.y - petVisitor.y;
          const remaining = Math.hypot(dx, dy);
          if (remaining < 3) {
            changed = true;
            return {
              ...petVisitor,
              x: target.x,
              y: target.y,
              pathIndex: petVisitor.pathIndex + 1,
            };
          }
          const step = Math.min(remaining, 58 * dt);
          changed = true;
          return {
            ...petVisitor,
            x: petVisitor.x + (dx / remaining) * step,
            y: petVisitor.y + (dy / remaining) * step,
            facing: dx < 0 ? "left" as const : "right" as const,
          };
        })
        .filter((petVisitor): petVisitor is VisitingPetState => Boolean(petVisitor))
        .filter((petVisitor) => petVisitor.pathIndex <= petVisitor.path.length);

      frame += 1;
      if (changed && frame % 2 === 0) {
        visitingPetsRef.current = nextPets;
        setVisitingPets(nextPets);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bounds.height, bounds.width, enabled]);

  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const resolveIconCollision = (toy: PetToyState, obstacle: DesktopObstacle) => {
      const radius = BALL_SIZE / 2;
      const center = getToyCenter(toy);
      const nearestX = Math.max(obstacle.x, Math.min(center.x, obstacle.x + obstacle.width));
      const nearestY = Math.max(obstacle.y, Math.min(center.y, obstacle.y + obstacle.height));
      let dx = center.x - nearestX;
      let dy = center.y - nearestY;
      let dist = Math.hypot(dx, dy);
      if (dist >= radius || dist === 0) {
        if (dist !== 0) return toy;
        const distances = [
          { nx: -1, ny: 0, amount: Math.abs(center.x - obstacle.x) },
          { nx: 1, ny: 0, amount: Math.abs(obstacle.x + obstacle.width - center.x) },
          { nx: 0, ny: -1, amount: Math.abs(center.y - obstacle.y) },
          { nx: 0, ny: 1, amount: Math.abs(obstacle.y + obstacle.height - center.y) },
        ].sort((a, b) => a.amount - b.amount);
        const normal = distances[0] ?? { nx: 1, ny: 0 };
        dx = normal.nx;
        dy = normal.ny;
        dist = 1;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const penetration = radius - dist + 0.8;
      const dot = toy.vx * nx + toy.vy * ny;
      return {
        ...toy,
        x: toy.x + nx * penetration,
        y: toy.y + ny * penetration,
        vx: dot < 0 ? toy.vx - 1.72 * dot * nx : toy.vx,
        vy: dot < 0 ? toy.vy - 1.72 * dot * ny : toy.vy,
      };
    };

    const pushFromPet = (
      toy: PetToyState,
      actor: { x: number; y: number; width: number; height: number },
      now: number,
      strength: number
    ) => {
      const center = getToyCenter(toy);
      const actorCenter = {
        x: actor.x + actor.width / 2,
        y: actor.y + actor.height * 0.52,
      };
      const dx = center.x - actorCenter.x;
      const dy = center.y - actorCenter.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const reach = BALL_SIZE / 2 + Math.min(actor.width, actor.height) * 0.42;
      if (dist > reach) return toy;
      const nx = dx / dist;
      const ny = dy / dist;
      return {
        ...toy,
        x: toy.x + nx * Math.max(1, reach - dist),
        y: toy.y + ny * Math.max(1, reach - dist),
        vx: toy.vx + nx * strength,
        vy: toy.vy + ny * strength,
        lastPetHitAt: now,
      };
    };

    const splashOrSpill = (toy: PetToyState, now: number) => {
      if (now - toy.lastMessAt < 850) return toy;
      const center = getToyCenter(toy);
      const hitDrop = dropsRef.current.find((drop) => {
        if (drop.kind !== "food" && drop.kind !== "water") return false;
        return distance(center, getDropCenter(drop)) < BALL_SIZE / 2 + getDropSize(drop.kind) * 0.45;
      });
      if (!hitDrop) return toy;

      if (hitDrop.kind === "water") {
        const nextDrops = dropsRef.current.map((drop) => {
          if (drop.id !== hitDrop.id) return drop;
          const jittered = clampFloatingPosition(
            {
              x: drop.x + (Math.random() - 0.5) * 22,
              y: drop.y + (Math.random() - 0.5) * 18,
            },
            bounds,
            getDropSize("water"),
            getDropSize("water")
          );
          return {
            ...drop,
            ...jittered,
            createdAt: Math.max(now - WATER_ABSORB_MS * 0.82, (drop.createdAt ?? now) - 18_000),
          };
        });
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
        return { ...toy, vx: toy.vx * 0.78, vy: toy.vy * 0.78, lastMessAt: now };
      }

      const servings = Math.max(1, hitDrop.servings ?? FOOD_SERVINGS);
      if (servings <= 1) return { ...toy, lastMessAt: now };
      const spilled = Math.max(1, Math.min(6, Math.floor(servings * 0.28)));
      const spillPosition = clampFloatingPosition(
        {
          x: hitDrop.x + (Math.random() - 0.5) * 56,
          y: hitDrop.y + (Math.random() - 0.5) * 42,
        },
        bounds,
        getDropSize("food"),
        getDropSize("food")
      );
      const nextDrops = [
        ...dropsRef.current.map((drop) =>
          drop.id === hitDrop.id
            ? { ...drop, servings: Math.max(1, servings - spilled), createdAt: now }
            : drop
        ),
        {
          id: `spill-${now}-${Math.round(Math.random() * 9999)}`,
          kind: "food" as const,
          createdAt: now,
          servings: spilled,
          ...spillPosition,
        },
      ].slice(-36);
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
      return { ...toy, vx: toy.vx * 0.84, vy: toy.vy * 0.84, lastMessAt: now };
    };

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;
      const tunnel =
        escapeTunnelRef.current && now < escapeTunnelRef.current.openUntil
          ? escapeTunnelRef.current
          : null;

      let nextToys = toysRef.current.map((currentToy) => {
        if (toyEscapeRequestIdsRef.current.has(currentToy.id)) return currentToy;
        let toy = {
          ...currentToy,
          x: currentToy.x + currentToy.vx * dt,
          y: currentToy.y + currentToy.vy * dt,
          vx: currentToy.vx * Math.pow(0.985, dt * 60),
          vy: currentToy.vy * Math.pow(0.985, dt * 60),
        };

        if (data?.pet?.alive && petAwayUntil <= now) {
          toy = pushFromPet(
            toy,
            { x: positionRef.current.x, y: positionRef.current.y, width: PET_W, height: PET_H },
            now,
            48
          );
        }
        for (const visitor of visitingPetsRef.current) {
          toy = pushFromPet(
            toy,
            { x: visitor.x, y: visitor.y, width: PET_W, height: PET_H },
            now,
            42
          );
        }

        const escapeEdge = toyEscapeEdge(toy, bounds);
        if (
          escapeEdge &&
          tunnel?.edge === escapeEdge &&
          now - toy.lastPetHitAt < 5_200
        ) {
          void requestToyWorldEscape(escapeEdge, toy);
          return toy;
        }

        if (toy.x < 0) {
          toy = { ...toy, x: 0, vx: Math.abs(toy.vx) * 0.82 };
        } else if (toy.x > bounds.width - BALL_SIZE) {
          toy = { ...toy, x: bounds.width - BALL_SIZE, vx: -Math.abs(toy.vx) * 0.82 };
        }
        if (toy.y < 0) {
          toy = { ...toy, y: 0, vy: Math.abs(toy.vy) * 0.82 };
        } else if (toy.y > bounds.height - BALL_SIZE) {
          toy = { ...toy, y: bounds.height - BALL_SIZE, vy: -Math.abs(toy.vy) * 0.82 };
        }

        for (const obstacle of obstaclesRef.current) {
          toy = resolveIconCollision(toy, obstacle);
        }
        toy = splashOrSpill(toy, now);
        if (Math.hypot(toy.vx, toy.vy) < 1.5) {
          toy = { ...toy, vx: 0, vy: 0 };
        }
        return toy;
      });

      nextToys = nextToys.slice(-(MAX_TOY_BALLS * 3));
      toysRef.current = nextToys;
      frame += 1;
      if (frame % 2 === 0) setToys(nextToys);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    bounds,
    bounds.height,
    bounds.width,
    data?.pet?.alive,
    enabled,
    petAwayUntil,
    requestToyWorldEscape,
  ]);

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
      if (escapeTunnelRef.current && now >= escapeTunnelRef.current.openUntil) {
        escapeTunnelRef.current = null;
        setEscapeTunnel(null);
      }
      setWalkaboutSignpost((sign) => (sign && now >= sign.until ? null : sign));
      setScentScratchCue((cue) => (cue && now >= cue.until ? null : cue));
      const activeEscapedSlots = escapedBallSlotsRef.current.filter((slot) => slot.until > now);
      if (activeEscapedSlots.length !== escapedBallSlotsRef.current.length) {
        escapedBallSlotsRef.current = activeEscapedSlots;
        setEscapedBallSlots(activeEscapedSlots);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (
      !enabled ||
      !data?.pet?.alive ||
      petAwayUntil > Date.now() ||
      bounds.width <= 1 ||
      bounds.height <= 1
    ) {
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
      const clockNow = Date.now();
      const liveDrops = dropsRef.current;
      const localFoodAvailable = liveDrops.some(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      const hungryDrop =
        pet.hunger < 92 ? liveDrops.find((drop) => drop.kind === "food") : undefined;
      const waterDrop = liveDrops.find((drop) => drop.kind === "water");
      const bathDrop =
        waterDrop && (pet.poopExposure > 0 || pet.sick || pet.hygiene < 62)
          ? waterDrop
          : undefined;
      const thirstyDrop = !bathDrop && pet.thirst < 92 ? waterDrop : undefined;
      const pursuit = hungryDrop ?? bathDrop ?? thirstyDrop;
      const pillowDrop =
        !pursuit && pet.energy < 74
          ? liveDrops.find((drop) => drop.kind === "pillow")
          : undefined;
      const genes = pet.genetics.effectiveStats;
      const careTarget = pursuit ?? pillowDrop;
      const defensiveTarget =
        !careTarget && clockNow >= defenseCooldownRef.current
          ? chooseDefensiveTarget(
              current,
              pet.trauma,
              antsRef.current,
              toysRef.current,
              visitingPetsRef.current
            )
          : null;
      const neighborFoodSmell = neighborFoodSmellRef.current;
      const scentPull =
        neighborFoodSmell && !careTarget && !localFoodAvailable && pet.hunger < 82
          ? clamp01(((82 - pet.hunger) / 82) * neighborFoodSmell.intensity)
          : 0;
      let scentTarget: { edge: DesktopWorldEdge; target: { x: number; y: number } } | null = null;
      if (!careTarget && !defensiveTarget && neighborFoodSmell && scentPull > 0) {
        const currentScratch = scentScratchRef.current;
        const keepFocus =
          currentScratch &&
          currentScratch.edge === neighborFoodSmell.edge &&
          clockNow < currentScratch.focusUntil;
        if (keepFocus || Math.random() < 0.008 + scentPull * 0.055) {
          let scratch = currentScratch;
          const targetDistance = scratch
            ? Math.hypot(current.x - scratch.target.x, current.y - scratch.target.y)
            : Number.POSITIVE_INFINITY;
          if (!scratch || scratch.edge !== neighborFoodSmell.edge || targetDistance < 16) {
            scratch = {
              edge: neighborFoodSmell.edge,
              target: sniffTargetForEdge(neighborFoodSmell.edge, bounds),
              focusUntil: clockNow + 3200 + scentPull * 14_000,
              nextScratchAt: 0,
              nextEscapeAttemptAt: clockNow + Math.max(3200, 13_000 - scentPull * 8500),
            };
            scentScratchRef.current = scratch;
          }
          scentTarget = { edge: scratch.edge, target: scratch.target };
        }
      } else if (!neighborFoodSmell || localFoodAvailable || pet.hunger >= 86) {
        scentScratchRef.current = null;
      }
      if (careTarget || defensiveTarget || scentTarget) escapeEdgeRef.current = null;
      const target = careTarget
        ? { x: careTarget.x - PET_W * 0.22, y: careTarget.y - PET_H * 0.35 }
        : defensiveTarget
          ? { x: defensiveTarget.x - PET_W / 2, y: defensiveTarget.y - PET_H * 0.52 }
        : scentTarget
          ? scentTarget.target
        : wanderTargetRef.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);

      if (pursuit && distance < 18) {
        const remainingDrops = liveDrops.filter((drop) => drop.id !== pursuit.id);
        dropsRef.current = remainingDrops;
        setDrops(remainingDrops);
        // Ants ration desktop food into 20 crumbs; non-ant pets eat the whole plate once.
        const action: HamsterAction =
          pursuit.kind === "food"
            ? "feed"
            : bathDrop && pursuit.id === bathDrop.id
              ? "clean"
              : "water";
        mutatePetActionRef.current(
          action === "clean"
            ? { action, metadata: { cleanSource: "desktop_water_drop" } }
            : action
        );
        if (action === "clean") sicknessExposureRef.current.nextAt = 0;
        if (pursuit.kind === "food") {
          const digestion = digestionRef.current;
          digestion.pendingPoops += 1;
          digestion.nextPoopAt =
            digestion.nextPoopAt || Date.now() + 24_000 + Math.random() * 46_000;
        }
      } else if (pillowDrop && distance < 18) {
        const clock = Date.now();
        const sleepTimers = sleepRef.current;
        if (clock >= sleepTimers.nextPillowSleepAt && pet.energy < 96) {
          sleepTimers.nextPillowSleepAt = clock + 45_000;
          mutatePetActionRef.current({
            action: "nap",
            metadata: { sleepQuality: "pillow" },
          });
        }
        wanderTargetRef.current = randomHamsterTarget(bounds);
      } else if (defensiveTarget && distance < 20) {
        defenseCooldownRef.current = clockNow + Math.max(5200, 14_000 - pet.trauma * 70);
        const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.5 };
        const dxStrike = defensiveTarget.x - petCenter.x;
        const dyStrike = defensiveTarget.y - petCenter.y;
        const strikeDistance = Math.max(1, Math.hypot(dxStrike, dyStrike));
        const nx = dxStrike / strikeDistance;
        const ny = dyStrike / strikeDistance;
        if (defensiveTarget.kind === "ant") {
          const nextAnts = antsRef.current.map((ant) =>
            ant.id === defensiveTarget.id
              ? {
                  ...ant,
                  carrying: false,
                  targetFoodId: null,
                  phase: "returning" as const,
                  phaseStartedAt: clockNow,
                  path: buildAntRoute(
                    { x: ant.x + nx * 20, y: ant.y + ny * 20 },
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
        } else if (defensiveTarget.kind === "toy") {
          const nextToys = toysRef.current.map((toy) =>
            toy.id === defensiveTarget.id
              ? {
                  ...toy,
                  vx: toy.vx + nx * (180 + pet.trauma * 3),
                  vy: toy.vy + ny * (180 + pet.trauma * 3),
                  lastPetHitAt: clockNow,
                }
              : toy
          );
          toysRef.current = nextToys;
          setToys(nextToys);
        } else {
          const nextVisitors = visitingPetsRef.current.map((visitor) =>
            visitor.id === defensiveTarget.id
              ? {
                  ...visitor,
                  x: visitor.x + nx * 18,
                  y: visitor.y + ny * 14,
                  pathIndex: Math.max(visitor.pathIndex, visitor.path.length - 1),
                }
              : visitor
          );
          visitingPetsRef.current = nextVisitors;
          setVisitingPets(nextVisitors);
        }
        wanderTargetRef.current = homePositionRef.current;
      } else if (scentTarget && distance < 14) {
        const scratch = scentScratchRef.current;
        if (scratch) {
          if (clockNow >= scratch.nextScratchAt) {
            const cue = scratchCuePosition(scentTarget.edge, current, bounds);
            setScentScratchCue({ ...cue, edge: scentTarget.edge, until: clockNow + 900 });
            scratch.nextScratchAt = clockNow + 750 + Math.random() * 850;
          }
          if (clockNow >= scratch.nextEscapeAttemptAt) {
            scratch.nextEscapeAttemptAt =
              clockNow + Math.max(9_500, 42_000 - scentPull * 28_000);
            void requestPetWorldEscape(scentTarget.edge, pet);
          } else if (clockNow + 900 >= scratch.focusUntil) {
            scratch.target = sniffTargetForEdge(scentTarget.edge, bounds);
            scratch.focusUntil = clockNow + 2200 + scentPull * 10_000;
          }
        }
      } else if (!careTarget && distance < 12) {
        const clock = Date.now();
        const homeTarget = homePositionRef.current;
        const farFromHome = Math.hypot(current.x - homeTarget.x, current.y - homeTarget.y) > 72;
        const shouldReturnHome =
          farFromHome &&
          (clock >= nextHomeReturnAtRef.current || pet.trauma >= 45 || pet.energy < 42);
        if (
          !shouldReturnHome &&
          clock >= nextPetEscapeAtRef.current &&
          pet.energy > 58 &&
          pet.hunger > 35 &&
          pet.thirst > 35 &&
          !pet.sick &&
          pet.trauma < 65
        ) {
          const edge = randomWorldEdge();
          escapeEdgeRef.current = edge;
          wanderTargetRef.current = offscreenTargetForEdge(edge, bounds);
        } else if (shouldReturnHome) {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = homeTarget;
          nextHomeReturnAtRef.current =
            clock + 70_000 + Math.random() * 75_000 + pet.bondLevel * 650;
        } else {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = randomHamsterTarget(bounds);
          if (
            Math.hypot(
              wanderTargetRef.current.x - homeTarget.x,
              wanderTargetRef.current.y - homeTarget.y
            ) > 140 &&
            pet.trauma >= 28
          ) {
            wanderTargetRef.current = homeTarget;
          }
        }
      } else if (distance > 0.5) {
        const speed = careTarget || defensiveTarget
          ? 38 + genes.speed * 0.52 + genes.stamina * 0.08
          : 14 + pet.energy * 0.14 + genes.speed * 0.28 + genes.stamina * 0.08;
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
        const escapeEdge = escapeEdgeRef.current;
        if (
          !careTarget &&
          escapeEdge &&
          isOffscreenTarget(target, bounds) &&
          isAtEdgeForTarget(next, escapeEdge, bounds)
        ) {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = randomHamsterTarget(bounds);
          void requestPetWorldEscape(escapeEdge, pet);
        }
      } else {
        setMoving(false);
      }

      if (!pursuit && !pillowDrop && pet.energy < 28) {
        const clock = Date.now();
        const sleepTimers = sleepRef.current;
        if (clock >= sleepTimers.nextFloorRestAt) {
          sleepTimers.nextFloorRestAt = clock + 130_000;
          mutatePetActionRef.current({
            action: "nap",
            metadata: { sleepQuality: "floor" },
          });
        }
      }

      if (pet.poopExposure > 0 && !pet.sick) {
        const clock = Date.now();
        const exposure = sicknessExposureRef.current;
        if (clock >= exposure.nextAt) {
          exposure.nextAt =
            clock + Math.max(44_000, 92_000 - Math.min(38_000, pet.poopExposure * 5500));
          mutatePetActionRef.current({
            action: "poop",
            metadata: { source: "unbathed_poop_exposure", recurringExposure: true },
          });
        }
      } else {
        sicknessExposureRef.current.nextAt = 0;
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
        mutatePetActionRef.current({
          action: "poop",
          metadata: { source: "desktop_digestive_cycle" },
        });
        sicknessExposureRef.current.nextAt = Date.now() + 70_000 + Math.random() * 28_000;
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
    data?.pet?.genetics,
    data?.pet?.hunger,
    data?.pet?.thirst,
    enabled,
    petAwayUntil,
    requestPetWorldEscape,
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
      if (foods.length === 0) {
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
        targetFoodId: null,
        phase: "exploring" as const,
        phaseStartedAt: now,
        path: buildAntExploreRoute(
          { x: ant.x, y: ant.y },
          foods,
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
      let colony = antColonyRef.current;
      if (
        !colony ||
        colony.boundsWidth !== bounds.width ||
        colony.boundsHeight !== bounds.height
      ) {
        colony = createAntColony(bounds);
        antColonyRef.current = colony;
      }

      if (foods.length > 0 && nextAnts.length < MAX_DESKTOP_ANTS && now >= nextAntSpawnAtRef.current) {
        const spawned = spawnDesktopAnt(foods, nextPheromones, obstaclesRef.current, bounds, colony);
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
      const liveFoods = [...currentFoodsById.values()];

      nextAnts = nextAnts
        .map((currentAnt) => {
          let ant = currentAnt;
          const targetFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;

          if ((ant.phase === "seeking" || ant.phase === "dancing" || ant.phase === "harvesting") && !targetFood) {
            ant = retargetAnt(ant, liveFoods, now);
          }

          const liveFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;
          if (ant.phase === "passing") {
            ant = moveAlongPath(ant, 48 + Math.random() * 12, dt);
          } else if (ant.phase === "exploring") {
            const discoveredFood = chooseDiscoveredFood(ant, liveFoods, nextPheromones);
            if (discoveredFood) {
              ant = {
                ...ant,
                targetFoodId: discoveredFood.id,
                phase: "seeking",
                phaseStartedAt: now,
                path: buildTrailRoute(
                  { x: ant.x, y: ant.y },
                  discoveredFood,
                  nextPheromones,
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
                carrying: false,
                lastRetargetAt: now,
              };
            } else {
              ant = moveAlongPath(ant, 34 + Math.random() * 8, dt);
              if (ant.pathIndex >= ant.path.length) {
                if (liveFoods.length === 0) {
                  ant = {
                    ...ant,
                    phase: "returning",
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
                } else {
                  ant = {
                    ...ant,
                    path: buildAntExploreRoute(
                      { x: ant.x, y: ant.y },
                      liveFoods,
                      nextPheromones,
                      obstaclesRef.current,
                      bounds
                    ),
                    pathIndex: 0,
                    lastRetargetAt: now,
                  };
                }
              }
            }
          } else if (ant.phase === "seeking" && liveFood) {
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
          if (ant.phase === "passing") {
            return ant.pathIndex <= ant.path.length && now - ant.phaseStartedAt < 26_000;
          }
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
    (kind: "food" | "water" | "pillow", x: number, y: number) => {
      const now = Date.now();
      const size = getDropSize(kind);
      const liveDrops =
        kind === "pillow"
          ? dropsRef.current.filter((drop) => drop.kind !== "pillow")
          : dropsRef.current;
      const nextDrops = [
        ...liveDrops.slice(-35),
        {
          id: `${kind}-${Date.now()}-${Math.round(Math.random() * 9999)}`,
          kind,
          createdAt: kind === "food" || kind === "water" ? now : undefined,
          servings: kind === "food" ? FOOD_SERVINGS : undefined,
          ...clampFloatingPosition({ x: x - size / 2, y: y - size / 2 }, bounds, size, size),
        },
      ];
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
    },
    [bounds]
  );

  const activeLocalBallSlotCount = useCallback(() => {
    const now = Date.now();
    return (
      toysRef.current.filter((toy) => toy.kind === "ball" && toy.owner === "local").length +
      escapedBallSlotsRef.current.filter((slot) => slot.until > now).length
    );
  }, []);

  const addBallToy = useCallback(
    (x: number, y: number) => {
      const activeLocalBallCount = activeLocalBallSlotCount();
      if (activeLocalBallCount >= Math.min(ballQty, MAX_TOY_BALLS)) {
        setMarketStatus({ text: "Ball limit reached.", error: true });
        return;
      }
      const now = Date.now();
      const nextToy: PetToyState = {
        id: `ball-${now}-${Math.round(Math.random() * 9999)}`,
        kind: "ball",
        color: seededBallColor(now + activeLocalBallCount),
        owner: "local",
        createdAt: now,
        lastPetHitAt: 0,
        lastMessAt: 0,
        vx: (Math.random() - 0.5) * 80,
        vy: -20 + Math.random() * 40,
        ...clampFloatingPosition({ x: x - BALL_SIZE / 2, y: y - BALL_SIZE / 2 }, bounds, BALL_SIZE, BALL_SIZE),
      };
      const nextToys = [...toysRef.current, nextToy].slice(-(MAX_TOY_BALLS * 3));
      toysRef.current = nextToys;
      setToys(nextToys);
      setMarketStatus({ text: "Ball dropped." });
    },
    [activeLocalBallSlotCount, ballQty, bounds]
  );

  const addSkeletonRemains = useCallback(() => {
    if (dropsRef.current.some((drop) => drop.kind === "skeleton")) return;
    const size = getDropSize("skeleton");
    const source = positionRef.current;
    const nextDrop: PetDrop = {
      id: `skeleton-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      kind: "skeleton",
      ...clampFloatingPosition(
        { x: source.x + PET_W * 0.18, y: source.y + PET_H * 0.55 },
        bounds,
        size,
        36
      ),
    };
    const nextDrops = [...dropsRef.current.slice(-35), nextDrop];
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
  }, [bounds]);

  useEffect(() => {
    if (!enabled || !data?.pet) return;
    if (data.pet.alive) {
      lastAliveRef.current = true;
      return;
    }
    if (lastAliveRef.current !== false) {
      remainsClearedRef.current = false;
    }
    lastAliveRef.current = false;
    if (!remainsClearedRef.current) addSkeletonRemains();
  }, [addSkeletonRemains, data?.pet, enabled]);

  const handleLayerPointerDown = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        activeTool !== "food" &&
        activeTool !== "water" &&
        activeTool !== "pillow" &&
        activeTool !== "ball"
      ) {
        return;
      }
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (activeTool === "ball") {
        if (ballQty <= 0) {
          setMarketStatus({ text: "No pet balls in inventory.", error: true });
          return;
        }
        addBallToy(x, y);
        return;
      }
      if (activeTool === "food") {
        if (foodQty <= 0) {
          setMarketStatus({ text: "No pet food in inventory.", error: true });
          return;
        }
        const consumed = await consumeMarketItem("pet-food");
        if (!consumed) return;
      }
      if (activeTool === "pillow" && shoeboxQty <= 0) {
        setMarketStatus({ text: "No shoebox in inventory.", error: true });
        return;
      }
      addDrop(activeTool, x, y);
    },
    [activeTool, addBallToy, addDrop, ballQty, consumeMarketItem, foodQty, shoeboxQty]
  );

  const moveDrop = useCallback((id: string, next: { x: number; y: number }) => {
    const nextDrops = dropsRef.current.map((drop) =>
      drop.id === id ? { ...drop, ...next } : drop
    );
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
  }, []);

  const moveToy = useCallback((id: string, next: { x: number; y: number }) => {
    const nextToys = toysRef.current.map((toy) =>
      toy.id === id ? { ...toy, ...next, vx: 0, vy: 0 } : toy
    );
    toysRef.current = nextToys;
    setToys(nextToys);
  }, []);

  const flingToy = useCallback((id: string, velocity: { vx: number; vy: number }) => {
    const nextToys = toysRef.current.map((toy) =>
      toy.id === id
        ? {
            ...toy,
            vx: velocity.vx,
            vy: velocity.vy,
          }
        : toy
    );
    toysRef.current = nextToys;
    setToys(nextToys);
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

  const putAwayPillow = useCallback((id: string) => {
    const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
    sleepRef.current.nextFloorRestAt = Date.now() + 18_000;
  }, []);

  const removeRemains = useCallback((id: string) => {
    remainsClearedRef.current = true;
    const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
  }, []);

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
  const petIsAway = petAwayUntil > desktopNow;
  const activeLocalBallCount =
    toys.filter((toy) => toy.kind === "ball" && toy.owner === "local").length +
    escapedBallSlots.filter((slot) => slot.until > desktopNow).length;
  const localBallCapacity = Math.min(ballQty, MAX_TOY_BALLS);
  const dropMode =
    activeTool === "food" ||
    activeTool === "water" ||
    activeTool === "pillow" ||
    activeTool === "ball";
  const toolHint =
    activeTool === "food"
      ? "Click the desktop to drop food."
      : activeTool === "water"
        ? "Click the desktop to drop water."
        : activeTool === "scoop"
          ? "Click poop or skeletal remains to clean up. Drag food/remains to trash."
          : activeTool === "pet"
            ? `Click ${pet.name} to pet.`
            : activeTool === "medicine"
              ? `Click ${pet.name} to give medicine.`
              : activeTool === "pillow"
                ? "Click the desktop to place a pillow. Drag it back here to put it away."
                : activeTool === "ball"
                  ? "Click the desktop to place a ball. Pets can knock it around."
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
        {walkaboutSignpost && desktopNow < walkaboutSignpost.until && (
          <WalkaboutSignpost
            aria-hidden="true"
            $x={walkaboutSignpost.x}
            $y={walkaboutSignpost.y}
          />
        )}
        {scentScratchCue && desktopNow < scentScratchCue.until && (
          <TunnelScratchCue
            aria-hidden="true"
            $x={scentScratchCue.x}
            $y={scentScratchCue.y}
            $edge={scentScratchCue.edge}
          />
        )}
        {drops.map((drop) => (
          <DesktopDropItem
            key={drop.id}
            drop={drop}
            activeTool={activeTool}
            bounds={bounds}
            trashRect={trashRect}
            careTrayRef={careTrayRef}
            now={desktopNow}
            onMove={moveDrop}
            onScoop={scoopDrop}
            onTrash={trashFood}
            onPutAwayPillow={putAwayPillow}
            onRemoveRemains={removeRemains}
          />
        ))}
        {toys.map((toy) => (
          <DesktopBallToy
            key={toy.id}
            toy={toy}
            bounds={bounds}
            onMove={moveToy}
            onFling={flingToy}
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
        {visitingPets.map((visitor) => {
          const visitorScheme = getHamsterColorScheme(visitor.schemeKey);
          return (
            <VisitingPetActor
              key={visitor.id}
              $x={visitor.x}
              $y={visitor.y}
              $facing={visitor.facing}
              style={{ "--label-flip": visitor.facing === "left" ? -1 : 1 } as React.CSSProperties}
            >
              <HamsterPixelSprite
                alive
                moving
                scheme={visitorScheme}
                width={90}
                height={60}
              />
              <HamsterNameLabel>{visitor.label}</HamsterNameLabel>
            </VisitingPetActor>
          );
        })}
        {pet.alive && !petIsAway && (
          <HamsterActor
            type="button"
            data-compact-control="true"
            $x={position.x}
            $y={position.y}
            $facing={facing}
            $glow={pet.genetics.phenotype.glow}
            $stealth={pet.genetics.phenotype.stealth}
            aria-label={`Care for ${pet.name}`}
            onClick={async (e) => {
              e.stopPropagation();
              if (activeTool === "water") {
                sicknessExposureRef.current.nextAt = 0;
                actionMutation.mutate({
                  action: "clean",
                  metadata: { cleanSource: "water_tool" },
                });
                return;
              }
              if (activeTool === "medicine") {
                if (medicineQty <= 0) {
                  setMarketStatus({ text: "No pet medicine in inventory.", error: true });
                  return;
                }
                const consumed = await consumeMarketItem("pet-medicine");
                if (!consumed) return;
                actionMutation.mutate("medicine");
                return;
              }
              if (activeTool && activeTool !== "pet") return;
              actionMutation.mutate("pet");
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
        )}
      </PetLayer>

      {careOpen && (
        <CareTray variant="outside" ref={careTrayRef as React.RefObject<HTMLDivElement>}>
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
            <span>Rest {pet.energy}</span>
            <span>{pet.sick ? "Sick" : `Risk ${pet.sicknessRisk}`}</span>
            <span>Care {pet.carePoints}</span>
            <span>Bond L{pet.bondLevel}</span>
            <span>Happy {pet.happinessIndexScore}</span>
            <span>Trauma {pet.trauma}</span>
          </MiniStatGrid>
          <MarketPanel>
            <MarketHeader>
              <MarketTitle>
                <ShoppingCart /> Market
              </MarketTitle>
              <CurrencyTabs>
                <Button
                  size="sm"
                  active={marketCurrency === "wtf" ? true : undefined}
                  onClick={() => setMarketCurrency("wtf")}
                  title="Pay with WTF"
                >
                  <Ticket /> WTF
                </Button>
                <Button
                  size="sm"
                  active={marketCurrency === "exp" ? true : undefined}
                  onClick={() => setMarketCurrency("exp")}
                  title={`Pay with EXP (${expBalance} available)`}
                >
                  <Coins /> EXP
                </Button>
              </CurrencyTabs>
            </MarketHeader>
            <CareMarketGrid>
              {marketListings.map((item) => {
                const price =
                  marketCurrency === "wtf"
                    ? `${item.priceWtfFormatted} WTF`
                    : `${item.priceExp} EXP`;
                const ballLimitReached =
                  item.sku === ballItem?.sku &&
                  ballQty + (cartTickets[item.sku] ?? 0) >= MAX_TOY_BALLS;
                const disabled =
                  checkoutBusy ||
                  ballLimitReached ||
                  (marketCurrency === "wtf" && !marketConfigured) ||
                  (marketCurrency === "exp" && item.priceExp <= 0);
                return (
                  <MarketTicketButton
                    key={item.sku}
                    size="sm"
                    disabled={disabled}
                    onClick={() => addCartTicket(item)}
                    title={`${item.name} (${price})`}
                  >
                    {item.sku === "pet-food" ? (
                      <Apple />
                    ) : item.sku === "pet-medicine" ? (
                      <Pill />
                    ) : item.sku === ballItem?.sku ? (
                      <Circle />
                    ) : (
                      <Package />
                    )}
                    <strong>{item.name.replace(/^Pet /, "")}</strong>
                    <span>{ballLimitReached ? "Limit 3" : price}</span>
                  </MarketTicketButton>
                );
              })}
            </CareMarketGrid>
            <CartPanel>
              {cartEntries.length === 0 ? (
                <CartLine>
                  <span>No tickets</span>
                  <CartQty>0</CartQty>
                  <Button size="sm" disabled title="Remove">
                    <Minus />
                  </Button>
                  <Button size="sm" disabled title="Add">
                    <Plus />
                  </Button>
                </CartLine>
              ) : (
                cartEntries.map(({ item, quantity }) => (
                  <CartLine key={item.sku}>
                    <span>{item.name}</span>
                    <CartQty>{quantity}</CartQty>
                    <Button
                      size="sm"
                      onClick={() => changeCartTicket(item.sku, -1)}
                      title={`Remove ${item.name}`}
                    >
                      <Minus />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => changeCartTicket(item.sku, 1)}
                      title={`Add ${item.name}`}
                    >
                      <Plus />
                    </Button>
                  </CartLine>
                ))
              )}
              {cartEntries.length > 0 && (
                <CartLine>
                  <span>Clear cart</span>
                  <CartQty>{cartTicketCount}</CartQty>
                  <Button size="sm" onClick={() => setCartTickets({})} title="Clear cart">
                    <Trash2 />
                  </Button>
                  <Button size="sm" disabled title="Tickets">
                    <Ticket />
                  </Button>
                </CartLine>
              )}
              <MarketTotals>
                <span>Subtotal</span>
                <strong>
                  {marketCurrency === "wtf"
                    ? `${cartSubtotalWtfFormatted} WTF`
                    : `${cartSubtotalExp} EXP`}
                </strong>
                <span>Est. gas/storage</span>
                <strong>{marketCurrency === "wtf" ? `~${MARKET_ESTIMATED_FEE_TEZ} tez` : "0 tez"}</strong>
                <span>Router total</span>
                <strong>
                  {marketCurrency === "wtf"
                    ? `${cartSubtotalWtfFormatted} WTF`
                    : `${cartSubtotalExp} EXP`}
                </strong>
              </MarketTotals>
              <CheckoutButton
                size="sm"
                disabled={
                  checkoutBusy ||
                  cartEntries.length === 0 ||
                  (marketCurrency === "wtf" && !marketConfigured) ||
                  (marketCurrency === "exp" && cartSubtotalExp > expBalance)
                }
                onClick={checkoutMarketCart}
              >
                <Zap />
                {marketCurrency === "wtf" ? "Send WTF" : `Redeem EXP (${expBalance})`}
              </CheckoutButton>
            </CartPanel>
          </MarketPanel>
          <CareToolGrid>
            <Button
              size="sm"
              active={activeTool === "food" ? true : undefined}
              disabled={foodQty <= 0}
              onClick={() => setActiveTool((tool) => (tool === "food" ? null : "food"))}
            >
              <Apple /> Food {foodQty}
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
              active={activeTool === "pet" ? true : undefined}
              onClick={() => {
                if (!pet.alive) {
                  actionMutation.mutate("revive");
                  return;
                }
                setActiveTool((tool) => (tool === "pet" ? null : "pet"));
              }}
            >
              <Heart /> {pet.alive ? "Pet" : "Revive"}
            </Button>
            <Button
              size="sm"
              active={activeTool === "medicine" ? true : undefined}
              disabled={!pet.alive || medicineQty <= 0}
              onClick={() => setActiveTool((tool) => (tool === "medicine" ? null : "medicine"))}
            >
              <Pill /> Med {medicineQty}
            </Button>
            <Button
              size="sm"
              active={activeTool === "pillow" ? true : undefined}
              disabled={!pet.alive || shoeboxQty <= 0}
              onClick={() => setActiveTool((tool) => (tool === "pillow" ? null : "pillow"))}
            >
              <Moon /> Box {shoeboxQty}
            </Button>
            <Button
              size="sm"
              active={activeTool === "ball" ? true : undefined}
              disabled={!pet.alive || activeLocalBallCount >= localBallCapacity}
              onClick={() => setActiveTool((tool) => (tool === "ball" ? null : "ball"))}
            >
              <Circle /> Ball {Math.max(0, localBallCapacity - activeLocalBallCount)}
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
          <CareStatusLine $error={marketStatus.error}>
            {checkoutBusy ? "Checkout in progress." : marketStatus.text}
          </CareStatusLine>
        </CareTray>
      )}
      {activeTool && <CareToolCursor tool={activeTool} position={toolCursorPosition} />}
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
        <SundayGrass userId={user?.id ?? null} bounds={surfaceSize} />
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
