import { config as dotenvConfig } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL?.trim() ?? "";

if (!dbUrl) {
  throw new Error(
    "[db] Missing DATABASE_URL. Set a PostgreSQL connection string before starting the server."
  );
}

if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
  throw new Error(
    "[db] DATABASE_URL must be a PostgreSQL URI (postgresql://...)."
  );
}

export const pool = new Pool({
  connectionString: dbUrl,
  max: Math.max(1, Number(process.env.DATABASE_POOL_MAX ?? 15)),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
});

export const db = drizzle(pool, { schema });
