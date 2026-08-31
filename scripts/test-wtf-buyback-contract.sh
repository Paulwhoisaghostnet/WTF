#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/contracts/wtf-buyback/WtfBuybackV1.py"
BUILD_ROOT="$(mktemp -d)"
trap 'rm -rf "$BUILD_ROOT"' EXIT

if ! python3 -c "import smartpy" 2>/dev/null; then
  echo "smartpy module not found. Install with: pip install smartpy-tezos" >&2
  exit 1
fi

SMARTPY_PYTHON="$(command -v python3)" \
  bash "$ROOT_DIR/scripts/smartpy-cli-wrapper.sh" test "$SOURCE" "$BUILD_ROOT/test"
SMARTPY_PYTHON="$(command -v python3)" \
  bash "$ROOT_DIR/scripts/smartpy-cli-wrapper.sh" compile "$SOURCE" "$BUILD_ROOT/compile"

ARTIFACT_DIR="$BUILD_ROOT/compile/WtfBuybackV1"
CONTRACT_ARTIFACT="$ARTIFACT_DIR/step_001_cont_0_contract.json"
STORAGE_ARTIFACT="$ARTIFACT_DIR/step_001_cont_0_storage.json"
test -f "$CONTRACT_ARTIFACT"
test -f "$STORAGE_ARTIFACT"
node "$ROOT_DIR/scripts/wtf-buyback/check-compiled-artifact.mjs" \
  "$CONTRACT_ARTIFACT" \
  "$STORAGE_ARTIFACT"

echo "WtfBuybackV1 tests, compile, artifact, entrypoint, and size checks passed."
