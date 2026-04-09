import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
  useContext,
} from "react";
import styled from "styled-components";
import { Window, WindowHeader, WindowContent, Button, ScrollView } from "react95";
import { useWindowManager, WindowPathContext } from "../../lib/window-context";
import { MOBILE_BP, MOBILE } from "../../global-styles";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

const FloatingWindow = styled(Window)<{
  $maximized: boolean;
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $z: number;
  $hidden: boolean;
}>`
  position: absolute;
  display: ${(p) => (p.$hidden ? "none" : "flex")};
  flex-direction: column;
  min-width: 320px;
  min-height: 200px;
  z-index: ${(p) => p.$z};
  ${(p) =>
    p.$maximized
      ? `top: 0; left: 0; width: 100%; height: 100%;`
      : `top: ${p.$y}px; left: ${p.$x}px; width: ${p.$w}px; height: ${p.$h}px;`}

  ${MOBILE} {
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0;
    min-height: 0;
  }
`;

const StyledHeader = styled(WindowHeader)<{ $focused: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  cursor: grab;
  padding-right: 3px;
  background: ${(p) =>
    p.$focused
      ? "linear-gradient(90deg, #000080, #1084d0)"
      : "linear-gradient(90deg, #808080, #b0b0b0)"};

  &:active {
    cursor: grabbing;
  }

  ${MOBILE} {
    cursor: default;
    padding: 4px 6px;
    min-height: 32px;
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

  ${MOBILE} {
    min-width: 28px;
    height: 28px;
    font-size: 14px;
  }
`;

const StyledContent = styled(WindowContent)`
  flex: 1;
  overflow: auto;
  padding: 8px;
  -webkit-overflow-scrolling: touch;

  ${MOBILE} {
    padding: 6px;
  }
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

  ${MOBILE} {
    display: none;
  }
`;

interface AppWindowProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

export function AppWindow({ title, children, toolbar }: AppWindowProps) {
  const pagePath = useContext(WindowPathContext);
  const wm = useWindowManager();
  const isMobile = useIsMobile();

  const windowKey = pagePath || title;
  const state = wm.getWindow(windowKey);
  const isFocused = wm.focusedPath === windowKey;

  useEffect(() => {
    wm.setTitle(windowKey, title);
  }, [windowKey, title]);

  const handleFocus = useCallback(() => {
    if (wm.focusedPath !== windowKey) wm.focus(windowKey);
  }, [windowKey, wm]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...state.position };

      const onMove = (ev: MouseEvent) => {
        wm.setPosition(
          windowKey,
          Math.max(0, startPos.x + (ev.clientX - startX)),
          Math.max(0, startPos.y + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowKey, state.maximized, state.position, wm, isMobile, handleFocus]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      e.preventDefault();
      e.stopPropagation();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = { ...state.size };

      const onMove = (ev: MouseEvent) => {
        wm.setSize(
          windowKey,
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
    [windowKey, state.maximized, state.size, wm, isMobile, handleFocus]
  );

  const effectiveMaximized = isMobile || state.maximized;

  return (
    <FloatingWindow
      $maximized={effectiveMaximized}
      $x={state.position.x}
      $y={state.position.y}
      $w={state.size.w}
      $h={state.size.h}
      $z={state.zIndex}
      $hidden={state.minimized}
      onMouseDown={handleFocus}
    >
      <StyledHeader
        $focused={isFocused}
        onMouseDown={handleDragStart}
        onDoubleClick={() => !isMobile && wm.toggleMaximize(windowKey)}
      >
        <TitleText>{title}</TitleText>
        <HeaderButtons>
          {!isMobile && (
            <>
              <WinButton
                size="sm"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.minimize(windowKey);
                }}
              >
                _
              </WinButton>
              <WinButton
                size="sm"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.toggleMaximize(windowKey);
                }}
              >
                {state.maximized ? "❐" : "□"}
              </WinButton>
            </>
          )}
          <WinButton
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              wm.close(windowKey);
            }}
          >
            ✕
          </WinButton>
        </HeaderButtons>
      </StyledHeader>
      {toolbar}
      <StyledContent>
        <ScrollView style={{ height: "100%" }}>{children}</ScrollView>
      </StyledContent>
      {!effectiveMaximized && (
        <ResizeHandle onMouseDown={handleResizeStart} />
      )}
    </FloatingWindow>
  );
}
