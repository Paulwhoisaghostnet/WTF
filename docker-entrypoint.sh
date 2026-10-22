#!/bin/sh
# Idempotent privilege-drop entrypoint.
#
# Container image runs as root so that, on first boot after switching
# to a non-root container, we can fix ownership of named volumes that
# were originally created by an older root-running build (existing
# Studio uploads, TV cache, DB backups).  Once perms are squared away
# we exec as the unprivileged `node` user (UID 1000) under tini.
#
# After the first successful repair, a per-volume marker lets future
# boots skip the recursive ownership walk entirely.

set -eu

WRITABLE_DIRS="/app/cache /app/uploads /app/uploads-staging /app/tmp-processing /app/backups /app/wtfiap-data"
OWNERSHIP_MARKER=".node-owner-ok"

is_placeholder_commit_ref() {
  case "${1:-}" in
    ""|"dev"|"development"|"local"|"unknown"|"undefined"|"null")
      return 0
      ;;
  esac
  return 1
}

if [ "${NODE_ENV:-}" = "production" ]; then
  commit_ref="${COMMIT_REF:-${COMMIT_SHA:-}}"
  if is_placeholder_commit_ref "$commit_ref"; then
    echo "[entrypoint] ERROR: production COMMIT_REF/COMMIT_SHA is missing or placeholder; use scripts/server-deploy.sh so live health can report the deployed commit"
    exit 1
  fi
  case "$commit_ref" in
    *[!0-9a-fA-F]*)
      echo "[entrypoint] ERROR: production COMMIT_REF/COMMIT_SHA must be a git hex ref, got '$commit_ref'"
      exit 1
      ;;
  esac
  if [ "${#commit_ref}" -lt 7 ] || [ "${#commit_ref}" -gt 40 ]; then
    echo "[entrypoint] ERROR: production COMMIT_REF/COMMIT_SHA must be 7-40 hex characters, got '$commit_ref'"
    exit 1
  fi
fi

if [ "$(id -u)" = "0" ]; then
  # The host signer keeps its socket and parent private to its own group.
  # Derive that mounted GID instead of assuming host/container group IDs match.
  # gosu initializes node's groups, so Compose group_add alone is not enough.
  signer_socket="${WTF_OPERATOR_SIGNER_SOCKET:-/run/wtf/operator-signer.sock}"
  if [ -S "$signer_socket" ]; then
    signer_gid="$(stat -c '%g' "$signer_socket")"
    if [ "$signer_gid" = "0" ]; then
      echo "[entrypoint] ERROR: signer socket must use a dedicated non-root group"
      exit 1
    fi
    signer_group="$(getent group "$signer_gid" | cut -d: -f1)"
    if [ -z "$signer_group" ]; then
      signer_group="wtf-operator-signer-socket"
      groupadd --gid "$signer_gid" "$signer_group"
    fi
    usermod --append --groups "$signer_group" node
    if ! gosu node test -w "$signer_socket"; then
      echo "[entrypoint] ERROR: node cannot access the configured signer socket"
      exit 1
    fi
  fi

  for d in $WRITABLE_DIRS; do
    if [ -d "$d" ]; then
      marker="$d/$OWNERSHIP_MARKER"
      dir_owner="$(stat -c '%u:%g' "$d" 2>/dev/null || echo '')"
      if [ "$dir_owner" = "1000:1000" ] && [ -f "$marker" ]; then
        continue
      fi

      # Best-effort.  If a volume mount is read-only or there are
      # broken symlinks, log and keep going; the app will fail loudly
      # on the actual write path if that genuinely matters.
      if chown -R node:node "$d" 2>/dev/null; then
        touch "$marker"
        chown node:node "$marker" 2>/dev/null || true
      else
        echo "[entrypoint] warning: chown on $d failed; continuing"
      fi
    fi
  done

  exec /usr/bin/tini -- gosu node "$@"
fi

# Already non-root (e.g. someone overrode --user at runtime); just
# exec under tini without a privilege drop.
exec /usr/bin/tini -- "$@"
