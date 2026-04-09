import { type ReactNode, useState, useCallback, useRef } from "react";
import styled from "styled-components";
import { Taskbar } from "./Taskbar";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";

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

  return (
    <DesktopContainer>
      <ContentArea>
        <WallpaperCenter>
          <WtfLogo>W T F</WtfLogo>
        </WallpaperCenter>
        <DesktopSurface>
          <DraggableIcon label="Recycle Bin" icon="🗑️" defaultX={12} defaultY={12} />
          <DraggableIcon
            label="HOARD!"
            icon="🐉"
            defaultX={12}
            defaultY={100}
            onDoubleClick={() => wm.openPage("/hoard")}
          />
          <DraggableIcon
            label="W"
            icon={<WDeskIcon>W</WDeskIcon>}
            defaultX={12}
            defaultY={188}
            onDoubleClick={() => wm.openPage("/w")}
          />
        </DesktopSurface>
        <RouteLayer>{children}</RouteLayer>
      </ContentArea>
      <Taskbar />
    </DesktopContainer>
  );
}
