# Pasta Protocol review response and technical disposition

**Original review:** skllz (@skullzarmy), against [`b351cccd`](https://github.com/Paulwhoisaghostnet/WTF/commit/b351cccd4b1b5958ab668f2fad22d089672946c4) and the `pasta-review-2026-10-06` unsigned macOS review package

**Technical correction:** Nimrod, 2026-10-27, incorporating the discussion in [PR #38](https://github.com/Paulwhoisaghostnet/WTF/pull/38) and the separate implementation in [draft PR #48](https://github.com/Paulwhoisaghostnet/WTF/pull/48)

This document records useful observations and candidate Aleatory patterns without treating a proposal as a verified Pasta implementation. The review target above is a historical snapshot. PR #48 contains later alpha corrections and evidence; neither PR is a production or Mainnet signoff.

## Desktop and Macaroni observations

- **Colander and suite navigation:** The review package exposed Colander and eight tools (including CH-EASE) in one native shell, and the reviewed project drafts survived ordinary restart. Navigation is evidence of reachability, not an end-to-end publishing proof for every tool.
- **Network boundary:** The October review package still exposed Mainnet while its instructions asked reviewers to use Shadownet. PR #48 enforces Shadownet-only alpha setup in the Suite and standalone Macaroni. Any public candidate needs its UI, Companion, documentation, and contract/network identity to agree.
- **Companion port:** Suite and standalone Macaroni default to `127.0.0.1:47835` but have different private runtime roots. PR #48 adds an occupied-port diagnostic and a fresh HMAC identity challenge before the Suite forwards its admin token. Running both still requires deliberately separate ports; a health-response shape alone is not identity proof.
- **First-run custody:** Macaroni V3.5 correctly begins locked. A real setup needs a dedicated revealed/funded finalizer, correct Shadownet RPC and indexer, private state and backup, exact content publishing and public retrieval, and a public HTTPS/CORS arrangement for remote collectors. The fixed amounts in the original review should not be treated as universal funding requirements; the actual contract reserve, signer liquidity, fee plus storage burn, and subsidy must be checked for the chosen project and network. PR #48 proves one installed local-loopback, funded Shadownet path; it does not prove a remotely hosted collector or public managed service.

## Aleatory ideas and the Pasta boundaries they would change

### Rotini and `ALEATORY-001`

The reviewed Rotini path is a dependency-free canvas layer compositor. It pins layers and a JSON generator manifest to IPFS and registers a generator URI; it does **not** inline p5.js into contract storage. Therefore the original `~900 KB` diagnosis and projected `<15 KB`/`~3.5 ꜩ` savings are not measurements of this Pasta artifact. Any cost claim needs an exact candidate build, operation estimate, and network context.

Declared libraries, typed parameters, a completion signal, and an isolated script runtime could form a useful **additive script-authoring mode**. They need a versioned manifest, dependency integrity policy, script capability boundary, deterministic input/output tests, and a verified capture lifecycle. If artist-authored scripts run, the proposed isolated origin and sandbox must be implemented and tested; declarations alone do not create that isolation.

Full Aleatory lifecycle adoption is a separate contract and product decision. Aleatory's immediate token ownership with pending metadata and provider publication changes when ownership exists and who may complete publication. Current Rotini uses reserve/render/finalize, and Ravioli's Rotini adapter depends on its reservation, minting, release, and deterministic-context behavior. A replacement must preserve those guarantees or explicitly version and migrate them. A mint-operation-hash seed is reproducible but can admit offline grinding; it is not by itself an unbiased randomness guarantee, nor does it remove every failure or recovery state.

Interface tags are compatibility declarations, not a guarantee that Objkt, Teia, or any other marketplace will index and trade the resulting contract on day one. Check actual contract support, metadata, listing rules, and a real transaction before advertising an integration.

### Collaboration attribution and payout splits

Aleatory's separate confirmation of public co-creator attribution is a useful consent pattern. Being paid and being named as a creator are distinct decisions. Pasta should apply it only where the actual contract and product want that behavior.

The earlier proposed “probe and route a reverting payee's share to the administrator so mint always succeeds” guarantee is too strong. An entrypoint-type probe can detect a missing or incompatible destination; a compatible contract can still fail during execution and revert the operation. A pre-origination simulation is useful evidence for the simulated state, not a guarantee about every later payout. The originally stated maximum of eight payees was not established for Pasta; any bound must come from its real contract and measured operation costs.

Before adding splits, decide who is owed each share, rounding, how a rejecting recipient's claim is preserved or refunded, whether a withdrawal model is needed, and who is authorized to change terms. Redirecting another person's entitlement to an administrator is an economic policy requiring explicit consent, not an automatic safety fix. Verify the relevant payment paths separately for each supported contract.

### Macaroni parked work and signed-operation recovery

The October review identified an operator visibility gap: `manual_review` work could park without a supported inspection/recovery flow. Aleatory's stuck-work and heartbeat patterns are useful references for classifying temporary dependency outages and operator-action states. A universal retry cap or fixed exponential schedule should not be copied without a concrete workload and protocol reason.

The critical safety boundary is the exact signed attempt. A timeout, restart, or changed FIFO/arm precondition cannot establish that the signed bytes failed on-chain. The signer-wide guard must remain until exact inclusion/finalized failure or protocol-derived branch expiry plus canonical absence allows a linked replacement with the same committed allocation. An operator action must not reroll or create an overlapping settlement. PR #48 implements bearer-protected attention/list/retry routes, native Studio recovery controls, and those chain-evidence checks. The [Companion backup/recovery contract](../companion/macaroni-v35/BACKUP_RECOVERY.md) remains the source for retained signed bytes and private state.

### Studio preflight and read resilience

Preview and validate the actual output before an irreversible wallet step. A missing capture, incomplete frame, absent declared dependency, or failed finish signal is a meaningful error for a script mode. A blanket “black image is invalid” rule would reject intentional artwork; capture health and artistic content must be distinguished. An acknowledgement can explain permanence, but must not be treated as proof the renderer or contract is correct.

Coalesce duplicate reads where this improves observed RPC/indexer load. A last-known-good cache may keep a **clearly marked stale display** visible during an outage. Purchases, contract binding, custody changes, finalizer recovery, and new signing still require fresh evidence from their workflow. A stale cache must not make an unavailable dependency look ready or invite a collector to purchase again while their first operation is unresolved.

## Unbundled infrastructure providers

A publisher should be able to self-run, use a private/allowlisted operator, buy specialist services, or combine these choices. An all-purpose provider remains a valid convenience bundle. Access policy (public versus private provider) and capability (pinning versus storage versus signing) are independent axes.

The [detailed proposal in PR #38](https://github.com/Paulwhoisaghostnet/WTF/pull/38#issuecomment-6161094527) maps private asset and CID/manifest custody, public pinning, gateways, media preparation, rendering, RPC/observation, durable execution, scoped signing, public APIs, hosting, backup, and monitoring to each Pasta tool. Start with concrete capability and agreement schemas and local reference adapters. Each offer needs its actual network/version, pricing unit, duration, permissions, completion evidence, and exit/recovery process. A pinning-only service needs no renderer or finalizer key. A private allowlist does not encrypt assets, and a CID proves content identity rather than retention. Native multi-provider payment or authorization may require a versioned contract change; metadata descriptions do not confer it on an existing collection.

## Release disposition and next steps

PR #48 corrects the alpha Macaroni recovery and desktop boundaries above. Its funded installed-app proof covers one paid, immediate-release, single-edition Shadownet drop using an explicit same-device loopback collector. Its clean-source Universal macOS packages pass installed-artifact smoke and the integrated quality workflow passes, but the local packages are unsigned/unnotarized. Remote HTTPS/CORS, other sale modes, larger workload evidence, backup/restore and operator migration rehearsal, production managed configuration, and Mainnet remain outside that proof. The [current known-issues record](KNOWN_ISSUES.md) distinguishes these boundaries.

Recommended sequence:

1. Integrate and review the concrete alpha corrections in PR #48 on the review branch; keep the release labeled as a controlled Shadownet alpha.
2. Choose the exact supported tool/mode/platform matrix. Prove each advertised complete user outcome against its matching source and contract artifacts, including the retained Ravioli/Rotini/Gnocchi proof and payment/recovery findings. Keep unverified tools visibly preview or unavailable.
3. Exercise the remotely hosted collector, backup/restore and custody handoff, service capacity/funding, public status, and failure recovery for any managed Macaroni offer. Prepare signed/notarized packages for public macOS distribution and verify the exact distributed bytes.
4. Specify specialist provider offers and local/self-run adapters in parallel, without making a full marketplace or a Rotini lifecycle migration a prerequisite for a narrower verified release.
5. Promote to Mainnet and production only after the supported release candidate, its operational dependencies, contracts, installed artifacts, and public site pass their applicable end-to-end and recovery checks.

The detailed [production-readiness issue list](https://github.com/Paulwhoisaghostnet/WTF/pull/38#issuecomment-6207562076) and [subsequent implementation handoff](https://github.com/Paulwhoisaghostnet/WTF/pull/38#issuecomment-6460063149) provide the per-tool and release evidence behind this disposition.
