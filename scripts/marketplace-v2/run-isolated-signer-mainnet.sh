#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <contract.json> <storage.json> <request-helper.mjs> <no-args.json>" >&2
  exit 2
fi

contract_json=$1
storage_json=$2
request_helper=$3
no_args_json=$4
rpc_url=${WTF_MARKETPLACE_V2_RPC_URL:-https://tezos-mainnet.octez.io/}
tzkt_url=${WTF_MARKETPLACE_V2_TZKT_URL:-https://api.tzkt.io/v1}
expected_chain_id=NetXdQprcVkpaWU
expected_admin=${WTF_MARKETPLACE_V2_ADMIN_ADDRESS:-tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo}
expected_wtf=${WTF_MARKETPLACE_V2_WTF_ADDRESS:-KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD}
deployer_wallet_id=${WTF_MARKETPLACE_V2_DEPLOYER_WALLET_ID:-wtf-os-root}
admin_wallet_id=${WTF_MARKETPLACE_V2_ADMIN_WALLET_ID:-contract-admin}
signer_env_file=${WTF_OPERATOR_SIGNER_ENV_FILE:-/etc/wtf-operator-signer.env}
signer_bundle=${WTF_OPERATOR_SIGNER_BUNDLE:-/opt/wtf-operator-signer/dist/index.cjs}
socket_path="/tmp/wtf-marketplace-v2-mainnet-signer-$$.sock"
audit_path="/tmp/wtf-marketplace-v2-mainnet-signer-$$.log"
stdout_path="/tmp/wtf-marketplace-v2-mainnet-signer-$$.stdout"
auth_token="wtf-marketplace-v2-mainnet-$$"
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
  "${contract_json}" \
  "${storage_json}" \
  "${request_helper}" \
  "${no_args_json}" \
  "${signer_env_file}" \
  "${signer_bundle}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file missing: ${required_file}" >&2
    exit 2
  fi
done

wait_applied() {
  local operation_hash=$1
  local status=
  for _ in $(seq 1 90); do
    status=$(curl -fsS --max-time 15 "${tzkt_url%/}/operations/${operation_hash}/status" 2>/dev/null | tr -d '"[:space:]' || true)
    if [[ "${status}" == "true" ]]; then
      return 0
    fi
    if [[ "${status}" == "false" ]]; then
      echo "Operation ${operation_hash} reached a failed terminal state" >&2
      return 1
    fi
    sleep 2
  done
  echo "Operation ${operation_hash} did not reach applied status before timeout" >&2
  return 1
}

read_storage() {
  curl -fsS --max-time 20 "${tzkt_url%/}/contracts/$1/storage"
}

assert_storage() {
  local contract_address=$1
  local expected_paused=$2
  local storage
  storage=$(read_storage "${contract_address}")
  node -e '
const storage = JSON.parse(process.argv[1]);
const [admin, wtf, paused] = process.argv.slice(2);
if (storage.admin !== admin) throw new Error(`admin mismatch: ${storage.admin}`);
if (storage.wtf_token_address !== wtf) throw new Error(`WTF token mismatch: ${storage.wtf_token_address}`);
if (String(storage.wtf_token_id) !== "0") throw new Error(`WTF token id mismatch: ${storage.wtf_token_id}`);
if (String(storage.paused) !== paused) throw new Error(`paused mismatch: ${storage.paused}`);
if (storage.proposed_admin != null) throw new Error("unexpected proposed admin");
for (const key of ["next_listing_id", "next_offer_id", "next_auction_id"]) {
  if (String(storage[key]) !== "0") throw new Error(`${key} is not zero`);
}
' "${storage}" "${expected_admin}" "${expected_wtf}" "${expected_paused}"
}

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
export WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID="${deployer_wallet_id}"
export WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST=
export WTF_OPERATOR_SIGNER_ALLOW_CUSTOM=1
export WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION=1
export WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ=0
export WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES=750000
export WTF_OPERATOR_SIGNER_AUDIT_LOG="${audit_path}"

runuser -u wtf-signer -m -- \
  node "${signer_bundle}" >"${stdout_path}" 2>&1 &
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

origination=$(
  WTF_OPERATOR_SIGNER_ORIGINATION_LABEL=wtf-marketplace-v2 \
    node "${request_helper}" \
    originate_contract \
    "${deployer_wallet_id}" \
    "${contract_json}" \
    "${storage_json}"
)
contract_address=$(
  node -e 'const value=JSON.parse(process.argv[1]); if(!value.contractAddress) process.exit(1); process.stdout.write(value.contractAddress)' \
    "${origination}"
)
origination_hash=$(
  node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${origination}"
)
wait_applied "${origination_hash}"
assert_storage "${contract_address}" false

pause=$(
  node "${request_helper}" custom "${admin_wallet_id}" "${contract_address}" pause "${no_args_json}"
)
pause_hash=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${pause}")
wait_applied "${pause_hash}"
assert_storage "${contract_address}" true

unpause=$(
  node "${request_helper}" custom "${admin_wallet_id}" "${contract_address}" unpause "${no_args_json}"
)
unpause_hash=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${unpause}")
wait_applied "${unpause_hash}"
assert_storage "${contract_address}" false

node -e '
const [origination, pause, unpause] = process.argv.slice(1, 4).map(JSON.parse);
process.stdout.write(`${JSON.stringify({
  network: "mainnet",
  chainId: process.argv[4],
  contractAddress: origination.contractAddress,
  deployedByWalletId: process.argv[5],
  signedBy: origination.signedBy,
  adminWalletId: process.argv[6],
  adminAddress: process.argv[7],
  originationHash: origination.opHash,
  pauseHash: pause.opHash,
  unpauseHash: unpause.opHash,
})}\n`);
' \
  "${origination}" \
  "${pause}" \
  "${unpause}" \
  "${expected_chain_id}" \
  "${deployer_wallet_id}" \
  "${admin_wallet_id}" \
  "${expected_admin}"
