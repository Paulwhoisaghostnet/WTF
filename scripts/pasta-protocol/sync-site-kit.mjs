#!/usr/bin/env node

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(repoRoot, "scripts/pasta-protocol/site-kit");
const apps = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

for (const app of apps) {
  const root = path.join(repoRoot, "public/creation-tools", app);
  mkdirSync(path.join(root, "css"), { recursive: true });
  mkdirSync(path.join(root, "js"), { recursive: true });
  copyFileSync(path.join(source, "site.html"), path.join(root, "site.html"));
  copyFileSync(path.join(source, "site.css"), path.join(root, "css/site.css"));
  copyFileSync(path.join(source, "site.js"), path.join(root, "js/site.js"));
  copyFileSync(path.join(source, "site-bundle.js"), path.join(root, "js/site-bundle.js"));
}

console.log(`Synced shared Pasta site kit into ${apps.length} publisher apps.`);
