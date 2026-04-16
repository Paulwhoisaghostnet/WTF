#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE_SOURCE="$ROOT_DIR/contracts/WTFMarketplaceV1_2.py"
BARTER_SOURCE="$ROOT_DIR/contracts/WTFBarterBoardV1_2.py"

if ! python -c "import smartpy" 2>/dev/null; then
  echo "smartpy module not found. Install with: pip install smartpy-tezos" >&2
  exit 1
fi

echo "[1/2] Running SmartPy marketplace V1.2 tests + compile..."
python "$MARKETPLACE_SOURCE"

echo "[2/2] Running SmartPy barter V1.2 tests + compile..."
python "$BARTER_SOURCE"

echo
echo "Contract V1.2 testing complete."
