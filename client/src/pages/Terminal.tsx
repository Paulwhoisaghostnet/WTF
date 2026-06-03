import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DesktopAppKey } from "@shared/types";
import { Button, GroupBox, Separator } from "react95";
import {
  Braces,
  CirclePlay,
  ClipboardList,
  Command,
  Gauge,
  HeartPulse,
  KeyRound,
  Route,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { WtfOsCliPanelView } from "../features/wtfos-cli/WtfOsCliPanel";
import { buildBrowserWtfOsCliCommands } from "../features/wtfos-cli/cli-runtime";
import { getInterfaceMode, setInterfaceMode } from "../features/wtfos-cli/interface-mode";
import { useWtfOsCli } from "../features/wtfos-cli/use-wtfos-cli";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div`
  min-height: 60px;
  padding: 7px;
  border: 1px solid #808080;
  background: #eeeeee;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: 14px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const CommandGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const CommandRow = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 56px;
  padding: 7px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;

  @media (max-width: 560px) {
    grid-template-columns: 28px minmax(0, 1fr);
  }
`;

const IconBox = styled.div`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const CommandName = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const CommandSummary = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const RunButton = styled(Button)`
  min-width: 74px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
  }
`;

const commandRows = [
  { key: "status", icon: HeartPulse },
  { key: "jobs", icon: Gauge },
  { key: "access", icon: ShieldCheck },
  { key: "routes", icon: Route },
  { key: "mcp", icon: KeyRound },
  { key: "commands", icon: Command },
  { key: "recovery", icon: ClipboardList },
] as const;

export function Terminal() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });
  const commands = buildBrowserWtfOsCliCommands();
  const commandMap = Object.fromEntries(commands.map((command) => [command.name, command]));

  const onViewed = useCallback(() => {
    logClientSystemEvent({ eventType: "terminal.viewed" });
  }, []);

  const cli = useWtfOsCli({
    navigate: setLocation,
    setInterfaceMode,
    getInterfaceMode,
    username: user?.username ?? null,
    displayName: user?.displayName ?? user?.username ?? null,
    role: user?.roles ?? user?.role ?? null,
    accessSurfaceIds: user?.wtfOsAccess?.surfaceIds ?? [],
    appAvailability: desktopAppsQuery.data?.apps ?? {},
    eventPrefix: "terminal",
  });

  useEffect(() => {
    onViewed();
  }, [onViewed]);

  return (
    <AppWindow title="Terminal">
      <Shell data-testid="wtf-terminal">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Mode</StatusLabel>
            <StatusValue>shared cli</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Commands</StatusLabel>
            <StatusValue>{commands.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Shell</StatusLabel>
            <StatusValue>disabled</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Full CLI</StatusLabel>
            <StatusValue>/cli</StatusValue>
          </StatusCell>
        </StatusGrid>

        <WtfOsCliPanelView
          variant="embedded"
          testId="wtf-terminal-cli"
          prompt=">"
          entries={cli.entries}
          busy={cli.busy}
          themeId={cli.themeId}
          commandCount={cli.commandList.length}
          runRawCommand={cli.runRawCommand}
        />

        <Separator />

        <GroupBox label="Safe Commands">
          <CommandGrid>
            {commandRows.map(({ key, icon }) => {
              const command = commandMap[key];
              const Icon = icon;
              return (
                <CommandRow key={key}>
                  <IconBox>
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <CommandName>{command.name}</CommandName>
                    <CommandSummary>{command.summary}</CommandSummary>
                  </div>
                  <RunButton onClick={() => void cli.runRawCommand(key)}>
                    <CirclePlay size={14} aria-hidden />
                    Run
                  </RunButton>
                </CommandRow>
              );
            })}
          </CommandGrid>
        </GroupBox>

        <GroupBox label="Boundary">
          <CommandRow>
            <IconBox>
              <TerminalSquare size={17} aria-hidden />
            </IconBox>
            <div>
              <CommandName>No arbitrary shell</CommandName>
              <CommandSummary>
                Commands are allowlisted browser actions and read-only diagnostics. The same CLI
                kernel powers this window and `/cli`; route opens enforce browser login, role, and
                app gates — not the public access manifest alone.
              </CommandSummary>
            </div>
            <RunButton onClick={() => setLocation("/browser-boundaries")}>
              <Braces size={14} aria-hidden />
              Access
            </RunButton>
          </CommandRow>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
