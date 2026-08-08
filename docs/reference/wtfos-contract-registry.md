# wtfOS Contract Registry and Control Matrix

Last verified: 2026-07-24

This is the release-control registry for contracts used by wtfOS. “Live” means
the exact address is configured for production and its current storage was
checked. “Candidate” means source or historical evidence exists but the current
artifact has not completed the full Shadownet-to-mainnet release gate.

## Production contracts

| Priority | Contract | Mainnet address | Operational control | Evidence and status |
| --- | --- | --- | --- | --- |
| P0 | WTF FA2 token, token id 0, 8 decimals | `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD` | Existing token admin; consumed by all reward/market contracts | Live dependency; metadata and token id verified through TzKT. |
| P1 | WTF Marketplace V2 | `KT1C8jTazt2QyFLPKf27xRGssv99AtzagWHb` | Admin: `contract-admin` / `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`; production signer remains origination-disabled | Live. Canonical compiled code equals the proven Shadownet contract and mainnet code. Mainnet origination `ontJVKgZ5Dby8bJg7BKXvYt1kW3gvjFZgiLmS93xZBGa3J6YvA5`; bounded pause/unpause authority smoke applied; final storage is unpaused with no pending admin. Full receipt: [`wtf-marketplace-v2-mainnet-release-20260724.md`](./wtf-marketplace-v2-mainnet-release-20260724.md). |
| P0 | WTF reward redemption escrow V2 | `KT1PiBUGpind9xUxGR4EzpeXiySHcgUBDQZo` | Admin: `contract-admin` / `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`; issuer: `reward-disburser` / `tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u` | Live. Canonical compiled Michelson equals RPC code. Fresh Shadownet V2 proof: `KT1WsKmJbfnFSLKm6UqcahPuNHw6q55T3ut1`. Mainnet origination `onvFevgf5AuidaBNRziDdVkN3C9wW9ckdwgfNg55qeoAmx55RsN`; 1 WTF bounded claim passed in `op2dGGFnPBa6MT6d5XkNPZYsXqpzx6Uq9k21gZw263785Bd8A9U`; operating float top-up applied in `ooZ5MPyWt2yddQiUR2WYmuJ9PsmTkNVbcQExBEW67sJiGDU9qjx`; final balance 1,019 WTF, reserved 0. |
| P1 | WTF in-app market V2 | `KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR` | Immutable treasury: `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; no mutable admin | Live. Storage is `wtf-in-app-market-v2`, WTF FA2/token id and treasury match production config. Fresh Shadownet market: `KT1Qrpd2sH1t5QjoAjuiMWqMh4aw4aQTq9uy`; purchase workflow passed. A bounded 1 WTF mainnet purchase applied in `opQ6E5Ajgk6LoA5AoavmfBmZDu8znZX9JmUW7hGSHCEAugykYFF`, transferred the exact amount to the immutable treasury, and its temporary FA2 operator approval was removed in `ooEGLw42B2QpNBgwadvKU994uryYWyQ8XafvvckYAACoJY4Cxnk`. |
| P2 | Marketplace V1 legacy | `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj` | Historical marketplace owner/admin | Production-configured legacy surface. Do not use as evidence for Marketplace V2. |
| P2 | Barter board | `KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm` | Historical contract control | Production-configured. Current local Marketplace/Barter suite passes; ownership rotation and fresh Shadownet/mainnet identity proof remain required. |
| P2 | Casino membership | `KT1H5giLicVuF99PWy4XgjToRCC7q6HeLNiQ` | Immutable treasury: `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; no mutable admin | Live and configured. Fresh Shadownet proof `KT18njFE1uLmsHb4UuL5JhwnsBoQJfukUF7A` passed an exact 1 XTZ membership purchase in `opJiGUv9Z3PNoMvxfWuovTiASfqpAFbVLDHPCARmJnuA1TDH2Sf`. Mainnet origination `op2vcnfrdi5Z8SSgwiUUcfyF2cCPZtY71BVFcUsQgqdt3hGtjW8`; bounded mainnet purchase `ooEB6vqrEBSChpnAh7Bxr5iNm61HmUaJEAEGCpNpVoqsQdcF3wF` forwarded exactly 1 XTZ to treasury. The compiled and live Michelson hashes match. |
| P2 | Club dues V2 | `KT1H4rtqtsbbJGCE6o1hTTQ3S3Mq2riLHvmG` | Admin: `contract-admin` / `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`; treasury: `tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ` | Live and configured. V2 adds two-step admin rotation and rejects tez on privileged calls. Fresh Shadownet proof `KT1TyWvR89UFnRkMcPuPKaZmtSjPg7CfUyNq` exercised both authority transfers and an exact 1 XTZ payment. Mainnet origination by the system `wtf-os-root` wallet applied in `ooZwqLFRP6ngdcydMAK1Laf48meEaeqzdVF7hBGTVpTjvXXunDF`; authority was transferred to the dues manager and back to contract-admin, ending with no pending admin. Bounded mainnet payment `onpyKQvyHN1o6FzfHFy6Bc7bSivTia9BYUVtQq9Q3g53o6ogiir` minted token 0 and forwarded exactly 1 XTZ. Canonical compiled/live code SHA-256: `9b5a8fccbc9ed59cf8f6fa60e2e5583a2fd7347354c514ae2a60e7d17af226cc`. |

