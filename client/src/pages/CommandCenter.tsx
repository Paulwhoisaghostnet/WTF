import { useEffect, useMemo, useState } from "react";
import { Button, GroupBox, Separator } from "react95";
import {
  ArrowRight,
  Command,
  Search,
  ShieldCheck,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import {
  buildCommandPaletteCommands,
  filterCommandPaletteCommands,
  type CommandPaletteCategory,
  type CommandPaletteCommand,
} from "../features/command-palette/command-palette-model";
import { useAuth } from "../lib/auth-context";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";
import { PAGE_DEFS } from "../routes/page-defs";

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  &[data-command-palette-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-command-palette-presentation-host="gamma"],
  &[data-command-palette-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region],
  &[data-command-palette-presentation-host="gamma"] fieldset {
    min-width: 0;
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #070706;
    background-image: none;
    color: #f2ead9;
  }

  &[data-command-palette-presentation-host="gamma"] fieldset {
    padding: 12px;
  }

  &[data-command-palette-presentation-host="gamma"] legend,
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="status-label"] {
    color: rgba(242, 234, 217, 0.7);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="status-cell"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="search-box"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="result-row"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="glyph"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="empty"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    background: #11110f;
    background-image: none;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="status-value"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="result-title"] {
    color: #f2ead9;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="result-meta"],
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="empty"] {
    color: rgba(242, 234, 217, 0.68);
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="search-input"] {
    border: 1px solid rgba(0, 210, 255, 0.5);
    border-radius: 4px;
    background: #070706;
    color: #f2ead9;
    outline: none;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="search-input"]:focus-visible {
    border-color: #00d2ff;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="glyph"] {
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="open-button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }

  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="open-button"]:hover,
  &[data-command-palette-presentation-host="gamma"] [data-command-palette-region="open-button"]:focus-visible {
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
  min-height: 58px;
  padding: 7px;
  border: 1px solid #808080;
  background: #eeeeee;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
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

const SearchRow = styled.label`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
`;

const SearchBox = styled.div`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const Input = styled.input`
  width: 100%;
  min-width: 0;
  border: 2px inset #dfdfdf;
  background: #ffffff;
  padding: 7px 8px;
  font: inherit;
`;

const ResultList = styled.div`
  display: grid;
  gap: 5px;
  max-height: 430px;
  overflow: auto;
`;

const ResultRow = styled.div`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 54px;
  padding: 7px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;

  @media (max-width: 560px) {
    grid-template-columns: 34px minmax(0, 1fr);
  }
`;

const Glyph = styled.div`
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

const ResultTitle = styled.div`
  font-size: var(--wtf-type-body, 14px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const ResultMeta = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: #404040;
  overflow-wrap: anywhere;
`;

const OpenButton = styled(Button)`
  min-width: 84px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: var(--wtf-type-caption, 13px);

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
  }
`;

const Empty = styled.div`
  padding: 18px;
  text-align: center;
  color: #333333;
`;

function categoryLabel(category: CommandPaletteCategory): string {
  if (category === "wallet") return "Wallet";
  if (category === "reward") return "Reward";
  if (category === "media") return "Media";
  if (category === "system") return "System";
  if (category === "admin") return "Admin";
  if (category === "app") return "App";
  return "Route";
}

function categoryGlyph(category: CommandPaletteCategory): string {
  if (category === "wallet") return "WA";
  if (category === "reward") return "RW";
  if (category === "media") return "MD";
  if (category === "system") return "OS";
  if (category === "admin") return "AD";
  if (category === "app") return "AP";
  return "GO";
}

function countCategories(commands: CommandPaletteCommand[]) {
  return commands.reduce<Record<CommandPaletteCategory, number>>(
    (counts, command) => {
      counts[command.category] = (counts[command.category] ?? 0) + 1;
      return counts;
    },
    {
      route: 0,
      app: 0,
      wallet: 0,
      reward: 0,
      media: 0,
      system: 0,
      admin: 0,
    }
  );
}

export function CommandCenter() {
  const { user } = useAuth();
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const role = user?.role ?? null;
  const commands = useMemo(() => buildCommandPaletteCommands(PAGE_DEFS, role), [role]);
  const results = useMemo(
    () => filterCommandPaletteCommands(commands, query, 50),
    [commands, query]
  );
  const counts = useMemo(() => countCategories(commands), [commands]);

  useEffect(() => {
    logClientSystemEvent({
      eventType: "command_palette.opened",
      metadata: { source: "route", commandCount: commands.length },
    });
  }, [commands.length]);

  function runCommand(command: CommandPaletteCommand) {
    logClientSystemEvent({
      eventType: "command_palette.executed",
      metadata: {
        commandId: command.id,
        category: command.category,
        path: command.path,
        source: "route",
      },
    });
    setLocation(presentationRouteHref(command.path, presentation.host));
  }

  return (
    <AppWindow title="Command Palette">
      <Shell
        data-testid="command-center"
        data-command-palette-presentation-host={presentation.host}
        data-command-palette-surface="command-palette"
        data-command-palette-region="surface"
      >
        <StatusGrid data-command-palette-region="status-grid">
          <StatusCell data-command-palette-region="status-cell">
            <StatusLabel data-command-palette-region="status-label">Role</StatusLabel>
            <StatusValue data-command-palette-region="status-value">{role ?? "session"}</StatusValue>
          </StatusCell>
          <StatusCell data-command-palette-region="status-cell">
            <StatusLabel data-command-palette-region="status-label">Commands</StatusLabel>
            <StatusValue data-command-palette-region="status-value">{commands.length}</StatusValue>
          </StatusCell>
          <StatusCell data-command-palette-region="status-cell">
            <StatusLabel data-command-palette-region="status-label">Apps</StatusLabel>
            <StatusValue data-command-palette-region="status-value">{counts.app}</StatusValue>
          </StatusCell>
          <StatusCell data-command-palette-region="status-cell">
            <StatusLabel data-command-palette-region="status-label">System</StatusLabel>
            <StatusValue data-command-palette-region="status-value">{counts.system}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <GroupBox label="Search">
          <SearchRow data-command-palette-region="search-row">
            <SearchBox data-command-palette-region="search-box">
              <Search size={16} aria-hidden />
            </SearchBox>
            <Input
              data-command-palette-region="search-input"
              aria-label="Search commands"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Command"
            />
          </SearchRow>
        </GroupBox>

        <GroupBox label="Commands">
          <ResultList data-command-palette-region="result-list">
            {results.length === 0 ? (
              <Empty data-command-palette-region="empty">No commands</Empty>
            ) : (
              results.map((command) => (
                <ResultRow
                  key={command.id}
                  data-command-palette-region="result-row"
                  data-command-palette-command-id={command.id}
                  data-command-palette-command-path={command.path}
                  data-command-palette-command-category={command.category}
                >
                  <Glyph data-command-palette-region="glyph">{categoryGlyph(command.category)}</Glyph>
                  <div>
                    <ResultTitle data-command-palette-region="result-title">{command.label}</ResultTitle>
                    <ResultMeta data-command-palette-region="result-meta">
                      {categoryLabel(command.category)} - {command.path}
                    </ResultMeta>
                  </div>
                  <OpenButton data-command-palette-region="open-button" onClick={() => runCommand(command)}>
                    <ArrowRight size={14} aria-hidden />
                    Open
                  </OpenButton>
                </ResultRow>
              ))
            )}
          </ResultList>
        </GroupBox>

        <GroupBox label="Boundary">
          <ResultRow
            data-command-palette-region="result-row"
            data-command-palette-command-id="browser-boundaries-shortcut"
            data-command-palette-command-path="/browser-boundaries"
            data-command-palette-command-category="system"
          >
            <Glyph data-command-palette-region="glyph">
              <ShieldCheck size={16} aria-hidden />
            </Glyph>
            <div>
              <ResultTitle data-command-palette-region="result-title">Browser Boundaries</ResultTitle>
              <ResultMeta data-command-palette-region="result-meta">System - /browser-boundaries</ResultMeta>
            </div>
            <OpenButton
              data-command-palette-region="open-button"
              onClick={() => setLocation(presentationRouteHref("/browser-boundaries", presentation.host))}
            >
              <Command size={14} aria-hidden />
              Open
            </OpenButton>
          </ResultRow>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
