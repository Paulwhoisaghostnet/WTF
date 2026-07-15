#!/usr/bin/env bash
# Cold-storage backup for the wtfOS AT DATA BOX (dedicated PDS fleet).
#
# Context: as of the storage split, the PDS fleet (master + 7 domain + users + private)
# run on a dedicated, privately-networked box (private 10.0.0.3).
# Their data lives in HOST BIND MOUNTS under /mnt/wtf-data/<vol> (NOT Docker named volumes).
# The wtfOS app/AppView + canonical Postgres stay on the main box and are backed up by the
# existing Supabase/Postgres job; THIS script covers only the data-box volumes.
#
# Run this ON THE DATA BOX. It is read-only against the PDS data and only writes tarballs
# to the existing Hetzner Storage Box cold storage over SFTP/SCP (port 23). Fully reversible.
#
# NOTE: PDS 0.4 stores per-account SQLite + on-disk blocks under /pds. A hot tar is usually
# restorable, but for a guaranteed-consistent snapshot, `docker compose stop` the PDS fleet
# first (brief AppView write outage; the app stays up) then restart after the tar step.
set -euo pipefail

DATA_ROOT="${WTFOS_DATA_ROOT:-/mnt/wtf-data}"
STORAGE_HOST="${WTFOS_STORAGEBOX_HOST:-u587985.your-storagebox.de}"
STORAGE_PORT="${WTFOS_STORAGEBOX_PORT:-23}"
STORAGE_USER="${WTFOS_STORAGEBOX_USER:-u587985}"
REMOTE_DIR="${WTFOS_STORAGEBOX_DIR:-wtf-server-backups/atproto-databox}"
STAMP="$(date +%F-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The 10 PDS data dirs (see docker-compose.yml WTFOS_PDS_*_DATA_DIR).
VOLS="pds pds-social pds-commerce pds-media pds-arcade pds-tezos pds-ops pds-os pds-users pds-private"

echo "[databox-backup] $STAMP snapshotting under $DATA_ROOT"
for v in $VOLS; do
  src="$DATA_ROOT/$v"
  if [ ! -d "$src" ]; then echo "  skip missing $src"; continue; fi
  tar czf "$WORK/${v}_${STAMP}.tar.gz" -C "$src" .
  echo "  packed $v ($(du -h "$WORK/${v}_${STAMP}.tar.gz" | cut -f1))"
done

echo "[databox-backup] uploading to ${STORAGE_USER}@${STORAGE_HOST}:${STORAGE_PORT}/${REMOTE_DIR}/${STAMP}/"
# Hetzner Storage Box speaks SFTP/SCP on :23. Create the dated dir, then upload.
ssh -p "$STORAGE_PORT" "${STORAGE_USER}@${STORAGE_HOST}" "mkdir -p ${REMOTE_DIR}/${STAMP}" 2>/dev/null || true
scp -P "$STORAGE_PORT" "$WORK"/*.tar.gz "${STORAGE_USER}@${STORAGE_HOST}:${REMOTE_DIR}/${STAMP}/"
echo "[databox-backup] done: $(ls "$WORK"/*.tar.gz | wc -l) archives -> ${REMOTE_DIR}/${STAMP}/"
echo "[databox-backup] reminder: PDS rotation keys + WTFOS_PRIVATE_PDS_ENC_KEY are NOT in these"
echo "                 volumes — keep them in the secrets manager + offline escrow (see runbook)."
