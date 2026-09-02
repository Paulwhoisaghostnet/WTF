#!/usr/bin/env node
/**
 * Build DATABASE_URL for Supabase-hosted Postgres without using the dashboard "Connection string" UI.
 *
 * The Management API never returns your database password — you must set it once:
 *   SUPABASE_DB_PASSWORD   (same as "Database password" in Project Settings → Database)
 *
 * Optional — fetch region for Transaction pooler URL (recommended for Netlify):
 *   SUPABASE_ACCESS_TOKEN  from https://supabase.com/dashboard/account/tokens
 *   Or run `supabase login` and pass token via env (CLI uses the same token for API calls).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='your-db-password' node scripts/resolve-database-url.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_DB_PASSWORD='...' node scripts/resolve-database-url.mjs
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env") });

const SUPABASE_API = "https://api.supabase.com/v1";

function parseRefFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function getRef() {
  return (
    process.env.SUPABASE_PROJECT_REF ||
    parseRefFromUrl(process.env.SUPABASE_URL) ||
    parseRefFromUrl(process.env.VITE_SUPABASE_URL)
  );
}

function tryReadCliToken() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const candidates = [
    join(home, ".supabase", "access-token"),
    join(home, ".config", "supabase", "access-token"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8").trim();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

async function fetchProjectRegion(ref, token) {
  const res = await fetch(`${SUPABASE_API}/projects/${ref}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.region || data.cloud_provider_region || null;
}

function buildUrls(ref, passwordEncoded, region) {
  const direct = `postgresql://postgres:${passwordEncoded}@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`;

  const pooler =
    region &&
    `postgresql://postgres.${ref}:${passwordEncoded}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=verify-full`;

  return { direct, pooler, region };
}

function redactDbUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "REDACTED";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const outputRaw = args.has("--raw");
  const ref = getRef();
  const password = process.env.SUPABASE_DB_PASSWORD;
  const token =
    process.env.SUPABASE_ACCESS_TOKEN || tryReadCliToken();

  if (!ref) {
    console.error(
      "Missing project ref. Set SUPABASE_URL (https://<ref>.supabase.co) or SUPABASE_PROJECT_REF."
    );
    process.exit(1);
  }
  if (!password) {
    console.error(
      "Missing SUPABASE_DB_PASSWORD.\n" +
        "This is the database password from Supabase → Project Settings → Database.\n" +
        "Reset it there if you never saved it — the API/CLI cannot recover it."
    );
    process.exit(1);
  }

  const passwordEncoded = encodeURIComponent(password);

  let region = process.env.SUPABASE_REGION || null;
  if (!region && token) {
    try {
      console.error("Fetching project region from Supabase Management API…");
      region = await fetchProjectRegion(ref, token);
    } catch (e) {
      console.error(String(e.message || e));
      console.error(
        "(Continuing without region — only the direct URL will be shown.)\n"
      );
    }
  }

  const { direct, pooler } = buildUrls(ref, passwordEncoded, region);
  const safeDirect = outputRaw ? direct : redactDbUrl(direct);
  const safePooler = pooler ? (outputRaw ? pooler : redactDbUrl(pooler)) : null;

  console.log("\n# Add to .env (pick ONE primary URL):\n");
  if (!outputRaw) {
    console.log(
      "# NOTE: password is redacted for safety. Re-run with --raw only on a trusted local machine."
    );
  }
  console.log("# --- Direct (port 5432): good for drizzle-kit push / local dev ---");
  console.log(`DATABASE_URL=${safeDirect}`);
  if (safePooler) {
    console.log("\n# --- Transaction pooler (port 6543): better for Netlify/serverless ---");
    console.log(`DATABASE_URL=${safePooler}`);
  } else {
    console.log(
      "\n# For Transaction pooler URL, set SUPABASE_ACCESS_TOKEN or run `supabase login`,\n# or set SUPABASE_REGION (e.g. us-east-1) and re-run."
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
