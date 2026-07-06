#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${WTFOS_APPHOST_DIR:-/opt/wtfos/apphost}"
APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the Hetzner host." >&2
  exit 77
fi

seed_hosted_apps_env() {
  local env_file="$TARGET_DIR/config/hosted-apps.env"
  if [[ ! -e "$env_file" ]]; then
    install -m 0600 -o "$APPHOST_USER" -g "$APPHOST_USER" /dev/null "$env_file"
  fi
  if [[ ! -s "$env_file" ]]; then
    local tmp_file
    tmp_file="$(mktemp)"
    cat >"$tmp_file" <<'EOF'
# Private hosted-application provider credentials.
# This file is read only by the isolated apphost service and is never returned
# through the public wtfOS API.
#
# Current provider: Steam, used internally for Jackbox manifests.
# Set WTFOS_APPHOST_STEAM_ADMIN_LOGIN=1 only after username/password are filled.
WTFOS_APPHOST_STEAM_ADMIN_LOGIN=0
WTFOS_APPHOST_STEAM_USERNAME=
WTFOS_APPHOST_STEAM_PASSWORD=

# Optional and temporary. Fill only while satisfying a one-time Steam Guard
# challenge, then remove the value after a successful session refresh.
WTFOS_APPHOST_STEAM_GUARD_CODE=
EOF
    install -m 0600 -o "$APPHOST_USER" -g "$APPHOST_USER" "$tmp_file" "$env_file"
    rm -f "$tmp_file"
  else
    chown "$APPHOST_USER:$APPHOST_USER" "$env_file"
    chmod 0600 "$env_file"
  fi
}

if ! id "$APPHOST_USER" >/dev/null 2>&1; then
  echo "Apphost user is missing: $APPHOST_USER. Run install-apphost.sh first." >&2
  exit 78
fi

install -d -m 0750 -o "$APPHOST_USER" -g "$APPHOST_USER" "$TARGET_DIR"
install -d -m 0750 -o "$APPHOST_USER" -g "$APPHOST_USER" \
  "$TARGET_DIR/bin" "$TARGET_DIR/config" "$TARGET_DIR/manifests" "$TARGET_DIR/scripts" "$TARGET_DIR/docs" \
  "$TARGET_DIR/tests" "$TARGET_DIR/state" "$TARGET_DIR/state/logs" "$TARGET_DIR/run" \
  "$TARGET_DIR/run/user" "$TARGET_DIR/home"

install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/apphostd.py" "$TARGET_DIR/apphostd.py"
install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/bin/"*.sh "$TARGET_DIR/bin/"
if compgen -G "$ROOT_DIR/bin/*.py" >/dev/null; then
  install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/bin/"*.py "$TARGET_DIR/bin/"
fi
if compgen -G "$ROOT_DIR/config/*.env" >/dev/null; then
  install -m 0640 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/config/"*.env "$TARGET_DIR/config/"
fi
seed_hosted_apps_env
install -m 0644 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/manifests/"*.json "$TARGET_DIR/manifests/"
install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/scripts/"*.sh "$TARGET_DIR/scripts/"

if compgen -G "$ROOT_DIR/docs/*.md" >/dev/null; then
  install -m 0644 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/docs/"*.md "$TARGET_DIR/docs/"
fi

if compgen -G "$ROOT_DIR/tests/*.py" >/dev/null; then
  install -m 0644 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/tests/"*.py "$TARGET_DIR/tests/"
fi

install -m 0644 "$ROOT_DIR/systemd/"*.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart wtfos-apphost.service

health_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

if [[ "$health_ok" != "1" ]]; then
  systemctl --no-pager --full status wtfos-apphost.service || true
  exit 1
fi

echo "Application host updated at $TARGET_DIR"
