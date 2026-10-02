#!/usr/bin/env bash
# Install only this service. Never invokes the wtfOS app deployment or Compose.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != "--activate" ) ]]; then
  echo "Usage: sudo bash ops/install.sh RELEASE.tar.gz [--activate]" >&2
  exit 1
fi
if [[ $(id -u) -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

ops_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact="$(realpath "$1")"
base=/opt/wtf-aleatory-provider
service_user=wtf-aleatory-provider
data_dir=/var/lib/wtf-aleatory-provider
config_dir=/etc/wtf-aleatory-provider
cache_dir=/var/cache/wtf-aleatory-provider
unit=wtf-aleatory-provider.service
staging=""
next_link=""
cleanup() {
  if [[ -n "$staging" && -d "$staging" ]]; then rm -rf -- "$staging"; fi
  if [[ -n "$next_link" && -L "$next_link" ]]; then rm -- "$next_link"; fi
}
trap cleanup EXIT

for required in python3 npm node runuser systemctl systemd-analyze flock; do
  command -v "$required" >/dev/null || { echo "Missing required command: $required" >&2; exit 1; }
done
[[ -x /usr/bin/node ]] || { echo "The systemd unit requires /usr/bin/node." >&2; exit 1; }
commit="$(python3 "$ops_dir/verify-release.py" "$artifact")"

install -d -o root -g root -m 0755 "$base" "$base/releases"
exec 9>"$base/install.lock"
flock 9
if ! getent group "$service_user" >/dev/null; then groupadd --system "$service_user"; fi
if ! id -u "$service_user" >/dev/null 2>&1; then
  useradd --system --gid "$service_user" --home-dir "$data_dir" --shell /usr/sbin/nologin "$service_user"
fi
install -d -o root -g root -m 0700 "$config_dir"
install -d -o "$service_user" -g "$service_user" -m 0700 "$data_dir" "$data_dir/state" "$data_dir/secrets" "$cache_dir"

staging="$(mktemp -d "$base/releases/.install.XXXXXXXX")"
python3 "$ops_dir/verify-release.py" "$artifact" --extract-to "$staging" >/dev/null
release="$base/releases/$commit"
if [[ -e "$release" || -L "$release" ]]; then
  [[ -d "$release" && ! -L "$release" ]] || { echo "Release path is not a real directory." >&2; exit 1; }
  cmp "$staging/release-manifest.json" "$release/release-manifest.json" >/dev/null || {
    echo "An immutable release with different contents already uses this commit." >&2; exit 1;
  }
  echo "Release $commit is already installed; preserving it."
else
  chown -R "$service_user:$service_user" "$staging"
  (
    cd "$staging"
    runuser -u "$service_user" -- env -i PATH=/usr/bin:/bin NODE_ENV=production \
      npm_config_cache="$cache_dir" npm ci --omit=dev --ignore-scripts --no-audit --no-fund
    # Exercise tsx/esbuild against a side-effect-free TypeScript module after
    # the independent install. Lifecycle scripts never receive custody access.
    runuser -u "$service_user" -- env -i PATH=/usr/bin:/bin NODE_ENV=production \
      node --import tsx -e "require('./extensions/wtf-operator-signer/src/network.ts')"
  )
  chown -R root:root "$staging"
  chmod -R a+rX,go-w "$staging"
  chmod 0755 "$staging"
  mv -- "$staging" "$release"
  staging=""
fi

install -o root -g root -m 0600 \
  "$release/extensions/aleatory-provider/ops/provider.env.example" "$config_dir/provider.env.example"
install -o root -g root -m 0644 \
  "$release/extensions/aleatory-provider/ops/wtf-aleatory-provider.service" "/etc/systemd/system/$unit"
systemd-analyze verify "/etc/systemd/system/$unit"

if [[ "${2:-}" == "--activate" ]]; then
  python3 - "$config_dir/provider.env" "$data_dir" "$service_user" <<'PY'
import json, os, pathlib, pwd, re, stat, sys
env_path, data_dir, username = sys.argv[1:]
uid = pwd.getpwnam(username).pw_uid
def regular_private_file(path, owner):
    info = os.lstat(path)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != owner or stat.S_IMODE(info.st_mode) != 0o600:
        raise SystemExit("Provider custody/config files must be regular files with the expected owner and mode 0600")
regular_private_file(env_path, 0)
allowed = set('TEZOS_NETWORK TEZOS_RPC TZKT_API ALEA_ROUTER_ADDRESS ALEA_REGISTRY_ADDRESS ALEA_PROVIDER_ADDRESS ALEA_AGENT_ADDRESS WTF_ALEATORY_OPERATOR_ADDRESS ALEA_RENDER_GAS_MUTEZ CF_ACCOUNT_ID CF_API_TOKEN PINATA_JWT WTF_ALEATORY_AGENT_KEYRING WTF_ALEATORY_AGENT_MASTER_KEY_FILE WTF_ALEATORY_AGENT_WALLET_ID ALEA_STATE_DIR'.split())
values = {}
for line in pathlib.Path(env_path).read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    match = re.fullmatch(r'([A-Z][A-Z0-9_]*)=(.*)', line)
    if not match or match[1] not in allowed or match[1] in values:
        raise SystemExit("Provider env contains an unknown/duplicate field or unsupported syntax; use provider.env.example")
    value = match[2].strip()
    if value.startswith(('"', "'")):
        if len(value) < 2 or value[-1] != value[0]:
            raise SystemExit("Provider env contains unmatched quotes")
        value = value[1:-1]
    if '\\' in value or '\n' in value or '\r' in value:
        raise SystemExit("Escaped/multiline provider env values are not supported")
    values[match[1]] = value
required = allowed - {'TEZOS_RPC', 'TZKT_API'}
if any(not values.get(key) for key in required):
    raise SystemExit("Provider env is incomplete; populate the dedicated file before activation")
if values['TEZOS_NETWORK'] != 'mainnet':
    raise SystemExit("This service installation requires the explicitly requested mainnet network")
paths = {
    'WTF_ALEATORY_AGENT_KEYRING': data_dir + '/secrets/agent-keyring.json',
    'WTF_ALEATORY_AGENT_MASTER_KEY_FILE': data_dir + '/secrets/agent-master.key',
    'ALEA_STATE_DIR': data_dir + '/state',
}
if any(values[key] != expected for key, expected in paths.items()):
    raise SystemExit("Provider custody/state paths must remain in the dedicated service directory")
for key in ('WTF_ALEATORY_AGENT_KEYRING', 'WTF_ALEATORY_AGENT_MASTER_KEY_FILE'):
    regular_private_file(values[key], uid)
wallets = json.loads(pathlib.Path(values['WTF_ALEATORY_AGENT_KEYRING']).read_text()).get('wallets', [])
if len(wallets) != 1 or wallets[0].get('id') != values['WTF_ALEATORY_AGENT_WALLET_ID']:
    raise SystemExit("Provider keyring must contain only the configured render agent")
wallet = wallets[0]
if wallet.get('address') != values['ALEA_AGENT_ADDRESS'] or wallet.get('network') != 'mainnet' or wallet.get('chainId') != 'NetXdQprcVkpaWU':
    raise SystemExit("Provider agent identity/network differs from its dedicated keyring")
if wallet.get('address') == values['WTF_ALEATORY_OPERATOR_ADDRESS']:
    raise SystemExit("Provider operator and render agent must be separate wallets")
print('Dedicated provider configuration and agent-only custody checked.')
PY
fi

next_link="$base/.current.$$.next"
ln -s "$release" "$next_link"
mv -Tf -- "$next_link" "$base/current"
next_link=""
systemctl daemon-reload
if [[ "${2:-}" == "--activate" ]]; then
  systemctl enable "$unit"
  systemctl restart "$unit"
  systemctl is-active "$unit"
  echo "Started release $commit. Verify state/health.json and an actual delivery before claiming provider readiness."
else
  echo "Installed release $commit. Service activation was not requested."
fi
