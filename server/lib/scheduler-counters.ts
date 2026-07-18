const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

/**
 * Keep best-effort scheduler audit counters representable by the
 * `sync_runs.items_in/items_out` PostgreSQL integer columns.
 *
 * Jobs can retain exact large measurements in cursor payloads; these columns
 * are intentionally bounded roll-up counters and must never prevent a run
 * from reaching its terminal audit state.
 */
export function normalizeSyncRunCounter(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(
    POSTGRES_INTEGER_MIN,
    Math.min(POSTGRES_INTEGER_MAX, Math.trunc(value)),
  );
}
