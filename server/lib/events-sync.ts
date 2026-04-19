/**
 * events-sync: the queue drainer.
 *
 * Reads pending entries from `indexing_queue`, calls the existing
 * `runWalletBackfill` (or a no-op stub for contract entries, until
 * contract indexing ships), and marks the row done/error.
 *
 * By design, this job is ADDITIVE to the existing wallet-events
 * global + safety sweeps.  It exists so that:
 *
 *   1. Login-triggered backfills that fail once still retry on the
 *      next queue tick (without the caller re-wiring anything).
 *   2. The cockpit "Sync now" button has a durable surface to target
 *      instead of firing off an async call that may be lost to a
 *      restart.
 *   3. Counterparty-discovery (phase 4+) has a place to enqueue
 *      newly-seen wallet addresses for follow-up indexing.
 *
 * Removing this file + the scheduler registration reverts WTF to
 * purely the existing setInterval-driven surveillance.
 */

import { runWalletBackfill } from "./wallet-events";
import {
  claim,
  markError,
  markSuccess,
  reclaimStuck,
} from "./indexing-queue";
import { register as registerJob } from "./scheduler";

const QUEUE_TICK_MS = 60_000; // drain up to 5 items every minute
const BATCH_SIZE = 5;

/**
 * Claim and process up to BATCH_SIZE queue entries.  Reclaims anything
 * stuck in `processing` for more than 10 minutes first, so a crashed
 * worker doesn't permanently park an item.
 */
export async function runEventsSyncQueue(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  await reclaimStuck();
  const items = await claim(BATCH_SIZE);
  let ok = 0;
  for (const item of items) {
    try {
      if (item.targetKind === "wallet") {
        await runWalletBackfill(item.target, {
          reason: item.reason ?? "queue",
        });
      } else {
        // Contract-indexing lands in a later phase; mark done so the
        // entry doesn't clog the queue.
        console.log(
          `[events-sync] contract indexing not implemented yet; skipping ${item.target}`
        );
      }
      await markSuccess(item.id);
      ok++;
    } catch (err) {
      console.error(
        `[events-sync] failed to process queue item ${item.id} (${item.target}):`,
        err
      );
      await markError(item.id, err);
    }
  }
  return { itemsIn: items.length, itemsOut: ok };
}

export function registerEventsSyncQueue(): void {
  registerJob({
    name: "events-sync-queue",
    fn: runEventsSyncQueue,
    intervalMs: QUEUE_TICK_MS,
  });
}
