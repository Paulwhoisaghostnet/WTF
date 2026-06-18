# Pasta Protocol

Pasta Protocol is wtfOS's suite of specialized Tezos **publishing** apps. Each app does one job —
compile, configure, deploy, and export a specific kind of contract-level or token-level product — and
they share one proven wallet/deploy/export engine (forked from Macaroni).

## Apps

| App | Role |
| --- | --- |
| **Macaroni** | Blind-mint drop studio / blind-mint collection publisher (existing, the shared fork base). |
| **Spaghetti** | Standard collection publisher + token-product publisher (mint into a new collection, the HEN shared contract, or a wtfOS open collection). |
| **CH-EASE** | App-format-aware prep/packager: turns uploaded media + metadata into collection or single-token packages shaped for the selected app. |
| **Colander** | Ownership / management / discovery: reads owned contracts and gives a per-contract control panel with the correct transfer/admin/role workflow. |
| **Gnocchi** | Open-edition publisher (timed / forever / supply-limited / bonding-curve). |
| **Ravioli** | Bundle publisher (art packs / redeemable / mystery / wrapped). |
| **Rotini** | Generative publisher (traits / layers / generative outputs). |
| **Penne** | Distribution publisher (airdrops / claims / participation rewards). |
| **Lasagna** | On-chain curation / exhibition publisher. |

## Principles

- **Contract Products** create contracts and may contain **Token Products**; Token Products are
  portable across many Contract Products. Token Products never contain Contract Products.
- **Tooling, not an index.** Apps compile/configure/deploy/export. Users provide their own pinning,
  storage, and hosting by default.
- **Trusted-creator privileges** (wtfOS storage, IPFS pinning, hosting) are available across every app
  **when used inside wtfOS**. Downloaded/standalone builds ship without those backend features.
- **Ownership architecture** is designed for a future Wallet → Franchise → Collection → Token Products
  hierarchy via relationship metadata, without enforcing it in the MVP.

## Wallet and contract rules

User-initiated originations and mints use the user's connected wallet via the shared Macaroni wallet
kernel (Octez-primary → Beacon, strict chain-id safety). Backend-signed origination (Kiln) is reserved
for trusted-creator flows inside wtfOS.

See `docs/superpowers/plans/2026-06-17-pasta-protocol-mvp.md` and the per-section subplans in
`docs/superpowers/plans/pasta-protocol/`.
