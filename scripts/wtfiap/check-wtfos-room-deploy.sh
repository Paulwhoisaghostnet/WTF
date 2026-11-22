#!/usr/bin/env bash
# Source this file to validate the production topology before reading room state.
wtfiap_deploy_error() {
  printf '%s\n' "[wtfiap-deploy] $1" >&2
  return 1
}

wtfiap_discover_room_authorities() {
  local containers binding=/etc/wtf/wtfiap-duel-deploy.json source_options
  containers="$(docker ps --all --format '{{.Names}}')" || return 1
  WTFiAP_LEGACY_ROOMS="$(docker inspect --type container --format '{{if .State.Running}}{{range .Mounts}}{{if and (eq .Destination "/app/wtfiap-data") .RW (eq .Type "bind")}}{{.Source}}{{end}}{{end}}{{end}}' wtf-app-app-1)" || return 1
  [[ -n "$WTFiAP_LEGACY_ROOMS" ]] || { wtfiap_deploy_error "The running legacy room mount could not be verified."; return 1; }

  WTFiAP_PROTECTED_ROOM=''
  WTFiAP_ISOLATED_ROOMS=''
  if [[ ! -e "$binding" && ! -L "$binding" ]] &&
     ! grep -qxE 'wtfiap-duel-(authority|gateway)' <<<"$containers"; then
    return 0
  fi

  WTFiAP_PROTECTED_ROOM="$(node - "$binding" <<'NODE'
const fs = require('node:fs');
try {
  const file = process.argv[2];
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) throw Error();
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Object.keys(config).length !== 2 || config.version !== 1 ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(config.protectedRoomCode)) throw Error();
  console.log(config.protectedRoomCode);
} catch {
  console.error('[wtfiap-deploy] The root-owned isolated Duel route binding is missing or invalid.');
  process.exitCode = 1;
}
NODE
  )" || return 1

  WTFiAP_ISOLATED_ROOMS="$(docker inspect --type container --format '{{if .State.Running}}{{range .Mounts}}{{if and (eq .Destination "/room-state") .RW (eq .Type "bind")}}{{.Source}}{{end}}{{end}}{{end}}' wtfiap-duel-authority)" || return 1
  source_options="$(docker inspect --type container --format '{{if .State.Running}}{{range .Mounts}}{{if and (not .RW) (eq .Type "bind")}}{{if or (eq .Destination "/legacy-rooms") (eq .Destination "/isolated-rooms")}}{{println .Destination .Source}}{{end}}{{end}}{{end}}{{end}}' wtfiap-duel-gateway)" || return 1
  if [[ -z "$WTFiAP_ISOLATED_ROOMS" ]] ||
     ! grep -Fxq "/legacy-rooms $WTFiAP_LEGACY_ROOMS" <<<"$source_options" ||
     ! grep -Fxq "/isolated-rooms $WTFiAP_ISOLATED_ROOMS" <<<"$source_options"; then
    wtfiap_deploy_error "The running Duel authority and gateway mounts do not agree."
    return 1
  fi
}

wtfiap_check_saved_rooms() {
  local scanner="$1"
  local args=(--legacy "$WTFiAP_LEGACY_ROOMS")
  if [[ -n "$WTFiAP_ISOLATED_ROOMS" ]]; then
    args+=(--isolated "$WTFiAP_ISOLATED_ROOMS" --protected-room "$WTFiAP_PROTECTED_ROOM")
  fi
  node "$scanner" "${args[@]}"
}

wtfiap_assert_ingress_fence() {
  local proxy_id
  proxy_id="$(docker inspect --type container --format '{{if .State.Running}}{{.Id}}{{end}}' wtf-app-caddy-1)" || return 1
  if [[ "$proxy_id" != "$WTFIAP_DEPLOY_PROXY_ID" ]]; then
    wtfiap_deploy_error "The fenced proxy changed before replacement."
    return 1
  fi
  docker exec "$proxy_id" wget -qO- http://127.0.0.1:2019/config/ |
    node -e 'const fs = require("node:fs"); const { isDeepStrictEqual } = require("node:util");
      const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
      if (!isDeepStrictEqual(read(0), read(process.argv[1]))) {
        console.error("[wtfiap-deploy] The ingress fence changed before replacement.");
        process.exitCode = 1;
      }' "$WTFIAP_DEPLOY_FENCE"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  wtfiap_discover_room_authorities
  wtfiap_check_saved_rooms "$(dirname "${BASH_SOURCE[0]}")/assert-room-deploy-safe.cjs"
fi
