#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${WTF_APP_DIR:-/opt/wtf-combo}"
ENV_FILE="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"
LOG_FILE="${REPO_DOCTOR_LOG:-/var/log/wtf/repo-doctor-heartbeat.jsonl}"
KILL_FILE="${REPO_DOCTOR_KILL_FILE:-/etc/wtf/repo-doctor.disabled}"
MAX_WRITES="${REPO_DOCTOR_MAX_WRITES:-100}"
DRY_RUN="${REPO_DOCTOR_DRY_RUN:-0}"
LOCK_NAMESPACE="${REPO_DOCTOR_LOCK_NAMESPACE:-947146}"
LOCK_KEY="${REPO_DOCTOR_LOCK_KEY:-7}"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --kill-switch) REPO_DOCTOR_DISABLED=1 ;;
    --max-writes=*) MAX_WRITES="${arg#*=}" ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p "$(dirname "$LOG_FILE")"

json_log() {
  local status="$1"
  local message="$2"
  local detail="${3:-}"
  APP_DIR="$APP_DIR" DRY_RUN="$DRY_RUN" MAX_WRITES="$MAX_WRITES" DETAIL="$detail" \
    node -e '
      const [status, message] = process.argv.slice(1);
      const entry = {
        ts: new Date().toISOString(),
        source: "repo-doctor-heartbeat",
        status,
        message,
        appDir: process.env.APP_DIR,
        dryRun: process.env.DRY_RUN === "1",
        maxWrites: Number(process.env.MAX_WRITES || 0),
      };
      if (process.env.DETAIL) entry.detail = process.env.DETAIL;
      console.log(JSON.stringify(entry));
    ' "$status" "$message" | tee -a "$LOG_FILE" >/dev/null
}

if [[ "${REPO_DOCTOR_DISABLED:-0}" == "1" || -f "$KILL_FILE" ]]; then
  json_log "disabled" "repo doctor heartbeat skipped by kill switch" "$KILL_FILE"
  exit 0
fi

if ! [[ "$MAX_WRITES" =~ ^[0-9]+$ ]]; then
  json_log "error" "REPO_DOCTOR_MAX_WRITES must be a non-negative integer" "$MAX_WRITES"
  exit 2
fi

DRY_RUN_SQL="false"
if [[ "$DRY_RUN" == "1" || "$DRY_RUN" == "true" ]]; then
  DRY_RUN_SQL="true"
fi

SQL_FILE="$(mktemp /tmp/wtf-repo-doctor.XXXXXX.sql)"
cleanup() {
  rm -f "$SQL_FILE"
}
trap cleanup EXIT

cat > "$SQL_FILE" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;

SELECT pg_try_advisory_xact_lock(:lock_namespace, :lock_key) AS locked \gset

\if :locked
INSERT INTO sync_runs (job_name, scope, status, cursor_before)
VALUES (
  'repo-doctor-heartbeat',
  'host',
  'running',
  jsonb_build_object(
    'dryRun', :dry_run::boolean,
    'maxWrites', :max_writes::integer,
    'zeroRowPolicy', 'inactive_not_error',
    'safeBackfillManifest', jsonb_build_array()
  )
)
RETURNING id AS run_id \gset

