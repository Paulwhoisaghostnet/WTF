/**
 * One-off: create or reset a host (admin) user. Requires DATABASE_URL in .env.
 *
 *   ADMIN_PASSWORD='your-password' npx tsx scripts/seed-admin.ts
 *
 * Optional: ADMIN_USERNAME (default: admin)
 */
import { config as dotenvConfig } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { hashPassword } from "../server/auth/passport";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (see .env)");
    process.exit(1);
  }
  if (!password) {
    console.error("Set ADMIN_PASSWORD (e.g. ADMIN_PASSWORD='...' npx tsx scripts/seed-admin.ts)");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "host",
        displayName: username,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));
    console.log(`Updated user "${username}" to role host and new password hash.`);
  } else {
    await db.insert(users).values({
      username,
      passwordHash,
      role: "host",
      displayName: username,
    });
    console.log(`Created host user "${username}".`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
