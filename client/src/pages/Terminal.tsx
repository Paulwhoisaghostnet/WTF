import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, GroupBox, Separator, TextField } from "react95";
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
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

type HealthResponse = {
  ok: boolean;
  status?: string;
  version?: { commitRef?: string | null; packageVersion?: string | null };
  db?: { ok?: boolean; latencyMs?: number | null };
  chain?: { ok?: boolean; network?: string | null; tezosRpcUrl?: string | null };
  jobs?: {
    ok?: boolean;
    registered?: number | null;
    running?: number | null;
    recentErrors?: number | null;
    jobs?: Array<{
      name: string;
      running?: boolean;
      latestStatus?: string | null;
      latestFinishedAt?: string | null;
      nextRunAt?: string | null;
    }>;
  };
};

type AccessManifest = {
  ok: boolean;
  browserRoutes: Array<{ path: string; access: string; enabled?: boolean }>;
  apiRoutes: Array<{ method: string; path: string; access: string }>;
  mcp: { endpoint: string; scopes: Array<{ scope: string }> };
};

type TerminalEntry = {
  id: string;
  kind: "input" | "output" | "error";
  text: string;
};

type TerminalCommand = {
  name: string;
  summary: string;
  run: () => Promise<string> | string;
};

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

const TerminalFrame = styled.div`
  display: grid;
  gap: 6px;
  min-height: 260px;
  padding: 8px;
  border: 2px inset #c0c0c0;
  background: #050505;
  color: #d8ffd0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    monospace;
  font-size: 12px;
`;

const Output = styled.div`
  display: grid;
  gap: 4px;
  align-content: start;
  min-height: 190px;
  max-height: 340px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Line = styled.div<{ $kind: TerminalEntry["kind"] }>`
  color: ${(p) => (p.$kind === "error" ? "#ffb8b8" : p.$kind === "input" ? "#b8ddff" : "#d8ffd0")};
`;

const Prompt = styled.form`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
`;

const PromptGlyph = styled.div`
  color: #ffffff;
  font-weight: bold;
`;

const CommandInput = styled(TextField)`
  input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      monospace;
  }
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

function line(kind: TerminalEntry["kind"], text: string): TerminalEntry {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, text };
}

function summarizeHealth(health: HealthResponse) {
  return [
    `ok=${health.ok}`,
    `commit=${health.version?.commitRef ?? "unknown"}`,
    `db=${health.db?.ok ? "ok" : "degraded"}`,
    `chain=${health.chain?.ok ? health.chain.network ?? "ok" : "degraded"}`,
    `rpc=${health.chain?.tezosRpcUrl ?? "unknown"}`,
    `jobs=${health.jobs?.registered ?? 0} registered / ${health.jobs?.running ?? 0} running / ${
      health.jobs?.recentErrors ?? 0
    } recent errors`,
  ].join("\n");
}

