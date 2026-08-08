#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceDir = path.join(repoRoot, "public/creation-tools/ravioli");
const iconSourceRoot = path.join(repoRoot, "public/pasta-icons");
const outDir = path.join(appDir, "ravioli");

const required = [
  "index.html",
  "css/theme.css",
  "js/common.js",
  "js/studio.js",
  "site.html",
  "css/site.css",
  "js/site.js",
  "js/site-bundle.js",
  "js/pasta-foundation.js",
  "js/rotini-artifact.js",
  "js/rotini-mint.js",
  "vendor/tezos.js",
  "vendor/octez-connect.js",
  "contract/pasta-bundle.contract.json",
  "contract/pasta-bundle.template.json",
  "contract/pasta-blind-pack-controller.contract.json",
  "contract/pasta-blind-pack-controller.template.json",
  "contract/pasta-ravioli-deployment-certificate.json",
  "contract/pasta-gnocchi-pack-adapter.contract.json",
  "contract/pasta-gnocchi-pack-adapter.template.json",
  "contract/pasta-rotini-pack-adapter.contract.json",
  "contract/pasta-rotini-pack-adapter.template.json",
];

if (!existsSync(sourceDir)) {
  console.error(`Ravioli source assets not found: ${sourceDir}`);
  process.exit(1);
}
if (!existsSync(iconSourceRoot)) throw new Error(`Pasta icon assets not found: ${iconSourceRoot}`);

for (const rel of required) {
  const target = path.join(sourceDir, rel);
  if (!existsSync(target) || statSync(target).size === 0) {
    console.error(`Missing Ravioli desktop asset: ${rel}`);
    process.exit(1);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(iconSourceRoot, path.join(outDir, "pasta-icons"), { recursive: true });

for (const entry of readdirSync(sourceDir)) {
  const from = path.join(sourceDir, entry);
  const to = path.join(outDir, entry);
  const stats = statSync(from);
  if (stats.isDirectory()) cpSync(from, to, { recursive: true });
  else if (stats.isFile()) copyFileSync(from, to);
}

console.log(`Prepared Ravioli desktop assets in ${path.relative(repoRoot, outDir)}`);
