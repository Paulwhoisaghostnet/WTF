#!/usr/bin/env node

import { config } from "dotenv";
import { Client } from "pg";
import dns from "dns/promises";

config({ path: ".env" });

const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPgUrl = /^postgres(ql)?:\/\//i.test(dbUrl);

if (!dbUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

if (!isPgUrl) {
  console.error(
    "DATABASE_URL must be a PostgreSQL URI (postgresql://...). " +
      "Do not use https://<project-ref>.supabase.co here."
  );
  process.exit(1);
}

const parsed = new URL(dbUrl);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);
const dbName = parsed.pathname.replace(/^\//, "") || "postgres";
const isSupabaseHost =
  host.includes("supabase") || host.includes("pooler.supabase.com");
const allowInsecureDbTls = process.env.ALLOW_INSECURE_DB_TLS?.trim() === "1";
if (isSupabaseHost) {
  parsed.searchParams.set(
    "sslmode",
    allowInsecureDbTls ? "no-verify" : "verify-full"
  );
}
const normalizedDbUrl = isSupabaseHost ? parsed.toString() : dbUrl;

console.log(`Host: ${host}`);
console.log(`Port: ${port}`);
console.log(`Database: ${dbName}`);

try {
  const records = await dns.lookup(host, { all: true });
  const hasIpv4 = records.some((r) => r.family === 4);
  const hasIpv6 = records.some((r) => r.family === 6);
  console.log(
    `DNS: ${hasIpv4 ? "IPv4 " : ""}${hasIpv6 ? "IPv6" : ""}`.trim() ||
      "DNS: no records"
  );
  if (!hasIpv4 && hasIpv6) {
    console.warn(
      "Warning: host appears IPv6-only. If this environment lacks IPv6, use a Supabase pooler URL instead."
    );
  }
} catch {
  console.warn("DNS lookup failed; continuing with direct connection attempt.");
}

const client = new Client({
  connectionString: normalizedDbUrl,
  connectionTimeoutMillis: 10_000,
});

if (isSupabaseHost && allowInsecureDbTls) {
  console.warn(
    "Warning: ALLOW_INSECURE_DB_TLS=1 disables certificate verification for this connection attempt."
  );
}

try {
  await client.connect();
  const result = await client.query(
    "select current_database() as db, current_user as usr, now() as ts"
  );
  const row = result.rows[0];
  console.log("Connection OK.");
  console.log(`Connected DB: ${row.db}`);
  console.log(`Connected User: ${row.usr}`);
  process.exit(0);
} catch (err) {
  const code = err?.code ? ` [${err.code}]` : "";
  const msg = err?.message || String(err);
  console.error(`Connection failed${code}: ${msg}`);

  if (err?.code === "3D000") {
    console.error(
      "Hint: database name does not exist. Check the final '/postgres' (or your DB name) in DATABASE_URL."
    );
  } else if (err?.code === "28P01") {
    console.error("Hint: authentication failed. Verify username/password in DATABASE_URL.");
  } else if (/timeout|ETIMEDOUT|terminated/i.test(msg)) {
    console.error(
      "Hint: network timeout. If using Supabase direct host (db.<ref>.supabase.co), switch to Transaction pooler for serverless/IPv4 environments."
    );
  } else if (/Tenant or user not found/i.test(msg)) {
    console.error(
      "Hint: Supabase pooler username/region is wrong. Re-copy the exact pooler URI from Supabase Connect."
    );
  } else if (err?.code === "42P01") {
    console.error(
      "Hint: required tables are missing. Run `npm run db:push` against the correct database."
    );
  }

  process.exit(1);
} finally {
  try {
    await client.end();
  } catch {
    // ignore
  }
}
