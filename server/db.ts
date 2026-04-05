import { config as dotenvConfig } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
const hasValidPgProtocol = /^postgres(ql)?:\/\//i.test(dbUrl);
const isSupabaseHost =
  dbUrl.includes("supabase") || dbUrl.includes("pooler.supabase.com");

if (!dbUrl) {
  throw new Error(
    "[db] Missing DATABASE_URL. Set a PostgreSQL connection string before starting the server. " +
      "Run `npm run db:check` to validate connectivity."
  );
}

if (!hasValidPgProtocol) {
  throw new Error(
    "[db] DATABASE_URL must be a PostgreSQL URI (postgresql://...)." +
      " The https://...supabase.co project URL is not a database connection string."
  );
}

/**
 * Pool tuned for Supabase-hosted Postgres (TLS + sensible limits).
 * - Use Transaction pooler URI (port 6543) for Netlify/serverless.
 * - Lower DATABASE_POOL_MAX on serverless (e.g. 1–3) if you see connection exhaustion.
 */
export const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSupabaseHost ? { rejectUnauthorized: false } : undefined,
  max: Math.max(
    1,
    Number(process.env.DATABASE_POOL_MAX ?? (isSupabaseHost ? 10 : 15))
  ),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
});

export const db = drizzle(pool, { schema });
