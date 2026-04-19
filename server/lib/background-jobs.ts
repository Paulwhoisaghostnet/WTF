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
import { registerSupabaseBackup } from "./supabase-backup";
import { runPortfolioSyncForAll } from "./portfolio-sync";
import {
  register as registerJob,
  start as startScheduler,
  stop as stopScheduler,
} from "./scheduler";

const PORTFOLIO_SYNC_INTERVAL = 4 * 60 * 60 * 1000;
const NONCE_CLEANUP_INTERVAL = 60 * 60 * 1000;

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

  registerWalletSurveillance();
  registerMarketplaceVerifier();
  registerEventsSyncQueue();
  registerHoldingsDerive();
  registerBalanceReconcile();
  // Nightly off-site backup: pg_dump + upload to Supabase Storage.
  // Silently skipped when Supabase creds aren't configured.
  registerSupabaseBackup();

  startScheduler();
}

export function stopBackgroundJobs(): void {
  stopScheduler();
  console.log("[jobs] Background intervals stopped");
}
