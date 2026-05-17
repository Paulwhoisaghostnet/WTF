#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${WTF_APP_DIR:-/opt/wtf-combo}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo WTF_APP_DIR=$APP_DIR bash scripts/install-systemd-timers.sh" >&2
  exit 1
fi

install -d -m 755 "$SYSTEMD_DIR"
install -d -m 755 /etc/wtf /etc/wtf/secrets /var/log/wtf

for unit in scripts/systemd/*.service scripts/systemd/*.timer; do
  [[ -e "$unit" ]] || continue
  dest="$SYSTEMD_DIR/$(basename "$unit")"
  sed "s#/opt/wtf-combo#${APP_DIR}#g" "$unit" > "$dest"
  chmod 644 "$dest"
done

systemctl daemon-reload

DEFAULT_TIMERS=(
  repo-doctor-heartbeat.timer
  wtf-object-storage-usage-check.timer
  wtf-cache-evict.timer
  wtf-tmp-clean.timer
  wtf-db-backup.timer
  wtf-manifest-backup.timer
  wtf-storage-health.timer
)

TIMERS=("$@")
if [[ "${#TIMERS[@]}" -eq 0 ]]; then
  TIMERS=("${DEFAULT_TIMERS[@]}")
fi

for timer in "${TIMERS[@]}"; do
  case "$timer" in
    repo-doctor-heartbeat.timer|wtf-object-storage-usage-check.timer|wtf-cache-evict.timer|wtf-tmp-clean.timer|wtf-db-backup.timer|wtf-manifest-backup.timer|wtf-storage-health.timer) ;;
    *)
      echo "Unsupported timer: $timer" >&2
      exit 2
      ;;
  esac
  systemctl enable --now "$timer"
done

systemctl list-timers "${TIMERS[@]}" --no-pager
