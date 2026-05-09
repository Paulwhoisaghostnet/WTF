#!/usr/bin/env bash
# Deploy wtf-operator-signer to the Hetzner box. Bundles with esbuild,
# copies dist/ + package.json, preserves /etc/wtf-operator-signer.env
# across deploys. Restarts the service at the end.
#
# Expected env:
#   HETZNER_SSH_HOST   — e.g. wtfgameshow.app
#   HETZNER_SSH_USER   — e.g. deploy
#   HETZNER_SSH_KEY    — local path to the private key (optional if agent)
set -euo pipefail

: "${HETZNER_SSH_HOST:?HETZNER_SSH_HOST is required}"
: "${HETZNER_SSH_USER:?HETZNER_SSH_USER is required}"

REMOTE="${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "${HETZNER_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${HETZNER_SSH_KEY}")
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ installing deps"
npm install --no-audit --no-fund

echo "→ building bundle"
npm run build

echo "→ shipping dist/ + package metadata → $REMOTE:/opt/wtf-operator-signer/"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo install -d -o wtf-signer -g wtf /opt/wtf-operator-signer/dist && sudo install -d -m 700 -o wtf-signer -g wtf /var/lib/wtf && sudo install -d -m 750 -o root -g wtf /etc/wtf/secrets"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --rsync-path "sudo rsync" \
  dist/ "$REMOTE:/opt/wtf-operator-signer/dist/"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --rsync-path "sudo rsync" \
  package.json package-lock.json "$REMOTE:/opt/wtf-operator-signer/"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo chown -R wtf-signer:wtf /opt/wtf-operator-signer"
ssh "${SSH_OPTS[@]}" "$REMOTE" "cd /opt/wtf-operator-signer && sudo -u wtf-signer env HOME=/tmp npm_config_cache=/tmp/wtf-signer-npm-cache npm ci --omit=dev --no-audit --no-fund"

echo "→ restarting systemd unit"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl restart wtf-operator-signer"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl status --no-pager wtf-operator-signer | head -20"

echo "✓ deploy complete"
