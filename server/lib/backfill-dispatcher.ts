/**
 * Backfill dispatcher — the worker that drains the manifest queue.
 *
 * Every tick (scheduler-driven, ~30 s) it:
 *
 *   1. Rescues any row stuck in `in_progress` longer than 10 min.
 *   2. Claims up to `BATCH_SIZE` pending rows whose `next_attempt_at`
 *      has elapsed, ordered by (priority ASC, created_at ASC).
 *   3. Runs the matching handler concurrently (bounded by
 *      `HANDLER_CONCURRENCY`) so a slow task can't block a fast one.
 *   4. Commits each result (completed | retrying | failed).
 *
 * The handlers themselves serialise upstream calls through the
 * shared rate-limited `UpstreamClient` in `upstream.ts`, so even if
 * the dispatcher runs N handlers in parallel, TzKT and Objkt still
 * see a bounded request rate.
 *
 * A separate low-cadence tick runs every 15 min to re-seed the
 * manifest.  See `backfill-seeders.ts`.
 *
 * The dispatcher registers with the scheduler, meaning every tick is
 * logged to `sync_runs` and appears in `/api/cockpit/sync/status`.
 */

import {
  claim,
  complete,
  fail,
  rescueStuck,
  stats,
  type BackfillRow,
  type BackfillTaskType,
} from "./backfill-manifest";
import { HANDLERS } from "./backfill-handlers";
import { runAllSeeders } from "./backfill-seeders";
import { register as registerJob, type JobResult } from "./scheduler";

/** How many rows to claim per dispatcher tick. */
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 24);

/** How many handlers to run concurrently within a batch. */
const HANDLER_CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 6);

/** How often the dispatcher fires.  30 s keeps the queue warm without
 *  spamming logs during quiet periods. */
const DISPATCHER_INTERVAL_MS = Number(
  process.env.BACKFILL_DISPATCHER_INTERVAL_MS ?? 30 * 1000
);

/** How often seeders run.  15 min is plenty — they're heavy SQL. */
const SEEDER_INTERVAL_MS = Number(
  process.env.BACKFILL_SEEDER_INTERVAL_MS ?? 15 * 60 * 1000
);

/** How long a row can be `in_progress` before we consider it stuck. */
const STUCK_MS = Number(process.env.BACKFILL_STUCK_MS ?? 10 * 60 * 1000);

/** Global kill-switch.  Set `BACKFILL_DISABLED=1` in env to turn it off. */
function isDisabled(): boolean {
  const v = process.env.BACKFILL_DISABLED;
  return v === "1" || v === "true" || v === "yes";
}

/** Expose the current config for logging / admin endpoint. */
export function dispatcherConfig() {
  return {
    batchSize: BATCH_SIZE,
    handlerConcurrency: HANDLER_CONCURRENCY,
    dispatcherIntervalMs: DISPATCHER_INTERVAL_MS,
    seederIntervalMs: SEEDER_INTERVAL_MS,
    stuckMs: STUCK_MS,
    disabled: isDisabled(),
  };
}

/* ----------------------------------------------------------------------- */
/* Worker bodies                                                             */
/* ----------------------------------------------------------------------- */

