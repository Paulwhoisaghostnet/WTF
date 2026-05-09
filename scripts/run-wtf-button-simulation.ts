import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runWtfButtonSimulation } from "../server/features/casino/games/wtf-button/simulation";

const seed =
  process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ??
  "wtf-button-default-seed";
const output =
  process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length) ??
  "tmp/wtf-button-simulation-latest.json";
const usersArg = process.argv.find((arg) => arg.startsWith("--users="))?.slice("--users=".length);
const daysArg = process.argv.find((arg) => arg.startsWith("--days="))?.slice("--days=".length);

const report = runWtfButtonSimulation({
  seed,
  users: usersArg ? Number(usersArg) : undefined,
  maxSimulatedDays: daysArg ? Number(daysArg) : undefined,
});

const outputPath = resolve(output);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(report.textReport);
console.log(`JSON results: ${outputPath}`);
