import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL ?? "";
const isSupabaseHost =
  dbUrl.includes("supabase") || dbUrl.includes("pooler.supabase.com");

if (dbUrl && !/^postgres(ql)?:\/\//i.test(dbUrl)) {
  console.warn(
    "[db] DATABASE_URL should be a PostgreSQL URI (postgresql://...). " +
      "In Supabase, copy it from Project Settings → Database → Connection string → URI. " +
      "The https://...supabase.co project URL is not a database connection string."
  );
}

/**
 * Pool tuned for Supabase-hosted Postgres (TLS + sensible limits).
 * - Use Transaction pooler URI (port 6543) for Netlify/serverless.
 * - Lower DATABASE_POOL_MAX on serverless (e.g. 1–3) if you see connection exhaustion.
 */
export const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: isSupabaseHost ? { rejectUnauthorized: false } : undefined,
  max: Math.max(
    1,
    Number(process.env.DATABASE_POOL_MAX ?? (isSupabaseHost ? 10 : 15))
  ),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
});

export const db = drizzle(pool, { schema });
