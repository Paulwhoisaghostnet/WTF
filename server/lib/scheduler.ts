/**
 * Cockpit scheduler.
 *
 * Single source of truth for all background jobs on the server.  Wraps
 * `setInterval` so that every run is:
 *
 *   - logged to the `sync_runs` table (status, duration, errors, cursor
 *     deltas), giving us a queryable audit trail in place of scattered
 *     `console.log` lines,
 *   - serialized per job: if a run is still in-flight when the next
 *     tick fires, the tick is skipped instead of stacking a second run,
 *   - observable: the `/api/cockpit/sync/status` endpoint reads the
 *     latest row per `jobName`.
 *
 * This module is ADDITIVE.  It wraps existing job bodies unchanged; it
 * does not replace them.  Removing it re-exposes the original
 * `setInterval` loops (see `_cockpit_backup/<ts>/` for originals).
 */

import { db } from "../db";
import { syncRuns } from "@shared/schema";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { logSystemEvent } from "./system-log";

export type JobResult = {
  itemsIn?: number;
  itemsOut?: number;
  cursorBefore?: unknown;
  cursorAfter?: unknown;
};

export type JobFn = () => Promise<JobResult | void>;

type Registered = {
  name: string;
  fn: JobFn;
  intervalMs: number;
  initialDelayMs: number;
  scope?: string;
  timer: ReturnType<typeof setInterval> | null;
  initialTimer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastStartedAt: Date | null;
  nextRunAt: Date | null;
  skipInitialRun: boolean;
};

const registry = new Map<string, Registered>();
let schedulerStarted = false;

const DEFAULT_ABANDONED_RUN_MS = 15 * 60 * 1000;

function abandonedRunMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.WTF_SCHEDULER_STALE_RUN_MS);
  if (!Number.isFinite(configured) || configured < 60_000) {
    return DEFAULT_ABANDONED_RUN_MS;
  }
  return Math.min(configured, 7 * 24 * 60 * 60 * 1000);
}

/**
 * Close durable `running` rows left behind by an unclean process exit.
 * This is called once, before this process arms any jobs, so no live run can
 * be mistaken for an abandoned one.
 */
