#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXCHANGE_SOURCE="$ROOT_DIR/contracts/wtf-xtz-exchange/WtfXtzExchange.py"
DUMMY_WTF_SOURCE="$ROOT_DIR/contracts/wtf-xtz-exchange/DummyWtfFA2.py"
TEST_SOURCE="$ROOT_DIR/tests/wtf_xtz_exchange_test.py"
BUILD_DIR="$ROOT_DIR/build/wtf-xtz-exchange"

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

echo "[1/3] Running SmartPy WTF -> XTZ exchange tests..."
python3 "$TEST_SOURCE"

echo "[2/3] Compiling exchange contract..."
smartpy compile "$EXCHANGE_SOURCE" "$BUILD_DIR/exchange"

echo "[3/3] Compiling dummy WTF FA2 contract..."
smartpy compile "$DUMMY_WTF_SOURCE" "$BUILD_DIR/dummy-wtf-fa2"

echo
echo "WTF -> XTZ exchange tests and compile completed."
