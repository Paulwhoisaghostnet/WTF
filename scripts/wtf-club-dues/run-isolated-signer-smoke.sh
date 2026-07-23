#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "Usage: $0 <contract.json> <storage.json> <request-helper.mjs> <propose-manager.json> <propose-admin.json> <no-args.json> <membership-args.json>" >&2
  exit 2
fi

contract_json=$1
storage_json=$2
request_helper=$3
propose_manager_json=$4
propose_admin_json=$5
no_args_json=$6
membership_args_json=$7
network=${WTF_CLUB_DUES_NETWORK:-shadownet}
case "${network}" in
  shadownet)
    rpc_url=${WTF_CLUB_DUES_RPC_URL:-https://tezos-shadownet.octez.io/}
    tzkt_url=${WTF_CLUB_DUES_TZKT_URL:-https://api.shadownet.tzkt.io/v1}
    expected_chain_id=NetXsqzbfFenSTS
    ;;
  mainnet)
    rpc_url=${WTF_CLUB_DUES_RPC_URL:-https://tezos-mainnet.octez.io/}
    tzkt_url=${WTF_CLUB_DUES_TZKT_URL:-https://api.tzkt.io/v1}
    expected_chain_id=NetXdQprcVkpaWU
    ;;
  *)
    echo "WTF_CLUB_DUES_NETWORK must be shadownet or mainnet" >&2
    exit 2
    ;;
esac

signer_env_file=${WTF_OPERATOR_SIGNER_ENV_FILE:-/etc/wtf-operator-signer.env}
signer_bundle=${WTF_OPERATOR_SIGNER_BUNDLE:-/opt/wtf-operator-signer/dist/index.cjs}
deployer_wallet_id=${WTF_CLUB_DUES_DEPLOYER_WALLET_ID:-contract-admin}
payment_wallet_id=${WTF_CLUB_DUES_PAYMENT_WALLET_ID:-club-dues-manager}
socket_path="/tmp/wtf-club-dues-${network}-signer-$$.sock"
audit_path="/tmp/wtf-club-dues-${network}-signer-$$.log"
auth_token="wtf-club-dues-${network}-$$"
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
  "${request_helper}" \
  "${propose_manager_json}" \
  "${propose_admin_json}" \
  "${no_args_json}" \
  "${membership_args_json}" \
  "${signer_env_file}" \
  "${signer_bundle}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file missing: ${required_file}" >&2
    exit 2
  fi
done
if [[ -z "${WTF_CLUB_DUES_EXISTING_CONTRACT:-}" ]]; then
  for required_file in "${contract_json}" "${storage_json}"; do
    if [[ ! -f "${required_file}" ]]; then
      echo "Required origination file missing: ${required_file}" >&2
      exit 2
    fi
  done
elif [[ ! "${WTF_CLUB_DUES_EXISTING_CONTRACT}" =~ ^KT1[1-9A-HJ-NP-Za-km-z]{33}$ ]]; then
  echo "WTF_CLUB_DUES_EXISTING_CONTRACT must be a valid KT1 address" >&2
  exit 2
fi

wait_applied() {
  local operation_hash=$1
  local status=
  for _ in $(seq 1 60); do
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
export WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ=2000000
export WTF_OPERATOR_SIGNER_AUDIT_LOG="${audit_path}"

runuser -u wtf-signer -m -- \
  node "${signer_bundle}" >"/tmp/wtf-club-dues-${network}-signer-$$.stdout" 2>&1 &
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
if [[ -n "${WTF_CLUB_DUES_EXISTING_CONTRACT:-}" ]]; then
  contract_address="${WTF_CLUB_DUES_EXISTING_CONTRACT}"
else
  origination=$(
    WTF_OPERATOR_SIGNER_ORIGINATION_LABEL=wtf-club-dues-v2 \
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
fi

if [[ "${WTF_CLUB_DUES_RESUME_STAGE:-}" == "after_accept_admin" ]]; then
  propose_manager=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_PROPOSE_MANAGER_HASH:-}")
  accept_manager=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_ACCEPT_MANAGER_HASH:-}")
  propose_admin=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_PROPOSE_ADMIN_HASH:-}")
  accept_admin=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_ACCEPT_ADMIN_HASH:-}")
