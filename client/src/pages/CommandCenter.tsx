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
import { logClientSystemEvent } from "../lib/system-log";
import { PAGE_DEFS } from "../routes/page-defs";

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
  min-height: 58px;
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
  font-size: 10px;
  font-weight: bold;
`;

const ResultTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const ResultMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const OpenButton = styled(Button)`
  min-width: 84px;
  min-height: 30px;
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
    setLocation(command.path);
  }

  return (
    <AppWindow title="Command Palette">
      <Shell data-testid="command-center">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Role</StatusLabel>
            <StatusValue>{role ?? "session"}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Commands</StatusLabel>
            <StatusValue>{commands.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Apps</StatusLabel>
            <StatusValue>{counts.app}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>System</StatusLabel>
            <StatusValue>{counts.system}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <GroupBox label="Search">
          <SearchRow>
            <SearchBox>
              <Search size={16} aria-hidden />
            </SearchBox>
            <Input
              aria-label="Search commands"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Command"
            />
          </SearchRow>
        </GroupBox>

        <GroupBox label="Commands">
          <ResultList>
            {results.length === 0 ? (
              <Empty>No commands</Empty>
            ) : (
              results.map((command) => (
                <ResultRow key={command.id}>
                  <Glyph>{categoryGlyph(command.category)}</Glyph>
                  <div>
                    <ResultTitle>{command.label}</ResultTitle>
                    <ResultMeta>
                      {categoryLabel(command.category)} - {command.path}
                    </ResultMeta>
                  </div>
                  <OpenButton onClick={() => runCommand(command)}>
                    <ArrowRight size={14} aria-hidden />
                    Open
                  </OpenButton>
                </ResultRow>
              ))
            )}
          </ResultList>
        </GroupBox>

        <GroupBox label="Boundary">
          <ResultRow>
            <Glyph>
              <ShieldCheck size={16} aria-hidden />
            </Glyph>
            <div>
              <ResultTitle>Browser Boundaries</ResultTitle>
              <ResultMeta>System - /browser-boundaries</ResultMeta>
            </div>
            <OpenButton onClick={() => setLocation("/browser-boundaries")}>
              <Command size={14} aria-hidden />
              Open
            </OpenButton>
          </ResultRow>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
