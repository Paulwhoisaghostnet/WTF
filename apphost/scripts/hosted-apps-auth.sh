#!/usr/bin/env bash
set -euo pipefail

APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
APPHOST_HOME="${WTFOS_APPHOST_HOME:-/opt/wtfos/apphost/home}"
APPHOST_ROOT="${WTFOS_APPHOST_DIR:-/opt/wtfos/apphost}"
CREDENTIAL_ENV_FILE="${WTFOS_APPHOST_CREDENTIAL_ENV_FILE:-$APPHOST_ROOT/config/hosted-apps.env}"

credential_mode() {
  stat -c "%a" "$CREDENTIAL_ENV_FILE" 2>/dev/null || stat -f "%Lp" "$CREDENTIAL_ENV_FILE" 2>/dev/null || true
}

if [[ -f "$CREDENTIAL_ENV_FILE" ]]; then
  mode="$(credential_mode)"
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    cat >&2 <<MSG
Refusing to read hosted-application credentials from $CREDENTIAL_ENV_FILE.
Expected file mode 0600 or 0400; found ${mode:-unknown}.
MSG
    exit 77
  fi
  set -a
  # shellcheck disable=SC1090
  source "$CREDENTIAL_ENV_FILE"
  set +a
fi

if [[ "${WTFOS_APPHOST_STEAM_ADMIN_LOGIN:-0}" != "1" ]]; then
  cat >&2 <<MSG
Refusing to refresh hosted-application credentials.
Set WTFOS_APPHOST_STEAM_ADMIN_LOGIN=1 in $CREDENTIAL_ENV_FILE or in the command environment.
MSG
  exit 78
fi

steam_args=(-silent)
if [[ -n "${WTFOS_APPHOST_STEAM_USERNAME:-}" && -n "${WTFOS_APPHOST_STEAM_PASSWORD:-}" ]]; then
  steam_args=(-silent -login "$WTFOS_APPHOST_STEAM_USERNAME" "$WTFOS_APPHOST_STEAM_PASSWORD")
  if [[ -n "${WTFOS_APPHOST_STEAM_GUARD_CODE:-}" ]]; then
    steam_args+=("$WTFOS_APPHOST_STEAM_GUARD_CODE")
  fi
  steam_args+=(-remember_password)
else
  cat >&2 <<MSG
Refusing to refresh hosted-application credentials.
Set WTFOS_APPHOST_STEAM_USERNAME and WTFOS_APPHOST_STEAM_PASSWORD in $CREDENTIAL_ENV_FILE or in the command environment.
MSG
  exit 78
fi

mkdir -p "$APPHOST_HOME" "$APPHOST_ROOT/run/user"
steam_env=(
  HOME="$APPHOST_HOME"
  XDG_RUNTIME_DIR="$APPHOST_ROOT/run/user"
  DISPLAY="${DISPLAY:-:99}"
  PULSE_SERVER="${PULSE_SERVER:-unix:$APPHOST_ROOT/run/pulse/native}"
  STEAM_RUNTIME="${STEAM_RUNTIME:-1}"
)

if [[ "$(id -un)" == "$APPHOST_USER" ]]; then
  env "${steam_env[@]}" steam "${steam_args[@]}"
else
  sudo -u "$APPHOST_USER" env "${steam_env[@]}" steam "${steam_args[@]}"
fi
