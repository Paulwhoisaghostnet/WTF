#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_SQL_FILE = resolve(repoRoot, "scripts/db-health-completion.sql");

dotenvConfig({ path: resolve(repoRoot, ".env"), quiet: true });

export function resolveOptions(env = process.env, argv = process.argv.slice(2)) {
  const topNArg = argv.find((arg) => arg.startsWith("--top="));
  const topN = Number(topNArg?.slice("--top=".length) ?? env.DB_HEALTH_TOP_N ?? 25);
  return {
    databaseUrl: String(env.DATABASE_URL ?? "").trim(),
    psqlBin: String(env.PSQL_BIN ?? "psql"),
    sqlFile: resolve(String(env.DB_HEALTH_COMPLETION_SQL ?? DEFAULT_SQL_FILE)),
    topN: Number.isInteger(topN) && topN > 0 ? topN : 25,
  };
}

export function buildPsqlArgs(options) {
  return [
    options.databaseUrl,
    "-v",
    `TOP_N=${options.topN}`,
    "-f",
    options.sqlFile,
  ];
}

function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "REDACTED";
    return parsed.toString();
  } catch {
    return "unparseable DATABASE_URL";
  }
}

export function run(options = resolveOptions()) {
  if (!options.databaseUrl) {
    throw new Error("DATABASE_URL is required for db health completion.");
  }
  if (!existsSync(options.sqlFile)) {
    throw new Error(`DB health SQL file not found: ${options.sqlFile}`);
  }

  console.error(`[db:health:completion] target=${redactDatabaseUrl(options.databaseUrl)}`);
  console.error(`[db:health:completion] top=${options.topN}`);

  return spawnSync(options.psqlBin, buildPsqlArgs(options), {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? "15",
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = run();
    process.exit(result.status ?? 1);
  } catch (err) {
    console.error(`[db:health:completion] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
