#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUES_SOURCE="$ROOT_DIR/contracts/wtf-club-dues/WtfClubDues.py"
TEST_SOURCE="$ROOT_DIR/tests/wtf_club_dues_test.py"
BUILD_DIR="$ROOT_DIR/build/wtf-club-dues"

if ! python3 -c "import smartpy" 2>/dev/null; then
  echo "smartpy module not found. Install with: pip install smartpy-tezos==0.24.1" >&2
  exit 1
fi

if ! command -v smartpy >/dev/null 2>&1; then
  echo "smartpy CLI not found on PATH. Install smartpy-tezos and ensure ~/.local/bin is on PATH." >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "[1/2] Running SmartPy WTF club dues tests..."
python3 "$TEST_SOURCE"

echo "[2/2] Compiling WTF club dues contract..."
smartpy compile "$DUES_SOURCE" "$BUILD_DIR/club-dues"
find "$BUILD_DIR/club-dues" -name '*.tz' -print0 | while IFS= read -r -d '' file; do
  LC_ALL=C perl -0pi -e 's/[ \t]*#.*//g; s/^[ \t]+//mg; s/[ \t]+$//mg; s/\n{2,}/\n/g' "$file"
done

DUES_CODE="$(find "$BUILD_DIR/club-dues" -name '*_contract.tz' -print | sort | tail -n 1)"
if [[ -n "$DUES_CODE" ]]; then
  DUES_BYTES="$(wc -c < "$DUES_CODE" | tr -d ' ')"
  echo "Compiled club dues Michelson size: ${DUES_BYTES} bytes"
fi

echo
echo "WTF club dues tests and compile completed."
