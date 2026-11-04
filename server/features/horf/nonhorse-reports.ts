import { horfTokenNonhorseDecisions } from "@shared/schema";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../db";

export interface ExactHorseTokenKey { contract: string; tokenId: string }

export function horseTokenKey(contract: string, tokenId: string): string {
  return `${contract}/${tokenId}`;
}

/** Return only Marshal-confirmed non-horses, keyed by exact FA2 token. */
export async function excludedHorseTokenKeys(keys: readonly ExactHorseTokenKey[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const unique = [...new Map(keys.map((key) => [horseTokenKey(key.contract, key.tokenId), key])).values()];
  const rows = await db.select({ contract: horfTokenNonhorseDecisions.tokenContract,
    tokenId: horfTokenNonhorseDecisions.tokenId })
    .from(horfTokenNonhorseDecisions).where(and(eq(horfTokenNonhorseDecisions.active, true),
      or(...unique.map((key) => and(eq(horfTokenNonhorseDecisions.tokenContract, key.contract),
        eq(horfTokenNonhorseDecisions.tokenId, key.tokenId))))));
  return new Set(rows.map((row) => horseTokenKey(row.contract, row.tokenId)));
}

export async function isExcludedHorseToken(contract: string, tokenId: string): Promise<boolean> {
  const [row] = await db.select({ tokenId: horfTokenNonhorseDecisions.tokenId })
    .from(horfTokenNonhorseDecisions).where(and(eq(horfTokenNonhorseDecisions.tokenContract, contract),
      eq(horfTokenNonhorseDecisions.tokenId, tokenId), eq(horfTokenNonhorseDecisions.active, true))).limit(1);
  return !!row;
}
