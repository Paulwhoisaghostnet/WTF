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
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region],
  &[data-gamma-utility-presentation-host="gamma"] fieldset {
    min-width: 0;
    background-image: none;
    border-radius: 6px;
  }

  &[data-gamma-utility-presentation-host="gamma"] fieldset,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="status-cell"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="command-row"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    background: #11110f;
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] legend,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="summary"] {
    color: rgba(242, 234, 217, 0.7);
  }

  &[data-gamma-utility-presentation-host="gamma"] legend,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"] {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="icon"] {
    border: 1px solid rgba(0, 210, 255, 0.5);
    background: #070706;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:hover,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:focus-visible {
    border-color: #00d2ff;
    color: #f2ead9;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }
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
  const presentation = usePresentationShell();
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
    navigate: (path) => setLocation(presentationRouteHref(path, presentation.host)),
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
      <Shell
        data-testid="wtf-terminal"
        data-gamma-utility-surface="terminal"
        data-gamma-utility-presentation-host={presentation.host}
        data-gamma-utility-region="surface"
      >
        <StatusGrid data-gamma-utility-region="status-grid">
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Mode</StatusLabel>
            <StatusValue>shared cli</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Commands</StatusLabel>
            <StatusValue>{commands.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Shell</StatusLabel>
            <StatusValue>disabled</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Full CLI</StatusLabel>
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
                <CommandRow key={key} data-gamma-utility-region="command-row">
                  <IconBox data-gamma-utility-region="icon">
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <CommandName>{command.name}</CommandName>
                    <CommandSummary data-gamma-utility-region="summary">{command.summary}</CommandSummary>
                  </div>
                  <RunButton data-gamma-utility-region="button" onClick={() => void cli.runRawCommand(key)}>
                    <CirclePlay size={14} aria-hidden />
                    Run
                  </RunButton>
                </CommandRow>
              );
            })}
          </CommandGrid>
        </GroupBox>

        <GroupBox label="Boundary">
          <CommandRow data-gamma-utility-region="command-row">
            <IconBox data-gamma-utility-region="icon">
              <TerminalSquare size={17} aria-hidden />
            </IconBox>
            <div>
              <CommandName>No arbitrary shell</CommandName>
              <CommandSummary data-gamma-utility-region="summary">
                Commands are allowlisted browser actions and read-only diagnostics. The same CLI
                kernel powers this window and `/cli`; route opens enforce browser login, role, and
                app gates — not the public access manifest alone.
              </CommandSummary>
            </div>
            <RunButton
              data-gamma-utility-region="button"
              onClick={() => setLocation(presentationRouteHref("/browser-boundaries", presentation.host))}
            >
              <Braces size={14} aria-hidden />
              Access
            </RunButton>
          </CommandRow>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
