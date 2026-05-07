#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────────────────────────────────────────
# WTF Gameshow Discord bot — first-time Hetzner provisioning.
#
# Idempotent. Safe to re-run. Expects to run as root (or with passwordless
# sudo). Installs Node.js 22, creates the `wtfbot` user, verifies the WTF app
# repo extension exists, drops the systemd unit in place, and enables the
# service. Deploy/build is handled by scripts/server-deploy.sh.
#
# Environment variables:
#   WTF_APP_ROOT   path to the checked-out WTF app repo
# ────────────────────────────────────────────────────────────────────────────

BOT_ROOT="/srv/wtf-gameshow-bot"
WTF_APP_ROOT="${WTF_APP_ROOT:-/opt/platform/repos/wtf-app}"
BOT_CURRENT="${WTF_APP_ROOT}/extensions/wtf-gameshow-bot"
SERVICE_NAME="wtf-gameshow-bot.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

echo "[provision] installing system packages"
apt-get update -y
apt-get install -y curl ca-certificates git jq

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 22 ]]; then
  echo "[provision] installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[provision] creating wtfbot user"
if ! id wtfbot >/dev/null 2>&1; then
  useradd --system --home "$BOT_ROOT" --shell /usr/sbin/nologin wtfbot
fi
mkdir -p "$BOT_ROOT"
chown -R wtfbot:wtfbot "$BOT_ROOT"

if [[ ! -f "$BOT_CURRENT/package.json" ]]; then
  echo "[provision] bot extension missing at $BOT_CURRENT" >&2
  echo "[provision] deploy the WTF app repo before provisioning the bot" >&2
  exit 2
fi

if [[ ! -f "$BOT_ROOT/.env" ]]; then
  echo "[provision] WARN: $BOT_ROOT/.env missing. Copy .env from your workstation before starting the service."
fi

echo "[provision] installing systemd unit"
install -m 0644 \
  "$BOT_CURRENT/infrastructure/systemd/wtf-gameshow-bot.service" \
  /etc/systemd/system/wtf-gameshow-bot.service
systemctl daemon-reload

echo "[provision] enabling service"
systemctl enable "$SERVICE_NAME" || true

echo "[provision] done — run extensions/wtf-gameshow-bot/scripts/server-deploy.sh to build + restart"
