#!/usr/bin/env bash
# Provision a compartment @wtfos.me mailbox (for bots or users). Returns JSON with address + password.
set -euo pipefail

LOCAL="${1:?usage: provision-address.sh <local-part> [password]}"
PASS="${2:-$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)}"
ADDR="${LOCAL}@wtfos.me"
CONTAINER="${MAIL_CONTAINER:-wtfos-mailserver}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo '{"error":"mailserver not running"}' >&2
  exit 1
fi

if docker exec "$CONTAINER" setup email list 2>/dev/null | grep -qx "$ADDR"; then
  echo "{\"address\":\"$ADDR\",\"status\":\"exists\"}"
  exit 0
fi

docker exec "$CONTAINER" setup email add "$ADDR" "$PASS" >/dev/null
echo "{\"address\":\"$ADDR\",\"password\":\"$PASS\",\"imap_host\":\"mail.wtfos.me\",\"imap_port\":993,\"smtp_host\":\"mail.wtfos.me\",\"smtp_port\":587}"
