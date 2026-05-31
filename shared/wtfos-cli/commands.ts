import { WTFOS_PLATFORM_LONG_NAME } from "../platform-branding";
import { wtfOsCliBanner, wtfOsCliMotd } from "./banner";
import { guardedBrowserRouteOpen } from "./route-open";
import { WTFOS_CLI_THEME_ORDER, WTFOS_CLI_THEMES, nextCliThemeId } from "./themes";
import type {
  WtfOsCliCommand,
  WtfOsCliCommandContext,
  WtfOsHealthResponse,
} from "./types";

export function summarizeWtfOsHealth(health: WtfOsHealthResponse) {
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

const BASE_COMMAND_NAMES = [
  "help",
  "clear",
  "banner",
  "motd",
  "whoami",
  "theme",
  "status",
  "health",
  "jobs",
  "access",
  "routes",
  "mcp",
  "open",
  "commands",
  "recovery",
  "settings",
  "wallet",
  "rewards",
  "echo",
] as const;

export function buildWtfOsCliCommands(): WtfOsCliCommand[] {
  return [
    {
      name: "help",
      aliases: ["?"],
      summary: "List safe CLI commands.",
      run: (ctx) => {
        const names = [...BASE_COMMAND_NAMES, ...(ctx.extraHelpCommands ?? [])];
        return [
          `${WTFOS_PLATFORM_LONG_NAME} safe CLI`,
          names.join(", "),
          "",
          "Examples:",
          "  open /mission-control",
          "  theme tezos",
          "  echo hello from the grid",
          "",
          "No server shell. No arbitrary code execution.",
          "Route opens use the same login, role, and app gates as the browser UI.",
        ].join("\n");
      },
    },
    {
      name: "clear",
      aliases: ["cls"],
      summary: "Clear the terminal output.",
      run: (ctx) => {
        ctx.clearEntries();
        return "";
      },
    },
    {
      name: "banner",
      aliases: ["ascii"],
      summary: "Show the wtfOS ASCII banner.",
      run: () => wtfOsCliBanner(),
    },
    {
      name: "motd",
      summary: "Show the message of the day.",
      run: () => wtfOsCliMotd(),
    },
    {
      name: "whoami",
      summary: "Show the signed-in WTF account.",
      run: (ctx) => {
        if (!ctx.username) return "Not signed in.";
        const label = ctx.displayName
          ? `${ctx.displayName} (@${ctx.username})`
          : `@${ctx.username}`;
        return label;
      },
    },
    {
      name: "theme",
      summary: "Show or change terminal colors.",
      usage: "theme [phosphor|amber|ice|bloodmoon|tezos]",
      run: (ctx, args) => {
        const requested = args[0]?.toLowerCase();
        if (!requested) {
          const next = nextCliThemeId(ctx.getTheme());
          ctx.setTheme(next);
          return `Theme set to ${WTFOS_CLI_THEMES[next].label}.`;
        }
        if (!(requested in WTFOS_CLI_THEMES)) {
          return `Unknown theme. Choose: ${WTFOS_CLI_THEME_ORDER.join(", ")}`;
        }
        ctx.setTheme(requested as keyof typeof WTFOS_CLI_THEMES);
        return `Theme set to ${WTFOS_CLI_THEMES[requested as keyof typeof WTFOS_CLI_THEMES].label}.`;
      },
    },
    {
      name: "status",
      summary: "Summarize kernel health and access manifest.",
      run: async (ctx) => {
        const [health, access] = await Promise.all([
          ctx.remote.getHealth(),
          ctx.remote.getAccess(),
        ]);
        return [
          summarizeWtfOsHealth(health),
          `browserRoutes=${access.browserRoutes.length}`,
          `apiRoutes=${access.apiRoutes.length}`,
          `mcpScopes=${access.mcp.scopes.length}`,
        ].join("\n");
      },
    },
    {
      name: "health",
      summary: "Read /api/health and show the user-safe summary.",
      run: async (ctx) => summarizeWtfOsHealth(await ctx.remote.getHealth()),
    },
    {
      name: "jobs",
      summary: "Show registered background jobs without exposing internals.",
      run: async (ctx) => {
        const health = await ctx.remote.getHealth();
        const jobs = health.jobs?.jobs ?? [];
        if (jobs.length === 0) return "No job records returned by health.";
        return jobs
          .slice(0, 18)
          .map(
            (job) =>
              `${job.running ? "*" : "-"} ${job.name}: ${job.latestStatus ?? "unknown"}${
                job.latestFinishedAt ? ` @ ${job.latestFinishedAt}` : ""
              }${job.nextRunAt ? ` next ${job.nextRunAt}` : ""}`
          )
          .join("\n");
      },
    },
    {
      name: "access",
      summary: "Summarize public/session/role browser boundary counts.",
      run: async (ctx) => {
        const access = await ctx.remote.getAccess();
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
    {
      name: "routes",
      summary: "List browser routes you can open with current session gates.",
      run: async (ctx) => {
        const routes = await ctx.remote.listAccessibleBrowserRoutes();
        if (routes.length === 0) {
          return "No browser routes available for your current session.";
        }
        return routes
          .slice(0, 32)
          .map((route) => `- ${route.path}${route.auth ? "" : " [public]"} ${route.title}`)
          .join("\n");
      },
    },
    {
      name: "mcp",
      summary: "Show MCP endpoint, scope count, and token settings route.",
      run: async (ctx) => {
        const access = await ctx.remote.getAccess();
        return [
          `endpoint=${access.mcp.endpoint}`,
          `scopes=${access.mcp.scopes.length}`,
          "token settings=/desktop-settings",
        ].join("\n");
      },
    },
    {
      name: "open",
      summary: "Open a browser route allowed for your session.",
      usage: "open /path",
      run: async (ctx, args) => {
        const target = args[0];
        if (!target) return "Usage: open /route";
        return guardedBrowserRouteOpen(ctx.remote, ctx.navigate, target);
      },
    },
    {
      name: "commands",
      summary: "Open Command Palette.",
      run: (ctx) => guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/command-palette"),
    },
    {
      name: "recovery",
      summary: "Open Recovery Mode.",
      run: (ctx) => guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/recovery-mode"),
    },
    {
      name: "settings",
      summary: "Open System Settings.",
      run: (ctx) => guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/settings"),
    },
    {
      name: "wallet",
      summary: "Open wallet cockpit.",
      run: (ctx) => guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/dashboard"),
    },
    {
      name: "rewards",
      summary: "Open Mission Control for rewards and next actions.",
      run: (ctx) => guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/mission-control"),
    },
    {
      name: "echo",
      summary: "Echo text back safely.",
      usage: "echo your message",
      run: (_ctx, args) => (args.length === 0 ? "" : args.join(" ")),
    },
  ];
}

export function indexWtfOsCliCommands(commands: WtfOsCliCommand[]): Map<string, WtfOsCliCommand> {
  const map = new Map<string, WtfOsCliCommand>();
  for (const command of commands) {
    map.set(command.name, command);
    for (const alias of command.aliases ?? []) {
      map.set(alias, command);
    }
  }
  return map;
}

export function buildBrowserOnlyWtfOsCliCommands(): WtfOsCliCommand[] {
  return [
    {
      name: "desktop",
      summary: "Switch to the full desktop UI.",
      run: async (ctx) => {
        ctx.setInterfaceMode?.("desktop");
        return guardedBrowserRouteOpen(ctx.remote, ctx.navigate, "/mission-control");
      },
    },
    {
      name: "cli",
      summary: "Stay in CLI mode and show quick tips.",
      run: (ctx) => {
        ctx.setInterfaceMode?.("cli");
        return [
          "CLI mode active.",
          wtfOsCliMotd(),
          "Use `desktop` when you want windows, icons, and the taskbar back.",
        ].join("\n");
      },
    },
  ];
}
