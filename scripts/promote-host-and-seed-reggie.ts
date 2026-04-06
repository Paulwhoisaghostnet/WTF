/**
 * One-off: promote main account to host + ensure witness test user "reggie".
 *
 *   npx tsx scripts/promote-host-and-seed-reggie.ts
 *
 * Optional env:
 *   HOST_USERNAME=paulwhoisaghost   (default: paulwhoisaghost)
 *   REGGIE_PASSWORD=...             (default: FuckAroundFindOut)
 */
import { config as dotenvConfig } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { hashPassword } from "../server/auth/passport";

dotenvConfig({ path: ".env.public" });
dotenvConfig({ path: ".env" });

const HOST_USERNAME = (
  process.env.HOST_USERNAME ?? "paulwhoisaghost"
).trim().toLowerCase();
const REGGIE_PASSWORD =
  process.env.REGGIE_PASSWORD ?? "FuckAroundFindOut";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const hostRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, HOST_USERNAME));
  if (hostRows.length === 0) {
    console.error(`No user with username "${HOST_USERNAME}". Set HOST_USERNAME.`);
    process.exit(1);
  }
  await db
    .update(users)
    .set({ role: "host", updatedAt: new Date() })
    .where(eq(users.id, hostRows[0].id));
  console.log(`Role host → ${HOST_USERNAME} (id ${hostRows[0].id})`);

  const reggieHash = await hashPassword(REGGIE_PASSWORD);
  const reggieRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "reggie"));

  if (reggieRows.length > 0) {
    await db
      .update(users)
      .set({
        passwordHash: reggieHash,
        role: "witness",
        displayName: "reggie",
        updatedAt: new Date(),
      })
      .where(eq(users.id, reggieRows[0].id));
    console.log(`Updated reggie (witness, password reset)`);
  } else {
    await db.insert(users).values({
      username: "reggie",
      passwordHash: reggieHash,
      role: "witness",
      displayName: "reggie",
    });
    console.log(`Created reggie (witness)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