## Release candidates and templates

| Family | Source | Current evidence | Required before mainnet |
| --- | --- | --- | --- |
| WTF→XTZ exchange | `contracts/wtf-xtz-exchange/WtfXtzExchange.py` | Current local tests and exchange/dummy-FA2 compilations pass. Historical Shadownet exchange `KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF`. Fresh 2026-07-23 run blocked before signing because `KILN_API_TOKEN` was unavailable. | Fresh Shadownet economic workflow; explicit price/treasury/admin decision; bounded liquidity; generated mainnet artifact; contract-admin ownership; mainnet smoke. |
| Buyback | `contracts/wtf-buyback/WtfBuybackV1.py` | Source exists; no current release-gate result recorded in this pass. | Local security suite, fresh Shadownet liquidity/withdraw/pause proof, signer allowlist, admin/treasury assignment, mainnet artifact and bounded smoke. |
| WTF domains registrar | `contracts/wtf-subdomains/registrar_v2.py` and `wtf_domains_registrar.py` | App contains mainnet Tezos Domains dependencies and deployment/verification scripts. No production wtfOS registrar address was present in the audited environment. | Resolve the authoritative registrar generation, compile/verify, fresh Shadownet registration and recovery proof, explicit domain-controller/admin ownership, then configure mainnet. |
| Creator collection templates | `contracts/fa2-templates/*`, `contracts/wtf-collections/*`, `contracts/pasta-protocol/*` | These are per-creator factories/templates rather than one global wtfOS system contract. Pasta has its own proof packages; several files have active unrelated work in this workspace. | Each originated instance must carry its own artifact hash, creator/admin wallet, network, Shadownet proof or approved template certificate, and mainnet address. Never deploy every template globally merely because the source exists. |

## Wallet policy

| Wallet role | Mainnet address | Allowed responsibility |
| --- | --- | --- |
| Contract admin | `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo` | Pause/recovery, two-step role rotation, and contract maintenance. It must not issue routine rewards. |
| Reward disburser/issuer | `tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u` | Fund reward escrow and create/cancel redemptions. It must not gain admin rotation or recovery authority. |
| In-app market treasury | `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt` | Receive immutable market proceeds. |
| Club dues treasury | `tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ` | Receive club dues proceeds. |

Contract origination is disabled in the production signer after deployment.
Custom calls are restricted to an explicit contract allowlist. Any future
mainnet release must temporarily enable only the needed authority, verify the
result, then restore the narrow policy.
