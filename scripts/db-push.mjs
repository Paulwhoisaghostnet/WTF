#!/usr/bin/env node
/**
 * Wrapper around `drizzle-kit push` that:
 *   1. Loads .env
 *   2. Target selection:
 *        - default: use DATABASE_URL if set, else fall back to Supabase
 *        - --supabase flag or DB_TARGET=supabase env var: force Supabase
 *          resolution from SUPABASE_URL + SUPABASE_DB_PASSWORD
 *        - --local flag or DB_TARGET=local: require DATABASE_URL, no fallback
 *   3. Rewrites sslmode=require → sslmode=no-verify for any Supabase host
 *      (pg v8 treats sslmode=require as verify-full, which rejects
 *       Supabase's managed cert chain on most environments).
 *
 * Extra args pass through:  `npm run db:push -- --verbose`
 */

import { config } from "dotenv";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
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
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
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
  try {
    const res = await fetch(`${SUPABASE_API}/projects/${ref}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.region || data.cloud_provider_region || null;
  } catch {
    return null;
  }
}

async function resolveFromSupabase() {
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    parseRefFromUrl(process.env.SUPABASE_URL) ||
    parseRefFromUrl(process.env.VITE_SUPABASE_URL);
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) return null;

  const encoded = encodeURIComponent(password);
  let region = process.env.SUPABASE_REGION || null;
  if (!region) {
    const token =
      process.env.SUPABASE_ACCESS_TOKEN || tryReadCliToken();
    if (token) region = await fetchProjectRegion(ref, token);
  }

  if (region) {
    return `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=no-verify`;
  }
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres?sslmode=no-verify`;
}

function rewriteSsl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const host = u.hostname;
    const isSupabase =
      host.endsWith(".supabase.co") ||
      host.endsWith(".pooler.supabase.com");
    if (!isSupabase) return url;
    const before = u.searchParams.get("sslmode");
    if (before !== "no-verify") {
      u.searchParams.set("sslmode", "no-verify");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (name) => {
    const idx = argv.indexOf(name);
    if (idx !== -1) {
      argv.splice(idx, 1);
      return true;
    }
    return false;
  };
  const forceSupabase = hasFlag("--supabase");
  const forceLocal = hasFlag("--local");
  const target =
    (forceSupabase && "supabase") ||
    (forceLocal && "local") ||
    process.env.DB_TARGET ||
    "auto";

  let url = "";
  let source = "";

  if (target === "supabase") {
    url = (await resolveFromSupabase()) || "";
    source = "SUPABASE_* creds (forced)";
  } else if (target === "local") {
    url = process.env.DATABASE_URL?.trim() || "";
    source = "DATABASE_URL env var (forced)";
  } else {
    url = process.env.DATABASE_URL?.trim() || "";
    source = "DATABASE_URL env var";
    if (!url) {
      url = (await resolveFromSupabase()) || "";
      source = url ? "SUPABASE_* creds (fallback)" : "";
    }
  }

  if (!url) {
    console.error(
      "[db:push] Could not resolve a database URL.\n" +
        "        - target: " +
        target +
        "\n" +
        "        - for local: set DATABASE_URL in .env\n" +
        "        - for supabase: set SUPABASE_URL + SUPABASE_DB_PASSWORD"
    );
    process.exit(1);
  }

  const rewritten = rewriteSsl(url);
  if (rewritten !== url) {
    console.log(
      "[db:push] Rewrote sslmode → no-verify for Supabase host " +
        "(pg v8 strict sslmode workaround)."
    );
  }
  console.log(
    `[db:push] Target: ${target} · source: ${source} · url: ${redact(rewritten)}`
  );

  const child = spawn("npx", ["drizzle-kit", "push", ...argv], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: rewritten },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", (err) => {
    console.error("[db:push] failed to spawn drizzle-kit:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
