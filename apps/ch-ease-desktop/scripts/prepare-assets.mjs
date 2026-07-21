#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceRoot = path.join(repoRoot, "public/creation-tools");
const outDir = path.join(appDir, "pasta");
const outTools = path.join(outDir, "creation-tools");

const tools = [
  { id: "ch-ease", required: ["index.html", "css/theme.css", "js/studio.js", "vendor/jszip.min.js"] },
  { id: "spaghetti", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-standard-collection.contract.json"] },
  { id: "gnocchi", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-open-edition.contract.json"] },
  { id: "ravioli", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-bundle.contract.json", "contract/pasta-gnocchi-pack-adapter.contract.json", "contract/pasta-rotini-pack-adapter.contract.json"] },
  { id: "rotini", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-generative-collection.contract.json"] },
  { id: "penne", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-distribution.contract.json"] },
  { id: "lasagna", required: ["index.html", "js/common.js", "js/studio.js", "js/pasta-foundation.js", "vendor/tezos.js", "vendor/octez-connect.js", "contract/pasta-exhibition.contract.json"] },
];

for (const tool of tools) {
  const source = path.join(sourceRoot, tool.id);
  if (!existsSync(source)) throw new Error(`CH-EASE desktop source tool not found: ${tool.id}`);
  for (const rel of tool.required) {
    const file = path.join(source, rel);
    if (!existsSync(file) || statSync(file).size === 0) throw new Error(`Missing ${tool.id} desktop asset: ${rel}`);
  }
}

const cheaseSource = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(sourceRoot, "ch-ease/js/studio.js"), "utf8"));
if (!cheaseSource.includes("wtfos.pasta.chease-package.v1")) throw new Error("Portable CH-EASE package schema marker is missing");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outTools, { recursive: true });
for (const tool of tools) {
  const source = path.join(sourceRoot, tool.id);
  const target = path.join(outTools, tool.id);
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    const to = path.join(target, entry);
    if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true });
    else copyFileSync(from, to);
  }
}

console.log(`Prepared CH-EASE desktop assets in ${path.relative(repoRoot, outDir)}`);
