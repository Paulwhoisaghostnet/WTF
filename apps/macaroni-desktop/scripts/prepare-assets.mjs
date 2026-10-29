#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceDir = path.join(repoRoot, "public/creation-tools/macaroni");
const iconSourceRoot = path.join(repoRoot, "public/pasta-icons");
const companionSourceRoot = path.join(repoRoot, "companion/macaroni-v35");
const outDir = path.join(appDir, "macaroni");
const companionOutDir = path.join(appDir, "companion/macaroni-v35");
const companionExcludedTopLevel = new Set(["node_modules", "data", "secrets", ".env"]);
const packageJson = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
const alphaShadownetOnly = packageJson.version.includes("-alpha.");
const trackedCompanionFiles = execFileSync("git", ["ls-files", "-z", "--", "companion/macaroni-v35"], { cwd: repoRoot })
  .toString("utf8").split("\0").filter(Boolean)
  .map((file) => path.relative(companionSourceRoot, path.join(repoRoot, file)));
if (!trackedCompanionFiles.length) throw new Error("Companion packaging requires a Git source checkout");

function includeCompanionSource(source) {
  const relative = path.relative(companionSourceRoot, source);
  if (!relative) return true;
  if (companionExcludedTopLevel.has(relative.split(path.sep)[0])) return false;
  const info = lstatSync(source);
  if (info.isSymbolicLink()) throw new Error(`Companion packaging rejects symbolic links: ${relative}`);
  if (info.isDirectory()) return trackedCompanionFiles.some((file) => file.startsWith(`${relative}${path.sep}`));
  return info.isFile() && trackedCompanionFiles.includes(relative);
}

const required = [
  "studio.html",
  "drop.html",
  "css/theme.css",
  "js/common.js",
  "js/studio.js",
  "js/site-bundle.js",
  "js/octez-wallet.js",
  "vendor/tezos.js",
  "vendor/octez-connect.js",
  "contract/mydrop.contract.json",
  "contract/macaroni-v3.contract.json",
  "contract/macaroni-v35.contract.json",
];

if (!existsSync(sourceDir)) {
  console.error(`Macaroni source assets not found: ${sourceDir}`);
  process.exit(1);
}
if (!existsSync(iconSourceRoot)) throw new Error(`Pasta icon assets not found: ${iconSourceRoot}`);
if (!existsSync(path.join(companionSourceRoot, "package.json")) || !existsSync(path.join(companionSourceRoot, "templates/pasta-service.json"))) {
  throw new Error(`Macaroni Companion assets not found: ${companionSourceRoot}`);
}

for (const rel of required) {
  const target = path.join(sourceDir, rel);
  if (!existsSync(target) || statSync(target).size === 0) {
    console.error(`Missing Macaroni desktop asset: ${rel}`);
    process.exit(1);
  }
}

rmSync(outDir, { recursive: true, force: true });
rmSync(companionOutDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(iconSourceRoot, path.join(outDir, "pasta-icons"), { recursive: true });

for (const entry of readdirSync(sourceDir)) {
  const from = path.join(sourceDir, entry);
  const to = path.join(outDir, entry);
  const stats = statSync(from);
  if (stats.isDirectory()) cpSync(from, to, { recursive: true });
  else if (stats.isFile()) copyFileSync(from, to);
}

if (alphaShadownetOnly) {
  const studioPath = path.join(outDir, "studio.html");
  const studio = readFileSync(studioPath, "utf8");
  writeFileSync(studioPath, studio.replace(/<option value="mainnet">Mainnet<\/option>/g,
    '<option value="mainnet" disabled>Mainnet (unavailable in alpha)</option>'), "utf8");
  const commonPath = path.join(outDir, "js/common.js");
  const common = readFileSync(commonPath, "utf8");
  const setup = "function setupToolkit(networkKey, customRpc) {";
  if (!common.includes(setup)) throw new Error("Macaroni alpha network guard could not be installed");
  writeFileSync(commonPath, common.replace(setup,
    `${setup}\n    if (networkKey !== "shadownet") throw new Error("This Macaroni alpha supports only Tezos Shadownet");`), "utf8");
}

mkdirSync(path.dirname(companionOutDir), { recursive: true });
cpSync(companionSourceRoot, companionOutDir, { recursive: true, filter: includeCompanionSource });

console.log(`Prepared Macaroni desktop assets in ${path.relative(repoRoot, outDir)}`);
