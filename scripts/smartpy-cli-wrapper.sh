#!/usr/bin/env bash
set -euo pipefail

SMARTPY_PYTHON="${SMARTPY_PYTHON:-/opt/smartpy/bin/python}"

usage() {
  cat <<'EOF'
Usage:
  smartpy compile <script> <output> [--purge]
  smartpy test    <script> <output> [--purge]
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

command="$1"
shift

case "$command" in
  help|--help|-h)
    usage
    ;;
  --version)
    "$SMARTPY_PYTHON" - <<'PY'
import importlib.metadata
print("smartpy-tezos", importlib.metadata.version("smartpy-tezos"))
PY
    ;;
  compile|test)
    if [[ $# -lt 2 ]]; then
      usage
      exit 1
    fi
    script="$1"
    output="$2"
    shift 2

    [[ -f "$script" ]] || { echo "File '$script' does not exist."; exit 1; }

    purge="no"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --purge)
          purge="yes"
          ;;
        *)
          echo "Unknown option: $1"
          exit 1
          ;;
      esac
      shift
    done

    mkdir -p "$output"
    if [[ "$purge" == "yes" ]]; then
      rm -rf "$output"/*
    fi

    SMARTPY_OUTPUT_DIR="$output" \
    SMARTPY_SCENARIO_NAME="." \
    "$SMARTPY_PYTHON" "$script"
    ;;
  *)
    echo "Unknown command: $command"
    usage
    exit 1
    ;;
esac
