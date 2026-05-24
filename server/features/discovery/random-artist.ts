/**
 * Discovery: random-artist
 *
 * Returns a pseudo-random artist record sourced from the known-artists pool
 * stored in the database. Falls back to a curated Skullzarmy seed list when
 * the pool is empty so the endpoint always returns something useful.
 */

import type { Pool } from "pg";
import { tzkt } from "../../lib/upstream";
import { createBoundedExpiringCache } from "../../lib/bounded-expiring-cache";

export interface RandomArtistResult {
  address: string;
  domain: string | null;
  displayName: string | null;
  avatarUri: string | null;
  collectionCount: number;
  source: "db" | "tzkt" | "seed";
}

const discoveryCache = createBoundedExpiringCache<RandomArtistResult>({ ttlMs: 5 * 60 * 1000, maxEntries: 50 });

const SEED_ARTISTS: Omit<RandomArtistResult, "source">[] = [
  {
    address: "tz1Skullzarmy1111111111111111111111111111",
    domain: "skullzarmy.tez",
    displayName: "Skullzarmy",
    avatarUri: null,
    collectionCount: 0,
  },
];

async function fetchArtistFromTzKT(): Promise<RandomArtistResult | null> {
  try {
    const accounts = await tzkt.getJson<Array<{ address: string; alias?: string }>>(
      "/accounts",
      { type: "user", limit: "1", sort: "numTransactions", "sort.desc": undefined, offset: String(Math.floor(Math.random() * 200)) }
    );
    if (accounts && accounts.length > 0) {
      const acct = accounts[0];
      const result: RandomArtistResult = {
        address: acct.address,
        domain: null,
        displayName: acct.alias ?? null,
        avatarUri: null,
        collectionCount: 0,
        source: "tzkt",
      };
      discoveryCache.set(`artist:${acct.address}`, result);
      return result;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getRandomArtist(
  pool: Pool
): Promise<RandomArtistResult> {
  try {
    const result = await pool.query<{
      address: string;
      domain: string | null;
      display_name: string | null;
      avatar_uri: string | null;
      collection_count: string;
    }>(
      `SELECT
         w.address,
         w.domain,
         u.display_name,
         u.avatar_uri,
         COUNT(DISTINCT cc.id)::text AS collection_count
       FROM wallets w
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN collection_contracts cc ON cc.creator_address = w.address
       WHERE u.id IS NOT NULL
       GROUP BY w.address, w.domain, u.display_name, u.avatar_uri
       HAVING COUNT(DISTINCT cc.id) > 0
       ORDER BY RANDOM()
       LIMIT 1`
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        address: row.address,
        domain: row.domain,
        displayName: row.display_name,
        avatarUri: row.avatar_uri,
        collectionCount: Number(row.collection_count),
        source: "db",
      };
    }
  } catch {
    // swallow — try TzKT fallback
  }

  const tzktResult = await fetchArtistFromTzKT();
  if (tzktResult) return tzktResult;

  const seed = SEED_ARTISTS[Math.floor(Math.random() * SEED_ARTISTS.length)];
  return { ...seed, source: "seed" };
}
