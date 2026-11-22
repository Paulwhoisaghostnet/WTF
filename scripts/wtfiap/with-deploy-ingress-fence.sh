#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/check-wtfos-room-deploy.sh"
[[ "${1:-}" == "--" && "$#" -gt 1 ]]
shift

wtfiap_discover_room_authorities
# An active room must prevent even a proxy reload.
wtfiap_check_saved_rooms "$script_dir/assert-room-deploy-safe.cjs"

proxy=wtf-app-caddy-1
proxy_id="$(docker inspect --type container --format '{{if .State.Running}}{{.Id}}{{end}}' "$proxy")"
[[ -n "$proxy_id" ]] || { wtfiap_deploy_error "The running ingress could not be verified."; exit 1; }
scratch="$(mktemp -d)"
reload_attempted=0

read_config() {
  docker exec "$proxy_id" wget -qO- http://127.0.0.1:2019/config/
}
same_config() {
  node -e 'const fs = require("node:fs"); const util = require("node:util"); const read = path => JSON.parse(fs.readFileSync(path)); process.exit(util.isDeepStrictEqual(read(process.argv[1]), read(process.argv[2])) ? 0 : 1)' "$1" "$2"
}
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$reload_attempted" == 1 && "$(docker inspect --type container --format '{{.Id}}' "$proxy" 2>/dev/null)" == "$proxy_id" ]]; then
    if ! read_config > "$scratch/current.json"; then
      wtfiap_deploy_error "Could not verify the current ingress for restoration." || true
      result=1
    elif same_config "$scratch/current.json" "$scratch/fenced.json"; then
      if ! docker exec -i "$proxy_id" caddy reload --config - < "$scratch/previous.json" ||
         ! read_config > "$scratch/current.json" ||
         ! same_config "$scratch/current.json" "$scratch/previous.json"; then
        wtfiap_deploy_error "Could not verify restoration of the ingress." || true
        result=1
      fi
    elif ! same_config "$scratch/current.json" "$scratch/previous.json"; then
      wtfiap_deploy_error "Ingress changed externally while the deployment held its fence." || true
      result=1
    fi
  fi
  if [[ "$result" == 1 && "$reload_attempted" == 1 ]]; then
    printf '[wtfiap-deploy] Ingress comparison saved at %s\n' "$scratch" >&2
  else
    rm -rf -- "$scratch"
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

read_config > "$scratch/previous.json"
node "$script_dir/fence-deploy-ingress.cjs" < "$scratch/previous.json" > "$scratch/fenced.json"
reload_attempted=1
docker exec -i "$proxy_id" caddy reload --config - < "$scratch/fenced.json"
read_config > "$scratch/current.json"
same_config "$scratch/current.json" "$scratch/fenced.json"
# Anything durably created before the gate closed must defer the replacement.
wtfiap_check_saved_rooms "$script_dir/assert-room-deploy-safe.cjs"

export WTFIAP_DEPLOY_FENCE="$scratch/fenced.json"
export WTFIAP_DEPLOY_PROXY_ID="$proxy_id"
export WTFIAP_DEPLOY_PROTECTED_ROOM="$WTFiAP_PROTECTED_ROOM"
"$@"
