#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${WTF_APP_DIR:-/opt/wtf-combo}"
ENV_FILE="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"
BACKUP_ROOT="${DB_BACKUP_STAGING_DIR:-${BACKUPS_STAGING_DIR_HOST:-/mnt/wtf-data/backups-staging}/database}"
REMOTE_BASE="${STORAGEBOX_REMOTE_BASE:-wtf-server-backups/database}"
STORAGEBOX_TARGET="${STORAGEBOX_TARGET:-u587985@u587985.your-storagebox.de}"
STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
STORAGEBOX_KEY="${STORAGEBOX_KEY:-/etc/wtf/secrets/storagebox_ed25519}"
RCLONE_CONFIG_PATH="${RCLONE_CONFIG:-/etc/wtf/secrets/rclone.conf}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-}"
KEEP_DAYS="${DB_BACKUP_KEEP_DAYS:-7}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
dump="$BACKUP_ROOT/wtf-${timestamp}.dump"
compressed="${dump}.zst"
sha="${compressed}.sha256"

echo "[backup-db] dumping Postgres to $dump"
cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U wtf -d wtf --format=custom --no-owner --no-acl > "$dump"
zstd -T0 -3 -f "$dump" -o "$compressed"
rm -f "$dump"
sha256sum "$compressed" > "$sha"

remote_dir="${REMOTE_BASE}/$(date -u +%Y/%m)"
if [[ -f "$STORAGEBOX_KEY" ]]; then
  echo "[backup-db] uploading to Storage Box $remote_dir"
  {
    echo "-mkdir wtf-server-backups"
    echo "-mkdir wtf-server-backups/database"
    echo "-mkdir ${REMOTE_BASE}/$(date -u +%Y)"
    echo "-mkdir ${remote_dir}"
    echo "put ${compressed} ${remote_dir}/$(basename "$compressed")"
    echo "put ${sha} ${remote_dir}/$(basename "$sha")"
    echo "bye"
  } | sftp -i "$STORAGEBOX_KEY" -o BatchMode=yes -P "$STORAGEBOX_PORT" "$STORAGEBOX_TARGET"
else
  echo "[backup-db] Storage Box key missing: $STORAGEBOX_KEY"
fi

if [[ -n "$GDRIVE_REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "[backup-db] Google Drive mirror skipped: rclone missing"
  elif [[ ! -f "$RCLONE_CONFIG_PATH" ]]; then
    echo "[backup-db] Google Drive mirror skipped: missing rclone config $RCLONE_CONFIG_PATH"
  else
    echo "[backup-db] mirroring to Google Drive $GDRIVE_REMOTE"
    rclone --config "$RCLONE_CONFIG_PATH" copy "$compressed" "$GDRIVE_REMOTE/database/$(date -u +%Y/%m)"
    rclone --config "$RCLONE_CONFIG_PATH" copy "$sha" "$GDRIVE_REMOTE/database/$(date -u +%Y/%m)"
  fi
fi

find "$BACKUP_ROOT" -type f -name 'wtf-*.dump.zst*' -mtime +"$KEEP_DAYS" -print -delete
echo "[backup-db] complete: $compressed"
