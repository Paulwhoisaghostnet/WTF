#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="wtf_${TIMESTAMP}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[backup] Starting pg_dump at $(date -Iseconds)"
pg_dump --format=custom --no-owner "$DB_URL" > "$FILEPATH"
echo "[backup] Wrote $FILEPATH ($(du -h "$FILEPATH" | cut -f1))"

echo "[backup] Pruning backups older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -name "wtf_*.dump" -mtime +${KEEP_DAYS} -delete

echo "[backup] Done. Current backups:"
ls -lh "$BACKUP_DIR"/wtf_*.dump 2>/dev/null || echo "  (none)"
