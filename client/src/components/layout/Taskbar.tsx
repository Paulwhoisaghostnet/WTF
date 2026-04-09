import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { AppBar, Toolbar, Button, Panel, Window, WindowHeader, WindowContent } from "react95";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
import { useWindowManager } from "../../lib/window-context";
import { StartMenu } from "./StartMenu";
import { MOBILE } from "../../global-styles";

const TaskbarContainer = styled.div`
  position: relative;
  z-index: 100;
`;

const StartButton = styled(Button)`
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;

  ${MOBILE} {
    padding: 0 8px;
    font-size: 12px;
    min-width: 0;
  }
`;

const WindowButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

const WindowButton = styled(Button)<{ $active?: boolean }>`
  max-width: 200px;
  min-width: 60px;
  font-size: 11px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  ${(p) => p.$active && "font-weight: bold;"}

  ${MOBILE} {
    min-width: 40px;
    max-width: 120px;
    font-size: 10px;
    padding: 2px 4px;
  }
`;

const SystemTray = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
`;

const Clock = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: 12px;
  min-width: 70px;
  text-align: center;

  ${MOBILE} {
    min-width: 54px;
    font-size: 11px;
    padding: 0 4px;
  }
`;

const WalletPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  ${MOBILE} { display: none; }
`;

const WifiIcon = styled.div<{ $connected: boolean }>`
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
  opacity: ${(p) => (p.$connected ? 1 : 0.5)};
  &:hover { opacity: 1; }

  ${MOBILE} { font-size: 16px; padding: 0 6px; }
`;

const WalletPopup = styled(Window)`
  position: absolute;
  bottom: 36px;
  right: 4px;
  width: 260px;
  z-index: 200;

  ${MOBILE} {
    width: calc(100vw - 16px);
    left: 8px;
    right: 8px;
  }
`;

export function Taskbar() {
  const [startOpen, setStartOpen] = useState(false);
  const [walletPopupOpen, setWalletPopupOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const { user } = useAuth();
  const { address, isConnecting, connect, disconnect } = useWallet();
  const wm = useWindowManager();
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!walletPopupOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = "touches" in e ? e.touches[0]?.target : e.target;
      if (popupRef.current && !popupRef.current.contains(target as Node)) {
        setWalletPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [walletPopupOpen]);

  const handleWindowButton = (path: string) => {
    const isFocused = wm.focusedPath === path && !wm.isMinimized(path);
    if (isFocused) {
      wm.minimize(path);
    } else if (wm.isMinimized(path)) {
      wm.restore(path);
    } else {
      wm.focus(path);
    }
  };

  return (
    <TaskbarContainer>
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <AppBar style={{ position: "relative" }}>
        <Toolbar>
          <StartButton
            onClick={() => setStartOpen(!startOpen)}
            active={startOpen}
            size="sm"
          >
            Stuffs
          </StartButton>

          <WindowButtons>
            {wm.openPages.map((path) => {
              const title = wm.titles[path] || path.replace(/^\//, "") || "Window";
              const isActive = wm.focusedPath === path && !wm.isMinimized(path);
              return (
                <WindowButton
                  key={path}
                  size="sm"
                  $active={isActive}
                  active={isActive}
                  onClick={() => handleWindowButton(path)}
                >
                  {title}
                </WindowButton>
              );
            })}
          </WindowButtons>

          <SystemTray>
            {user && (
              <WalletPanel title={user.username}>
                {user.displayName || user.username} [{user.role}]
              </WalletPanel>
            )}
            <WifiIcon
              $connected={!!address}
              onClick={() => setWalletPopupOpen((v) => !v)}
              title={address ? `Connected: ${address}` : "Wallet not connected"}
            >
              {address ? "📶" : "📡"}
            </WifiIcon>
            <Clock>
              {time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Clock>
          </SystemTray>
        </Toolbar>
      </AppBar>

      {walletPopupOpen && (
        <WalletPopup ref={popupRef as any}>
          <WindowHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12 }}>Wallet</span>
            <Button
              size="sm"
              style={{ padding: "0 4px", minWidth: 18, height: 18, fontSize: 10 }}
              onClick={() => setWalletPopupOpen(false)}
            >
              ✕
            </Button>
          </WindowHeader>
          <WindowContent style={{ padding: 10 }}>
            {address ? (
              <>
                <div style={{ fontSize: 11, marginBottom: 6, color: "#008000", fontWeight: "bold" }}>
                  Connected
                </div>
                <div style={{ fontSize: 10, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 8 }}>
                  {address}
                </div>
                <Button
                  size="sm"
                  fullWidth
                  onClick={async () => {
                    await disconnect();
                    setWalletPopupOpen(false);
                  }}
                >
                  Disconnect Wallet
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, marginBottom: 6, color: "#808080" }}>
                  No wallet connected
                </div>
                <Button
                  size="sm"
                  fullWidth
                  disabled={isConnecting}
                  onClick={async () => {
                    await connect();
                    setWalletPopupOpen(false);
                  }}
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </Button>
              </>
            )}
          </WindowContent>
        </WalletPopup>
      )}
    </TaskbarContainer>
  );
}
