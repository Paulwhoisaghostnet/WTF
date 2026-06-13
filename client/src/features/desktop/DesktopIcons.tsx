import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import { styled } from "styled-components";
import {
  DESKTOP_APPS,
  EXPERIMENTAL_DESKTOP_APPS,
  type DesktopAppKey,
} from "@shared/types";

export const ICON_W = 78;
export const ICON_H = 76;

const DESKTOP_APP_KEY_SET = new Set<string>(DESKTOP_APPS);
const EXPERIMENTAL_DESKTOP_APP_SET = new Set<string>(EXPERIMENTAL_DESKTOP_APPS);

function desktopAppKeyForIconKey(key: string): DesktopAppKey | null {
  const appKey = key === "my-gallery" ? "gallery" : key;
  return DESKTOP_APP_KEY_SET.has(appKey) ? (appKey as DesktopAppKey) : null;
}

function markExperimentalIconDefs(defs: DesktopIconDef[]): DesktopIconDef[] {
  return defs.map((def) => {
    const appKey = desktopAppKeyForIconKey(def.key);
    if (!appKey || !EXPERIMENTAL_DESKTOP_APP_SET.has(appKey)) return def;
    return { ...def, experimental: true };
  });
}

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
  font-family: var(--wtf-shell-font);
  margin-bottom: 2px;
`;

const WimDeskIcon = styled.div`
  width: 32px;
  height: 32px;
  border: 2px solid #080808;
  background: linear-gradient(180deg, #fff4a2 0%, #ffc239 48%, #f15a3b 100%);
  color: #ffffff;
  font-weight: 900;
  font-size: 13px;
  line-height: 1;
  text-align: center;
  font-family: var(--wtf-shell-font);
  margin-bottom: 2px;
  position: relative;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.7), 2px 2px 0 rgba(0, 0, 0, 0.22);

  &::before {
    content: "W";
    position: absolute;
    left: 10px;
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #07145f;
    line-height: 10px;
    box-shadow:
      -4px 13px 0 1px #07145f,
      8px 15px 0 -1px #07145f;
  }

  &::after {
    content: "";
    position: absolute;
    right: 3px;
    top: 5px;
    width: 12px;
    height: 8px;
    background: #ffffff;
    border: 1px solid #080808;
  }
`;

const ConsoleDeskIcon = styled.div`
  width: 36px;
  height: 26px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #2a2a50 0%, #1a1a3a 100%);
  color: #7b8fff;
  font-weight: 700;
  font-size: 13px;
  line-height: 22px;
  text-align: center;
  font-family: var(--wtf-shell-font);
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

const MissionControlDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #f0f0f0 0%, #9fb7c8 100%);
  color: #101010;
  font-size: 13px;

  &::after {
    background: #f0f0f0;
  }
`;

const CommandPaletteDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #fffff0 0%, #d0c38a 100%);
  color: #000080;
  font-size: 13px;

  &::after {
    background: #fffff0;
  }
`;

const GameStudioDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #12352d 0%, #10141b 100%);
  color: #99ffe0;
  font-size: 13px;

  &::after {
    background: #12352d;
  }
`;

const ArcadeDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #432719 0%, #141014 100%);
  color: #ffcb5c;

  &::after {
    background: #432719;
  }
`;

const CasinoDeskIcon = styled(ConsoleDeskIcon)`
  background:
    linear-gradient(180deg, #161616 0%, #06180f 100%);
  color: #ffd66b;
  font-size: 13px;

  &::after {
    background: #161616;
  }
`;

const DuesDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #e9f6ff 0%, #7bbbd1 100%);
  color: #10242c;
  font-size: 13px;

  &::after {
    background: #e9f6ff;
  }
`;

const TVDeskIcon = styled.div`
  width: 36px;
  height: 26px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #c8d0d8 0%, #9aa7b3 100%);
  color: #101010;
  font-weight: 700;
  font-size: 13px;
  line-height: 22px;
  text-align: center;
  font-family: var(--wtf-shell-font);
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

