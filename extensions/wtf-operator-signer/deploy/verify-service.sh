#!/usr/bin/env bash
set -euo pipefail

# Read both files inside the host; never print either authentication token.
set -a
. /etc/wtf/wtf.env
app_auth="${WTF_OPERATOR_SIGNER_AUTH_TOKEN:-}"
. /etc/wtf-operator-signer.env
set +a
if [[ -z "$app_auth" || "$app_auth" != "${WTF_OPERATOR_SIGNER_AUTH_TOKEN:-}" ]]; then
  echo 'App and signer authentication tokens differ.' >&2
  exit 1
fi
node /opt/wtf-operator-signer/deploy/verify-health.mjs
