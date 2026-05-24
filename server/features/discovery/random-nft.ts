/**
 * Discovery: random-nft
 *
 * Returns a pseudo-random NFT from the holdings/token archive, sourced from
 * the database. Falls back to a curated seed when the pool is empty.
 */

import type { Pool } from "pg";
import { tzkt } from "../../lib/upstream";
import { createBoundedExpiringCache } from "../../lib/bounded-expiring-cache";

export interface RandomNftResult {
  contractAddress: string;
  tokenId: string;
  title: string | null;
  description: string | null;
  artifactUri: string | null;
  displayUri: string | null;
  creatorAddress: string | null;
  source: "db" | "tzkt" | "seed";
}

const discoveryCache = createBoundedExpiringCache<RandomNftResult>({ ttlMs: 5 * 60 * 1000, maxEntries: 50 });

const SEED_NFTS: Omit<RandomNftResult, "source">[] = [
  {
    contractAddress: "KT1Skullzarmy1111111111111111111111111111",
    tokenId: "0",
    title: "Skull #001",
    description: "Skullzarmy genesis token.",
    artifactUri: null,
    displayUri: null,
    creatorAddress: null,
  },
];

async function fetchNftFromTzKT(): Promise<RandomNftResult | null> {
  try {
    const tokens = await tzkt.getJson<Array<{
      contract?: { address?: string };
      tokenId?: string;
      metadata?: { name?: string; description?: string; artifactUri?: string; displayUri?: string };
      firstMinter?: { address?: string };
    }>>(
      "/tokens",
      { "metadata.name.null": "false", limit: "1", offset: String(Math.floor(Math.random() * 200)) }
    );
    if (tokens && tokens.length > 0) {
      const tok = tokens[0];
      const result: RandomNftResult = {
        contractAddress: tok.contract?.address ?? "",
        tokenId: tok.tokenId ?? "0",
        title: tok.metadata?.name ?? null,
        description: tok.metadata?.description ?? null,
        artifactUri: tok.metadata?.artifactUri ?? null,
        displayUri: tok.metadata?.displayUri ?? null,
        creatorAddress: tok.firstMinter?.address ?? null,
        source: "tzkt",
      };
      discoveryCache.set(`nft:${result.contractAddress}:${result.tokenId}`, result);
      return result;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getRandomNft(pool: Pool): Promise<RandomNftResult> {
  try {
    const result = await pool.query<{
      contract_address: string;
      token_id: string;
      title: string | null;
      description: string | null;
      artifact_uri: string | null;
      display_uri: string | null;
      creator_address: string | null;
    }>(
      `SELECT
         contract_address,
         token_id,
         title,
         description,
         artifact_uri,
         display_uri,
         creator_address
       FROM token_archive
       WHERE title IS NOT NULL
         AND (display_uri IS NOT NULL OR artifact_uri IS NOT NULL)
       ORDER BY RANDOM()
       LIMIT 1`
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        contractAddress: row.contract_address,
        tokenId: row.token_id,
        title: row.title,
        description: row.description,
        artifactUri: row.artifact_uri,
        displayUri: row.display_uri,
        creatorAddress: row.creator_address,
        source: "db",
      };
    }
  } catch {
    // swallow — try TzKT fallback
  }

  const tzktResult = await fetchNftFromTzKT();
  if (tzktResult) return tzktResult;

  const seed = SEED_NFTS[Math.floor(Math.random() * SEED_NFTS.length)];
  return { ...seed, source: "seed" };
}
