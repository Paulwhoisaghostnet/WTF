#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "[server-deploy] ERROR: .env is missing"
  exit 1
fi

runtime_env=""
runtime_env_is_temp="0"
cleanup() {
  if [[ "$runtime_env_is_temp" == "1" && -n "$runtime_env" && -f "$runtime_env" ]]; then
    rm -f "$runtime_env"
  fi
}
trap cleanup EXIT

default_runtime_env="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"

if [[ -r "$default_runtime_env" ]]; then
  runtime_env="$default_runtime_env"
elif sudo -n test -r "$default_runtime_env" 2>/dev/null; then
  runtime_env="$(mktemp /tmp/wtf-runtime.XXXXXX.env)"
  runtime_env_is_temp="1"
  chmod 600 "$runtime_env"
  sudo -n cat "$default_runtime_env" > "$runtime_env"
fi

migrate_known_rpc_defaults() {
  local env_file="$1"
  [[ -n "$env_file" && -f "$env_file" ]] || return 0

  local rewrite_script='s#https://rpc\.tzkt\.io/mainnet#https://tezos-mainnet.octez.io/#g; s#https://rpc\.shadownet\.teztnets\.com#https://tezos-shadownet.octez.io/#g'
  if [[ -w "$env_file" ]]; then
    perl -0pi -e "$rewrite_script" "$env_file"
  elif sudo -n test -w "$env_file" 2>/dev/null; then
    sudo perl -0pi -e "$rewrite_script" "$env_file"
  else
    echo "[server-deploy] note: cannot rewrite RPC defaults in $env_file; continuing with current file"
  fi
}

migrate_known_rpc_defaults ".env"
migrate_known_rpc_defaults "$runtime_env"

set -a
. ./.env
if [[ -n "$runtime_env" && -r "$runtime_env" ]]; then
  . "$runtime_env"
  export WTF_ENV_FILE="$runtime_env"
fi
set +a

require_runtime_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    echo "[server-deploy] ERROR: $name is required for production deployment"
    exit 1
  fi
}

require_min_free_disk() {
  local path="${1:-/}"
  local min_kb="${2:-12582912}" # 12 GiB, in 1 KiB df blocks.
  local available_kb

  available_kb="$(df -Pk "$path" | awk 'NR == 2 { print $4 }')"
  if [[ ! "$available_kb" =~ ^[0-9]+$ ]]; then
    echo "[server-deploy] ERROR: could not determine free disk space for $path"
    exit 1
  fi

  local available_mib=$((available_kb / 1024))
  local min_mib=$((min_kb / 1024))
  if (( available_kb < min_kb )); then
    echo "[server-deploy] ERROR: deploy disk preflight failed for $path: ${available_mib} MiB free, need at least ${min_mib} MiB"
    echo "[server-deploy] Free Docker build/image cache or expand the production disk before deploying."
    docker system df || true
    exit 1
  fi

  echo "[server-deploy] disk preflight ok for $path: ${available_mib} MiB free"
}

require_runtime_secret "TWITTER_TOKEN_ENCRYPTION_KEY"
require_runtime_secret "STUDIO_CRYPTO_KEY"

if [[ -z "${TOKEN_ENCRYPTION_KEY-}" || -z "${TOKEN_ENCRYPTION_KEY//[[:space:]]/}" ]]; then
  twitter_key="${TWITTER_TOKEN_ENCRYPTION_KEY//[[:space:]]/}"
  if [[ "${#twitter_key}" -ge 32 ]]; then
    export TOKEN_ENCRYPTION_KEY="$twitter_key"
    echo "[server-deploy] TOKEN_ENCRYPTION_KEY unset; reusing TWITTER_TOKEN_ENCRYPTION_KEY"
  fi
fi
require_runtime_secret "TOKEN_ENCRYPTION_KEY"

token_key="${TOKEN_ENCRYPTION_KEY//[[:space:]]/}"
if [[ "${#token_key}" -lt 32 ]]; then
  echo "[server-deploy] ERROR: TOKEN_ENCRYPTION_KEY must be at least 32 characters"
  exit 1
