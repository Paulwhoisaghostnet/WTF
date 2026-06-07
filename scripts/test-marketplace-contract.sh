#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE_SOURCE="$ROOT_DIR/contracts/WTFMarketplaceV1_2.py"
MARKETPLACE_V2_SOURCE="$ROOT_DIR/contracts/WTFMarketplaceV2.py"
BARTER_SOURCE="$ROOT_DIR/contracts/WTFBarterBoardV1_2.py"

if ! python3 -c "import smartpy" 2>/dev/null; then
  echo "smartpy module not found. Install with: pip install smartpy-tezos" >&2
  exit 1
fi

echo "[1/3] Running SmartPy marketplace V1.2 tests + compile..."
python3 "$MARKETPLACE_SOURCE"

echo "[2/3] Running SmartPy marketplace V2 tests + compile..."
python3 "$MARKETPLACE_V2_SOURCE"

echo "[3/3] Running SmartPy barter V1.2 tests + compile..."
python3 "$BARTER_SOURCE"

echo
echo "Marketplace and barter contract testing complete."
