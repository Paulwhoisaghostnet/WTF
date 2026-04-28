/**
 * One-off runner that applies the idempotent gameshow boot backfill
 * (everything in `server/lib/gameshow-boot-backfill.ts`) against whatever
 * database the current env points at. Used as a stand-in for
 * `drizzle-kit push` when drizzle-kit chokes on the existing BigInt
 * defaults (the DDL it would emit is already captured in the boot
 * backfill anyway — both paths materialise the same tables/enums/columns
 * with IF NOT EXISTS guards).
 *
 * Usage:
 *   npx tsx scripts/run-boot-backfill.ts            # uses DATABASE_URL
 *   npx tsx scripts/run-boot-backfill.ts --supabase # resolves Supabase creds
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

function allowInsecureDbTls() {
  return process.env.ALLOW_INSECURE_DB_TLS?.trim() === "1";
}

async function resolveSupabaseUrl() {
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    (process.env.SUPABASE_URL || "").match(
      /^https?:\/\/([a-z0-9]+)\.supabase\.co/i
    )?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) return null;
  const encoded = encodeURIComponent(password);
  const region = process.env.SUPABASE_REGION || "us-west-2";
  const sslmode = allowInsecureDbTls() ? "no-verify" : "require";
  return `postgresql://postgres.${ref}:${encoded}@aws-1-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=${sslmode}`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--supabase")) {
    if (allowInsecureDbTls()) {
      console.warn(
        "[boot-backfill] WARNING: ALLOW_INSECURE_DB_TLS=1 downgraded Supabase TLS verification to sslmode=no-verify."
      );
    }
    const url =
      process.env.SUPABASE_BACKUP_URL || (await resolveSupabaseUrl());
    if (!url) {
      console.error(
        "[boot-backfill] cannot resolve Supabase URL; set SUPABASE_BACKUP_URL or SUPABASE_URL + SUPABASE_DB_PASSWORD"
      );
      process.exit(1);
    }
    process.env.DATABASE_URL = url;
  }
  if (!process.env.DATABASE_URL) {
    console.error("[boot-backfill] DATABASE_URL is not set");
    process.exit(1);
  }
  const redacted = (() => {
    try {
      const u = new URL(process.env.DATABASE_URL!);
      if (u.password) u.password = "***";
      return u.toString();
    } catch {
      return "<unparseable>";
    }
  })();
  console.log(`[boot-backfill] target: ${redacted}`);

  // Dynamic import so we pick up the DATABASE_URL override.
  const { runGameshowBootBackfill } = await import(
    "../server/lib/gameshow-boot-backfill.ts"
  );
  await runGameshowBootBackfill();
  console.log("[boot-backfill] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
