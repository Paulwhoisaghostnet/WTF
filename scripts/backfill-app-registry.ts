/**
 * Idempotent backfill for the wtfOS App Registry (Req1).
 *
 * Registers EVERY current app — the 20 desktop apps and the static creation
 * tools / packages / integration plugins — into app_registrations with computed
 * integrity fingerprints, preserving current enabled/disabled defaults, and
 * issues an operating key for each currently-enabled (published) builtin so that
 * flipping APP_REGISTRY_ENABLED on does not regress installability.
 *
 * Safe to run repeatedly. Requires DATABASE_URL in .env.
 *
 *   npx tsx scripts/backfill-app-registry.ts
 *   npm run app-registry:backfill
 */
import { config as dotenvConfig } from "dotenv";
import { runAppRegistryBackfill } from "../server/features/app-registry/backfill";

dotenvConfig({ path: ".env" });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (see .env)");
    process.exit(1);
  }
  const summary = await runAppRegistryBackfill();
  console.log("[app-registry] backfill complete:");
  console.log(`  scanned:    ${summary.scanned}`);
  console.log(`  inserted:   ${summary.inserted}`);
  console.log(`  skipped:    ${summary.skipped} (already registered)`);
  console.log(`  keysIssued: ${summary.keysIssued}`);
  if (summary.insertedAppIds.length > 0) {
    console.log(`  new apps:   ${summary.insertedAppIds.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[app-registry] backfill failed:", err);
    process.exit(1);
  });
