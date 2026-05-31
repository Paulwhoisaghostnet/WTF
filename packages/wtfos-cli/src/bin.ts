import { stdout } from "node:process";
import { clearSession, configDir, loadConfig, saveConfig } from "./config.js";
import { normalizeCliThemeId } from "../../../shared/wtfos-cli/index.ts";
import { loginInteractive, printWhoami } from "./login.js";
import { runCliCommandLine, startRepl } from "./repl.js";

const HELP = `wtfOS native CLI

Usage:
  wtfos                         Interactive shell (REPL)
  wtfos <command> [args...]     Run one allowlisted command
  wtfos login [--username u] [--password p]
  wtfos logout
  wtfos whoami
  wtfos config get [baseUrl|theme]
  wtfos config set <key> <value>

Environment:
  WTFOS_URL / WTFOS_BASE_URL    Default deployment origin (default: https://wtfos.app)

Config: ${configDir()}

Examples:
  wtfos health
  wtfos routes
  wtfos open /mission-control
  WTFOS_URL=http://localhost:3000 wtfos login
`;

function parseFlags(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--username" || token === "-u") {
      flags.username = argv[++index] ?? "";
      continue;
    }
    if (token === "--password" || token === "-p") {
      flags.password = argv[++index] ?? "";
      continue;
    }
    positional.push(token);
  }
  return { positional, flags };
}

async function handleConfig(subcommand: string | undefined, args: string[]) {
  if (subcommand === "get") {
    const key = args[0] ?? "baseUrl";
    const config = loadConfig();
    if (key === "baseUrl") {
      console.log(config.baseUrl);
      return;
    }
    if (key === "theme") {
      console.log(config.theme);
      return;
    }
    throw new Error(`Unknown config key: ${key}`);
  }

  if (subcommand === "set") {
    const [key, value] = args;
    if (!key || !value) throw new Error("Usage: wtfos config set <baseUrl|theme> <value>");
    if (key === "baseUrl") {
      saveConfig({ baseUrl: value.replace(/\/+$/, "") });
      console.log(`baseUrl=${value}`);
      return;
    }
    if (key === "theme") {
      saveConfig({ theme: normalizeCliThemeId(value) });
      console.log(`theme=${value}`);
      return;
    }
    throw new Error(`Unknown config key: ${key}`);
  }

  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    if (stdout.isTTY) {
      await startRepl();
      return;
    }
    console.log(HELP);
    return;
  }

  const [command, ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "shell" || command === "repl") {
    await startRepl();
    return;
  }

  if (command === "login") {
    const { flags } = parseFlags(rest);
    const username = await loginInteractive(
      typeof flags.username === "string" ? flags.username : undefined,
      typeof flags.password === "string" ? flags.password : undefined
    );
    console.log(`Signed in as @${username}`);
    return;
  }

  if (command === "logout") {
    clearSession();
    console.log("Signed out.");
    return;
  }

  if (command === "whoami") {
    await printWhoami();
    return;
  }

  if (command === "config") {
    const [subcommand, ...args] = rest;
    await handleConfig(subcommand, args);
    return;
  }

  const result = await runCliCommandLine([command, ...rest].join(" "));
  if (result.output) console.log(result.output);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
