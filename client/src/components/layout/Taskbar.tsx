import { useState, useEffect } from "react";
import styled from "styled-components";
import { AppBar, Toolbar, Button, Panel } from "react95";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
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

const SystemTray = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
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

export function Taskbar() {
  const [startOpen, setStartOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const { user } = useAuth();
  const { address } = useWallet();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

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
            <span style={{ fontSize: 16 }}>W</span>
            Start
          </StartButton>

          <SystemTray>
            {user && (
              <WalletPanel title={user.username}>
                {user.displayName || user.username} [{user.role}]
              </WalletPanel>
            )}
            {shortAddr && (
              <WalletPanel title={address!}>
                {shortAddr}
              </WalletPanel>
            )}
            <Clock>
              {time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Clock>
          </SystemTray>
        </Toolbar>
      </AppBar>
    </TaskbarContainer>
  );
}
