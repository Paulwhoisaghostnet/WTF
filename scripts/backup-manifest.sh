#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${WTF_APP_DIR:-/opt/wtf-combo}"
ENV_FILE="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"
BACKUP_ROOT="${MANIFEST_BACKUP_STAGING_DIR:-${BACKUPS_STAGING_DIR_HOST:-/mnt/wtf-data/backups-staging}/manifests}"
CONTAINER_BACKUP_DIR="${MANIFEST_BACKUP_CONTAINER_DIR:-/app/backups/manifests}"
REMOTE_BASE="${STORAGEBOX_REMOTE_BASE:-wtf-server-backups}/manifests"
STORAGEBOX_TARGET="${STORAGEBOX_TARGET:-u587985@u587985.your-storagebox.de}"
STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
STORAGEBOX_KEY="${STORAGEBOX_KEY:-/etc/wtf/secrets/storagebox_ed25519}"
RCLONE_CONFIG_PATH="${RCLONE_CONFIG:-/etc/wtf/secrets/rclone.conf}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-}"
KEEP_DAYS="${MANIFEST_BACKUP_KEEP_DAYS:-30}"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

echo "[backup-manifest] exporting media manifest via app container"
cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" exec -T \
  -e "MANIFEST_BACKUP_DIR=${CONTAINER_BACKUP_DIR}" \
  app npx tsx scripts/backup-manifest.ts

latest="$(ls -1t "$BACKUP_ROOT"/media-manifest-*.jsonl.gz 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest" || ! -f "$latest" ]]; then
  echo "[backup-manifest] no manifest produced in $BACKUP_ROOT" >&2
  exit 1
fi

sha="${latest}.sha256"
sha256sum "$latest" > "$sha"

remote_dir="${REMOTE_BASE}/$(date -u +%Y/%m)"
if [[ -f "$STORAGEBOX_KEY" ]]; then
  echo "[backup-manifest] uploading to Storage Box $remote_dir"
  {
    echo "-mkdir wtf-server-backups"
    echo "-mkdir ${STORAGEBOX_REMOTE_BASE:-wtf-server-backups}"
    echo "-mkdir ${REMOTE_BASE}"
    echo "-mkdir ${REMOTE_BASE}/$(date -u +%Y)"
    echo "-mkdir ${remote_dir}"
    echo "put ${latest} ${remote_dir}/$(basename "$latest")"
    echo "put ${sha} ${remote_dir}/$(basename "$sha")"
    echo "bye"
  } | sftp -i "$STORAGEBOX_KEY" -o BatchMode=yes -P "$STORAGEBOX_PORT" "$STORAGEBOX_TARGET"
else
  echo "[backup-manifest] Storage Box key missing: $STORAGEBOX_KEY"
fi

if [[ -n "$GDRIVE_REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "[backup-manifest] Google Drive mirror skipped: rclone missing"
  elif [[ ! -f "$RCLONE_CONFIG_PATH" ]]; then
    echo "[backup-manifest] Google Drive mirror skipped: missing rclone config $RCLONE_CONFIG_PATH"
  else
    echo "[backup-manifest] mirroring to Google Drive $GDRIVE_REMOTE"
    rclone --config "$RCLONE_CONFIG_PATH" copy "$latest" "$GDRIVE_REMOTE/manifests/$(date -u +%Y/%m)"
    rclone --config "$RCLONE_CONFIG_PATH" copy "$sha" "$GDRIVE_REMOTE/manifests/$(date -u +%Y/%m)"
  fi
fi

find "$BACKUP_ROOT" -type f -name 'media-manifest-*.jsonl.gz*' -mtime +"$KEEP_DAYS" -print -delete
echo "[backup-manifest] complete: $latest"
