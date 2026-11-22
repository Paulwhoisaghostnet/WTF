#!/usr/bin/env bash
set -euo pipefail
umask 077
stage="$(cd -- "$(dirname -- "$0")" && pwd)"
# Run from the prepared release directory on the production attached volume.
app=wtf-app-app-1
db=wtf-app-postgres-1
protected_code="${1:?Supply the existing funded Duel UUID to keep on the original authority.}"
[[ "$protected_code" =~ ^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$ ]]
[[ "$(basename -- "$stage")" == wtfiap-isolated-duels.* ]]
[[ "$(dirname -- "$stage")" == /mnt/wtf-data ]]
exec 9</tmp/wtf-app-deploy.lock
flock -nx 9
test ! -e "$stage/runtime.env"
sudo -n install -d -m 0750 -o 1000 -g 1000 "$stage/rooms"
install -d -m 0755 "$stage/policy"
printf '["shadownet"]\n' >"$stage/policy/admission.json"
chmod 644 "$stage/policy/admission.json"
docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$app" >"$stage/app-before"
docker inspect --format '{{.Id}} {{.State.StartedAt}}' wtf-app-caddy-1 >"$stage/caddy-before"
docker exec "$app" sha256sum "/app/wtfiap-data/$protected_code.json" | cut -d' ' -f1 >"$stage/duel-before"

# Validate required settings in the established runtime before creating any
# database role. Only the exact values needed by the isolated runtime are
# written to an operator-private file.
docker exec "$app" node -e '
  const required = ["SESSION_SECRET", "WTF_OPERATOR_SIGNER_AUTH_TOKEN"];
  if (required.some(key => !process.env[key])) process.exit(1);
  for (const [key, value] of Object.entries(process.env)) {
    if (required.includes(key) || /^(WTFIAP_OPEN_DUEL_(MAINNET|SHADOWNET)_[A-Z_]+|WTF_OPERATOR_SIGNER_(SOCKET|CONNECT_TIMEOUT_MS|RESPONSE_TIMEOUT_MS)|WTFOS_SESSION_COOKIE_DOMAIN|CORS_ALLOWED_ORIGINS|CANONICAL_PUBLIC_ORIGIN|PUBLIC_SITE_URL|WTFOS_PUBLIC_BASE_URL|RATE_LIMIT_STORE|JSON_BODY_LIMIT)$/.test(key)) {
      if (/\r|\n/.test(value)) process.exit(1);
      console.log(key + "=" + value);
    }
  }
' >"$stage/runtime-base.env"

auth_password="$(openssl rand -hex 32)"
escrow_password="$(openssl rand -hex 32)"
{
  printf "CREATE ROLE wtfiap_duel_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';\n" "$auth_password"
  printf "CREATE ROLE wtfiap_duel_escrow LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';\n" "$escrow_password"
  cat <<'SQL'
BEGIN;
GRANT CONNECT ON DATABASE wtf TO wtfiap_duel_auth;
GRANT USAGE ON SCHEMA public TO wtfiap_duel_auth;
GRANT SELECT ON public.users, public.user_roles, public.desktop_app_settings, public.user_notification_preferences TO wtfiap_duel_auth;
GRANT SELECT (user_id, wallet_address) ON public.user_wallets TO wtfiap_duel_auth;
GRANT SELECT ON public.mcp_agent_tokens TO wtfiap_duel_auth;
GRANT UPDATE (last_used_at, updated_at) ON public.mcp_agent_tokens TO wtfiap_duel_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."session", public.rate_limit_buckets TO wtfiap_duel_auth;
GRANT INSERT ON public.user_notifications TO wtfiap_duel_auth;
GRANT USAGE ON SEQUENCE public.user_notifications_id_seq TO wtfiap_duel_auth;
COMMIT;
CREATE DATABASE wtfiap_isolated_duels;
REVOKE CONNECT ON DATABASE wtfiap_isolated_duels FROM PUBLIC;
GRANT CONNECT ON DATABASE wtfiap_isolated_duels TO wtfiap_duel_escrow;
SQL
} | docker exec -i "$db" psql -qX -v ON_ERROR_STOP=1 -U wtf -d wtf

docker exec -i "$db" psql -qX -v ON_ERROR_STOP=1 -U wtf -d wtfiap_isolated_duels <<'SQL'
BEGIN;
CREATE SCHEMA duel_authority;
CREATE TABLE duel_authority.wtfiap_open_duels (
    room_code text PRIMARY KEY,
    document jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wtfiap_open_duel_identity CHECK (
      document->>'roomCode' = room_code AND document->>'schemaVersion' = '2'
    )
);
GRANT USAGE ON SCHEMA duel_authority TO wtfiap_duel_escrow;
GRANT SELECT, INSERT, UPDATE ON duel_authority.wtfiap_open_duels TO wtfiap_duel_escrow;
COMMIT;
SQL

{
  cat "$stage/runtime-base.env"
  printf 'DATABASE_URL=postgresql://wtfiap_duel_auth:%s@postgres:5432/wtf\n' "$auth_password"
  printf 'WTFIAP_ISOLATED_DUEL_DB_URL=postgresql://wtfiap_duel_escrow:%s@postgres:5432/wtfiap_isolated_duels\n' "$escrow_password"
  printf 'WTFIAP_DATA_DIR=/room-state\nWTFIAP_ISOLATED_DUEL_POLICY=/duel-policy/admission.json\nWTFIAP_PROTECTED_DUEL=%s\nNODE_ENV=production\nPORT=3031\nNODE_PATH=/app/node_modules\n' "$protected_code"
} >"$stage/runtime.env"
rm "$stage/runtime-base.env"
echo 'Isolated escrow database and restricted roles provisioned. No room requests sent.'
