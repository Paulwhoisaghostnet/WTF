#!/bin/sh
# Idempotent privilege-drop entrypoint.
#
# Container image runs as root so that, on first boot after switching
# to a non-root container, we can fix ownership of named volumes that
# were originally created by an older root-running build (existing
# Studio uploads, TV cache, DB backups).  Once perms are squared away
# we exec as the unprivileged `node` user (UID 1000) under tini.
#
# Subsequent boots are essentially free: chown is a no-op when the
# tree is already owned by node.

set -eu

WRITABLE_DIRS="/app/cache /app/uploads /app/backups"

if [ "$(id -u)" = "0" ]; then
  for d in $WRITABLE_DIRS; do
    if [ -d "$d" ]; then
      # Best-effort.  If a volume mount is read-only or there are
      # broken symlinks, log and keep going; the app will fail loudly
      # on the actual write path if that genuinely matters.
      chown -R node:node "$d" 2>/dev/null || \
        echo "[entrypoint] warning: chown on $d failed; continuing"
    fi
  done

  exec /usr/bin/tini -- gosu node "$@"
fi

# Already non-root (e.g. someone overrode --user at runtime); just
# exec under tini without a privilege drop.
exec /usr/bin/tini -- "$@"
