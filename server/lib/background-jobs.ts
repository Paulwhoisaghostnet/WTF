/**
 * Central entry for process-wide background jobs (production boot).
 * Phase 6 retired `token-sync.ts`; portfolio sync + scheduler jobs
 * register here.
 */

import { cleanupExpiredNonces } from "../auth/storage";
import { registerWalletSurveillance } from "./wallet-events";
import { registerMarketplaceVerifier } from "./marketplace-verifier";
import { registerEventsSyncQueue } from "./events-sync";
import { registerHoldingsDerive } from "./holdings-derive";
import { registerBalanceReconcile } from "./balance-reconcile";
import { registerContractMetadataSync } from "./contract-metadata-sync";
import { registerSupabaseBackup } from "./supabase-backup";
import { registerBackfillWorkers } from "./backfill-dispatcher";
import { runPortfolioSyncForAll } from "./portfolio-sync";
import { runTvCacheEviction } from "../routes/tv";
import { runRecaptureWatcher } from "./wtf-recapture-watcher";
import {
  register as registerJob,
  start as startScheduler,
  stop as stopScheduler,
} from "./scheduler";

const PORTFOLIO_SYNC_INTERVAL = 4 * 60 * 60 * 1000;
const NONCE_CLEANUP_INTERVAL = 60 * 60 * 1000;
const TV_CACHE_EVICT_INTERVAL = 60 * 60 * 1000;
const WTF_RECAPTURE_WATCHER_INTERVAL = 2 * 60 * 1000;

export function startBackgroundJobs(): void {
  console.log("[jobs] Registering background jobs with scheduler");

  registerJob({
    name: "portfolio-sync",
    fn: runPortfolioSyncForAll,
    intervalMs: PORTFOLIO_SYNC_INTERVAL,
  });

  registerJob({
    name: "nonce-cleanup",
    fn: async () => {
      await cleanupExpiredNonces();
    },
    intervalMs: NONCE_CLEANUP_INTERVAL,
  });

  // Hourly belt-and-braces TV cache eviction. `ensureMediaCached()`
  // already runs `cleanupTvCache()` opportunistically on every fetch,
  // but that only runs when the TV endpoints are receiving traffic.
  // This job guarantees the LRU budget is honored even during idle
  // windows and gives the cockpit a clean audit line per sweep.
  registerJob({
    name: "tv-cache-evict",
    fn: async () => {
      const result = await runTvCacheEviction();
      return {
        itemsIn: result.kept + result.removed,
        itemsOut: result.removed,
      };
    },
    intervalMs: TV_CACHE_EVICT_INTERVAL,
    initialDelayMs: 5 * 60 * 1000,
  });

  registerWalletSurveillance();
  registerMarketplaceVerifier();
  registerEventsSyncQueue();
  registerHoldingsDerive();
  registerBalanceReconcile();
  // Drains distinct contracts from wallet_holdings / wallet_events
  // into `contract_metadata` via TzKT every 15 min, 200 per tick,
  // with freshness refresh every 30 days.  First-run backfills the
  // full 4.7k-contract backlog over ~4 hours of ticks.
  registerContractMetadataSync();
  // Nightly off-site backup: pg_dump + upload to Supabase Storage.
  // Silently skipped when Supabase creds aren't configured.
  registerSupabaseBackup();

  // Manifest-driven backfill: seeders enumerate gaps in our data
  // (synthetic ophashes, missing sellers, XTZ-price holes, unlabeled
  // addresses, tokens with no active-listing snapshot, wallets with
  // stale cursors) and a dispatcher drains the queue against TzKT /
  // Objkt under the shared rate limiter.  Set BACKFILL_DISABLED=1 to
  // turn it off for debugging.
  registerBackfillWorkers();

  // Phase 10 — walk `wallet_events` forward-only and book every
  // inbound WTF transfer to the operator wallet into
  // `wtf_recapture_events`. Sources are tagged when we can infer
  // them (buyback swap / ante / side-quest entry fee / auction
  // settlement). No external calls — this runs entirely off our
  // existing TzKT surveillance.
  registerJob({
    name: "wtf-recapture-watcher",
    fn: async () => {
      const { scanned, inserted } = await runRecaptureWatcher();
      return { itemsIn: scanned, itemsOut: inserted };
    },
    intervalMs: WTF_RECAPTURE_WATCHER_INTERVAL,
    initialDelayMs: 30_000,
  });

  startScheduler();
}

export function stopBackgroundJobs(): void {
  stopScheduler();
  console.log("[jobs] Background intervals stopped");
}
