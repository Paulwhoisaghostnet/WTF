import { type ReactNode, useState, useCallback, useRef } from "react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { Taskbar } from "./Taskbar";
import { WindowManagerProvider } from "../../lib/window-context";

const DesktopContainer = styled.div`
  width: 100vw;
  height: 100vh;
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

interface DraggableIconProps {
  label: string;
  icon: string;
  defaultX: number;
  defaultY: number;
  onDoubleClick?: () => void;
}

function DraggableIcon({ label, icon, defaultX, defaultY, onDoubleClick }: DraggableIconProps) {
  const [pos, setPos] = useState({ x: defaultX, y: defaultY });
  const dragRef = useRef({ dragging: false, moved: false, ox: 0, oy: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dr = dragRef.current;
      dr.dragging = true;
      dr.moved = false;
      dr.ox = e.clientX - pos.x;
      dr.oy = e.clientY - pos.y;

      const onMove = (ev: MouseEvent) => {
        if (!dr.dragging) return;
        dr.moved = true;
        setPos({
          x: Math.max(0, ev.clientX - dr.ox),
          y: Math.max(0, ev.clientY - dr.oy),
        });
      };
      const onUp = () => {
        dr.dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [pos]
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
      }}
      onMouseDown={handleMouseDown}
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
  const [, setLocation] = useLocation();

  return (
    <WindowManagerProvider>
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
              onDoubleClick={() => setLocation("/hoard")}
            />
          </DesktopSurface>
          <RouteLayer>{children}</RouteLayer>
        </ContentArea>
        <Taskbar />
      </DesktopContainer>
    </WindowManagerProvider>
  );
}
