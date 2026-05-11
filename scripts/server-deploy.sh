#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "[server-deploy] ERROR: .env is missing"
  exit 1
fi

runtime_env=""
cleanup() {
  if [[ -n "$runtime_env" && -f "$runtime_env" ]]; then
    rm -f "$runtime_env"
  fi
}
trap cleanup EXIT

default_runtime_env="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"

if [[ -r "$default_runtime_env" ]]; then
  runtime_env="$default_runtime_env"
elif sudo -n test -r "$default_runtime_env" 2>/dev/null; then
  runtime_env="$(mktemp /tmp/wtf-runtime.XXXXXX.env)"
  chmod 600 "$runtime_env"
  sudo -n cat "$default_runtime_env" > "$runtime_env"
fi

set -a
. ./.env
if [[ -n "$runtime_env" && -r "$runtime_env" ]]; then
  . "$runtime_env"
  export WTF_ENV_FILE="$runtime_env"
fi
set +a

echo "[server-deploy] checking public Kiln mutation auth"
node scripts/check-kiln-auth.mjs

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

echo "[server-deploy] applying production migrations"
bash "$ROOT_DIR/scripts/apply-production-migrations.sh"

echo "[server-deploy] starting app + caddy"
docker compose up -d --remove-orphans app caddy

echo "[server-deploy] waiting for health"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    docker compose ps
    exit 0
  fi
  sleep 3
done

echo "[server-deploy] health check failed"
docker compose ps || true
docker compose logs --tail=80 app || true
exit 1
