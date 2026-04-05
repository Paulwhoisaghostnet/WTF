import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL ?? "";
const supabaseTls =
  databaseUrl.includes("supabase") || databaseUrl.includes("pooler.supabase.com");

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    // Required for drizzle-kit push/pull against Supabase-managed Postgres
    ...(supabaseTls ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
