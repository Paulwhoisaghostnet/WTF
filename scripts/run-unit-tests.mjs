import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOTS = ["client", "server", "shared", "extensions", "scripts", "tests/unit", "tests/e2e/inventory"];
const DEDICATED_LANES = ["tests/playwright", "tests/e2e/puppets", "tests/load"];
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", ".cache"]);
const TEST_FILE = /\.test\.(?:ts|tsx|mjs|js)$/;

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    if (DEDICATED_LANES.some((lane) => candidate === lane || candidate.startsWith(`${lane}${path.sep}`))) {
      continue;
    }
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (TEST_FILE.test(entry.name) && !entry.name.includes(".spec.")) files.push(candidate);
  }
  return files;
}

const files = (await Promise.all(ROOTS.map(walk))).flat().sort();
if (files.length === 0) {
  console.error("[unit] no tests discovered");
  process.exit(1);
}

console.log(`[unit] running ${files.length} tests across ${ROOTS.join(", ")}`);
const reporter = process.env.WTF_UNIT_TEST_REPORTER?.trim();
const testArgs = ["--import", "tsx", "--test", "--test-concurrency=4"];
if (reporter) testArgs.push(`--test-reporter=${reporter}`);
testArgs.push(...files);
const testEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL?.trim()
    || "postgresql://wtf:wtf@127.0.0.1:5432/wtf_test",
};
const child = spawn(
  process.execPath,
  testArgs,
  { cwd: process.cwd(), env: testEnv, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error("[unit] failed to launch test process", error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) console.error(`[unit] test process terminated by ${signal}`);
  process.exit(code ?? 1);
});
