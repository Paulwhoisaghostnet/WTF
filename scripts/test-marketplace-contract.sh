#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_OUT="${1:-/tmp/wtf-marketplace-test}"
COMPILE_OUT="${2:-$ROOT_DIR/build/contracts}"

if ! command -v smartpy >/dev/null 2>&1; then
  echo "smartpy CLI was not found on PATH." >&2
  echo "Install smartpy-tezos first, then retry." >&2
  exit 1
fi

echo "[1/2] Running SmartPy scenarios..."
smartpy test "$ROOT_DIR/contracts/WTFMarketplace.py" "$TEST_OUT" --purge

echo "[2/2] Compiling contract..."
smartpy compile "$ROOT_DIR/contracts/WTFMarketplace.py" "$COMPILE_OUT" --purge

echo
echo "Contract testing complete."
echo "Scenarios output: $TEST_OUT"
echo "Compile output:   $COMPILE_OUT"
