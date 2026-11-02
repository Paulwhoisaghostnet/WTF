# Mainnet setup evidence — 2026-10-02

Status at 18:27 UTC: **originated, registered, funded and running on mainnet**.
The public [Aleatory provider page](https://aleatory.art/providers/KT18oG4df3HzTtP7f8FA88p7KGvh9haw5G77)
lists wtfOS at the owner's selected **0.5 XTZ per rendered mint (500000 mutez)**.
The daemon completed a polling cycle without errors. No generator has assigned
work yet, so completed delivery for an actual minted token remains unproven.

The current-main provider-source import copies the provider directory from
`03a587837e6cb8e3890037157ea37ff9d26cb1b6`; this deployment record was
added afterward. The annotated tag `wtf-aleatory-provider-mainnet-2026-10-02`
pins that entire original release commit and its shared signer dependencies.
Two shared release inputs on current `main` have since changed for WTFIAP, so
assembling from `HEAD` creates a different artifact. Use the pinned tag to
reproduce the installed release. This source import does not install or restart
the daemon. Later Aleatory Studio, account-storage, and upstream-sync work
remains separate until its own release verification.

## Installed service and identities

- Host: existing wtfOS Hetzner host, accessed through `scripts/wtf-ssh.sh`.
- Installed source: `03a587837e6cb8e3890037157ea37ff9d26cb1b6`.
- Archive SHA-256: `e8c4a588cd1c7bca4635c73df48ca5faf716c61dd469e148449cb56454688aae`.
- Current release: `/opt/wtf-aleatory-provider/current`.
- Unit: `wtf-aleatory-provider.service`, **enabled and active (running)**.
- Network: Tezos mainnet, `NetXdQprcVkpaWU`.
- Current RPC: configured fallback `https://tcinfra.net/rpc/tezos/mainnet`.
  The primary `https://tezos-mainnet.octez.io/` returned HTTP 503 during funding
  estimation before signing; estimation succeeded on the configured fallback.
- Router: `KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J`.
- Registry: `KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9`.
- Existing platform-root operator: `tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo`.
- New dedicated render agent: `tz1iKCqqcWQWMqURT6J2KLyj8srQeweVGhBy`.
- Provider contract: `KT18oG4df3HzTtP7f8FA88p7KGvh9haw5G77`.
- Main WTF funding wallet, as identified by the owner:
  `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`. This is distinct from platform-root.

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

The owner's 20 XTZ funding transfer was applied at 18:10:25 UTC, level 15201532,
from the main WTF wallet to the platform-root/operator. Its separate sender-paid
network fee was 0.000485 XTZ. The pending browser state was stale; chain evidence
confirmed the exact source, destination and amount. No duplicate transfer was sent.

All amounts below are XTZ. Setup costs are actual confirmed fees and storage or
account-allocation burns, not SDK allowances.

| Item | Amount | Basis |
| --- | ---: | --- |
| Owner's setup allocation | 20.000000 | Main WTF wallet to operator |
| Provider origination cost | 0.440538 | 0.001788 fee + 0.374500 storage + 0.064250 allocation |
| Registry registration cost | 0.018710 | 0.000960 fee + 0.017750 storage |
| Agent funding transfer cost | 0.064743 | 0.000493 fee + 0.064250 account allocation |
| Agent reveal cost | 0.000299 | Confirmed reveal fee |
| Total setup cost from allocation | 0.524290 | Sum of the four setup operations |
| Agent balance after reveal | 19.470710 | Transfer of 19.471009 less reveal fee |
| Unused allocation remaining with operator | 0.005000 | Transfer estimate's unused storage buffer |
| Operator balance after setup | 0.237369 | Original 0.232369 plus unused 0.005000 |
| Main WTF wallet balance after funding | 250.280527 | Includes sender-paid 0.000485 transfer fee |
| Provider contract balance | 0.000000 | No customer mints yet |

The 20 XTZ allocation reconciles exactly: 19.470710 agent balance + 0.524290
setup costs + 0.005000 remaining with the operator. Customer fees accrue in the
provider contract, separately from the agent's gas balance.

Confirmed mainnet operations:

- [Main WTF wallet funding](https://tzkt.io/ooZvPb98PULmpn4c9YQ8T6RNib4yqDBbopqXJt9nUnh3ACWHy1B), level 15201532.
- [Provider origination](https://tzkt.io/opFtZCbUSZwXSTNjdGMFdeF92vzP3eAYCcdataySW7UYvKi3pYL), level 15201613.
- [Registry registration](https://tzkt.io/ookBz6S8GTVqNFYUvUzTUDuiMvt31bqNvLXcmfpSqpPc7uXBRxH), level 15201626.
- [Agent funding](https://tzkt.io/onzdpRgs3discQJL9qqxNnJtYqPkt9BmnvxJFqh7ZZcqQr5zTTu), level 15201674; request ID `launch-budget-20261002`.
- [Agent reveal](https://tzkt.io/oniGvDYJ6UztrQcZsWjCcRzC7SfU3wf5rG6uPzw3Gp1DwQh76GZ), level 15201686.

## Registration and runtime verification

- Deployed code matches the compiled artifact with SHA-256
  `abb456bed19b4699140315a21cec7c9ffc653a116be832e23b2f64ce32b046be`.
  Comparison normalizes only top-level declaration order because TzKT reorders
  script sections; all instructions and the three views match exactly.
- `src/check.mts` reports mainnet, `registered: true`, the expected operator and
  agent, `render_gas: "500000"`, and an empty pending queue.
- The Aleatory directory and provider detail page were checked in the browser:
  name wtfOS, 0.5 XTZ price, correct signing address, no deliveries yet.
- Activation reused the verified release archive. Systemd reports active/running,
  successful status and zero restarts. The 18:27:23 UTC heartbeat reports
  `0 scanned, 0 scan failed, 0 published, 0 failed, 0 stuck (skipped)`.
- Private operator receipts are confirmed against exact applied chain operations
  under `/var/lib/wtf-aleatory-provider/operator`. Signed operation bytes remain
  private; user-local audit exports contain only public receipt fields.

Repricing is supported through `operator.mts set-price`, followed by matching
`ALEA_RENDER_GAS_MUTEZ` configuration and a service restart; see the README.
It is a manual operator action, not automatic adjustment to the XTZ exchange rate.
No Studio or public collection was created in this setup pass. A real assigned
token's completed media/metadata publication is the next delivery milestone.

The package's contract, metadata, rendering, custody, operation-replay and
archive checks passed, as did strict TypeScript checking and inventory coverage.
Browser/live-puppet suites were not run: this change adds host commands without
a browser/API route, and those suites cannot exercise this host-custody boundary.
