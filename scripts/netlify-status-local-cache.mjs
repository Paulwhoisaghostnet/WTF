import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".npm-cache", "netlify-status");
const cliVersion = "17.38.1";
// The pinned CLI has a large dependency graph. Two measured cold-cache installs
// exceeded the old 120-second guard before reaching `status`; five minutes
// keeps the guard bounded while covering the observed local install path.
const timeoutMs = Number(process.env.NETLIFY_STATUS_TIMEOUT_MS || 300_000);
const preferredNpmBins = [
  process.env.NETLIFY_STATUS_NPM_BIN,
  "/Users/joshuafarnworth/.nvm/versions/node/v22.22.0/bin/npm",
  process.platform === "win32" ? "npm.cmd" : "npm",
].filter(Boolean);

mkdirSync(cacheDir, { recursive: true });

const npmBin = preferredNpmBins.find((candidate) =>
  candidate === "npm" || candidate === "npm.cmd" || existsSync(candidate)
) ?? (process.platform === "win32" ? "npm.cmd" : "npm");
const npmBinDir = path.dirname(npmBin);
const child = spawn(
  npmBin,
  [
    "exec",
    "--yes",
    "--package",
    `netlify-cli@${cliVersion}`,
    "--",
    "netlify",
    "status",
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
      PATH:
        npmBin === "npm" || npmBin === "npm.cmd"
          ? process.env.PATH
          : `${npmBinDir}${path.delimiter}${process.env.PATH || ""}`,
    },
    stdio: "inherit",
  }
);

const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
  ? setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs)
  : null;

child.on("exit", (code, signal) => {
  if (timeout) clearTimeout(timeout);
  if (signal) {
    console.error(`netlify status terminated by ${signal}`);
    process.exit(signal === "SIGTERM" ? 124 : 1);
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  if (timeout) clearTimeout(timeout);
  console.error(`failed to start netlify status: ${err.message}`);
  process.exit(1);
});
