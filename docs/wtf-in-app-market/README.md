# WTF In-App Market

The in-app market contract is a tiny WTF payment router for platform-only
inventory on Tezos. It does not mint item tokens, escrow WTF, store purchases,
or store the catalog. Buyers approve the market contract as an FA2 operator,
call `purchase`, and the contract pulls the requested WTF amount from the buyer
wallet directly into the gameshow treasury:

`tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`

The app owns item prices and grants inventory only after TzKT confirms both:

- an applied `purchase` call to the configured in-app market contract; and
- the exact matching WTF FA2 transfer from the buyer to the treasury.

## Seed Listings

| Listing ID | SKU | Item | Price |
| ---: | --- | --- | ---: |
| 0 | `pet-food` | Pet Food | 10.00 WTF |
| 1 | `pet-medicine` | Pet Medicine | 25.00 WTF |
| 2 | `shoebox` | Shoebox | 50.00 WTF |

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

The generated SmartPy Michelson is compacted after compile. The current payment
router contract artifact is about 1 KB, safely below Kiln Shadowbox's 200 KB
source limit.

## Runtime Env

```bash
VITE_IN_APP_MARKET_CONTRACT_ADDRESS=KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE
IN_APP_MARKET_CONTRACT_ADDRESS=KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE
IN_APP_MARKET_TREASURY_ADDRESS=tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt
```

The app also ships this KT1 as the shared default in `shared/types.ts`; keep the
client and server env overrides aligned when rotating the payment router.

The server uses the shared WTF token config from `shared/types.ts`; the
mainnet artifact generator defaults to WTF FA2
`KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`.

## Kiln Status

The latest public Kiln probe is recorded in
`docs/wtf-in-app-market/shadownet-kiln-run.md`. At the time of that run,
`kiln.wtfgameshow.app` exposed Shadownet capability metadata but required a
Kiln API token for workflow/deploy/e2e mutation routes, so live Shadownet
deployment and E2E remained blocked locally.
