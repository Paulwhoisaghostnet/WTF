/**
 * Discovery: spotlight-scheduler
 *
 * Tracks the current "spotlight" artist/NFT that rotates on a configurable
 * cadence. The scheduler stores its state purely in memory — a full restart
 * picks a new spotlight automatically, which is intentional.
 *
 * The cadence is controlled by DISCOVERY_SPOTLIGHT_INTERVAL_MS (default 1 h).
 */

import type { Pool } from "pg";
import { getRandomArtist, type RandomArtistResult } from "./random-artist";
import { getRandomNft, type RandomNftResult } from "./random-nft";

export interface SpotlightState {
  artist: RandomArtistResult | null;
  nft: RandomNftResult | null;
  refreshedAt: string;
  intervalMs: number;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

let state: SpotlightState = {
  artist: null,
  nft: null,
  refreshedAt: new Date(0).toISOString(),
  intervalMs: DEFAULT_INTERVAL_MS,
};

let pool: Pool | null = null;

export function initSpotlightScheduler(dbPool: Pool): void {
  pool = dbPool;
  void refreshSpotlight();
}

export async function refreshSpotlight(): Promise<void> {
  if (!pool) return;
  const intervalMs =
    Number(process.env.DISCOVERY_SPOTLIGHT_INTERVAL_MS ?? 0) ||
    DEFAULT_INTERVAL_MS;

  try {
    const [artist, nft] = await Promise.all([
      getRandomArtist(pool),
      getRandomNft(pool),
    ]);
    state = {
      artist,
      nft,
      refreshedAt: new Date().toISOString(),
      intervalMs,
    };
  } catch (err) {
    console.error("[discovery] spotlight refresh failed:", err);
  }

  setTimeout(() => {
    void refreshSpotlight();
  }, state.intervalMs);
}

export function getSpotlight(): SpotlightState {
  return state;
}
