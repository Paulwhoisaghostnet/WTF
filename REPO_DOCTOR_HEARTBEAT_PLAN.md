# Repo Doctor Heartbeat + Worker Plan (Design Only)

Date: 2026-04-27
Status: Design complete, no code changes yet.

## 0) What we learned first (health snapshot)

- Total tables in `public`: **106**
- Populated tables: **15**
- Empty tables: **91**
- Overall estimated cell completion (including null + empty string): **~75.11%**
- Required-row completion (non-nullable columns): **100%** on populated tables.

### Top 25 worst tables by missing-cell percentage

The current dataset has many empty tables, which appear as 100% missing because row count is 0.

1. `public.acquisition_lots`
2. `public.address_labels`
3. `public.attendance_events`
4. `public.board_categories`
5. `public.board_channel_permissions`
6. `public.board_reactions`
7. `public.board_thread_replies`
8. `public.board_threads`
9. `public.board_webhooks`
10. `public.buyback_allowlist`
11. `public.buyback_windows`
12. `public.calendar_tickets`
13. `public.challenge_reward_flags`
14. `public.challenge_submissions`
15. `public.challenges`
16. `public.channels`
17. `public.collection_contracts`
18. `public.collection_items`
19. `public.collections`
20. `public.console_play_tickets`
21. `public.console_scores`
22. `public.contract_activity_logs`
23. `public.contract_metadata`
24. `public.crp_nominations`
25. `public.desktop_app_settings`

### Top 25 populated tables (for real backfill work)

1. `public.users` — rows: 2, cols: 33, cell completion 39.39%
2. `public.backfill_manifest` — rows: 2856, cols: 13, cell completion 62.06%
3. `public.sync_runs` — rows: 24, cols: 12, cell completion 69.44%
4. `public.system_event_logs` — rows: 57072, cols: 19, cell completion 75.55%
5. `public.console_games` — rows: 2, cols: 13, cell completion 84.62%
6. `public.tv_channels` — rows: 1, cols: 14, cell completion 85.71%
7. `public.xp_events` — rows: 1, cols: 7, cell completion 85.71%
8. `public.desktop_pet_events` — rows: 4, cols: 9, cell completion 91.67%

### Top 25 worst columns by missing percentage (on populated tables)

1. `public.system_event_logs.error_stack`
2. `public.backfill_manifest.payload`
3. `public.backfill_manifest.last_error`
4. `public.backfill_manifest.next_attempt_at`
5. `public.sync_runs.error`
6. `public.sync_runs.cursor_before`
7. `public.console_games.hmac_secret`
8. `public.console_games.created_by`
9. `public.users.email`
10. `public.users.temp_password_hash`
11. `public.users.temp_password_expires_at`
12. `public.users.avatar_url`
13. `public.users.twitter_id`
14. `public.users.twitter_handle`
15. `public.users.twitter_oauth_token`
16. `public.users.twitter_oauth_token_secret`
17. `public.users.twitter_oauth2_access_token`
18. `public.users.twitter_oauth2_refresh_token`
19. `public.users.twitter_oauth2_scopes`
20. `public.users.twitter_oauth2_expires_at`
21. `public.users.discord_id`
22. `public.users.discord_handle`
23. `public.users.google_id`
24. `public.users.github_id`
25. `public.users.bio`

## 1) Design goals (non-negotiable)

- Keep all "Repo Doctor" behavior on Hetzner host level (systemd), not only inside `docker compose app`.
- Runs even when `wtf` service is stopped.
- Self-wake and schedule itself.
- Avoid stepping on existing in-app scheduler jobs.
- Keep workers idempotent and re-entrant.
- Backfill only fields with known deterministic remediation logic.

## 2) System architecture

### 2.1 Components

1. **`repo-doctor-heartbeat` (systemd timer + one-shot service)**
   - OS-level process on the Hetzner host.
   - Fires every N minutes regardless of app container health.
   - Enforces run-window lock and concurrency guard.

2. **`repo-doctor-worker` (CLI script / binary run by timer)**
   - Reads env and DB URL directly.
   - Computes top missing buckets.
   - Enqueues repair tasks into a durable queue table (or direct immediate execution for safe idempotent jobs).

3. **`repo-doctor-plan` table(s) (existing + new)**
   - Use existing `backfill_manifest` for dispatch if payload is suitable.
   - Add new lightweight `repo_doctor_runs` + `repo_doctor_queue` only for this subsystem.

4. **`repo-doctor-health log`**
   - Structured rows written to `system_event_logs` + syslog/journal.
   - Includes heartbeat start, lock contention, cycles completed, rows fixed, failures, next run time.

### 2.2 Why this is above/beside app

- Existing scheduler runs from Node process, so if the app container is down, no in-process jobs can run.
- `systemd` timer remains active at host level.
- Host service can start a worker or queue seeder even right after boot (`OnBootSec`) before app startup.

