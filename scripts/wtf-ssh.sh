#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${WTFOS_MACHINE_SSH_ENV:-$ROOT_DIR/.codex/machine-ssh.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

SSH_HOST_ALIAS="${WTFOS_SSH_HOST:-wtf}"
SSH_IDENTITY="${WTFOS_SSH_IDENTITY:-$HOME/.ssh/id_ed25519}"
SSH_IDENTITY_PUB="${WTFOS_SSH_IDENTITY_PUB:-$SSH_IDENTITY.pub}"

usage() {
  cat <<'EOF'
Usage:
  scripts/wtf-ssh.sh --doctor
  scripts/wtf-ssh.sh --check
  scripts/wtf-ssh.sh [ssh args...]

This wrapper is for Codex/local machine SSH to the wtf host. It sources:
  .codex/machine-ssh.env

Expected local env keys:
  WTFOS_SSH_HOST=wtf
  WTFOS_SSH_IDENTITY=/Users/joshuafarnworth/.ssh/id_ed25519
  WTFOS_SSH_AUTH_SOCK=/path/to/working/agent/socket   # optional override

It will not prompt for the key passphrase inside Codex. If the required identity
is not already loaded, it exits with the exact local fix to run.
EOF
}

load_agent_env() {
  if [[ -n "${WTFOS_SSH_AUTH_SOCK:-}" ]]; then
    export SSH_AUTH_SOCK="$WTFOS_SSH_AUTH_SOCK"
  fi

  if [[ -z "${SSH_AUTH_SOCK:-}" || ! -S "${SSH_AUTH_SOCK:-}" ]]; then
    local launch_sock=""
    launch_sock="$(launchctl getenv SSH_AUTH_SOCK 2>/dev/null || true)"
    if [[ -n "$launch_sock" && -S "$launch_sock" ]]; then
      export SSH_AUTH_SOCK="$launch_sock"
    fi
  fi

  ssh-add --apple-load-keychain </dev/null >/dev/null 2>&1 || ssh-add -A </dev/null >/dev/null 2>&1 || true
}

required_fingerprint() {
  if [[ ! -f "$SSH_IDENTITY_PUB" ]]; then
    return 1
  fi

  ssh-keygen -lf "$SSH_IDENTITY_PUB" | awk '{print $2}'
}

agent_has_required_identity() {
  local fingerprint="$1"
  if [[ -z "$fingerprint" ]]; then
    return 1
  fi

  ssh-add -l 2>/dev/null | grep -Fq "$fingerprint"
}

print_identity_blocker() {
  local fingerprint="${1:-unknown}"

  cat >&2 <<EOF
[wtf-ssh] Required local SSH identity is not loaded in the agent Codex can see.

Host alias: $SSH_HOST_ALIAS
Identity:   $SSH_IDENTITY
Fingerprint: $fingerprint

Run this once in your normal terminal, then retry:
  ssh-add --apple-use-keychain "$SSH_IDENTITY"

If your normal terminal already works with 'ssh $SSH_HOST_ALIAS' but Codex still
cannot see the same agent, run this from that working terminal:
  printf 'WTFOS_SSH_AUTH_SOCK=%s\n' "\$SSH_AUTH_SOCK" >> "$ENV_FILE"

This wrapper refuses to guess with deploy/GitHub keys or hang on a passphrase
prompt inside Codex.
EOF
}

ensure_required_identity() {
  load_agent_env

  local fingerprint=""
  if ! fingerprint="$(required_fingerprint)"; then
    echo "[wtf-ssh] Missing public key file: $SSH_IDENTITY_PUB" >&2
    exit 78
  fi

  if ! agent_has_required_identity "$fingerprint"; then
    print_identity_blocker "$fingerprint"
    exit 78
  fi
}

doctor() {
  load_agent_env

  local fingerprint="missing-public-key"
  if [[ -f "$SSH_IDENTITY_PUB" ]]; then
    fingerprint="$(required_fingerprint)"
  fi

  echo "wtf ssh host alias: $SSH_HOST_ALIAS"
  echo "identity: $SSH_IDENTITY"
  echo "identity public key: $SSH_IDENTITY_PUB"
  echo "identity fingerprint: $fingerprint"
  echo "env file: $ENV_FILE"
  echo "SSH_AUTH_SOCK: ${SSH_AUTH_SOCK:-unset}"

  if agent_has_required_identity "$fingerprint"; then
    echo "agent status: required identity loaded"
    return 0
  fi

  echo "agent status: required identity NOT loaded"
  return 1
}

case "${1:-}" in
  --help|-h)
    usage
    ;;
  --doctor)
    doctor
    ;;
  --check)
    shift
    ensure_required_identity
    if [[ "$#" -gt 0 ]]; then
      exec ssh "$SSH_HOST_ALIAS" "$@"
    fi
    exec ssh "$SSH_HOST_ALIAS" 'printf "host=%s\n" "$(hostname)"; uname -a; command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true; command -v llama-server >/dev/null 2>&1 && llama-server --version || true'
    ;;
  --)
    shift
    ensure_required_identity
    exec ssh "$SSH_HOST_ALIAS" "$@"
    ;;
  *)
    ensure_required_identity
    exec ssh "$SSH_HOST_ALIAS" "$@"
    ;;
esac
