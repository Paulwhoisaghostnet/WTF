# Tezos Marketplace Emergency Lockdown + V2 Runbook

Last updated: 2026-06-06

## Mainnet Legacy Status

- Legacy marketplace: `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj`
- Known admin from TzKT storage on 2026-06-06: `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`
- Dangerous live evidence: offer on `KT1HErfW6XogrdKHrHFhXn3HWC1nFhiYivch#2` had `token_amount=9990000` and `amount_wtf=110000000`.
- Do not deploy Marketplace V2 to mainnet from this pass. Mainnet V2 requires a separate owner instruction after shadownet proof.

Read-only status check:

```bash
npm run contract:marketplace:legacy-status
```

Pause legacy marketplace only if all of these are true:

- TzKT storage still reports `paused=false`.
- The provided signer public key hash matches the storage admin.
- The owner intends to block legacy create/buy/place/accept/bid flows while keeping cancel/refund paths available.

```bash
MARKETPLACE_ADMIN_SECRET_KEY='edsk...' npm run contract:marketplace:legacy-pause
```

The pause script writes `.agents/docs/archive/contracts/wtf-marketplace-v2/legacy-marketplace-pause-run.md`.

## Shadownet V2 Publish And Puppet E2E

Marketplace V2 must be published to shadownet through Kiln before any mainnet rollout artifact is treated as ready.

Required environment:

```bash
export KILN_API_URL="${KILN_API_URL:-https://kiln.wtfgameshow.app}"
export KILN_NETWORK_ID="${KILN_NETWORK_ID:-tezos-shadownet}"
export KILN_API_TOKEN='...'
```

If the WTF repo shell does not have `KILN_API_TOKEN`, check the sibling Kiln
service environment. The live Kiln service uses `API_AUTH_TOKEN` in
`../building/shadownet kiln/.env`; source it without printing the value and pass it
through as `KILN_API_TOKEN` for this script.

Run:

```bash
npm run contract:deploy:marketplace-v2:kiln
```

The script uses Kiln puppet wallets from `/api/kiln/balances`, deploys:

- Dummy WTF FA2
- Sample FA2
- WTF Marketplace V2 with puppet wallet A as admin and dummy WTF as currency

The Kiln E2E then tests:

- Listing creation with explicit quantity
- Listing buy with expected token, owner, quantity, and unit price
- Offer escrow and accept with expected quantity and unit price
- Cancel/refund for a second offer
- Auction create/cancel with explicit quantity
- Pause blocks a new offer
- Unpause restores active state

Reports:

- `.agents/docs/archive/contracts/wtf-marketplace-v2/shadownet-kiln-run.md`
- `.agents/docs/archive/contracts/wtf-marketplace-v2/shadownet-e2e-report.md`

Latest passed proof, 2026-06-06:

- Kiln WTF FA2 (bronze): `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`
- Sample FA2: `KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V`
- WTF Marketplace V2: `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy`
- E2E: 17/17 steps passed, 15/15 entrypoints covered, storage/balance/big-map assertion kinds passed.

If `KILN_API_TOKEN` is missing and Kiln rejects unauthenticated mutation routes, the script exits with code `2` and writes BLOCKED reports. That is not a shadownet pass.

The script retries transient Kiln/RPC 429 and 5xx responses. If
`https://rpc.shadownet.teztnets.com` returns sustained HTTP 503, the pass is
blocked before any shadownet origination can be proven.

If Kiln workflow clearance cannot prove the dependent FA2 marketplace path in
the single-contract shadowbox stage, the script may use Kiln's
`allowShadownetDirectDeploy` flag for `tezos-shadownet` only. That is still
testnet-only and must be followed by a passing puppet-wallet E2E report before
Marketplace V2 is considered shadownet-proven.

## App Rollout

- Active contract env names remain `MARKETPLACE_CONTRACT_ADDRESS` and `VITE_MARKETPLACE_CONTRACT_ADDRESS`.
- `LEGACY_MARKETPLACE_CONTRACT_ADDRESS` is read-only legacy reference/recovery context.
- Legacy accepts must be blocked unless canonical `/api/marketplace/onchain` proves `tokenAmount === "1"`.
- V2 accepts require `offerId`, token contract/id, target owner, quantity, unit WTF, total WTF, and contract version before wallet signing.
- Cancel/reject must use owner-scoped legacy token refs or V2 `offer_id`; never token id alone.
