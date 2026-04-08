import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
  useId,
} from "react";
import styled from "styled-components";
import { Window, WindowHeader, WindowContent, Button, ScrollView } from "react95";
import { useWindowManager } from "../../lib/window-context";

const Overlay = styled.div<{ $minimized: boolean }>`
  position: absolute;
  inset: 0;
  display: ${(p) => (p.$minimized ? "none" : "flex")};
  flex-direction: column;
`;

const FloatingWindow = styled(Window)<{
  $maximized: boolean;
  $x: number;
  $y: number;
  $w: number;
  $h: number;
}>`
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  min-height: 200px;
  z-index: 10;
  ${(p) =>
    p.$maximized
      ? `top: 0; left: 0; width: 100%; height: 100%;`
      : `top: ${p.$y}px; left: ${p.$x}px; width: ${p.$w}px; height: ${p.$h}px;`}
`;

const StyledHeader = styled(WindowHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  cursor: grab;
  padding-right: 3px;

  &:active {
    cursor: grabbing;
  }
`;

const TitleText = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: 2px;
  flex-shrink: 0;
`;

const WinButton = styled(Button)`
  padding: 0;
  min-width: 20px;
  height: 20px;
  font-size: 10px;
  font-weight: bold;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledContent = styled(WindowContent)`
  flex: 1;
  overflow: auto;
  padding: 8px;
`;

const ResizeHandle = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 20;

  &::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #808080;
    border-bottom: 2px solid #808080;
  }
`;

interface AppWindowProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

export function AppWindow({ title, children, toolbar }: AppWindowProps) {
  const stableId = useId();
  const windowId = `win-${title}`;
  const wm = useWindowManager();
  const state = wm.getWindow(windowId);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    wm.registerWindow(windowId, title);
    return () => wm.unregisterWindow(windowId);
  }, [windowId, title]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (state.maximized) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...state.position };

      const onMove = (ev: MouseEvent) => {
        wm.setPosition(
          windowId,
          Math.max(0, startPos.x + (ev.clientX - startX)),
          Math.max(0, startPos.y + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setDragging(false);
      };
      setDragging(true);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowId, state.maximized, state.position, wm]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (state.maximized) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = { ...state.size };

      const onMove = (ev: MouseEvent) => {
        wm.setSize(
          windowId,
          Math.max(320, startSize.w + (ev.clientX - startX)),
          Math.max(200, startSize.h + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowId, state.maximized, state.size, wm]
  );

  return (
    <Overlay $minimized={state.minimized}>
      <FloatingWindow
        $maximized={state.maximized}
        $x={state.position.x}
        $y={state.position.y}
        $w={state.size.w}
        $h={state.size.h}
      >
        <StyledHeader
          ref={headerRef}
          onMouseDown={handleDragStart}
          onDoubleClick={() => wm.toggleMaximize(windowId)}
        >
          <TitleText>{title}</TitleText>
          <HeaderButtons>
            <WinButton size="sm" onClick={() => wm.minimize(windowId)}>
              _
            </WinButton>
            <WinButton
              size="sm"
              onClick={() => wm.toggleMaximize(windowId)}
            >
              {state.maximized ? "❐" : "□"}
            </WinButton>
            <WinButton size="sm" onClick={() => wm.close(windowId)}>
              ✕
            </WinButton>
          </HeaderButtons>
        </StyledHeader>
        {toolbar}
        <StyledContent>
          <ScrollView style={{ height: "100%" }}>{children}</ScrollView>
        </StyledContent>
        {!state.maximized && (
          <ResizeHandle ref={resizeRef} onMouseDown={handleResizeStart} />
        )}
      </FloatingWindow>
    </Overlay>
  );
}