/** Run N handlers in parallel with a simple worker pool. */
async function runBatch(rows: BackfillRow[]): Promise<{
  ok: number;
  failed: number;
  skipped: number;
  byType: Record<string, number>;
}> {
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.taskType] = (byType[r.taskType] ?? 0) + 1;

  let idx = 0;
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  async function worker(): Promise<void> {
    while (idx < rows.length) {
      const mine = rows[idx++];
      if (!mine) return;
      const handler = HANDLERS[mine.taskType as BackfillTaskType];
      if (!handler) {
        await fail({
          id: mine.id,
          error: `no handler for task_type=${mine.taskType}`,
          currentAttempts: mine.attempts,
          maxAttempts: mine.maxAttempts,
        });
        failed += 1;
        continue;
      }
      try {
        await handler(mine);
        const completed = await complete(mine.id);
        if (completed) ok += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        await fail({
          id: mine.id,
          error: err,
          currentAttempts: mine.attempts,
          maxAttempts: mine.maxAttempts,
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(HANDLER_CONCURRENCY, rows.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { ok, failed, skipped, byType };
}

/** One dispatcher tick. */
async function dispatcherTick(): Promise<JobResult> {
  if (isDisabled()) {
    return { itemsIn: 0, itemsOut: 0 };
  }

  const rescued = await rescueStuck(STUCK_MS);
  if (rescued > 0) {
    console.log(`[backfill] rescued ${rescued} stuck rows`);
  }

  const rows = await claim({ limit: BATCH_SIZE });
  if (rows.length === 0) {
    return { itemsIn: 0, itemsOut: 0 };
  }

  const res = await runBatch(rows);
  console.log(
    `[backfill] tick: ok=${res.ok} failed=${res.failed} types=${JSON.stringify(
      res.byType
    )}`
  );

  return { itemsIn: rows.length, itemsOut: res.ok };
}

/** One seeder tick. */
async function seederTick(): Promise<JobResult> {
  if (isDisabled()) {
    return { itemsIn: 0, itemsOut: 0 };
  }
  const r = await runAllSeeders();
  console.log(
    `[backfill:seeders] seeded ${r.totalEnqueued} rows in ${r.elapsedMs}ms: ${r.seeded
      .map((s) => `${s.name}=${s.enqueued}/${s.candidates}`)
      .join(" ")}`
  );
  return {
    itemsIn: r.seeded.reduce((a, b) => a + b.candidates, 0),
    itemsOut: r.totalEnqueued,
  };
}

/** One-off stats log so operators can see the manifest shape. */
async function logStats(): Promise<void> {
  try {
    const s = await stats();
    const byType = s.byTaskType
      .map(
        (t) =>
          `${t.taskType}[p=${t.pending} i=${t.inProgress} c=${t.completed} f=${t.failed} s=${t.skipped}]`
      )
      .join(" ");
    console.log(
      `[backfill] manifest stats: total=${s.total} ${byType} oldest_pending=${
        s.oldestPendingAt?.toISOString() ?? "-"
      }`
    );
  } catch (err) {
    console.warn("[backfill] stats failed:", err);
  }
}

/* ----------------------------------------------------------------------- */
/* Registration                                                              */
/* ----------------------------------------------------------------------- */

/**
 * Wire the dispatcher + seeder into the scheduler.  Call once at boot
 * from `background-jobs.ts`.  Safe to call more than once: scheduler
 * `register()` replaces prior registrations.
 *
 * Seeder runs first on boot (initialDelayMs = 5s) so the dispatcher
 * has rows to chew on.  Dispatcher fires 15s after that.
 */
export function registerBackfillWorkers(): void {
  if (isDisabled()) {
    console.log(
      "[backfill] BACKFILL_DISABLED set — seeder+dispatcher not scheduled"
    );
    return;
  }

  registerJob({
    name: "backfill-seeder",
    fn: seederTick,
    intervalMs: SEEDER_INTERVAL_MS,
    initialDelayMs: 5_000,
    scope: "backfill",
  });

  registerJob({
    name: "backfill-dispatcher",
    fn: dispatcherTick,
    intervalMs: DISPATCHER_INTERVAL_MS,
    initialDelayMs: 20_000,
    scope: "backfill",
  });

  // Low-noise stats line every 5 minutes — shows up in docker logs
  // alongside the per-tick summaries and gives a good at-a-glance of
  // manifest progress without needing the admin endpoint.
  registerJob({
    name: "backfill-stats",
    fn: async () => {
      await logStats();
      return {};
    },
    intervalMs: 5 * 60 * 1000,
    initialDelayMs: 2 * 60 * 1000,
    scope: "backfill",
  });

  console.log(
    `[backfill] registered workers: seeder@${Math.round(
      SEEDER_INTERVAL_MS / 1000
    )}s dispatcher@${Math.round(
      DISPATCHER_INTERVAL_MS / 1000
    )}s concurrency=${HANDLER_CONCURRENCY} batch=${BATCH_SIZE}`
  );
}
