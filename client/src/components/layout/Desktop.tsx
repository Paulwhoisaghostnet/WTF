import { type ReactNode, useState, useCallback, useRef } from "react";
import styled from "styled-components";
import { useQuery } from "@tanstack/react-query";
import { Taskbar } from "./Taskbar";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";
import { api } from "../../lib/api";
import type { DesktopAppKey } from "@shared/types";

const DesktopContainer = styled.div`
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: #008080;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow: hidden;
  position: relative;
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
  color: rgba(255, 255, 255, 0.08);
  letter-spacing: 12px;
  user-select: none;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.05);

  ${MOBILE} { font-size: 48px; letter-spacing: 8px; }
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

  &::before {
    content: "";
    position: absolute;
    width: 2px;
    height: 8px;
    left: 5px;
    top: -8px;
    background: #2a2a2a;
    transform: rotate(-25deg);
  }

  &::after {
    content: "";
    position: absolute;
    width: 2px;
    height: 8px;
    right: 5px;
    top: -8px;
    background: #2a2a2a;
    transform: rotate(25deg);
  }
`;

const DickswordDeskIcon = styled.div`
  width: 30px;
  height: 24px;
  border: 2px solid #101010;
  background: linear-gradient(180deg, #7289da 0%, #3b4f9f 100%);
  color: #ffffff;
  font-weight: 700;
  font-size: 8px;
  line-height: 20px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  margin-bottom: 4px;
  border-radius: 6px;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);

  &::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -6px;
    height: 6px;
    background: #3b4f9f;
    border: 2px solid #101010;
    border-top: none;
    border-radius: 0 0 8px 8px;
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
    box-shadow:
      9px -1px 0 0 #2e6fd6,
      3px 9px 0 0 #2ea14c,
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
    background:
      radial-gradient(circle at 72% 32%, #ffe27a 0 2.2px, transparent 2.6px),
      linear-gradient(
        180deg,
        #6fbfe6 0%,
        #b5e8f5 55%,
        #3f8a4a 55%,
        #2e6e37 100%
      );
    box-shadow: inset 0 0 0 1px #2a1a08;
  }
`;

interface DraggableIconProps {
  label: string;
  icon: ReactNode;
  defaultX: number;
  defaultY: number;
  onDoubleClick?: () => void;
}

function DraggableIcon({ label, icon, defaultX, defaultY, onDoubleClick }: DraggableIconProps) {
  const [pos, setPos] = useState({ x: defaultX, y: defaultY });
  const dragRef = useRef({ dragging: false, moved: false, ox: 0, oy: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const dr = dragRef.current;
      dr.dragging = true;
      dr.moved = false;
      dr.ox = e.clientX - pos.x;
      dr.oy = e.clientY - pos.y;
    },
    [pos]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dr = dragRef.current;
      if (!dr.dragging) return;
      dr.moved = true;
      setPos({
        x: Math.max(0, e.clientX - dr.ox),
        y: Math.max(0, e.clientY - dr.oy),
      });
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const dr = dragRef.current;
      dr.dragging = false;
      if (!dr.moved && onDoubleClick) {
        onDoubleClick();
      }
    },
    [onDoubleClick]
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!dragRef.current.moved && onDoubleClick) onDoubleClick();
    },
    [onDoubleClick]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "grab",
        userSelect: "none",
        pointerEvents: "auto",
        width: 68,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDblClick}
    >
      <div
        style={{
          fontSize: 32,
          lineHeight: 1,
          textShadow: "1px 1px 2px rgba(0,0,0,0.4)",
          marginBottom: 2,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#fff",
          textAlign: "center",
          textShadow: "1px 1px 1px #000",
          lineHeight: 1.2,
          wordBreak: "break-word",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function Desktop({ children }: { children: ReactNode }) {
  const wm = useWindowManager();
  const { data } = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const apps = {
    hoard: data?.apps?.hoard ?? true,
    w: data?.apps?.w ?? true,
    tv: data?.apps?.tv ?? true,
    dicksword: data?.apps?.dicksword ?? true,
    console: data?.apps?.console ?? true,
    studio: data?.apps?.studio ?? true,
    gallery: data?.apps?.gallery ?? true,
  };

  return (
    <DesktopContainer>
      <ContentArea>
        <WallpaperCenter>
          <WtfLogo>W T F</WtfLogo>
        </WallpaperCenter>
        <DesktopSurface>
          <DraggableIcon label="Recycle Bin" icon="🗑️" defaultX={12} defaultY={12} />
          {apps.hoard && (
            <DraggableIcon
              label="HOARD!"
              icon="🐉"
              defaultX={12}
              defaultY={100}
              onDoubleClick={() => wm.openPage("/hoard")}
            />
          )}
          {apps.w && (
            <DraggableIcon
              label="W"
              icon={<WDeskIcon>W</WDeskIcon>}
              defaultX={12}
              defaultY={188}
              onDoubleClick={() => wm.openPage("/w")}
            />
          )}
          {apps.tv && (
            <DraggableIcon
              label="WTF TV"
              icon={<TVDeskIcon>TV</TVDeskIcon>}
              defaultX={12}
              defaultY={276}
              onDoubleClick={() => wm.openPage("/tv")}
            />
          )}
          {apps.dicksword && (
            <DraggableIcon
              label="Dicksword"
              icon={<DickswordDeskIcon>DS</DickswordDeskIcon>}
              defaultX={92}
              defaultY={276}
              onDoubleClick={() => wm.openPage("/dicksword")}
            />
          )}
          {apps.console && (
            <DraggableIcon
              label="WTF Console"
              icon={<ConsoleDeskIcon>&#9654;</ConsoleDeskIcon>}
              defaultX={12}
              defaultY={364}
              onDoubleClick={() => wm.openPage("/console")}
            />
          )}
          {apps.studio && (
            <DraggableIcon
              label="Studio"
              icon={<StudioDeskIcon />}
              defaultX={12}
              defaultY={452}
              onDoubleClick={() => wm.openPage("/studio")}
            />
          )}
          {apps.gallery && (
            <DraggableIcon
              label="My Gallery"
              icon={<GalleryDeskIcon />}
              defaultX={12}
              defaultY={540}
              onDoubleClick={() => wm.openPage("/my-gallery")}
            />
          )}
        </DesktopSurface>
        <RouteLayer>{children}</RouteLayer>
      </ContentArea>
      <Taskbar />
    </DesktopContainer>
  );
}
