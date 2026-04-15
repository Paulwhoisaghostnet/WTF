import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
