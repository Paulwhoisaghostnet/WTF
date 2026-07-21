#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_SOURCE="$ROOT_DIR/tests/pasta_ravioli_contracts_test.py"
BUILD_DIR="$ROOT_DIR/build/pasta-ravioli-contracts"

if ! python3 -c "import smartpy" 2>/dev/null; then
  echo "smartpy module not found. Install with: pip install smartpy-tezos==0.24.1" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "[1/2] Running the five Ravioli fulfillment modes and atomic-failure checks..."
python3 "$TEST_SOURCE"

echo "[2/2] Compiling router, adapters, and underlying Pasta FA2 contracts..."
for source in \
  PastaPackRouterFA2.py \
  PastaGnocchiPackAdapter.py \
  PastaRotiniPackAdapter.py \
  PastaOpenEditionFA2.py \
  PastaGenerativeCollectionFA2.py; do
  slug="${source%.py}"
  smartpy compile "$ROOT_DIR/contracts/pasta-protocol/$source" "$BUILD_DIR/$slug"
done

echo "Ravioli contract integration tests and compiles completed."