export function Terminal() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("help");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<TerminalEntry[]>([
    line("output", "WTF OS Terminal ready. Type `help` for safe commands."),
  ]);

  useEffect(() => {
    logClientSystemEvent({ eventType: "terminal.viewed" });
  }, []);

  const commands = useMemo<Record<string, TerminalCommand>>(
    () => ({
      help: {
        name: "help",
        summary: "List safe terminal commands.",
        run: () =>
          [
            "Safe commands:",
            "help, status, health, jobs, access, routes, mcp, commands, recovery, settings, wallet, rewards",
            "This terminal does not execute server shell commands.",
          ].join("\n"),
      },
      status: {
        name: "status",
        summary: "Summarize kernel health and access manifest.",
        run: async () => {
          const [health, access] = await Promise.all([
            api.get<HealthResponse>("/api/health"),
            api.get<AccessManifest>("/api/access"),
          ]);
          return [
            summarizeHealth(health),
            `browserRoutes=${access.browserRoutes.length}`,
            `apiRoutes=${access.apiRoutes.length}`,
            `mcpScopes=${access.mcp.scopes.length}`,
          ].join("\n");
        },
      },
      health: {
        name: "health",
        summary: "Read /api/health and show the user-safe summary.",
        run: async () => summarizeHealth(await api.get<HealthResponse>("/api/health")),
      },
      jobs: {
        name: "jobs",
        summary: "Show registered background jobs without exposing internals.",
        run: async () => {
          const health = await api.get<HealthResponse>("/api/health");
          const jobs = health.jobs?.jobs ?? [];
          if (jobs.length === 0) return "No job records returned by health.";
          return jobs
            .slice(0, 18)
            .map(
              (job) =>
                `${job.running ? "*" : "-"} ${job.name}: ${job.latestStatus ?? "unknown"}${
                  job.latestFinishedAt ? ` @ ${job.latestFinishedAt}` : ""
                }${
                  job.nextRunAt ? ` next ${job.nextRunAt}` : ""
                }`
            )
            .join("\n");
        },
      },
      access: {
        name: "access",
        summary: "Summarize public/session/role browser boundary counts.",
        run: async () => {
          const access = await api.get<AccessManifest>("/api/access");
          const modes = access.browserRoutes.reduce<Record<string, number>>((acc, route) => {
            acc[route.access] = (acc[route.access] ?? 0) + 1;
            return acc;
          }, {});
          return Object.entries(modes)
            .map(([mode, count]) => `${mode}: ${count}`)
            .concat([`apiRoutes: ${access.apiRoutes.length}`])
            .join("\n");
        },
      },
      routes: {
        name: "routes",
        summary: "List the first browser routes from the standard access map.",
        run: async () => {
          const access = await api.get<AccessManifest>("/api/access");
          return access.browserRoutes
            .slice(0, 24)
            .map((route) => `${route.enabled === false ? "x" : "-"} ${route.path} [${route.access}]`)
            .join("\n");
        },
      },
      mcp: {
        name: "mcp",
        summary: "Show MCP endpoint, scope count, and token settings route.",
        run: async () => {
          const access = await api.get<AccessManifest>("/api/access");
          return [
            `endpoint=${access.mcp.endpoint}`,
            `scopes=${access.mcp.scopes.length}`,
            "token settings=/desktop-settings",
          ].join("\n");
        },
      },
      commands: {
        name: "commands",
        summary: "Open Command Palette.",
        run: () => {
          setLocation("/command-palette");
          return "Opening /command-palette";
        },
      },
      recovery: {
        name: "recovery",
        summary: "Open Recovery Mode.",
        run: () => {
          setLocation("/recovery-mode");
          return "Opening /recovery-mode";
        },
      },
      settings: {
        name: "settings",
        summary: "Open System Settings.",
        run: () => {
          setLocation("/settings");
          return "Opening /settings";
        },
      },
      wallet: {
        name: "wallet",
        summary: "Open wallet cockpit.",
        run: () => {
          setLocation("/dashboard");
          return "Opening /dashboard";
        },
      },
      rewards: {
        name: "rewards",
        summary: "Open Mission Control for rewards and next actions.",
        run: () => {
          setLocation("/mission-control");
          return "Opening /mission-control";
        },
      },
    }),
    [setLocation]
  );

  async function runCommand(raw: string) {
    const commandName = raw.trim().toLowerCase().replace(/^wtf\s+/, "");
    if (!commandName) return;
    const command = commands[commandName];
    setEntries((current) => [...current, line("input", `> ${raw.trim()}`)].slice(-80));
    logClientSystemEvent({
      eventType: "terminal.command_executed",
      metadata: { command: commandName, allowed: Boolean(command) },
    });
    if (!command) {
      setEntries((current) =>
        [...current, line("error", `Unknown command: ${commandName}. Type help.`)].slice(-80)
      );
      return;
    }
    setBusy(true);
    try {
      const result = await command.run();
      setEntries((current) => [...current, line("output", result)].slice(-80));
    } catch (error) {
      setEntries((current) =>
        [
          ...current,
          line("error", error instanceof Error ? error.message : "Command failed"),
        ].slice(-80)
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input;
    setInput("");
    void runCommand(value);
  }

  const commandRows = [
    { key: "status", icon: HeartPulse },
    { key: "jobs", icon: Gauge },
    { key: "access", icon: ShieldCheck },
    { key: "routes", icon: Route },
    { key: "mcp", icon: KeyRound },
    { key: "commands", icon: Command },
    { key: "recovery", icon: ClipboardList },
  ];

  return (
    <AppWindow title="Terminal">
      <Shell data-testid="wtf-terminal">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Mode</StatusLabel>
            <StatusValue>safe</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Commands</StatusLabel>
            <StatusValue>{Object.keys(commands).length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Shell</StatusLabel>
            <StatusValue>disabled</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Output</StatusLabel>
            <StatusValue>{entries.length}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <TerminalFrame>
          <Output aria-live="polite">
            {entries.map((entry) => (
              <Line key={entry.id} $kind={entry.kind}>
                {entry.text}
              </Line>
            ))}
          </Output>
          <Prompt onSubmit={submit}>
            <PromptGlyph>&gt;</PromptGlyph>
            <CommandInput
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              disabled={busy}
              aria-label="Terminal command"
            />
            <Button type="submit" disabled={busy || input.trim().length === 0}>
              {busy ? "Run..." : "Run"}
            </Button>
          </Prompt>
        </TerminalFrame>

        <Separator />

        <GroupBox label="Safe Commands">
          <CommandGrid>
            {commandRows.map(({ key, icon }) => {
              const command = commands[key];
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
                  <RunButton disabled={busy} onClick={() => void runCommand(key)}>
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
                Commands are allowlisted browser actions and read-only diagnostics. Server operations
                stay behind admin, deploy, and recovery gates.
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
