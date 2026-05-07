#!/usr/bin/env tsx

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREATION_TOOLS } from "../client/src/features/creation-tools/tool-registry";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(projectRoot, "public");

const missing: string[] = [];

for (const tool of CREATION_TOOLS) {
  for (const asset of tool.requiredAssets) {
    const diskPath = path.join(publicRoot, asset.replace(/^\/+/, ""));
    if (!existsSync(diskPath) || statSync(diskPath).size === 0) {
      missing.push(`${tool.id}: ${asset}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing creation tool assets:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Verified ${CREATION_TOOLS.length} creation tool module(s).`);
