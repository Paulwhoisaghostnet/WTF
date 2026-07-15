import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_DOCKER_CONTEXT_EXCLUSIONS = Object.freeze([
  ".git",
  ".github",
  ".env",
  ".env.*",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
  "artifacts",
  "tests",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__snapshots__",
  ".e2e",
  "e2e-puppets*.json",
  "*.puppet-credentials.json",
  "uploads",
  "cache",
  "backups",
  ".wtf-gameshow",
  ".wtf-platform-keyring",
  "platform-wallet-keyring*.json",
  "platform-keyring-master.key",
  "*.platform-keyring.json",
  "*.platform-wallets.json",
  "docs/platform-wallets",
  ".idea",
  ".vscode",
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
]);

export function parseDockerignore(source) {
  return new Set(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!")),
  );
}

export function findMissingDockerContextExclusions(source) {
  const exclusions = parseDockerignore(source);
  return REQUIRED_DOCKER_CONTEXT_EXCLUSIONS.filter((pattern) => !exclusions.has(pattern));
}

export function checkDockerContext(source) {
  const missing = findMissingDockerContextExclusions(source);
  if (missing.length > 0) {
    throw new Error(
      `Production Docker context is missing required exclusions:\n${missing
        .map((pattern) => `- ${pattern}`)
        .join("\n")}`,
    );
  }
  return REQUIRED_DOCKER_CONTEXT_EXCLUSIONS.length;
}

function main() {
  const count = checkDockerContext(readFileSync(".dockerignore", "utf8"));
  console.log(`Docker context policy passed for ${count} required exclusions.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
