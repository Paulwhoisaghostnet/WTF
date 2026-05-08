#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASINO_SOURCE="$ROOT_DIR/contracts/wtf-casino-membership/WtfCasinoMembership.py"
TEST_SOURCE="$ROOT_DIR/tests/wtf_casino_membership_test.py"
BUILD_DIR="$ROOT_DIR/build/wtf-casino-membership"

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

echo "[1/2] Running SmartPy WTF Casino membership tests..."
python3 "$TEST_SOURCE"

echo "[2/2] Compiling Casino membership contract..."
smartpy compile "$CASINO_SOURCE" "$BUILD_DIR/membership"
find "$BUILD_DIR/membership" -name '*.tz' -print0 | while IFS= read -r -d '' file; do
  LC_ALL=C perl -0pi -e 's/[ \t]*#.*//g; s/^[ \t]+//mg; s/[ \t]+$//mg; s/\n{2,}/\n/g' "$file"
done

MEMBERSHIP_CODE="$(find "$BUILD_DIR/membership" -name '*_contract.tz' -print | sort | tail -n 1)"
if [[ -n "$MEMBERSHIP_CODE" ]]; then
  MEMBERSHIP_BYTES="$(wc -c < "$MEMBERSHIP_CODE" | tr -d ' ')"
  echo "Compiled Casino membership Michelson size: ${MEMBERSHIP_BYTES} bytes"
fi

echo
echo "WTF Casino membership tests and compile completed."
