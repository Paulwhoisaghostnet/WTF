import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildWtfOsCliCommands,
  indexWtfOsCliCommands,
  parseCliInput,
  wtfOsCliBanner,
  wtfOsCliMotd,
  WTFOS_CLI_THEMES,
  type WtfOsCliCommandContext,
  type WtfOsCliThemeId,
} from "../../../shared/wtfos-cli/index.ts";
import { loadConfig, loadSession, saveConfig } from "./config.js";
import { createRemoteClient, fetchCurrentUser } from "./http.js";

function colorize(text: string, tone: "fg" | "err" | "sys", themeId: WtfOsCliThemeId) {
  const theme = WTFOS_CLI_THEMES[themeId];
  const ansi = theme.ansi;
  if (!ansi) return text;
  const code = tone === "err" ? ansi.error : tone === "sys" ? ansi.system : ansi.foreground;
  return `${code}${text}\x1b[0m`;
}

async function createCommandContext(): Promise<WtfOsCliCommandContext> {
  const config = loadConfig();
  const session = loadSession();
  let themeId = config.theme;
  let username = session?.username ?? null;
  let displayName = session?.displayName ?? null;

  if (session?.cookie && !username) {
    const user = await fetchCurrentUser().catch(() => null);
    username = user?.username ?? null;
    displayName = user?.displayName ?? null;
  }

  return {
    remote: createRemoteClient(),
    navigate(path) {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      return `Open in browser: ${config.baseUrl}${normalized}`;
    },
    setTheme(nextThemeId) {
      themeId = nextThemeId;
      saveConfig({ theme: nextThemeId });
    },
    getTheme() {
      return themeId;
    },
    clearEntries: () => {},
    appendSystem: () => {},
    username,
    displayName,
    extraHelpCommands: ["exit", "quit"],
  };
}

export async function runCliCommandLine(raw: string): Promise<{ ok: boolean; output: string }> {
  const parsed = parseCliInput(raw);
  if (!parsed) return { ok: true, output: "" };

  const commands = indexWtfOsCliCommands(buildWtfOsCliCommands());
  const command = commands.get(parsed.name);
  if (!command) {
    return { ok: false, output: `Unknown command: ${parsed.name}. Type help.` };
  }

  try {
    const ctx = await createCommandContext();
    const result = await command.run(ctx, parsed.args);
    return { ok: true, output: result ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed";
    return { ok: false, output: message };
  }
}

export async function startRepl() {
  const config = loadConfig();
  const themeId = config.theme;

  console.log(colorize(wtfOsCliBanner(), "sys", themeId));
  console.log(colorize(wtfOsCliMotd(), "fg", themeId));
  console.log(colorize(`Connected to ${config.baseUrl}`, "fg", themeId));

  const rl = createInterface({ input, output, terminal: true, prompt: "wtf> " });
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      continue;
    }
    if (trimmed === "exit" || trimmed === "quit") {
      rl.close();
      break;
    }

    const result = await runCliCommandLine(trimmed);
    if (result.output) {
      console.log(colorize(result.output, result.ok ? "fg" : "err", themeId));
    }
    rl.prompt();
  }
}