elif [[ "${WTF_CLUB_DUES_RESUME_STAGE:-}" == "after_propose_admin" ]]; then
  propose_manager=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_PROPOSE_MANAGER_HASH:-}")
  accept_manager=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_ACCEPT_MANAGER_HASH:-}")
  propose_admin=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1] || null}))' "${WTF_CLUB_DUES_PROPOSE_ADMIN_HASH:-}")
  if [[ -z "${WTF_CLUB_DUES_PROPOSE_ADMIN_HASH:-}" ]]; then
    echo "WTF_CLUB_DUES_PROPOSE_ADMIN_HASH is required for after_propose_admin resume" >&2
    exit 2
  fi
  wait_applied "${WTF_CLUB_DUES_PROPOSE_ADMIN_HASH}"
  accept_admin=$(
    node "${request_helper}" custom contract-admin "${contract_address}" accept_admin "${no_args_json}"
  )
  wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${accept_admin}")"
elif [[ "${WTF_CLUB_DUES_RESUME_STAGE:-}" == "after_propose_manager" ]]; then
  if [[ -z "${WTF_CLUB_DUES_PROPOSE_MANAGER_HASH:-}" ]]; then
    echo "WTF_CLUB_DUES_PROPOSE_MANAGER_HASH is required for after_propose_manager resume" >&2
    exit 2
  fi
  propose_manager=$(node -e 'process.stdout.write(JSON.stringify({opHash: process.argv[1]}))' "${WTF_CLUB_DUES_PROPOSE_MANAGER_HASH}")
  wait_applied "${WTF_CLUB_DUES_PROPOSE_MANAGER_HASH}"
else
  propose_manager=$(
    node "${request_helper}" custom contract-admin "${contract_address}" propose_admin "${propose_manager_json}"
  )
  wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${propose_manager}")"
fi
if [[ -z "${WTF_CLUB_DUES_RESUME_STAGE:-}" || "${WTF_CLUB_DUES_RESUME_STAGE}" == "after_propose_manager" ]]; then
  accept_manager=$(
    node "${request_helper}" custom club-dues-manager "${contract_address}" accept_admin "${no_args_json}"
  )
  wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${accept_manager}")"
  propose_admin=$(
    node "${request_helper}" custom club-dues-manager "${contract_address}" propose_admin "${propose_admin_json}"
  )
  wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${propose_admin}")"
  accept_admin=$(
    node "${request_helper}" custom contract-admin "${contract_address}" accept_admin "${no_args_json}"
  )
  wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${accept_admin}")"
fi
payment=$(
  WTF_OPERATOR_SIGNER_CALL_MUTEZ=1000000 \
    node "${request_helper}" custom "${payment_wallet_id}" "${contract_address}" pay_membership "${membership_args_json}"
)
wait_applied "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).opHash)' "${payment}")"

node -e '
const values = process.argv.slice(1, 7).map((value) => value ? JSON.parse(value) : null);
const [originationValue, proposeManager, acceptManager, proposeAdmin, acceptAdmin, payment] = values;
const origination = originationValue || null;
process.stdout.write(`${JSON.stringify({
  network: process.argv[7],
  chainId: process.argv[8],
  contractAddress: origination?.contractAddress || process.argv[9],
  signedBy: origination?.signedBy || "tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo",
  originationHash: origination?.opHash || process.argv[10] || null,
  proposeManagerHash: proposeManager.opHash,
  acceptManagerHash: acceptManager.opHash,
  proposeAdminHash: proposeAdmin.opHash,
  acceptAdminHash: acceptAdmin.opHash,
  paymentWalletId: process.argv[11],
  paymentHash: payment.opHash,
})}\n`);
' \
  "${origination}" \
  "${propose_manager}" \
  "${accept_manager}" \
  "${propose_admin}" \
  "${accept_admin}" \
  "${payment}" \
  "${network}" \
  "${expected_chain_id}" \
  "${contract_address}" \
  "${WTF_CLUB_DUES_ORIGINATION_HASH:-}" \
  "${payment_wallet_id}"
