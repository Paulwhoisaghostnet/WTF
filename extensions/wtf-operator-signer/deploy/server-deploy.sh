#!/usr/bin/env bash
# Build a signer package, install one on the deploy host, or do both over SSH.
# Installation preserves the signer environment and keyring on the host.
set -euo pipefail

package_members=(
  dist/index.cjs
  package.json
  package-lock.json
  deploy/wtf-operator-signer.service
  deploy/verify-health.mjs
  deploy/verify-service.sh
  deploy/server-deploy.sh
)

build_package() (
  local archive="$1" build_root staging
  build_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
  staging="$(mktemp -d "$(dirname "$archive")/.signer-package.XXXXXXXX")"
  trap 'rm -rf -- "$staging"' EXIT

  cd "$build_root"
  echo "→ installing pinned build deps"
  npm ci --no-audit --no-fund
  echo "→ building bundle"
  npm run build

  tar -czf "$staging/package.tar.gz" "${package_members[@]}"
  mv -f -- "$staging/package.tar.gz" "$archive"
)

hash_file() {
  node -e 'const{createHash}=require("node:crypto"),{readFileSync}=require("node:fs");process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$1"
}

installed_hash() {
  sudo sha256sum "$1" 2>/dev/null | cut -d' ' -f1 || true
}

install_package() (
  local archive="$1" staging entries expected types expected_types
  local bundle_hash lock_hash unit_hash install_root unit_path
  install_root=/opt/wtf-operator-signer
  unit_path=/etc/systemd/system/wtf-operator-signer.service
  staging="$(mktemp -d)"
  trap 'rm -rf -- "$staging"' EXIT

  # Validate members before extraction or privileged commands. An archive
  # from the build contains exactly these regular files and no links.
  entries="$(tar -tzf "$archive" | LC_ALL=C sort)"
  expected="$(printf '%s\n' "${package_members[@]}" | LC_ALL=C sort)"
  types="$(LC_ALL=C tar -tvzf "$archive" | cut -c1)"
  expected_types="$(printf '%s\n' "${package_members[@]}" | sed 's/.*/-/')"
  if [[ "$entries" != "$expected" || "$types" != "$expected_types" ]]; then
    echo "Signer package must contain the expected regular files." >&2
    exit 1
  fi
  tar -xzf "$archive" -C "$staging" --no-same-owner --no-same-permissions "${package_members[@]}"

  bundle_hash="$(hash_file "$staging/dist/index.cjs")"
  lock_hash="$(hash_file "$staging/package-lock.json")"
  unit_hash="$(hash_file "$staging/deploy/wtf-operator-signer.service")"
  sudo install -d -o wtf-signer -g wtf "$install_root/dist" "$install_root/deploy"
  sudo install -d -m 770 -o wtf-signer -g wtf /run/wtf
  sudo install -d -m 700 -o wtf-signer -g wtf /var/lib/wtf
  sudo install -d -m 750 -o root -g wtf /etc/wtf/secrets
  sudo rsync -az "$staging/deploy/verify-health.mjs" "$staging/deploy/verify-service.sh" "$install_root/deploy/"

  if [[ "$bundle_hash" == "$(installed_hash "$install_root/dist/index.cjs")" && \
        "$lock_hash" == "$(installed_hash "$install_root/package-lock.json")" && \
        "$unit_hash" == "$(installed_hash "$unit_path")" ]] && \
     sudo systemctl is-active --quiet wtf-operator-signer && \
     sudo bash "$install_root/deploy/verify-service.sh" --wait-ready; then
    echo "✓ signer bundle already matches source and reports sponsored prize claim support"
    exit 0
  fi

  echo "→ installing changed signer bundle and package metadata"
  sudo install -o root -g root -m 0644 "$staging/deploy/wtf-operator-signer.service" "$unit_path"
  sudo systemctl daemon-reload
  sudo rsync -az "$staging/dist/" "$install_root/dist/"
  sudo rsync -az "$staging/package.json" "$staging/package-lock.json" "$install_root/"
  sudo chown -R wtf-signer:wtf "$install_root"
  sudo -u wtf-signer env npm_config_cache=/tmp/wtf-signer-npm-cache \
    npm --prefix "$install_root" ci --omit=dev --no-audit --no-fund

  echo "→ restarting systemd unit"
  sudo systemctl restart wtf-operator-signer
  sudo systemctl is-active --quiet wtf-operator-signer
  if [[ "$(installed_hash "$install_root/dist/index.cjs")" != "$bundle_hash" ]]; then
    echo "Signer bundle hash differs after install." >&2
    exit 1
  fi
  sudo bash "$install_root/deploy/verify-service.sh" --wait-ready
  echo "✓ signer deploy complete: bundle hash $bundle_hash"
)

deploy_over_ssh() (
  : "${HETZNER_SSH_HOST:?HETZNER_SSH_HOST is required}"
  : "${HETZNER_SSH_USER:?HETZNER_SSH_USER is required}"
  local remote="${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}" staging remote_staging=""
  local ssh_options=(-o StrictHostKeyChecking=accept-new)
  if [[ -n "${HETZNER_SSH_KEY:-}" ]]; then
    ssh_options+=(-i "$HETZNER_SSH_KEY")
  fi
  staging="$(mktemp -d)"
  cleanup() {
    rm -rf -- "$staging"
    if [[ -n "$remote_staging" ]]; then
      ssh "${ssh_options[@]}" "$remote" "rm -rf -- '$remote_staging'" || true
    fi
  }
  trap cleanup EXIT

  build_package "$staging/package.tar.gz"
  local discovered
  discovered="$(ssh "${ssh_options[@]}" "$remote" 'mktemp -d /tmp/wtf-operator-signer.XXXXXXXX')"
  if [[ ! "$discovered" =~ ^/tmp/wtf-operator-signer\.[a-zA-Z0-9]+$ ]]; then
    echo "Signer deploy could not determine the remote staging directory." >&2
    exit 1
  fi
  remote_staging="$discovered"
  echo "→ shipping signer package → $remote:/opt/wtf-operator-signer/"
  scp "${ssh_options[@]}" "$staging/package.tar.gz" "$remote:$remote_staging/package.tar.gz"
  ssh "${ssh_options[@]}" "$remote" \
    "tar -xOzf '$remote_staging/package.tar.gz' deploy/server-deploy.sh > '$remote_staging/install.sh' && bash '$remote_staging/install.sh' --install-package '$remote_staging/package.tar.gz'"
)

case "${1-}:$#" in
  :0) deploy_over_ssh ;;
  --package:2) build_package "$2" ;;
  --install-package:2) install_package "$2" ;;
  *) echo "Usage: $0 [--package ARCHIVE | --install-package ARCHIVE]" >&2; exit 1 ;;
esac
