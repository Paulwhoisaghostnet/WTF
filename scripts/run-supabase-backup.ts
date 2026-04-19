/**
 * One-shot off-site backup trigger.  Bypasses the scheduler registry
 * (which is only populated inside the long-running server process) and
 * invokes `runSupabaseBackup` directly.  Intended for manual dispatch
 * from a GitHub Actions workflow or `docker compose exec` so we don't
 * have to wait up to 24 h for the nightly run.
 *
 * Safety:
 *   - Read from env only; no CLI args.
 *   - Exits non-zero only on genuine failure.  Plan-size errors are
 *     now folded into a successful result (offsiteSkipped=true), so a
 *     free-tier Supabase will still exit 0 and just log a warning.
 *
 * Usage (inside the app container):
 *   node --import tsx/esm scripts/run-supabase-backup.ts
 */
import { runSupabaseBackup } from "../server/lib/supabase-backup";

async function main(): Promise<void> {
  const started = Date.now();
  console.log("[run-supabase-backup] starting…");
  try {
    const result = await runSupabaseBackup();
    const ms = Date.now() - started;
    console.log(
      `[run-supabase-backup] finished in ${ms}ms →`,
      JSON.stringify(result, null, 2)
    );
    process.exit(0);
  } catch (err) {
    console.error("[run-supabase-backup] failed:", err);
    process.exit(1);
  }
}

main();