const WtfIamDeskIcon = styled.div`
  width: 32px;
  height: 30px;
  border: 2px solid #141414;
  background:
    linear-gradient(180deg, #ffef8a 0%, #f0b43c 52%, #d85f3d 53%, #b73428 100%);
  color: #101010;
  font-weight: 900;
  font-size: 13px;
  line-height: 26px;
  text-align: center;
  font-family: var(--wtf-shell-font);
  margin-bottom: 2px;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55), 2px 2px 0 rgba(0, 0, 0, 0.2);

  &::before {
    content: "";
    position: absolute;
    left: 7px;
    top: -8px;
    width: 14px;
    height: 11px;
    border: 2px solid #141414;
    border-bottom: none;
    border-radius: 9px 9px 0 0;
    background: transparent;
  }

  &::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 6px;
    height: 6px;
    background: #18a8a2;
    border: 1px solid #101010;
    box-shadow: -9px -12px 0 #fefefe;
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
  font-family: var(--wtf-shell-font);
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

const TelegramDeskIcon = styled(ConsoleDeskIcon)`
  background: linear-gradient(180deg, #ffffff 0%, #77c9f7 100%);
  color: #0a3250;
  font-size: 13px;

  &::after {
    background: #ffffff;
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

const DesktopIconRoot = styled.div<{ $experimental?: boolean }>`
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
  font-family: var(--wtf-shell-font);
  box-sizing: border-box;

  ${(p) =>
    p.$experimental
      ? `
        outline: 2px solid #ffd400;
        outline-offset: -1px;
        background: rgba(255, 212, 0, 0.14);
        box-shadow:
          inset 0 0 0 1px rgba(82, 60, 0, 0.68),
          2px 2px 0 rgba(0, 0, 0, 0.24);
      `
      : ""}

  html[data-wtf-appearance-style="wtf-aqua"] & {
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.62);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    text-shadow: none;
  }
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
  font-size: var(--wtf-shell-font-size, 14px);
  color: #fff;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  max-width: 76px;
  border-radius: var(--wtf-control-radius, 0);
  padding: 1px 2px;

  html[data-wtf-appearance-style="wtf-xp"] & {
    font-size: var(--wtf-shell-font-size, 14px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.72);
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    max-width: 70px;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(6px);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    color: #000000;
    background: color-mix(in srgb, var(--wtf-window-color, #ffffff) 88%, #ffffff);
    border: 2px solid #000000;
    box-shadow: 2px 2px 0 #000000;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

export interface DesktopIconDef {
  key: string;
  label: string;
  icon: ReactNode;
  defaultX: number;
  defaultY: number;
  enabled: boolean;
  experimental?: boolean;
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
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>, def: DesktopIconDef) => void;
  onShiftClick?: (event: React.PointerEvent<HTMLDivElement>, def: DesktopIconDef) => void;
  onDragStart: (key: string) => void;
  onDragEnd: (key: string) => void;
}

export function clampIconPosition(
  position: { x: number; y: number },
  bounds: { width: number; height: number }
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - ICON_W), position.x)),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - ICON_H), position.y)),
  };
}

export function DraggableIcon({
  def,
  position,
  bounds,
  onMove,
  onRelease,
  onOpen,
  onContextMenu,
  onShiftClick,
  onDragStart,
  onDragEnd,
}: DraggableIconProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    currentX: position.x,
    currentY: position.y,
  });

  const clearDragTransform = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    node.style.transform = "";
    node.style.willChange = "";
    node.style.zIndex = "";
  }, []);

  useLayoutEffect(() => {
    if (!dragRef.current.dragging) clearDragTransform();
  }, [clearDragTransform, position.x, position.y]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        onShiftClick?.(e, def);
        return;
      }
      if (e.button !== 0) return;
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
      dr.currentX = position.x;
      dr.currentY = position.y;
      const node = rootRef.current;
      if (node) {
        node.style.willChange = "transform";
        node.style.zIndex = "50";
      }
      onDragStart(def.key);
    },
    [def, onDragStart, onShiftClick, position.x, position.y]
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
      const nextPosition = clampIconPosition(
        {
          x: e.clientX - dr.ox,
          y: e.clientY - dr.oy,
        },
        bounds
      );
      dr.currentX = nextPosition.x;
      dr.currentY = nextPosition.y;
      const node = rootRef.current;
      if (node) {
        const dx = nextPosition.x - position.x;
        const dy = nextPosition.y - position.y;
        node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      }
    },
    [bounds, position.x, position.y]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const dr = dragRef.current;
      dr.dragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (dr.moved) {
        onRelease(def.key, { x: dr.currentX, y: dr.currentY }, { x: dr.vx, y: dr.vy });
      } else {
        clearDragTransform();
        onOpen?.();
      }
      onDragEnd(def.key);
    },
    [clearDragTransform, def.key, onDragEnd, onOpen, onRelease]
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
      ref={rootRef}
      data-desktop-icon-root="true"
      data-desktop-icon-key={def.key}
      data-desktop-icon-experimental={def.experimental ? "true" : undefined}
      $experimental={def.experimental}
      style={{
        left: position.x,
        top: position.y,
      }}
      title={def.label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDblClick}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event, def);
      }}
    >
      <IconGlyph>{def.icon}</IconGlyph>
      <IconLabel>{def.label}</IconLabel>
    </DesktopIconRoot>
  );
}


export type DesktopAppAvailability = {
  wtfiam: boolean;
  hoard: boolean;
  wim: boolean;
  w: boolean;
  tv: boolean;
  dicksword: boolean;
  "i-hate-telegram": boolean;
  "dear-diary": boolean;
  arcade: boolean;
  casino: boolean;
  "dues-manager": boolean;
  console: boolean;
  "game-studio": boolean;
  studio: boolean;
  gallery: boolean;
  "ipfs-pinning": boolean;
  skywire: boolean;
  "wtf-live": boolean;
  tz2at: boolean;
  "crp-nominations": boolean;
  "rat-race": boolean;
  "map-lab": boolean;
  mail: boolean;
};

export function buildDesktopIconDefs(
  apps: DesktopAppAvailability,
  options: { appAccessBlocked?: boolean; appGateBypass?: boolean } = {}
): DesktopIconDef[] {
  const canOpenApps = !options.appAccessBlocked;
  const canOpenDisabledApps = Boolean(options.appGateBypass);
  const defs: DesktopIconDef[] = [
    {
      key: "recycle-bin",
      label: "Recycle Bin",
      icon: "🗑️",
      defaultX: 12,
      defaultY: 12,
      enabled: true,
    },
    {
      key: "mission-control",
      label: "Mission Control",
      icon: <MissionControlDeskIcon>MAP</MissionControlDeskIcon>,
      defaultX: 92,
      defaultY: 12,
      enabled: canOpenApps,
      openPath: "/mission-control",
    },
    {
      key: "command-palette",
      label: "Command Palette",
      icon: <CommandPaletteDeskIcon>FIND</CommandPaletteDeskIcon>,
      defaultX: 172,
      defaultY: 12,
      enabled: canOpenApps,
      openPath: "/command-palette",
    },
    {
      key: "wtfiam",
      label: "WTF IAM",
      icon: <WtfIamDeskIcon>IAM</WtfIamDeskIcon>,
      defaultX: 92,
      defaultY: 100,
      enabled: canOpenApps && (apps.wtfiam || canOpenDisabledApps),
      openPath: "/wtfiam",
    },
    {
      key: "hoard",
      label: "HOARD!",
      icon: "🐉",
      defaultX: 12,
      defaultY: 100,
      enabled: canOpenApps && (apps.hoard || canOpenDisabledApps),
      openPath: "/hoard",
    },
    {
      key: "w",
      label: "W",
      icon: <WDeskIcon>W</WDeskIcon>,
      defaultX: 12,
      defaultY: 188,
      enabled: canOpenApps && (apps.w || canOpenDisabledApps),
      openPath: "/w",
    },
    {
      key: "wim",
      label: "WIM",
      icon: <WimDeskIcon aria-hidden />,
      defaultX: 92,
      defaultY: 188,
      enabled: canOpenApps && (apps.wim || canOpenDisabledApps),
      openPath: "/wim",
    },
    {
      key: "skywire",
      label: "Skywire",
      icon: <ConsoleDeskIcon>AT</ConsoleDeskIcon>,
      defaultX: 172,
      defaultY: 188,
      enabled: canOpenApps && (apps.skywire || canOpenDisabledApps),
      openPath: "/skywire",
    },
    {
      key: "wtf-live",
      label: "WTF LIVE",
      icon: <ConsoleDeskIcon>LIVE</ConsoleDeskIcon>,
      defaultX: 172,
      defaultY: 276,
      enabled: canOpenApps && (apps["wtf-live"] || canOpenDisabledApps),
      openPath: "/live",
    },
    {
      key: "tz2at",
      label: "tz2at",
      icon: <ConsoleDeskIcon>TZ</ConsoleDeskIcon>,
      defaultX: 252,
      defaultY: 188,
      enabled: canOpenApps && (apps.tz2at || canOpenDisabledApps),
      openPath: "/tz2at",
    },
    {
      key: "crp-nominations",
      label: "CRP",
      icon: <ConsoleDeskIcon>CRP</ConsoleDeskIcon>,
      defaultX: 332,
      defaultY: 188,
      enabled: canOpenApps && (apps["crp-nominations"] || canOpenDisabledApps),
      openPath: "/crp-nominate",
    },
    {
      key: "rat-race",
      label: "Rat Race",
      icon: <ConsoleDeskIcon>RR</ConsoleDeskIcon>,
      defaultX: 412,
      defaultY: 188,
      enabled: canOpenApps && (apps["rat-race"] || canOpenDisabledApps),
      openPath: "/rat-race",
    },
    {
      key: "map-lab",
      label: "Map Lab",
      icon: <ConsoleDeskIcon>MAP</ConsoleDeskIcon>,
      defaultX: 492,
      defaultY: 188,
      enabled: canOpenApps && (apps["map-lab"] || canOpenDisabledApps),
      openPath: "/map-lab",
    },
    {
      key: "mail",
      label: "WTF Mail",
      icon: <ConsoleDeskIcon>@</ConsoleDeskIcon>,
      defaultX: 252,
      defaultY: 100,
      enabled: canOpenApps && (apps.mail || canOpenDisabledApps),
      openPath: "/mail",
    },
    {
      key: "tv",
      label: "WTF TV",
      icon: <TVDeskIcon>TV</TVDeskIcon>,
      defaultX: 12,
      defaultY: 276,
      enabled: canOpenApps && (apps.tv || canOpenDisabledApps),
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
      enabled: canOpenApps && (apps.dicksword || canOpenDisabledApps),
      openPath: "/dicksword",
    },
    {
      key: "i-hate-telegram",
      label: "I Hate Telegram",
      icon: <TelegramDeskIcon>TG</TelegramDeskIcon>,
      defaultX: 252,
      defaultY: 364,
      enabled: canOpenApps && (apps["i-hate-telegram"] || canOpenDisabledApps),
      openPath: "/i-hate-telegram",
    },
    {
      key: "dear-diary",
      label: "Dear Diary",
      icon: <ConsoleDeskIcon>DD</ConsoleDeskIcon>,
      defaultX: 252,
      defaultY: 188,
      enabled: canOpenApps && (apps["dear-diary"] || canOpenDisabledApps),
      openPath: "/dear-diary",
    },
    {
      key: "arcade",
      label: "WTF Arcade",
      icon: <ArcadeDeskIcon>AR</ArcadeDeskIcon>,
      defaultX: 92,
      defaultY: 364,
      enabled: canOpenApps && (apps.arcade || canOpenDisabledApps),
      openPath: "/arcade",
    },
    {
      key: "casino",
      label: "WTF Casino",
      icon: <CasinoDeskIcon>$</CasinoDeskIcon>,
      defaultX: 172,
      defaultY: 276,
      enabled: canOpenApps && (apps.casino || canOpenDisabledApps),
      openPath: "/casino",
    },
    {
      key: "dues-manager",
      label: "Club Dues",
      icon: <DuesDeskIcon>DUE</DuesDeskIcon>,
      defaultX: 252,
      defaultY: 276,
      enabled: canOpenApps && (apps["dues-manager"] || canOpenDisabledApps),
      openPath: "/dues",
    },
    {
      key: "console",
      label: "WTF Console",
      icon: <ConsoleDeskIcon>&#9654;</ConsoleDeskIcon>,
      defaultX: 12,
      defaultY: 364,
      enabled: canOpenApps && (apps.console || canOpenDisabledApps),
      openPath: "/console",
    },
    {
      key: "game-studio",
      label: "Game Studio",
      icon: <GameStudioDeskIcon>SDK</GameStudioDeskIcon>,
      defaultX: 172,
      defaultY: 364,
      enabled: canOpenApps && (apps["game-studio"] || canOpenDisabledApps),
      openPath: "/game-studio",
    },
    {
      key: "studio",
      label: "Studio",
      icon: <StudioDeskIcon />,
      defaultX: 12,
      defaultY: 452,
      enabled: canOpenApps && (apps.studio || canOpenDisabledApps),
      openPath: "/studio",
    },
    {
      key: "my-gallery",
      label: "My Gallery",
      icon: <GalleryDeskIcon />,
      defaultX: 12,
      defaultY: 540,
      enabled: canOpenApps && (apps.gallery || canOpenDisabledApps),
      openPath: "/my-gallery",
    },
    {
      key: "ipfs-pinning",
      label: "IPFS Pinning",
      icon: <ConsoleDeskIcon>PIN</ConsoleDeskIcon>,
      defaultX: 92,
      defaultY: 540,
      enabled: canOpenApps && (apps["ipfs-pinning"] || canOpenDisabledApps),
      openPath: "/ipfs-pinning",
    },
  ];
  return markExperimentalIconDefs(defs);
}
