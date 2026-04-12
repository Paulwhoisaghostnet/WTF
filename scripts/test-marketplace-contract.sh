#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_OUT="${1:-/tmp/wtf-contract-test}"
COMPILE_OUT="${2:-$ROOT_DIR/build/contracts}"
MARKETPLACE_SOURCE="$ROOT_DIR/contracts/WTFMarketplaceV1_2.py"
BARTER_SOURCE="$ROOT_DIR/contracts/WTFBarterBoardV1_2.py"
MARKETPLACE_TEST_OUT="$TEST_OUT/marketplace-v1_2"
BARTER_TEST_OUT="$TEST_OUT/barter-v1_2"
MARKETPLACE_COMPILE_OUT="$COMPILE_OUT/marketplace-v1_2"
BARTER_COMPILE_OUT="$COMPILE_OUT/barter-v1_2"

if ! command -v smartpy >/dev/null 2>&1; then
  echo "smartpy CLI was not found on PATH." >&2
  echo "Install smartpy-tezos first, then retry." >&2
  exit 1
fi

echo "[1/4] Running SmartPy marketplace V1.2 scenarios..."
smartpy test "$MARKETPLACE_SOURCE" "$MARKETPLACE_TEST_OUT" --purge

echo "[2/4] Running SmartPy barter V1.2 scenarios..."
smartpy test "$BARTER_SOURCE" "$BARTER_TEST_OUT" --purge

echo "[3/4] Compiling marketplace V1.2 contract..."
smartpy compile "$MARKETPLACE_SOURCE" "$MARKETPLACE_COMPILE_OUT" --purge

echo "[4/4] Compiling barter V1.2 contract..."
smartpy compile "$BARTER_SOURCE" "$BARTER_COMPILE_OUT" --purge

echo
echo "Contract V1.2 testing complete."
echo "Marketplace scenarios: $MARKETPLACE_TEST_OUT"
echo "Barter scenarios:      $BARTER_TEST_OUT"
echo "Marketplace compile:   $MARKETPLACE_COMPILE_OUT"
echo "Barter compile:        $BARTER_COMPILE_OUT"
