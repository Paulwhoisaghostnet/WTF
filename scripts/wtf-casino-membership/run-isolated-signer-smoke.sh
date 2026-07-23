#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <contract.json> <storage.json> <membership-args.json> <request-helper.mjs>" >&2
  exit 2
fi

contract_json=$1
storage_json=$2
membership_args_json=$3
request_helper=$4
network=${WTF_CASINO_NETWORK:-shadownet}
case "${network}" in
  shadownet)
    rpc_url=${WTF_CASINO_RPC_URL:-https://tezos-shadownet.octez.io/}
    expected_chain_id=NetXsqzbfFenSTS
    ;;
  mainnet)
    rpc_url=${WTF_CASINO_RPC_URL:-https://tezos-mainnet.octez.io/}
    expected_chain_id=NetXdQprcVkpaWU
    ;;
  *)
    echo "WTF_CASINO_NETWORK must be shadownet or mainnet" >&2
    exit 2
    ;;
esac
signer_env_file=${WTF_OPERATOR_SIGNER_ENV_FILE:-/etc/wtf-operator-signer.env}
signer_bundle=${WTF_OPERATOR_SIGNER_BUNDLE:-/opt/wtf-operator-signer/dist/index.cjs}
socket_path="/tmp/wtf-casino-${network}-signer-$$.sock"
audit_path="/tmp/wtf-casino-${network}-signer-$$.log"
auth_token="wtf-casino-${network}-$$"
signer_pid=

cleanup() {
  if [[ -n "${signer_pid}" ]]; then
    kill "${signer_pid}" 2>/dev/null || true
    wait "${signer_pid}" 2>/dev/null || true
  fi
  rm -f "${socket_path}"
}
trap cleanup EXIT

for required_file in \
  "${membership_args_json}" \
  "${request_helper}" \
  "${signer_env_file}" \
  "${signer_bundle}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file missing: ${required_file}" >&2
    exit 2
  fi
done
if [[ -z "${WTF_CASINO_EXISTING_CONTRACT:-}" ]]; then
  for required_file in "${contract_json}" "${storage_json}"; do
    if [[ ! -f "${required_file}" ]]; then
      echo "Required origination file missing: ${required_file}" >&2
      exit 2
    fi
  done
elif [[ ! "${WTF_CASINO_EXISTING_CONTRACT}" =~ ^KT1[1-9A-HJ-NP-Za-km-z]{33}$ ]]; then
  echo "WTF_CASINO_EXISTING_CONTRACT must be a valid KT1 address" >&2
  exit 2
fi

chain_id=$(curl -fsS --max-time 15 "${rpc_url%/}/chains/main/chain_id" | tr -d '"[:space:]')
if [[ "${chain_id}" != "${expected_chain_id}" ]]; then
  echo "Refusing signer start: expected ${expected_chain_id}, got ${chain_id:-missing}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${signer_env_file}"
set +a
export WTF_OPERATOR_SIGNER_RPC="${rpc_url}"
export WTF_OPERATOR_SIGNER_SOCKET="${socket_path}"
export WTF_OPERATOR_SIGNER_AUTH_TOKEN="${auth_token}"
export WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID=contract-admin
export WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST=
export WTF_OPERATOR_SIGNER_ALLOW_CUSTOM=1
export WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION=1
export WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ=2000000
export WTF_OPERATOR_SIGNER_AUDIT_LOG="${audit_path}"

runuser -u wtf-signer -m -- \
  node "${signer_bundle}" >"/tmp/wtf-casino-${network}-signer-$$.stdout" 2>&1 &
signer_pid=$!

for _ in $(seq 1 80); do
  [[ -S "${socket_path}" ]] && break
  if ! kill -0 "${signer_pid}" 2>/dev/null; then
    echo "Temporary signer exited before its socket became ready" >&2
    exit 1
  fi
  sleep 0.25
done
if [[ ! -S "${socket_path}" ]]; then
  echo "Temporary signer socket did not become ready" >&2
  exit 1
fi

origination=
if [[ -n "${WTF_CASINO_EXISTING_CONTRACT:-}" ]]; then
  contract_address="${WTF_CASINO_EXISTING_CONTRACT}"
else
  origination=$(
    WTF_OPERATOR_SIGNER_ORIGINATION_LABEL=wtf-casino-membership-v1 \
      node "${request_helper}" \
      originate_contract \
      contract-admin \
      "${contract_json}" \
      "${storage_json}"
  )
  contract_address=$(
    node -e 'const value=JSON.parse(process.argv[1]); if(!value.contractAddress) process.exit(1); process.stdout.write(value.contractAddress)' \
      "${origination}"
  )
fi

purchase=$(
  WTF_OPERATOR_SIGNER_CALL_MUTEZ=1000000 \
    node "${request_helper}" \
    custom \
    contract-admin \
    "${contract_address}" \
    purchase_membership \
    "${membership_args_json}"
)

node -e '
const origination = process.argv[1] ? JSON.parse(process.argv[1]) : null;
const purchase = JSON.parse(process.argv[2]);
process.stdout.write(`${JSON.stringify({
  network: process.argv[4],
  chainId: process.argv[5],
  contractAddress: origination?.contractAddress || process.argv[3],
  originationHash: origination?.opHash || null,
  purchaseHash: purchase.opHash,
  signedBy: origination?.signedBy || purchase.signedBy,
})}\n`);
' "${origination}" "${purchase}" "${contract_address}" "${network}" "${expected_chain_id}"
