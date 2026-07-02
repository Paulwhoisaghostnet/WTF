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

exec steam -silent -applaunch "$STEAM_APP_ID"
