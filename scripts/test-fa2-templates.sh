#!/usr/bin/env bash
# test-fa2-templates.sh — Run SmartPy tests for all FA2 template contracts.
#
# Requires `smartpy` CLI to be installed and on PATH.
# Install: pip install smartpy
#
# Usage:
#   bash scripts/test-fa2-templates.sh
#
# Output artifacts land in /tmp/fa2-template-tests/.

set -euo pipefail

CONTRACTS_DIR="$(cd "$(dirname "$0")/../contracts/fa2-templates" && pwd)"
OUT_DIR="/tmp/fa2-template-tests"

mkdir -p "$OUT_DIR"

run_test() {
  local contract="$1"
  local name
  name="$(basename "$contract" .py)"
  echo "▶ Testing $name …"
  python3 "$contract" 2>&1 | tee "$OUT_DIR/$name.log"
  echo "✔ $name OK"
}

run_test "$CONTRACTS_DIR/fa2_fixed_supply.py"
run_test "$CONTRACTS_DIR/fa2_mintable.py"

echo ""
echo "All FA2 template tests passed. Logs in $OUT_DIR/"
