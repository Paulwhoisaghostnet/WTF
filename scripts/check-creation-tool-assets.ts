import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CREATION_TOOLS } from "../client/src/features/creation-tools/tool-registry";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const missing: string[] = [];

for (const tool of Object.values(CREATION_TOOLS)) {
  for (const assetPath of tool.requiredAssets ?? []) {
    const localPath = path.join(repoRoot, "public", assetPath.replace(/^\//, "").replace(/^creation-tools\//, "creation-tools/"));
    try {
      await access(localPath);
    } catch {
      missing.push(`${tool.id}: ${assetPath}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing creation tool assets:");
  for (const entry of missing) console.error(`- ${entry}`);
  process.exit(1);
}

console.log("Creation tool asset check passed.");
