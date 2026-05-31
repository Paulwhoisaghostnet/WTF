import { count, eq } from "drizzle-orm";
import { crpAppviewNominationCredits } from "@shared/schema";
import { db } from "../../db";

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

/** Record one anonymous nomination credit (no nominee/category/timestamp stored). */
export async function recordAnonymousNominationCredit(userId: number): Promise<void> {
  try {
    await db.insert(crpAppviewNominationCredits).values({ userId });
  } catch (err) {
    if (missingRelation(err)) return;
    throw err;
  }
}

/** Count anonymous nomination credits for reward eligibility. */
export async function countAnonymousNominationCredits(userId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ value: count() })
      .from(crpAppviewNominationCredits)
      .where(eq(crpAppviewNominationCredits.userId, userId));
    return Number(row?.value ?? 0);
  } catch (err) {
    if (missingRelation(err)) return 0;
    throw err;
  }
}
