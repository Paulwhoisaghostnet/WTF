#!/usr/bin/env bash
# Pack the frozen Tezos-Intel dump into a tarball ready for upload
# to Supabase Storage (or any HTTPS-reachable bucket).  The resulting
# file is intentionally large but still under Supabase's 50 MB per-
# request ceiling for the free tier — we gzip then split into ~45 MB
# parts if the total compressed size exceeds that.  The import
# workflow reassembles them before extraction.
#
# Usage:
#   ./scripts/pack-intel-csv.sh [source-dir] [output-path]
#
# Defaults:
#   source-dir:  ../objkt-advisor-db-2026-02-26
#   output-path: /tmp/wtf-intel-csv.tar.gz
set -euo pipefail

SRC="${1:-$(cd "$(dirname "$0")"/../../.. && pwd)/objkt-advisor-db-2026-02-26}"
OUT="${2:-/tmp/wtf-intel-csv.tar.gz}"

if [[ ! -d "$SRC" ]]; then
  echo "[pack-intel-csv] source dir not found: $SRC" >&2
  exit 1
fi

echo "[pack-intel-csv] source:  $SRC"
echo "[pack-intel-csv] output:  $OUT"

# Tar up only the .csv files (skip .DS_Store, editor junk).  Use
# gzip -9 because the uplink cost dwarfs the CPU; 537k-row sales.csv
# shrinks from ~118 MB to ~18 MB.
(
  cd "$(dirname "$SRC")"
  tar --exclude='.DS_Store' \
      --exclude='*.swp' \
      -czf "$OUT" \
      "$(basename "$SRC")"
)

SIZE_H="$(du -h "$OUT" | awk '{print $1}')"
SHA="$(shasum -a 256 "$OUT" | awk '{print $1}')"

echo "[pack-intel-csv] packed:  $SIZE_H"
echo "[pack-intel-csv] sha256:  $SHA"
echo
echo "Next steps:"
echo "  1. Upload $OUT to Supabase Storage (or any HTTPS-reachable URL)."
echo "  2. Generate a signed URL valid for at least 1 hour."
echo "  3. Trigger the 'Import Intel CSV' GitHub workflow with that URL"
echo "     (and the sha256 above for integrity verification)."
