# Mainnet setup evidence — 2026-10-02

Status at 15:36 UTC: **installed and infrastructure-tested; not originated,
registered or activated**. No mainnet operation has been signed or submitted.
The operator needs additional funding. The owner chose **0.5 XTZ per rendered
mint (500000 mutez)** and can reprice later with the operator command.

## Installed service and identities

- Host: existing wtfOS Hetzner host, accessed through `scripts/wtf-ssh.sh`.
- Installed source: `03a587837e6cb8e3890037157ea37ff9d26cb1b6`.
- Archive SHA-256: `e8c4a588cd1c7bca4635c73df48ca5faf716c61dd469e148449cb56454688aae`.
- Current release: `/opt/wtf-aleatory-provider/current`.
- Unit: `wtf-aleatory-provider.service`, loaded and **inactive**.
- Network: Tezos mainnet, `NetXdQprcVkpaWU`.
- Router: `KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J`.
- Registry: `KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9`.
- Existing platform-root operator: `tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo`.
- New dedicated render agent: `tz1iKCqqcWQWMqURT6J2KLyj8srQeweVGhBy`.
- Provider contract address: **none yet**. Addresses returned by failed
  origination simulation are not deployed contracts and must never be used.

Selected Cloudflare and Pinata credentials are in the root-owned dedicated
`/etc/wtf-aleatory-provider/provider.env`, mode 0600. Agent-only encrypted custody
is under `/var/lib/wtf-aleatory-provider/secrets`, files mode 0600 and owned by
the dedicated service user. The daemon does not receive operator custody.
The existing operator master file retains its established root/service-group
0640 access; no original custody file was changed or copied.

## Live infrastructure proof

`src/prove.mts --pin` succeeded on the host at 15:25:59 UTC:

- Two captures produced the same PNG and features, signaled readiness, and
  rejected the diagnostic artwork's external fetch.
- PNG: 37816 bytes, SHA-256
  `891151aed7deba22979514a4f1738e2b5935e4ef9235d39a087635ca146aebe7`.
- Image: `ipfs://Qmam1NTXBQxjt6JuetnHSLPm8DyRdkRtWSR4WQg6s7x28x`.
- Metadata: `ipfs://QmPM5MWKaN9jixXS4PbfEHr4i3DCzmoizV5VwE1KEXwjhU`.
- Both were retrieved from FileShip and compared with the original content.
- Cloudflare reported 219.699462890625 browser milliseconds for each response.
  This simple fixture is not a representative mint-cost or profit estimate.
- Host proof: `/var/lib/wtf-aleatory-provider/state/proofs/2026-10-02T15-25-59-657Z/proof.json`.

No token was minted by this diagnostic. Actual assigned-token delivery remains
unproven until a generator uses the registered provider.

## Funding evidence

All amounts below are mutez, with 1000000 mutez = 1 XTZ.

| Item | Amount | Basis |
| --- | ---: | --- |
| Operator balance | 232369 | Live mainnet balance |
| Actual origination storage/allocation burn | 438750 | Backtracked simulation: (1498 + 257) bytes × 250 mutez |
| Origination SDK quote | 445538 | 1788 transaction fee + 443750 storage allowance; includes Taquito's 20-byte storage buffer |
| Origination-only top-up shortfall | 213169 | SDK quote less current balance |
| Initial agent allowance | 82948 | Upstream maximum for one metadata publication plus reveal; not ongoing runway |
| Transfer to new agent, excluding transferred amount | 69742 | Live estimate: 492 fee + 69250 storage allowance |
| Registry registration reference | 22274 | Other provider's confirmed registration: 4524 fee + 17750 storage; not a quote for our future transaction |

Origination quote + agent transfer quote + initial allowance + historical
registration reference totals 620502 mutez. Against the observed balance, the
indicative shortfall is 388133 mutez, hence the request for **roughly 0.4 XTZ**
additional setup funding. Registration must be estimated again after our
provider exists; transaction fees and balances can change. Customer fees accrue
in the provider contract, separately from the agent's gas balance.

Historical registration reference:
[`oodnm37Ka9txZ2sabLeZr4wXmgzGFw9C6vqouvPNxsPQfSvsUDK`](https://tzkt.io/oodnm37Ka9txZ2sabLeZr4wXmgzGFw9C6vqouvPNxsPQfSvsUDK).

## Resume after funding

1. Run `operator.mts status` and fresh estimates using the dedicated environment
   and private `--receipt-dir /var/lib/wtf-aleatory-provider/operator`.
2. Originate only the compiled provider artifact with the recorded root
   operator, dedicated agent and 500000-mutez fee. Confirm the receipt in TzKT
   and set `ALEA_PROVIDER_ADDRESS` from the actual confirmed operation.
3. Fund and reveal the agent using the freshly verified allowance/fees. Funding
   execution needs a stable request ID. Keep operator variables out of systemd.
4. Estimate and register the actual provider, then verify the directory,
   operator/agent views, metadata and live 500000-mutez fee.
5. Activate the installed artifact through `ops/install.sh --activate`, verify
   systemd and a fresh polling heartbeat, and run `src/check.mts`.
6. Record registration and health evidence. First real token publication is a
   separate delivery milestone; no Studio or public collection was created.

The package's contract, metadata, rendering, custody, operation-replay and
archive checks passed, as did strict TypeScript checking and inventory coverage.
Browser/live-puppet suites were not run: this change adds host commands without
a browser/API route, and those suites cannot exercise this host-custody boundary.
