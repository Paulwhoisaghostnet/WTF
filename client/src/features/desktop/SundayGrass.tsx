import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  DESKTOP_SUNDAY_GRASS_MAX_STAGE,
  desktopSundayKey,
  isDesktopSunday,
  projectDesktopSundayGrassState,
  type DesktopSundayGrassState,
} from "@shared/desktop";
import { clampFloatingPosition, seededUnit, type DesktopBounds } from "./geometry";

const SUNDAY_GRASS_STORAGE_PREFIX = "wtf.desktop.sunday-grass.v1";
const SUNDAY_GRASS_W = 72;
const SUNDAY_GRASS_LABEL_H = 16;

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
  bounds: DesktopBounds
) {
  const seed = sundayGrassSeed(userId, sundayKey);
  const safeWidth = Math.max(1, bounds.width - SUNDAY_GRASS_W - 24);
  const safeHeight = Math.max(1, bounds.height - sundayGrassHeight(DESKTOP_SUNDAY_GRASS_MAX_STAGE) - 34);
  return {
    x: 108 + seededUnit(seed, 13) * Math.max(1, safeWidth - 108),
    y: 46 + seededUnit(seed, 29) * Math.max(1, safeHeight - 46),
  };
}

function clampSundayGrassPosition(state: DesktopSundayGrassState, bounds: DesktopBounds) {
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

export function SundayGrass({
  userId,
  bounds,
}: {
  userId: number | null;
  bounds: DesktopBounds;
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
