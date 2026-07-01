#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceDir = path.join(repoRoot, "public/creation-tools/rotini");
const outDir = path.join(appDir, "rotini");

const required = [
  "index.html",
  "css/theme.css",
  "js/common.js",
  "js/studio.js",
  "js/pasta-foundation.js",
  "vendor/tezos.js",
  "vendor/octez-connect.js",
  "contract/pasta-standard-collection.contract.json",
];

if (!existsSync(sourceDir)) {
  console.error(`Rotini source assets not found: ${sourceDir}`);
  process.exit(1);
}

for (const rel of required) {
  const target = path.join(sourceDir, rel);
  if (!existsSync(target) || statSync(target).size === 0) {
    console.error(`Missing Rotini desktop asset: ${rel}`);
    process.exit(1);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of readdirSync(sourceDir)) {
  const from = path.join(sourceDir, entry);
  const to = path.join(outDir, entry);
  const stats = statSync(from);
  if (stats.isDirectory()) cpSync(from, to, { recursive: true });
  else if (stats.isFile()) copyFileSync(from, to);
}

console.log(`Prepared Rotini desktop assets in ${path.relative(repoRoot, outDir)}`);
