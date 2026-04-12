#!/usr/bin/env bash
# Run Claude Code against llama-server (Anthropic Messages API on /v1/messages).
# Prereq: start llama-server first, e.g.:
#   llama-server -m /path/to/model.gguf --host 127.0.0.1 --port 8080
#
# IMPORTANT: Use 127.0.0.1 in ANTHROPIC_BASE_URL, not "localhost".
# On macOS, "localhost" often resolves to IPv6 (::1) first; llama-server
# typically listens on IPv4 only (127.0.0.1), so you get "connection refused".
#
# Optional overrides:
#   ANTHROPIC_BASE_URL   default http://127.0.0.1:8080
#   LOCAL_MODEL          default Qwen3-4B-Q4_K_M.gguf (must match /v1/models on your server)
#   ANTHROPIC_API_KEY    must match llama-server --api-key if you use that flag

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${ANTHROPIC_BASE_URL:-http://127.0.0.1:8080}"
if [[ "$BASE" == *"localhost"* ]]; then
  echo "Warning: ANTHROPIC_BASE_URL contains 'localhost'; prefer http://127.0.0.1:8080 (IPv4) to avoid connection refused on macOS." >&2
fi

export ANTHROPIC_BASE_URL="$BASE"
# Non-empty key: Anthropic SDK + llama-server both accept a dummy value when the server has no --api-key
export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-local-llama}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-local-llama}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost,localhost.localdomain}"

if ! curl -sS --connect-timeout 2 -o /dev/null "$BASE/health"; then
  echo "Error: nothing answered at $BASE/health — start llama-server first, e.g.:" >&2
  echo "  llama-server -m \"\$HOME/.lmstudio/models/.../model.gguf\" --host 127.0.0.1 --port 8080" >&2
  exit 1
fi

LOCAL_MODEL="${LOCAL_MODEL:-Qwen3-4B-Q4_K_M.gguf}"

exec claude --model "$LOCAL_MODEL" "$@"
