# WTFIAP-v0.01 escrow readiness

New XTZ tournament rooms target **Tezos Shadownet**. New WTF tournament rooms target a separately configured **Tezos Mainnet** lane. Mainnet work is preparation only until its escrow is originated and verified: no Mainnet WTFIAP operation has been signed or injected. Existing funded rooms retain their pinned network and contract.

## Approved economics and recovery

- Eight distinct human account/wallet entrants; no AI fill in funded tournaments.
- Entry and prizes remain in the room currency: XTZ or WTF. Entry increments are **0.01 XTZ** (10,000 mutez) and **0.01 WTF** (1,000,000 atoms at eight decimals).
- The combined pot pays places 1–3 at **50/35/15**. Same-round eliminations compare final unclamped commander HP, gold, then last-fielded total maximum HP. Remaining ties share the combined occupied prizes.
- Each player's share is rounded **down** to the room's 0.01 quantum. The aggregate remainder belongs to the immutable `wtf.tez` treasury. There is no separate house fee. Treasury collection is isolated from player claims.
- Entrants may withdraw their full entry before start and rejoin while funding remains open. An auditable technical void refunds every paid entry in full. No arbitrary cancellation deadline, forfeit, automatic winner or claim expiry is added.
- The server is the trusted referee. It validates commands and derives results from saved authoritative combat/replay records; clients cannot submit winners or payout amounts.

## Contracts and current proof

The approved artifact is `contracts/wtfiap-escrow/artifacts/contract.json`, SHA-256 `d3cec0eaa8ebe362315f455c78a5fee278dbdb131b7fbe809b6310b3fbf2b34c`. Its constructor pins the room creator, WTF token and treasury; rooms pin the referee, entrants, terms, rules and seed commitment.

Shadownet chain ID: `NetXsqzbfFenSTS`.

| Purpose | Address | Applied operation |
| --- | --- | --- |
| Standard dummy WTF, token 0, eight decimals | `KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg` | `opNeGppDhooenBVYxJLFminCbwCarC7R3tTatnDtRiYr2Vmxy2m` |
| Contract lifecycle rehearsal escrow | `KT1NHQikB69AVHaNYvfdBvyx2RSHQk3uPzR3` | `ontx2wFq3gpbWARkT7PLiJNgDh5x4qB2oEFpGpDM624azXRUzuN` |
| Hosted wtfOS escrow | `KT1HQoH75iYeMK5xDJmuVRpBxdKxnEg9Wjko` | `ooYK1bU6R2fNPYAJ5HLLVPyozUC6Mz7GxoxtbUF5nmgve2JmPXM` |

The rehearsal uses the existing local Shadownet root as its synthetic creator/referee/treasury. It is not the final hosted escrow. Exact applied receipts, initial storage, estimates and code identities are in [the Shadownet proof directory](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-22/). The deployed token contains no Mainnet WTF.

Local contract verification covers seven escrow scenarios, both currency paths, refund/rejoin/void, recipient/treasury rejection isolation, unauthorized calls and malformed/replayed results. Independent arithmetic covers all 64 eliminated-player tie partitions, both quanta, all 420 rounding residue classes and amounts above JavaScript's safe-integer range.

Four real Shadownet lifecycle cases now pass with **144 applied operations**: XTZ ranked payouts, WTF tied-place payouts, and withdrawal → re-entry → start → technical void → all eight refunds in each currency. Every room ends with zero held funds. The withdrawal/re-entry cases conserve cumulative deposits of 90,000 mutez and 9,000,000 WTF atoms respectively, including the initial withdrawn entry. Native fees and storage burns are accounted separately from escrow principal. See the [durable lifecycle journal](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-22/lifecycle/journal.json), [measured operation costs](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-22/final-operation-costs.json), and [finalized wallet handoff](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-22/local-wallet-handoff.json). These contract exercises do not substitute for the native and hosted complete-game proofs below.

## Host integration and automation

The native funding panel uses the existing Octez Connect/Taquito wallet stack. Only a verified linked wallet belonging to the authenticated room seat can bind. Same-origin iframe messages carry room identity, never transaction parameters. `/wtfiap?room=<code>&funding=1` recovers deposits, withdrawals, claims and void refunds independently of the battlefield.

