import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL ?? "";
if (dbUrl && !/^postgres(ql)?:\/\//i.test(dbUrl)) {
  console.warn(
    "[db] DATABASE_URL should be a PostgreSQL URI (postgresql://...). " +
      "In Supabase, copy it from Project Settings → Database → Connection string → URI. " +
      "The https://...supabase.co project URL is not a database connection string."
  );
}

export const pool = new Pool({
  connectionString: dbUrl || undefined,
  // Supabase pooler + many cloud Postgres hosts require TLS
  ssl: dbUrl.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
