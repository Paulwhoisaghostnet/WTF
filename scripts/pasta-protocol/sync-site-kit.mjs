#!/usr/bin/env node

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(repoRoot, "scripts/pasta-protocol/site-kit");
const studioDraftSource = path.join(repoRoot, "scripts/pasta-protocol/studio-kit/studio-draft.js");
const studioContractsSource = path.join(repoRoot, "scripts/pasta-protocol/studio-kit/studio-contracts.js");
const rotiniRuntimeRoot = path.join(repoRoot, "public/creation-tools/rotini/js");
const apps = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

for (const app of apps) {
  const root = path.join(repoRoot, "public/creation-tools", app);
  mkdirSync(path.join(root, "css"), { recursive: true });
  mkdirSync(path.join(root, "js"), { recursive: true });
  copyFileSync(path.join(source, "site.html"), path.join(root, "site.html"));
  copyFileSync(path.join(source, "site.css"), path.join(root, "css/site.css"));
  copyFileSync(path.join(source, "site.js"), path.join(root, "js/site.js"));
  copyFileSync(path.join(source, "site-bundle.js"), path.join(root, "js/site-bundle.js"));
  copyFileSync(studioDraftSource, path.join(root, "js/studio-draft.js"));
  copyFileSync(studioContractsSource, path.join(root, "js/studio-contracts.js"));
  if (app === "ravioli") {
    copyFileSync(path.join(rotiniRuntimeRoot, "rotini-artifact.js"), path.join(root, "js/rotini-artifact.js"));
    copyFileSync(path.join(rotiniRuntimeRoot, "rotini-mint.js"), path.join(root, "js/rotini-mint.js"));
  }
}

console.log(`Synced shared Pasta site and studio recovery kits into ${apps.length} publisher apps.`);