fi
if [[ "${#token_key}" -eq 64 && "$token_key" =~ ^[0-9a-fA-F]+$ ]]; then
  : # preferred hex format
elif [[ "${#token_key}" -ge 32 ]]; then
  echo "[server-deploy] note: TOKEN_ENCRYPTION_KEY is non-hex; ensure runtime matches token-encryption expectations"
else
  echo "[server-deploy] ERROR: TOKEN_ENCRYPTION_KEY format is invalid"
  exit 1
fi

echo "[server-deploy] checking public Kiln mutation auth"
node scripts/check-kiln-auth.mjs

echo "[server-deploy] checking public Kiln production posture"
node scripts/check-kiln-production-posture.mjs

require_min_free_disk "${WTF_DEPLOY_DISK_PATH:-/}" "${WTF_DEPLOY_MIN_FREE_KB:-12582912}"

COMMIT_SHA="$(git rev-parse --short HEAD)"
export COMMIT_SHA

echo "[server-deploy] building app image for ${COMMIT_SHA}"
docker compose build \
  --build-arg COMMIT_SHA="$COMMIT_SHA" \
  --build-arg VITE_MARKETPLACE_CONTRACT_ADDRESS="${VITE_MARKETPLACE_CONTRACT_ADDRESS:-}" \
  --build-arg VITE_BARTER_CONTRACT_ADDRESS="${VITE_BARTER_CONTRACT_ADDRESS:-}" \
  app

echo "[server-deploy] ensuring postgres is up"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U wtf -d wtf >/dev/null 2>&1; do
  sleep 2
done

echo "[server-deploy] stopping app before migrations"
docker compose stop app >/dev/null 2>&1 || true
docker compose rm -f app >/dev/null 2>&1 || true

echo "[server-deploy] applying production migrations"
bash "$ROOT_DIR/scripts/apply-production-migrations.sh"

echo "[server-deploy] starting app + caddy"
compose_up_output=""
if ! compose_up_output="$(docker compose up -d --remove-orphans --force-recreate app caddy 2>&1)"; then
  echo "$compose_up_output"
  if grep -q "already in use" <<<"$compose_up_output"; then
    echo "[server-deploy] docker compose hit a transient recreate-name conflict; retrying once"
    sleep 3
    docker compose up -d --remove-orphans --force-recreate app caddy
  else
    exit 1
  fi
else
  echo "$compose_up_output"
fi

echo "[server-deploy] waiting for health"
health_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    docker compose ps
    health_ok=1
    break
  fi
  sleep 3
done

if [[ "$health_ok" == "1" ]]; then
  echo "[server-deploy] health check passed"
  echo "[server-deploy] verifying repo doctor heartbeat timer"
  sudo WTF_APP_DIR="$ROOT_DIR" bash scripts/install-systemd-timers.sh repo-doctor-heartbeat.timer
  sudo systemctl is-enabled repo-doctor-heartbeat.timer
  sudo systemctl is-active repo-doctor-heartbeat.timer
  sudo systemctl start repo-doctor-heartbeat.service
  sudo systemctl show repo-doctor-heartbeat.service -p ActiveState -p Result -p ExecMainStatus --no-pager
  sudo tail -n 5 /var/log/wtf/repo-doctor-heartbeat.jsonl
  docker compose exec -T postgres psql -U wtf -d wtf -F '|' -At -c "SELECT job_name,status,scope,finished_at IS NOT NULL AS finished FROM sync_runs WHERE job_name='repo-doctor-heartbeat' ORDER BY started_at DESC NULLS LAST, id DESC LIMIT 3;"
  docker compose exec -T postgres psql -U wtf -d wtf -F '|' -At -c "SELECT source,event_type,severity,created_at FROM system_event_logs WHERE source='repo-doctor-heartbeat' ORDER BY created_at DESC LIMIT 3;"
else
  echo "[server-deploy] health check failed"
  docker compose ps || true
  docker compose logs --tail=80 app || true
  exit 1
fi
