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

WRITABLE_DIRS="/app/cache /app/uploads /app/uploads-staging /app/tmp-processing /app/backups"
OWNERSHIP_MARKER=".node-owner-ok"

if [ "$(id -u)" = "0" ]; then
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
