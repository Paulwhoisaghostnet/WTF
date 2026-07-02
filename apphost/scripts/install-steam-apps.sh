#!/usr/bin/env bash
set -euo pipefail

APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
APPHOST_HOME="${WTFOS_APPHOST_HOME:-/opt/wtfos/apphost/home}"
APPS=(2216830 3364070)

echo "This script asks the already-authenticated Steam client to install Jackbox appids: ${APPS[*]}"
for app_id in "${APPS[@]}"; do
  sudo -u "$APPHOST_USER" env \
    HOME="$APPHOST_HOME" \
    XDG_RUNTIME_DIR=/opt/wtfos/apphost/run/user \
    DISPLAY="${DISPLAY:-:99}" \
    PULSE_SERVER="${PULSE_SERVER:-unix:/opt/wtfos/apphost/run/pulse/native}" \
    STEAM_RUNTIME=1 \
    steam "steam://install/$app_id" || true
done

echo "If Steam opens an install prompt in the virtual desktop, complete it there. Authentication is not bypassed."
