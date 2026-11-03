#!/usr/bin/env bash
# Deploy wtf-operator-signer to the Hetzner box. Bundles with esbuild,
# copies dist/ + package.json, preserves /etc/wtf-operator-signer.env
# across deploys. Installs and restarts only when the bundle or policy probe differs.
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

echo "→ installing pinned build deps"
npm ci --no-audit --no-fund

echo "→ building bundle"
npm run build

hash_file() {
  node -e 'const{createHash}=require("node:crypto"),{readFileSync}=require("node:fs");process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$1"
}
remote_hash() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo sha256sum '$1' 2>/dev/null | cut -d' ' -f1" || true
}
verify_health() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo bash /opt/wtf-operator-signer/deploy/verify-service.sh"
}

local_bundle_hash="$(hash_file dist/index.cjs)"
local_lock_hash="$(hash_file package-lock.json)"
local_unit_hash="$(hash_file deploy/wtf-operator-signer.service)"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo install -d -o wtf-signer -g wtf /opt/wtf-operator-signer/dist /opt/wtf-operator-signer/deploy && sudo install -d -m 770 -o wtf-signer -g wtf /run/wtf && sudo install -d -m 700 -o wtf-signer -g wtf /var/lib/wtf && sudo install -d -m 750 -o root -g wtf /etc/wtf/secrets"
rsync -az -e "ssh ${SSH_OPTS[*]}" --rsync-path "sudo rsync" \
  deploy/verify-health.mjs deploy/verify-service.sh "$REMOTE:/opt/wtf-operator-signer/deploy/"
remote_bundle_hash="$(remote_hash /opt/wtf-operator-signer/dist/index.cjs)"
remote_lock_hash="$(remote_hash /opt/wtf-operator-signer/package-lock.json)"
remote_unit_hash="$(remote_hash /etc/systemd/system/wtf-operator-signer.service)"

if [[ "$local_bundle_hash" == "$remote_bundle_hash" && "$local_lock_hash" == "$remote_lock_hash" && "$local_unit_hash" == "$remote_unit_hash" ]] && \
   ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl is-active --quiet wtf-operator-signer" && verify_health; then
  echo "✓ signer bundle already matches source and reports sponsored prize claim support"
  exit 0
fi

echo "→ shipping changed signer bundle + package metadata → $REMOTE:/opt/wtf-operator-signer/"
rsync -az -e "ssh ${SSH_OPTS[*]}" --rsync-path "sudo rsync" \
  deploy/wtf-operator-signer.service "$REMOTE:/tmp/wtf-operator-signer.service"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo install -o root -g root -m 0644 /tmp/wtf-operator-signer.service /etc/systemd/system/wtf-operator-signer.service && sudo rm -f /tmp/wtf-operator-signer.service && sudo systemctl daemon-reload"
rsync -az -e "ssh ${SSH_OPTS[*]}" --rsync-path "sudo rsync" \
  dist/ "$REMOTE:/opt/wtf-operator-signer/dist/"
rsync -az -e "ssh ${SSH_OPTS[*]}" --rsync-path "sudo rsync" \
  package.json package-lock.json "$REMOTE:/opt/wtf-operator-signer/"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo chown -R wtf-signer:wtf /opt/wtf-operator-signer"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo -u wtf-signer env HOME=/tmp npm_config_cache=/tmp/wtf-signer-npm-cache npm --prefix /opt/wtf-operator-signer ci --omit=dev --no-audit --no-fund"

echo "→ restarting systemd unit"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl restart wtf-operator-signer"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl is-active --quiet wtf-operator-signer"
[[ "$(remote_hash /opt/wtf-operator-signer/dist/index.cjs)" == "$local_bundle_hash" ]] || { echo "Signer bundle hash differs after install." >&2; exit 1; }
verify_health

echo "✓ signer deploy complete: bundle hash $local_bundle_hash"
