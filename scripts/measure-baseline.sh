#!/usr/bin/env bash
set -euo pipefail

HOST="${BASELINE_SSH_HOST:-wtf}"
REMOTE_DIR="${BASELINE_REMOTE_DIR:-/opt/platform/repos/wtf-app}"
OUT="${1:-.agents/docs/archive/reports/post-rescue-baseline.md}"

mkdir -p "$(dirname "$OUT")"

run_remote() {
  ssh "$HOST" "cd '$REMOTE_DIR' && $1"
}

{
  echo "# Post-rescue Baseline"
  echo
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "Remote host: \`$HOST\`"
  echo
  echo "## Filesystem"
  echo
  echo '```text'
  run_remote "df -h /"
  echo
  run_remote "sudo du -xhd1 /var/lib/docker/volumes 2>/dev/null | sort -h"
  echo
  run_remote "docker compose exec -T app sh -c 'du -xhd1 /app/backups /app/cache /app/uploads /app/logs 2>/dev/null || true'"
  echo '```'
  echo
  echo "## Postgres Size"
  echo
  echo '```text'
  run_remote "docker compose exec -T postgres psql -U wtf -d wtf -At -c \"SELECT pg_size_pretty(pg_database_size('wtf')), pg_database_size('wtf');\""
  echo '```'
  echo
  echo "## Top 30 Tables"
  echo
  echo '| table | rows | bytes | pretty |'
  echo '|---|---:|---:|---:|'
  run_remote "docker compose exec -T postgres psql -U wtf -d wtf -F '|' -At -c \"SELECT relname, n_live_tup, pg_total_relation_size(relid), pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 30;\"" |
    awk -F'|' '{ printf "| `%s` | %s | %s | %s |\n", $1, $2, $3, $4 }'
  echo
  echo "## Domain Rollup"
  echo
  echo '| domain | tables | rows | bytes | pretty |'
  echo '|---|---:|---:|---:|---:|'
  run_remote "docker compose exec -T postgres psql -U wtf -d wtf -F '|' -At -c \"WITH mapped AS (SELECT relname, pg_total_relation_size(relid) AS bytes, n_live_tup AS rows, CASE WHEN relname ~ '^(seasons|rounds|challenges|challenge_|side_quest|gameshow_|season_|round_|operator_|buyback_|calendar_|attendance_|crp_)' THEN 'gameshow' WHEN relname LIKE 'tv_%' OR relname='user_media_library' THEN 'tv' WHEN relname LIKE 'studio_%' THEN 'studio' WHEN relname ~ '^(wallet_|token_|contract_|address_|xtz_|tezonians|backfill_)' THEN 'chain' WHEN relname ~ '^(marketplace_|collections|collection_|token_gates|wtf_auction|reward_ledger)' THEN 'marketplace' WHEN relname LIKE 'board_%' THEN 'boards' WHEN relname ~ '^(channels|messages|dm_|x_dm_)' THEN 'messaging' WHEN relname LIKE 'x_timeline_%' OR relname='w_feed_cache' THEN 'xapi' WHEN relname LIKE 'console_%' THEN 'console' WHEN relname LIKE 'discord_%' THEN 'dicksword' WHEN relname IN ('faq_items','links') THEN 'content' ELSE 'kernel' END AS domain FROM pg_stat_user_tables) SELECT domain, count(*), sum(rows), sum(bytes), pg_size_pretty(sum(bytes)) FROM mapped GROUP BY domain ORDER BY sum(bytes) DESC;\"" |
    awk -F'|' '{ printf "| %s | %s | %s | %s | %s |\n", $1, $2, $3, $4, $5 }'
  echo
  echo "## Sync Runs (30 days)"
  echo
  echo '| job | status | count | latest |'
  echo '|---|---|---:|---|'
  run_remote "docker compose exec -T postgres psql -U wtf -d wtf -F '|' -At -c \"SELECT job_name,status,count(*),max(started_at) FROM sync_runs WHERE started_at > now() - interval '30 days' GROUP BY job_name,status ORDER BY job_name,status;\"" |
    awk -F'|' '{ printf "| `%s` | `%s` | %s | %s |\n", $1, $2, $3, $4 }'
} > "$OUT"

echo "Wrote $OUT"
