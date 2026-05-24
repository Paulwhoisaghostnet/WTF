/**
 * Premium WTF pinning worker — runs on schedule for eligible users only.
 * Pins are bounded per user via quota.ts; never pins entire platform wallets.
 */

import { db } from "../../db";
import { eq } from "drizzle-orm";
import { porcupinConnections } from "@shared/schema";
import { checkPorcupinPremiumEligibility } from "../porcupin/eligibility";
import { getUserQuotaBytes, recordPinBytes } from "./quota";

const MAX_PINS_PER_RUN = 5;

export async function runPorcupinPremiumPinningCycle(input: {
  userId: number;
  walletAddress: string;
  hasActiveDues: boolean;
  inventorySkus: string[];
  fetchWtfBalance: (address: string) => Promise<number>;
}) {
  const eligibility = await checkPorcupinPremiumEligibility(input);
  if (!eligibility.eligible) return { skipped: true, reason: eligibility.notes };

  const [conn] = await db
    .select()
    .from(porcupinConnections)
    .where(eq(porcupinConnections.userId, input.userId))
    .limit(1);

  if (!conn) return { skipped: true, reason: ["No Porcupin connection"] };

  const quota = await getUserQuotaBytes(input.userId);
  if (quota.usedBytes >= quota.maxBytes) {
    return { skipped: true, reason: ["Quota exceeded"] };
  }

  // Stub: enqueue pin jobs against user's remote Porcupin API
  const pinned = Math.min(MAX_PINS_PER_RUN, Math.floor((quota.maxBytes - quota.usedBytes) / 1_000_000));
  if (pinned > 0) {
    await recordPinBytes(input.userId, pinned * 1_000_000);
  }

  return { skipped: false, pinned, remoteUrl: conn.remoteUrl };
}