PostgreSQL stores frozen terms, intents, observations, results and void evidence. The private signer records an intent before sending and its operation hash before waiting. An uncertain send cannot be blindly repeated. Chain reads pin one block with two successors and use the configured primary/fallback for that network.

The `wtfiap-escrow-reconciliation` job wakes on startup, room changes, explicit actions and chain heads. Disabling new funding blocks create/start; saved settlement, treasury and technical-void obligations retain their original configuration. Direct wallet claims/refunds remain available. A separate payment cron is unnecessary.

The dedicated encrypted host wallet is `wtfiap-shadownet-referee`, address `tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe`. Its secret never leaves the host keyring. The game lane is configured for the finalized hosted escrow above. The first room exposed a container identity mismatch: root health checks passed, but the actual node process lacked the host socket group. The entrypoint now derives that mounted group and grants only the node account membership before dropping privileges, preserving private socket modes. An isolated production-image test covers denial before correction, successful unprivileged communication, repeated startup, socket recreation and continued denial for an unrelated account. Normal deployment39854380320 serves220600ef; the actual app process has the required supplementary group and its unprivileged signer probe succeeds. Four finalized deposits survived replacement, and the live chain-head reconciliation worker is healthy. [Socket proof and original-ID request recovery](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-22/host-signer-access.json).

Game configuration uses `WTFIAP_ESCROW_NETWORK`, `WTFIAP_ESCROW_RPC_URL`, `WTFIAP_ESCROW_CONTRACT`, `WTFIAP_ESCROW_SCRIPT_HASH`, `WTFIAP_REFEREE_WALLET_ID`, `WTFIAP_REFEREE_ADDRESS`, `WTFIAP_ROOM_CREATOR_ADDRESS`, `WTFIAP_TREASURY_ADDRESS`, `WTFIAP_WTF_TOKEN_CONTRACT`, `WTFIAP_WTF_TOKEN_ID` and measured `WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS`. Global Mainnet token/RPC settings remain unchanged.

The signer requires explicit `WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS`, `WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID`, `WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID`, `WTF_OPERATOR_SIGNER_WTFIAP_RPC` and persistent `WTF_OPERATOR_SIGNER_WTFIAP_JOURNAL_PATH`. Empty configuration disables this lane.

Normal deployment applies `drizzle/0132_wtfiap_funding.sql`, preserves private room files and holds the shared deployment/admission gate during replacement. Incompatible rules cannot replace an unresolved funded game. Archived settled results and verified technical voids permit later claims/refunds after a rules upgrade.

Technical voids are private operator maintenance: stop the app, obtain the deployment gate, reproduce the authoritative failure, commit evidence and preserve the failed snapshot. Restart the normal worker to submit the committed void. Healthy and completed matches cannot be voided by this path. Use `scripts/wtfiap/request-technical-void.mjs` and the required `scripts/wtf-ssh.sh` host wrapper.

## Mainnet preparation

Mainnet remains disabled. The production asset will be WTF `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token 0, eight decimals, on `NetXdQprcVkpaWU`.

The game now selects the funding lane by room currency and exposes exact room-specific settings at `GET /api/wtfiap/funding/config?room=<code>`. The operator signer has independent Mainnet contract, wallet, RPC and durable-journal allowlists. The Mainnet lane cannot inherit the Shadownet escrow or signer settings; blank Mainnet fields keep new WTF deposits disabled. Player WTF approval, deposit and permission removal remain one wallet batch with zero XTZ attached; the initiating wallet pays Tezos gas and storage fees in XTZ. Claims and refunds for older rooms remain pinned to their original deployment.

Mainnet admission requires all `WTFIAP_MAINNET_*` game settings from `.env.example` and all `WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_*` signer settings from the signer `.env.example`, matching the finalized deployment. `originate-mainnet.ts` checks the exact approved artifact, creator, WTF asset and resolved treasury; it is read-only unless explicitly called with `--execute`.

Readonly finalized Tezos Domains resolution proves that `wtf.tez` resolves to `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; its domain owner is a different address. The record expires 2027-04-10. See [treasury resolution evidence](../../contracts/wtfiap-escrow/proof/mainnet-treasury.json), reproducible with `scripts/wtfiap/resolve-treasury.mjs`.

