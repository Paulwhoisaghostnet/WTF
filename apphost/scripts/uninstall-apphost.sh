#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${WTFOS_APPHOST_DIR:-/opt/wtfos/apphost}"
APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the Hetzner host." >&2
  exit 77
fi

systemctl disable --now \
  wtfos-apphost-vnc.service \
  wtfos-apphost.service \
  wtfos-apphost-wm.service \
  wtfos-apphost-pulse.service \
  wtfos-apphost-xvfb.service 2>/dev/null || true

rm -f \
  /etc/systemd/system/wtfos-apphost-vnc.service \
  /etc/systemd/system/wtfos-apphost.service \
  /etc/systemd/system/wtfos-apphost-wm.service \
  /etc/systemd/system/wtfos-apphost-pulse.service \
  /etc/systemd/system/wtfos-apphost-xvfb.service
rm -rf /run/wtf/apphost
systemctl daemon-reload

if [[ "${WTFOS_APPHOST_PURGE:-0}" == "1" ]]; then
  rm -rf "$TARGET_DIR"
  userdel "$APPHOST_USER" 2>/dev/null || true
  echo "Purged $TARGET_DIR and removed $APPHOST_USER."
else
  echo "Stopped and disabled apphost services. Set WTFOS_APPHOST_PURGE=1 to remove $TARGET_DIR and $APPHOST_USER."
fi
