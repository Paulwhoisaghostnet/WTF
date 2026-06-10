# WTF In-App Market

The in-app market V2 contract is a tiny WTF payment primitive for platform-only
inventory on Tezos. It does not mint item tokens, escrow WTF, store purchases,
store stock, or store the catalog. Buyers approve the market contract as an FA2
operator, call `purchase`, and the contract pulls the requested WTF amount from
the buyer wallet directly into the gameshow treasury:

`tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`

The app owns item prices and grants inventory only after TzKT confirms both:

- an applied `purchase` call to the configured in-app market contract; and
- the exact matching WTF FA2 transfer from the buyer to the treasury.
- V2 expected terms on the purchase call: expected WTF token, expected treasury,
  amount, purchase reference, and deterministic cart hash.

## Catalog Ownership

Catalog rows, SKUs, stock, sale pricing, EXP checkout, inventory grants, and
cart expansion stay in the app database. The on-chain `listing_id` is an app
reference only; the V2 contract verifies payment terms and emits the operation
evidence the server reconciles.

## Commands

```bash
npm run contract:test:in-app-market
npm run contract:deploy:in-app-market:kiln
npm run contract:e2e:in-app-market:shadownet
npm run contract:prepare:in-app-market:mainnet
```

`contract:prepare:in-app-market:mainnet` is gated on
`docs/wtf-in-app-market/shadownet-e2e-report.md` containing
`- Status: PASSED`.

The generated SmartPy Michelson is compacted after compile. The current V2
payment primitive artifact is about 2.7 KB, safely below Kiln Shadowbox's 200 KB
source limit.

## Runtime Env

```bash
VITE_IN_APP_MARKET_CONTRACT_ADDRESS=KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR
IN_APP_MARKET_CONTRACT_ADDRESS=KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR
VITE_IN_APP_MARKET_CONTRACT_VERSION=v2
IN_APP_MARKET_CONTRACT_VERSION=v2
IN_APP_MARKET_TREASURY_ADDRESS=tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt
```

The app also ships this KT1 as the shared default in `shared/types.ts`; keep the
client and server env overrides aligned when rotating the payment primitive.

The server uses the shared WTF token config from `shared/types.ts`; the
mainnet artifact generator defaults to WTF FA2
`KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`.

## Deploy Status

- Shadownet V2 proof: `KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t`
- Mainnet V2: `KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR`
- Mainnet WTF FA2: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`

The latest Kiln/Shadownet run is recorded in
`docs/wtf-in-app-market/shadownet-kiln-run.md` and
`docs/wtf-in-app-market/shadownet-e2e-report.md`.
