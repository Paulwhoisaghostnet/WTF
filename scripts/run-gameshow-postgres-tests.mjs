import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(root, ".env"), quiet: true });

// Only this explicit integration lane promotes the application's local database
// setting into the test opt-in. The unit lane's placeholder URL is not consent.
const connectionString = (process.env.GAMESHOW_TEST_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
if (!connectionString) {
  throw new Error("Set GAMESHOW_TEST_DATABASE_URL or local DATABASE_URL before running the PostgreSQL integration lane.");
}
let target;
try { target = new URL(connectionString); }
catch { throw new Error("The PostgreSQL integration database must be a valid PostgreSQL URL."); }
if (!["postgres:", "postgresql:"].includes(target.protocol) || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname)) {
  throw new Error("Refusing a nonlocal PostgreSQL integration database. This lane never writes production.");
}

const files = [
  "server/features/gameshow/service.test.ts",
  "server/features/gameshow/production.test.ts",
  "server/features/gameshow/provisioning.test.ts",
  "server/features/wtf-sites/private-pages.test.ts",
  "server/features/wtf-sites/private-admin-boundary.test.ts",
  "server/lib/backfill-manifest-bigint.test.ts",
];
console.log("[gameshow:postgres] Running local database, private HTTP/browser, and migration proofs.");
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root,
  env: { ...process.env, GAMESHOW_TEST_DATABASE_URL: connectionString, DATABASE_URL: connectionString },
  stdio: "inherit",
});
child.on("error", () => {
  console.error("[gameshow:postgres] Could not launch the integration test process.");
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) console.error(`[gameshow:postgres] Test process terminated by ${signal}.`);
  process.exit(code ?? 1);
});