WITH table_catalog AS (
  SELECT
    c.relname AS table_name,
    GREATEST(c.reltuples::bigint, 0) AS estimated_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = ANY(ARRAY[
      'users',
      'user_desktop_settings',
      'wallet_events',
      'wallet_holdings',
      'sync_runs',
      'system_event_logs',
      'x_dm_events',
      'timeline_posts',
      'studio_projects',
      'tv_channels',
      'in_app_inventory_grants'
    ])
),
checks AS (
  SELECT
    jsonb_build_object(
      'requiredTables', jsonb_build_object(
        'syncRuns', to_regclass('public.sync_runs') IS NOT NULL,
        'systemEventLogs', to_regclass('public.system_event_logs') IS NOT NULL,
        'users', to_regclass('public.users') IS NOT NULL
      ),
      'featureTables', COALESCE(
        jsonb_object_agg(table_name, estimated_rows ORDER BY table_name),
        '{}'::jsonb
      ),
      'safeBackfills', jsonb_build_array(),
      'writesAttempted', 0,
      'writesApplied', 0,
      'writeCap', :max_writes::integer,
      'dryRun', :dry_run::boolean
    ) AS report,
    count(*)::integer AS inspected
  FROM table_catalog
)
UPDATE sync_runs
SET
  status = 'success',
  finished_at = clock_timestamp(),
  duration_ms = GREATEST(
    0,
    floor(extract(epoch from (clock_timestamp() - sync_runs.started_at)) * 1000)::integer
  ),
  items_in = checks.inspected,
  items_out = 0,
  cursor_after = checks.report
FROM checks
WHERE sync_runs.id = :run_id;

INSERT INTO system_event_logs (
  event_id,
  source,
  event_type,
  severity,
  message,
  duration_ms,
  metadata,
  created_at
)
SELECT
  'repo-doctor-' || substr(md5(random()::text || clock_timestamp()::text), 1, 32),
  'repo-doctor-heartbeat',
  'heartbeat_succeeded',
  'info',
  'Repo doctor heartbeat completed without deterministic backfills.',
  duration_ms,
  jsonb_build_object('syncRunId', id, 'report', cursor_after),
  clock_timestamp()
FROM sync_runs
WHERE id = :run_id;
\else
INSERT INTO sync_runs (job_name, scope, status, finished_at, duration_ms, error, cursor_after)
VALUES (
  'repo-doctor-heartbeat',
  'host',
  'skipped',
  clock_timestamp(),
  0,
  'repo doctor advisory lock is already held',
  jsonb_build_object('lockSkipped', true)
)
RETURNING id AS skipped_run_id \gset

INSERT INTO system_event_logs (
  event_id,
  source,
  event_type,
  severity,
  message,
  metadata,
  created_at
)
SELECT
  'repo-doctor-' || substr(md5(random()::text || clock_timestamp()::text), 1, 32),
  'repo-doctor-heartbeat',
  'heartbeat_lock_skipped',
  'warn',
  'Repo doctor heartbeat skipped because another invocation owns the advisory lock.',
  jsonb_build_object('syncRunId', :skipped_run_id::integer, 'lockSkipped', true),
  clock_timestamp();
\endif

COMMIT;
SQL

json_log "starting" "repo doctor heartbeat starting"

if [[ -n "${REPO_DOCTOR_DATABASE_URL:-${HOST_DATABASE_URL:-}}" ]]; then
  DB_URL="${REPO_DOCTOR_DATABASE_URL:-${HOST_DATABASE_URL:-}}"
  if ! command -v psql >/dev/null 2>&1; then
    json_log "error" "psql is required for REPO_DOCTOR_DATABASE_URL mode"
    exit 1
  fi
  psql "$DB_URL" \
    -v lock_namespace="$LOCK_NAMESPACE" \
    -v lock_key="$LOCK_KEY" \
    -v dry_run="$DRY_RUN_SQL" \
    -v max_writes="$MAX_WRITES" \
    -f "$SQL_FILE"
else
  COMPOSE_CMD=()
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    json_log "error" "docker compose is required when REPO_DOCTOR_DATABASE_URL is not set"
    exit 1
  fi
  cd "$APP_DIR"
  "${COMPOSE_CMD[@]}" exec -T postgres psql \
    -U "${POSTGRES_USER:-wtf}" \
    -d "${POSTGRES_DB:-wtf}" \
    -v lock_namespace="$LOCK_NAMESPACE" \
    -v lock_key="$LOCK_KEY" \
    -v dry_run="$DRY_RUN_SQL" \
    -v max_writes="$MAX_WRITES" \
    -f - < "$SQL_FILE"
fi

json_log "success" "repo doctor heartbeat finished"
