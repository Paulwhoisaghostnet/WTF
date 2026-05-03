#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${WTF_APP_DIR:-/opt/wtf-combo}"
ENV_FILE="${WTF_ENV_FILE:-/etc/wtf/wtf.env}"
STORAGEBOX_TARGET="${STORAGEBOX_TARGET:-u587985@u587985.your-storagebox.de}"
STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
STORAGEBOX_KEY="${STORAGEBOX_KEY:-/etc/wtf/secrets/storagebox_ed25519}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive-wtf:}"

echo "[health] $(date -Is)"
echo
echo "[health] filesystems"
df -hT / /mnt/wtf-data /mnt/wtf-storagebox 2>/dev/null || true
echo
echo "[health] mounts"
findmnt / /mnt/wtf-data /mnt/wtf-storagebox 2>/dev/null || true
echo
echo "[health] app compose"
if [[ -d "$APP_DIR" ]]; then
  (cd "$APP_DIR" && docker compose ps || true)
else
  echo "missing app dir: $APP_DIR"
fi
echo
echo "[health] storage box sftp"
if [[ -f "$STORAGEBOX_KEY" ]]; then
  printf 'pwd\nbye\n' | sftp -i "$STORAGEBOX_KEY" \
    -o BatchMode=yes -o ConnectTimeout=15 -P "$STORAGEBOX_PORT" \
    "$STORAGEBOX_TARGET"
else
  echo "missing Storage Box key: $STORAGEBOX_KEY"
fi
echo
echo "[health] object storage env"
if [[ -f "$ENV_FILE" ]]; then
  for key in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
    if grep -Eq "^${key}=.+" "$ENV_FILE"; then echo "${key}=set"; else echo "${key}=missing_or_empty"; fi
  done
else
  echo "missing env file: $ENV_FILE"
fi
echo
echo "[health] google drive remote"
if command -v rclone >/dev/null 2>&1; then
  rclone lsd "$GDRIVE_REMOTE" --max-depth 1 >/dev/null && echo "gdrive remote ok: $GDRIVE_REMOTE" || echo "gdrive remote failed: $GDRIVE_REMOTE"
else
  echo "rclone missing"
fi
