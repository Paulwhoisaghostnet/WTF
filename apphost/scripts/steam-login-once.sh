#!/usr/bin/env bash
set -euo pipefail

APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
APPHOST_HOME="${WTFOS_APPHOST_HOME:-/opt/wtfos/apphost/home}"

sudo -u "$APPHOST_USER" env \
  HOME="$APPHOST_HOME" \
  XDG_RUNTIME_DIR=/opt/wtfos/apphost/run/user \
  DISPLAY="${DISPLAY:-:99}" \
  PULSE_SERVER="${PULSE_SERVER:-unix:/opt/wtfos/apphost/run/pulse/native}" \
  STEAM_RUNTIME=1 \
  steam
