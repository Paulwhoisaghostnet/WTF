# WTFIAP-v0.01 escrow readiness

This release targets **Tezos Shadownet**. Mainnet work is preparation only: no Mainnet operation has been signed or injected. Testnet contracts are deployed; end-to-end game and hosted release verification are still in progress.

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

Local contract verification covers seven escrow scenarios, both currency paths, refund/rejoin/void, recipient/treasury rejection isolation, unauthorized calls and malformed/replayed results. Independent arithmetic covers all 64 eliminated-player tie partitions, both quanta, all 420 rounding residue classes and amounts above JavaScript's safe-integer range. These are local proofs; real lifecycle receipts are recorded separately.

## Host integration and automation

The native funding panel uses the existing Octez Connect/Taquito wallet stack. Only a verified linked wallet belonging to the authenticated room seat can bind. Same-origin iframe messages carry room identity, never transaction parameters. `/wtfiap?room=<code>&funding=1` recovers deposits, withdrawals, claims and void refunds independently of the battlefield.

PostgreSQL stores frozen terms, intents, observations, results and void evidence. The private signer records an intent before sending and its operation hash before waiting. An uncertain send cannot be blindly repeated. Chain reads pin one block with two successors and use the configured primary/fallback for that network.

The `wtfiap-escrow-reconciliation` job wakes on startup, room changes, explicit actions and chain heads. Disabling new funding blocks create/start; saved settlement, treasury and technical-void obligations retain their original configuration. Direct wallet claims/refunds remain available. A separate payment cron is unnecessary.

The dedicated encrypted host wallet is `wtfiap-shadownet-referee`, address `tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe`. Its secret never leaves the host keyring. The updated signer is installed and its service/socket identity verified; the game lane is awaiting activation with the finalized hosted escrow above.

Game configuration uses `WTFIAP_ESCROW_NETWORK`, `WTFIAP_ESCROW_RPC_URL`, `WTFIAP_ESCROW_CONTRACT`, `WTFIAP_ESCROW_SCRIPT_HASH`, `WTFIAP_REFEREE_WALLET_ID`, `WTFIAP_REFEREE_ADDRESS`, `WTFIAP_ROOM_CREATOR_ADDRESS`, `WTFIAP_TREASURY_ADDRESS`, `WTFIAP_WTF_TOKEN_CONTRACT`, `WTFIAP_WTF_TOKEN_ID` and measured `WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS`. Global Mainnet token/RPC settings remain unchanged.

The signer requires explicit `WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS`, `WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID`, `WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID`, `WTF_OPERATOR_SIGNER_WTFIAP_RPC` and persistent `WTF_OPERATOR_SIGNER_WTFIAP_JOURNAL_PATH`. Empty configuration disables this lane.

Normal deployment applies `drizzle/0132_wtfiap_funding.sql`, preserves private room files and holds the shared deployment/admission gate during replacement. Incompatible rules cannot replace an unresolved funded game. Archived settled results and verified technical voids permit later claims/refunds after a rules upgrade.

Technical voids are private operator maintenance: stop the app, obtain the deployment gate, reproduce the authoritative failure, commit evidence and preserve the failed snapshot. Restart the normal worker to submit the committed void. Healthy and completed matches cannot be voided by this path. Use `scripts/wtfiap/request-technical-void.mjs` and the required `scripts/wtf-ssh.sh` host wrapper.

## Mainnet preparation

Mainnet remains disabled. The production asset will be WTF `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token 0, eight decimals, on `NetXdQprcVkpaWU`.

Readonly finalized Tezos Domains resolution proves that `wtf.tez` resolves to `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; its domain owner is a different address. The record expires 2027-04-10. See [treasury resolution evidence](../../contracts/wtfiap-escrow/proof/mainnet-treasury.json), reproducible with `scripts/wtfiap/resolve-treasury.mjs`.

The current artifact and Mainnet initial storage typecheck under protocol `PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY`. Readonly estimation using the funded public treasury address requires **2,406,769 mutez**: 10,019 fee plus 2,396,750 storage burn. No key was loaded and signing is impossible in this helper. The primary RPC returned 503; the approved Mainnet fallback completed the check. [Current estimate](../../contracts/wtfiap-escrow/proof/mainnet-2026-10-22/preflight.json).

The planned creator/referee is the existing contract-admin `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`, observed with 745,372 mutez. The treasury was only the readonly estimation source; this does not authorize treasury spending. Before Mainnet activation, select/fund the actual origination payer, refresh its exact estimate and referee operating budget, re-resolve `wtf.tez`, originate the tested artifact, verify finalized code/storage and then configure the Mainnet lane through a separately authorized deployment. Historic `preflight-mainnet-draft` reports refer to the superseded draft and are not current costs.

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