## 3) Execution flow

1. `repo-doctor-heartbeat` timer launches shell wrapper.
2. Wrapper calls worker script with:
   - `--mode=once`
   - `--dry-run` only for health precheck
   - `--max-tables=...`
   - `--max-columns=...`
3. Worker immediately tries an advisory lock:
   - `pg_try_advisory_lock(420042)` in a dedicated DB connection.
4. If lock is unavailable, worker exits successfully and writes `skipped (already running)` log.
5. If lock obtained:
   - Refresh missingness snapshot (or read recent cached baseline).
   - Apply deterministic backfills in strict order:
     - high priority optional telemetry fields (e.g. `system_event_logs.error_*` from available evidence)
     - manifest/sync reconciliation rows
     - social/account profile fields if source exists in auth source tables
   - For each item, upsert status into `repo_doctor_queue` with retries/backoff.
6. Worker exits; timer naturally waits for next tick.

## 4) Scheduling behavior

- **Heartbeat cadence:** every 5 minutes minimum.
- **Soft max execution time:** 120s.
- **Cold-start self-heal:** one-shot run `60s` after boot.
- **Backoff policy:** exponential per-table when failure rate > threshold.
- **Stale lock recovery:** if worker crashes, lock auto-releases on connection close; keep explicit heartbeat row TTL.

## 5) Backfill strategy for Repo Doctor (first-pass policy)

- Start only with deterministic and safe writes:
  - `system_event_logs`: fill `error_stack` when `error_name + error_message` are present and stack is null.
  - `backfill_manifest`: normalize timestamp columns and payload format only where type-checked.
  - `sync_runs`: only fill end-state fields that can be reconstructed from run metadata.
- Explicitly do **not** fill social/profile nullable columns in `users` unless source exists for that identity/provider.
- Treat missing values in feature tables with 0 rows as “inactive/not-yet-populated” (not errors).
- Never force defaults blindly; all writes must have source derivation + confidence score.

## 6) Idempotency, safety, and blast-radius limits

- Per-run cap: 500 operations max.
- Per-cycle lock TTL: 4 minutes.
- Every mutation uses:
  - `WHERE` guard on actual-null state.
  - dry-run preview option.
  - batch size 50.
- If a table has >50% empty-critical fields and no working strategy, skip and emit warning.
- Keep all queries in read/write phases with explicit `LIMIT` and transaction boundaries.

## 7) Hetzner install (global, persist across reboots)

Install from SSH only:

1. `ssh wtf@<hetzner-host>` as admin.
2. Create dedicated directories:
   - `/opt/wtf/repo-doctor/`
   - `/etc/wtf/repo-doctor/` (config/secrets only)
3. Add environment file with least-privilege DB role credentials.
4. Install service + timer unit under:
   - `/etc/systemd/system/repo-doctor-heartbeat.service`
   - `/etc/systemd/system/repo-doctor-heartbeat.timer`
5. Enable and start:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now repo-doctor-heartbeat.timer`
6. Verify:
   - `sudo systemctl list-timers`
   - `journalctl -u repo-doctor-heartbeat.service -f`

## 8) Host vs container boundary

- Repo doctor package must be installed outside Docker image.
- No dependency on `docker-compose` lifecycle.
- If app path exists but container is down, worker still runs with DB connectivity only.
- On recoverable DB connectivity failure, retry with backoff and emit alerts.

## 9) Observability and alerting

- Emit structured heartbeat status lines:
  - `repo_doctor.heartbeat_start`, `repo_doctor.lock_taken`, `repo_doctor.rows_examined`,
    `repo_doctor.rows_fixed`, `repo_doctor.failures`.
- Add a lightweight Slack/Discord webhook or email hook (optional, separate task) on repeated failures.
- Wire into existing `system_event_logs` + existing app log shipping.

## 10) Delivery sequence (plan-only)

1. Create DB schema + optional queue tables.
2. Add worker script + unit/timer files.
3. Implement deterministic backfill handlers mapped to top missing columns.
4. Add dry-run mode + kill-switch env var (`REPO_DOCTOR_DRY_RUN`).
5. Deploy to staging Hetzner node and validate 24h behavior.
6. Promote to production after two successful heartbeat cycles.

## 11) Acceptance criteria

- Heartbeat runs every X minutes even when `wtf` process is stopped.
- Worker writes are idempotent and recoverable.
- No duplicate job stampede using advisory lock + queue state.
- No new production deploy needed to start/restart heartbeat; only host-level `systemctl`.
- Top populated tables show measurable reduction in missing optional fields after defined safe backfills.

## 12) Explicitly out of scope for this design phase

- Creating code changes.
- Deploying to production.
- Changing existing in-app scheduler behavior.

