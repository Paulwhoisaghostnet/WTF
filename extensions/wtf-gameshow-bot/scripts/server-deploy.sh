#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────────────────────────────────────────
# Canonical deploy script for the WTF Gameshow Discord bot.
# - Uses the already-synced WTF app repo on the host
# - Installs prod deps
# - Rebuilds the CJS bundle
# - Prunes dev deps
# - Restarts the systemd service
# - Prints `systemctl status` tail for visual confirmation
# ────────────────────────────────────────────────────────────────────────────

BOT_ROOT="/srv/wtf-gameshow-bot"
WTF_APP_ROOT="${WTF_APP_ROOT:-/opt/platform/repos/wtf-app}"
BOT_CURRENT="${WTF_APP_ROOT}/extensions/wtf-gameshow-bot"
SERVICE_NAME="wtf-gameshow-bot.service"

cd "$BOT_CURRENT"

echo "[deploy] using extension source at $BOT_CURRENT"
if ! id wtfbot >/dev/null 2>&1; then
  echo "[deploy] creating wtfbot service user"
  useradd --system --home "$BOT_ROOT" --shell /usr/sbin/nologin wtfbot
fi
mkdir -p "$BOT_ROOT"
chown -R wtfbot:wtfbot "$BOT_ROOT"

install -m 0644 \
  "$BOT_CURRENT/infrastructure/systemd/wtf-gameshow-bot.service" \
  /etc/systemd/system/wtf-gameshow-bot.service
systemctl daemon-reload

echo "[deploy] installing dependencies"
npm ci --include=dev

echo "[deploy] building"
npm run build

echo "[deploy] pruning dev dependencies"
npm prune --omit=dev

chown -R wtfbot:wtfbot "$BOT_ROOT" "$BOT_CURRENT/node_modules" "$BOT_CURRENT/dist"

echo "[deploy] restarting service"
systemctl restart "$SERVICE_NAME"

sleep 2
systemctl --no-pager --lines=15 status "$SERVICE_NAME" || true
