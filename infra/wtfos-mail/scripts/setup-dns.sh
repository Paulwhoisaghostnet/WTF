#!/usr/bin/env bash
# Publish MX/A/SPF/DMARC for wtfos.me mail on GoDaddy. Idempotent-ish (skips exact duplicates).
set -euo pipefail

DOMAIN="${MAIL_DOMAIN:-wtfos.me}"
HOST="${MAIL_HOST:-mail.wtfos.me}"
IP="${MAIL_PUBLIC_IP:-5.78.214.209}"
API="https://api.godaddy.com/v1"

: "${GODADDY_API_KEY:?Set GODADDY_API_KEY}"
: "${GODADDY_API_SECRET:?Set GODADDY_API_SECRET}"

auth=(-H "Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}" -H "Content-Type: application/json")

has_record() {
  local type="$1" name="$2" data="$3"
  curl -sf "${auth[@]}" "$API/domains/$DOMAIN/records/$type/$name" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if any(r.get('data','').strip('\"')==sys.argv[1] for r in d) else 'no')" "$data" 2>/dev/null || echo no
}

add_record() {
  local type="$1" name="$2" data="$3" ttl="${4:-600}" priority="${5:-}"
  if [[ "$(has_record "$type" "$name" "$data")" == yes ]]; then
    echo "skip $type $name $data"
    return 0
  fi
  local body
  if [[ -n "$priority" ]]; then
    body=$(printf '[{"type":"%s","name":"%s","data":"%s","ttl":%s,"priority":%s}]' "$type" "$name" "$data" "$ttl" "$priority")
  else
    body=$(printf '[{"type":"%s","name":"%s","data":"%s","ttl":%s}]' "$type" "$name" "$data" "$ttl")
  fi
  curl -sf -X PATCH "${auth[@]}" "$API/domains/$DOMAIN/records" -d "$body" >/dev/null
  echo "added $type $name $data"
}

add_record A mail "$IP"
add_record MX "@" "$HOST" 3600 10
add_record TXT "@" "v=spf1 mx a:${HOST} ~all" 3600
add_record TXT "_dmarc" "v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:postmaster@${DOMAIN}" 3600

echo "DNS base records applied for ${DOMAIN}"
