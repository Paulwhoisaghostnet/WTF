#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKET_SOURCE="$ROOT_DIR/contracts/wtf-in-app-market/WtfInAppMarket.py"
DUMMY_WTF_SOURCE="$ROOT_DIR/contracts/wtf-xtz-exchange/DummyWtfFA2.py"
TEST_SOURCE="$ROOT_DIR/tests/wtf_in_app_market_test.py"
BUILD_DIR="$ROOT_DIR/build/wtf-in-app-market"

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

echo "[1/3] Running SmartPy WTF in-app market tests..."
python3 "$TEST_SOURCE"

echo "[2/3] Compiling in-app market contract..."
smartpy compile "$MARKET_SOURCE" "$BUILD_DIR/market"
find "$BUILD_DIR/market" -name '*.tz' -print0 | while IFS= read -r -d '' file; do
  LC_ALL=C perl -0pi -e 's/[ \t]*#.*//g; s/^[ \t]+//mg; s/[ \t]+$//mg; s/\n{2,}/\n/g' "$file"
done

echo "[3/3] Compiling dummy WTF FA2 contract..."
smartpy compile "$DUMMY_WTF_SOURCE" "$BUILD_DIR/dummy-wtf-fa2"
find "$BUILD_DIR/dummy-wtf-fa2" -name '*.tz' -print0 | while IFS= read -r -d '' file; do
  LC_ALL=C perl -0pi -e 's/[ \t]*#.*//g; s/^[ \t]+//mg; s/[ \t]+$//mg; s/\n{2,}/\n/g' "$file"
done

MARKET_CODE="$(find "$BUILD_DIR/market" -name '*_contract.tz' -print | sort | tail -n 1)"
if [[ -n "$MARKET_CODE" ]]; then
  MARKET_BYTES="$(wc -c < "$MARKET_CODE" | tr -d ' ')"
  echo "Compiled in-app market Michelson size: ${MARKET_BYTES} bytes"
fi

echo
echo "WTF in-app market tests and compile completed."
