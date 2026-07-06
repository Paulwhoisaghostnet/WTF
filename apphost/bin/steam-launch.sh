#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${STEAM_APP_ID:-}" ]]; then
  echo "STEAM_APP_ID is required" >&2
  exit 64
fi

export HOME="${HOME:-/opt/wtfos/apphost/home}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/opt/wtfos/apphost/run/user}"
export DISPLAY="${DISPLAY:-:99}"
export PULSE_SERVER="${PULSE_SERVER:-unix:/opt/wtfos/apphost/run/pulse/native}"
export STEAM_RUNTIME="${STEAM_RUNTIME:-1}"

mkdir -p "$HOME" "$XDG_RUNTIME_DIR"

# A long-running Steam client keeps the environment it was first started with.
# If an existing Steam was started without PULSE_SERVER, every game it launches
# inherits a dead audio path, so shut it down and start fresh with full env.
steam_pid="$(pgrep -u "$(id -u)" -x steam | head -n 1 || true)"
if [[ -n "$steam_pid" ]] && ! tr '\0' '\n' <"/proc/$steam_pid/environ" 2>/dev/null | grep -q '^PULSE_SERVER='; then
  echo "Restarting Steam pid $steam_pid: it is missing PULSE_SERVER and would launch silent games" >&2
  steam -shutdown >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    kill -0 "$steam_pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$steam_pid" 2>/dev/null; then
    pkill -u "$(id -u)" -f '\.local/share/Steam' || true
    sleep 3
  fi
fi

steam_args=(-silent)
steam_args+=(-applaunch "$STEAM_APP_ID")

exec steam "${steam_args[@]}"
