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

echo "[1/4] Running Ravioli fulfillment, fairness, liveness, and atomic-failure checks..."
smartpy test "$TEST_SOURCE" "$BUILD_DIR/scenarios"

echo "[2/4] Compiling router, blind controller, adapters, and underlying Pasta FA2 contracts..."
for source in \
  PastaPackRouterFA2.py \
  PastaBlindPackController.py \
  PastaGnocchiPackAdapter.py \
  PastaRotiniPackAdapter.py \
  PastaOpenEditionFA2.py \
  PastaGenerativeCollectionFA2.py; do
  slug="${source%.py}"
  smartpy compile "$ROOT_DIR/contracts/pasta-protocol/$source" "$BUILD_DIR/$slug"
done

echo "[3/4] Checking signed Tezos origination envelopes for split Ravioli contracts..."
node "$ROOT_DIR/scripts/pasta-protocol/check-smartpy-origination-size.mjs" \
  "$BUILD_DIR/PastaPackRouterFA2" \
  "$BUILD_DIR/PastaBlindPackController" \
  "$BUILD_DIR/PastaGnocchiPackAdapter" \
  "$BUILD_DIR/PastaRotiniPackAdapter"

echo "[4/4] Rebuilding public Ravioli artifacts and their source-bound deployment certificate..."
node "$ROOT_DIR/scripts/pasta-protocol/compile-fa2-template.mjs" \
  contracts/pasta-protocol/PastaPackRouterFA2.py \
  pasta-bundle \
  ravioli
node "$ROOT_DIR/scripts/pasta-protocol/compile-fa2-template.mjs" \
  contracts/pasta-protocol/PastaBlindPackController.py \
  pasta-blind-pack-controller \
  ravioli
node "$ROOT_DIR/scripts/pasta-protocol/compile-fa2-template.mjs" \
  contracts/pasta-protocol/PastaGnocchiPackAdapter.py \
  pasta-gnocchi-pack-adapter \
  ravioli
node "$ROOT_DIR/scripts/pasta-protocol/compile-fa2-template.mjs" \
  contracts/pasta-protocol/PastaRotiniPackAdapter.py \
  pasta-rotini-pack-adapter \
  ravioli
node "$ROOT_DIR/scripts/pasta-protocol/generate-ravioli-deployment-certificate.mjs"

echo "Ravioli contract integration tests, compiles, and deployment certification completed."
