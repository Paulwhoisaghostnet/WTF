#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${WTFIAP_ESCROW_BUILD_DIR:-$(mktemp -d)}"
if [[ -z "${WTFIAP_ESCROW_BUILD_DIR:-}" ]]; then
  trap 'rm -rf "$BUILD_DIR"' EXIT
fi
python3 - <<'PY'
import importlib.metadata
assert importlib.metadata.version('smartpy-tezos') == '0.24.1', 'Use contracts/wtfiap-escrow/requirements.txt'
PY
python3 "$ROOT_DIR/contracts/wtfiap-escrow/test_arithmetic.py"
SMARTPY_PYTHON="$(command -v python3)" bash "$ROOT_DIR/scripts/smartpy-cli-wrapper.sh" test \
  "$ROOT_DIR/contracts/wtfiap-escrow/test_escrow.py" "$BUILD_DIR"
node "$ROOT_DIR/contracts/wtfiap-escrow/check_artifacts.mjs" "$BUILD_DIR/wtfiap_escrow_native"
echo 'WTFIAP owner-approved local scenarios, independent arithmetic, compile and interface parity passed; no network writes.'
