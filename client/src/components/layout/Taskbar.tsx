import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { AppBar, Toolbar, Button, Panel, Window, WindowHeader, WindowContent } from "react95";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
import { useWindowManager } from "../../lib/window-context";
import { StartMenu } from "./StartMenu";

const TaskbarContainer = styled.div`
  position: relative;
  z-index: 100;
`;

const StartButton = styled(Button)`
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
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
  min-width: 80px;
  font-size: 11px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${(p) => p.$active && "font-weight: bold;"}
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
`;

const WalletPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
`;

const WifiIcon = styled.div<{ $connected: boolean }>`
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
  opacity: ${(p) => (p.$connected ? 1 : 0.5)};
  title: ${(p) => (p.$connected ? "Wallet Connected" : "Wallet Disconnected")};
  &:hover { opacity: 1; }
`;

const WalletPopup = styled(Window)`
  position: absolute;
  bottom: 36px;
  right: 4px;
  width: 260px;
  z-index: 200;
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
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setWalletPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [walletPopupOpen]);

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  const windowEntries = Object.entries(wm.windowTitles);

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
            {windowEntries.map(([id, title]) => {
              const isActive = wm.activeWindowId === id && !wm.isMinimized(id);
              return (
                <WindowButton
                  key={id}
                  size="sm"
                  $active={isActive}
                  active={isActive}
                  onClick={() => {
                    if (wm.isMinimized(id)) {
                      wm.restore(id);
                    } else {
                      wm.minimize(id);
                    }
                  }}
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