The 2026-10-22 artifact and Mainnet initial storage typechecked under protocol `PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY`. Its historical read-only treasury-source estimate was **2,406,769 mutez**. It does not estimate or authorize the revised artifact. [Historical estimate](../../contracts/wtfiap-escrow/proof/mainnet-2026-10-22/preflight.json).

The planned creator/referee is the existing contract-admin `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`, observed with 745,372 mutez. The treasury was only the readonly estimation source; this does not authorize treasury spending. Before Mainnet activation, select/fund the actual origination payer, refresh its exact estimate and referee operating budget, re-resolve `wtf.tez`, originate the tested artifact, verify finalized code/storage and then configure the Mainnet lane through a separately authorized deployment. Historic `preflight-mainnet-draft` reports refer to the superseded draft and are not current costs.

The 2026-10-23 revision adds two-human duels and eight-seat tournaments with two through eight paying humans. AI prize-place shares and rounded remainders go to the fixed treasury. The revised compiled code SHA-256 is `50944a178b52a411498f747f346af03553067702b5eddccaf82d035c0ec67926`, with canonical Michelson identity `d4e870627065c1a91e2bc848d7aef6329a2071a1180700a7492ecb2087f478b1`. SmartPy scenarios, an independent arithmetic oracle, game-server full matches, funding adapter tests and focused browser stories pass. Shadownet origination `oodBmT7mhgXswVgfhLAYdy1d55o4mGw77aZrRS7s2p38Vnp3dk9` finalized at `KT1G1zBKD5fVdmXFTAikmMAAK1urRnQ699nh`; code and storage matched the revision. [Shadownet receipt](../../contracts/wtfiap-escrow/proof/shadownet-2026-10-23-ai/origination/origination.json).

The owner authorized `reward-disburser` (`tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u`) to pay Mainnet origination. A read-only preflight using that exact source measured **2,654,056 mutez** total at the pinned block, against **4,349,079 mutez** held. The same revised code and constructor typechecked on Mainnet. The Mainnet primary RPC returned 503; the configured fallback completed the check. Finalized `wtf.tez` resolution still points to `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`. [Payer estimate](../../contracts/wtfiap-escrow/proof/mainnet-2026-10-23-ai/preflight.json), [treasury resolution](../../contracts/wtfiap-escrow/proof/mainnet-2026-10-23-ai/treasury.json). Mainnet signing and hosted activation require their separate receipts below.

## Verification commands and boundaries

```sh
npm run contract:test:wtfiap
npx tsx --test contracts/wtfiap-escrow/shadownet-proof.test.ts contracts/wtfiap-escrow/preflight-origination.test.ts
npm run operator-signer:check
npm run operator-signer:test
npm run operator-signer:build
npx tsx --test server/features/wtfiap/funding.test.ts server/features/wtfiap/funding-contract.test.ts server/features/wtfiap/funding-store.test.ts server/features/wtfiap/funding-http.test.ts client/src/features/wtfiap/funding.test.ts
node --test scripts/wtfiap/deploy-guard.test.mjs scripts/deploy-dry-run-policy.test.mjs scripts/production-migrations-policy.test.mjs
node scripts/vendor-wtfiap.mjs
NODE_OPTIONS=--max-old-space-size=6144 npm run check
npm run test:e2e:inventory:coverage
npm run env:inventory:check
npm run test:e2e:inventory
```

The TypeScript heap comes from existing Docker/CI policy. PostgreSQL proof requires an isolated `WTFIAP_TEST_DATABASE_URL`; a skipped database test is not persistence proof. Inventory DTO fixtures prove interface behavior, not payments. The local actor harness proves authentication/admission separately. The real Shadownet wallet-provider harness must prove native wallet requests, real chain effects, reconciliation and reload; it does not substitute for a commercial extension's UI test. Final hosted release claims additionally require the deployed commit, public health, actual funded match receipts and running worker evidence.