export async function reconcileAbandonedRuns(
  now = new Date(),
  staleAfterMs = abandonedRunMs(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const rows = await db
    .update(syncRuns)
    .set({
      status: "error",
      finishedAt: now,
      durationMs: sql<number>`GREATEST(0, EXTRACT(EPOCH FROM (${now} - ${syncRuns.startedAt})) * 1000)::integer`,
      error: "abandoned by process restart",
    })
    .where(
      and(
        eq(syncRuns.status, "running"),
        isNull(syncRuns.finishedAt),
        lte(syncRuns.startedAt, cutoff),
      ),
    )
    .returning({ id: syncRuns.id });

  if (rows.length > 0) {
    console.warn(`[scheduler] reconciled ${rows.length} abandoned durable run(s)`);
  }
  return rows.length;
}

/**
 * Persist a sync_runs row with `status=running` and return its id.
 * Never throws — a DB outage during audit writes must not kill the job.
 */
async function recordStart(
  jobName: string,
  scope?: string,
  cursorBefore?: unknown
): Promise<number | null> {
  try {
    const [row] = await db
      .insert(syncRuns)
      .values({
        jobName,
        scope: scope ?? null,
        status: "running",
        cursorBefore: (cursorBefore ?? null) as any,
      })
      .returning({ id: syncRuns.id });
    return row?.id ?? null;
  } catch (err) {
    console.warn(`[scheduler] recordStart(${jobName}) failed:`, err);
    return null;
  }
}

async function recordFinish(
  id: number | null,
  opts: {
    status: "success" | "error" | "skipped";
    startedAt: Date;
    error?: unknown;
    result?: JobResult;
  }
): Promise<void> {
  if (id == null) return;
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - opts.startedAt.getTime();
  try {
    await db
      .update(syncRuns)
      .set({
        status: opts.status,
        finishedAt,
        durationMs,
        itemsIn: opts.result?.itemsIn ?? 0,
        itemsOut: opts.result?.itemsOut ?? 0,
        error: opts.error
          ? String(
              opts.error instanceof Error
                ? opts.error.stack ?? opts.error.message
                : opts.error
            ).slice(0, 4000)
          : null,
        cursorAfter: (opts.result?.cursorAfter ?? null) as any,
      })
      .where(eq(syncRuns.id, id));
  } catch (err) {
    console.warn(`[scheduler] recordFinish(${id}) failed:`, err);
  }
}

/**
 * Execute a registered job body once.  If a run is already in flight
 * for this job, records a `skipped` sync_runs row and returns early.
 */
export async function runJob(name: string): Promise<void> {
  const job = registry.get(name);
  if (!job) {
    console.warn(`[scheduler] runJob(${name}): not registered`);
    logSystemEvent({
      source: "scheduler",
      eventType: "job_missing",
      severity: "warn",
      message: `Scheduler job not registered: ${name}`,
      metadata: { jobName: name },
    });
    return;
  }
  if (job.running) {
    const startedAt = new Date();
    const id = await recordStart(name, job.scope);
    await recordFinish(id, {
      status: "skipped",
      startedAt,
      error: "previous run still in flight",
    });
    logSystemEvent({
      source: "scheduler",
      eventType: "job_skipped",
      severity: "warn",
      message: `Scheduler job skipped because prior run is still active: ${name}`,
      metadata: { jobName: name, scope: job.scope, syncRunId: id },
    });
    return;
  }
  job.running = true;
  job.lastStartedAt = new Date();
  const startedAt = job.lastStartedAt;
  const id = await recordStart(name, job.scope);
  logSystemEvent({
    source: "scheduler",
    eventType: "job_started",
    severity: "info",
    message: `Scheduler job started: ${name}`,
    metadata: { jobName: name, scope: job.scope, syncRunId: id },
  });
  try {
    const result = (await job.fn()) ?? undefined;
    await recordFinish(id, { status: "success", startedAt, result });
    logSystemEvent({
      source: "scheduler",
      eventType: "job_succeeded",
      severity: "info",
      message: `Scheduler job succeeded: ${name}`,
      durationMs: Date.now() - startedAt.getTime(),
      metadata: { jobName: name, scope: job.scope, syncRunId: id, result },
    });
  } catch (err) {
    console.error(`[scheduler] job ${name} failed:`, err);
    await recordFinish(id, { status: "error", startedAt, error: err });
    logSystemEvent({
      source: "scheduler",
      eventType: "job_failed",
      severity: "error",
      message: `Scheduler job failed: ${name}`,
      durationMs: Date.now() - startedAt.getTime(),
      metadata: { jobName: name, scope: job.scope, syncRunId: id },
      error: err,
    });
  } finally {
    job.running = false;
  }
}

export type RegisterOptions = {
  /** Unique name; used for sync_runs.job_name. */
  name: string;
  /** Body of the job.  Should be safe to re-run; should not throw stray. */
  fn: JobFn;
  /** Period in ms.  Set to 0 to disable scheduling (on-demand only). */
  intervalMs: number;
  /**
   * Optional delay before the first tick fires.  Default is 0, which
   * runs immediately on registration.  Pass something > 0 to stagger
   * concurrent jobs at boot.
   */
  initialDelayMs?: number;
  /** Optional scope string stamped on every sync_runs row. */
  scope?: string;
  /**
   * If true, do not run the job immediately on start.  Only the
   * timer-driven cadence runs.
   */
  skipInitialRun?: boolean;
};

/**
 * Register a job and, when `start()` is called, begin scheduling it.
 * Safe to call multiple times — duplicate names replace the previous
 * registration (after stopping its timers).
 */
export function register(opts: RegisterOptions): void {
  const existing = registry.get(opts.name);
  if (existing) {
    if (existing.timer) clearInterval(existing.timer);
    if (existing.initialTimer) clearTimeout(existing.initialTimer);
  }
  registry.set(opts.name, {
    name: opts.name,
    fn: opts.fn,
    intervalMs: opts.intervalMs,
    initialDelayMs: opts.initialDelayMs ?? 0,
    scope: opts.scope,
    timer: null,
    initialTimer: null,
    running: false,
    lastStartedAt: null,
    nextRunAt: null,
    skipInitialRun: opts.skipInitialRun === true,
  });
}

/**
 * Start every registered job.  Each job runs once immediately (unless
 * `skipInitialRun`), then every `intervalMs` ms.  Jobs with
 * `intervalMs === 0` only run on-demand via `runJob(name)`.
 */
export function start(): void {
  if (schedulerStarted) {
    console.warn("[scheduler] start() ignored; scheduler is already running");
    return;
  }
  schedulerStarted = true;

  for (const job of registry.values()) {
    if (job.intervalMs <= 0) continue;
    const kickoff = () => {
      job.nextRunAt = new Date(Date.now() + job.intervalMs);
      runJob(job.name).catch((err) =>
        console.error(`[scheduler] ${job.name} crashed:`, err)
      );
    };
    const armInterval = () => {
      if (job.skipInitialRun) {
        job.nextRunAt = new Date(Date.now() + job.intervalMs);
      } else {
        kickoff();
      }
      job.timer = setInterval(kickoff, job.intervalMs);
    };
    if (job.initialDelayMs > 0) {
      job.nextRunAt = new Date(Date.now() + job.initialDelayMs);
      job.initialTimer = setTimeout(() => {
        job.initialTimer = null;
        armInterval();
      }, job.initialDelayMs);
    } else {
      armInterval();
    }
  }
  const rows = Array.from(registry.values())
    .map(
      (j) =>
        `${j.name}@${
          j.intervalMs > 0 ? `${Math.round(j.intervalMs / 1000)}s` : "on-demand"
        }`
    )
    .join(", ");
  console.log(`[scheduler] started: ${rows || "(no jobs registered)"}`);
}

/** Stop every registered job.  Safe to call multiple times. */
export function stop(): void {
  for (const job of registry.values()) {
    if (job.timer) clearInterval(job.timer);
    if (job.initialTimer) clearTimeout(job.initialTimer);
    job.timer = null;
    job.initialTimer = null;
    job.nextRunAt = null;
  }
  schedulerStarted = false;
  console.log("[scheduler] stopped");
}

/** List every registered job.  Used by the cockpit status endpoint. */
export function listJobs(): Array<{
  name: string;
  intervalMs: number;
  running: boolean;
  lastStartedAt: Date | null;
  nextRunAt: Date | null;
}> {
  return Array.from(registry.values()).map((j) => ({
    name: j.name,
    intervalMs: j.intervalMs,
    running: j.running,
    lastStartedAt: j.lastStartedAt,
    nextRunAt: j.nextRunAt,
  }));
}

/**
 * Rollup: latest finished run per job.  Feeds the Sync tab in the
 * cockpit.  Uses a single SQL query with DISTINCT ON — cheap even
 * on a million-row sync_runs table.
 */
export async function latestPerJob(): Promise<
  Array<{
    jobName: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    itemsIn: number;
    itemsOut: number;
    error: string | null;
  }>
> {
  const jobNames = Array.from(registry.keys()).sort();
  if (jobNames.length === 0) return [];
  const registeredJobs = sql.join(jobNames.map((name) => sql`(${name})`), sql`, `);
  const result = (await db.execute(sql`
    WITH registered(job_name) AS (
      VALUES ${registeredJobs}
    )
    SELECT
      registered.job_name,
      latest.status,
      latest.started_at,
      latest.finished_at,
      latest.duration_ms,
      latest.items_in,
      latest.items_out,
      latest.error
    FROM registered
    LEFT JOIN LATERAL (
      SELECT
        status,
        started_at,
        finished_at,
        duration_ms,
        items_in,
        items_out,
        error
      FROM sync_runs
      WHERE sync_runs.job_name = registered.job_name
      ORDER BY started_at DESC
      LIMIT 1
    ) latest ON true
    WHERE latest.started_at IS NOT NULL
    ORDER BY registered.job_name
  `)) as any;
  const raw: any[] = result?.rows ?? (Array.isArray(result) ? result : []);
  return raw.map((r) => ({
    jobName: r.job_name,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    itemsIn: r.items_in,
    itemsOut: r.items_out,
    error: r.error,
  }));
}

/**
 * Recent runs for one job.  Feeds the per-job drilldown.
 */
export async function recentRuns(jobName: string, limit = 50) {
  return db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.jobName, jobName))
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);
}
