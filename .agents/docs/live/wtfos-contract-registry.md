# wtfOS Contract Registry and Control Matrix

Last verified: 2026-07-23

This is the release-control registry for contracts used by wtfOS. “Live” means
the exact address is configured for production and its current storage was
checked. “Candidate” means source or historical evidence exists but the current
artifact has not completed the full Shadownet-to-mainnet release gate.

## Production contracts

| Priority | Contract | Mainnet address | Operational control | Evidence and status |
| --- | --- | --- | --- | --- |
| P0 | WTF FA2 token, token id 0, 8 decimals | `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD` | Existing token admin; consumed by all reward/market contracts | Live dependency; metadata and token id verified through TzKT. |
| P0 | WTF reward redemption escrow V2 | `KT1PiBUGpind9xUxGR4EzpeXiySHcgUBDQZo` | Admin: `contract-admin` / `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`; issuer: `reward-disburser` / `tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u` | Live. Canonical compiled Michelson equals RPC code. Fresh Shadownet V2 proof: `KT1WsKmJbfnFSLKm6UqcahPuNHw6q55T3ut1`. Mainnet origination `onvFevgf5AuidaBNRziDdVkN3C9wW9ckdwgfNg55qeoAmx55RsN`; 1 WTF bounded claim passed in `op2dGGFnPBa6MT6d5XkNPZYsXqpzx6Uq9k21gZw263785Bd8A9U`; operating float top-up applied in `ooZ5MPyWt2yddQiUR2WYmuJ9PsmTkNVbcQExBEW67sJiGDU9qjx`; final balance 1,019 WTF, reserved 0. |
| P1 | WTF in-app market V2 | `KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR` | Immutable treasury: `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; no mutable admin | Live. Storage is `wtf-in-app-market-v2`, WTF FA2/token id and treasury match production config. Fresh Shadownet market: `KT1Qrpd2sH1t5QjoAjuiMWqMh4aw4aQTq9uy`; purchase workflow passed. |
| P2 | Marketplace V1 legacy | `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj` | Historical marketplace owner/admin | Production-configured legacy surface. Do not use as evidence for Marketplace V2. |
| P2 | Barter board | `KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm` | Historical contract control | Production-configured. Current local Marketplace/Barter suite passes; ownership rotation and fresh Shadownet/mainnet identity proof remain required. |
| P2 | Club dues | `KT1B24vzsRccFBT8zeH9H24wgiVxxcLtw8DH` | Current on-chain admin: legacy operator `tz1P7TbhLFgCTYeYsHA5e4f9SwLNyT2YJ7Hd`; treasury: `tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ` | Live contract discovered in signer allowlist and verified by storage. Current local suite passes and compiles to 18,629 bytes. Admin migration to the dedicated contract-admin wallet is still pending a fresh network rehearsal. |

## Release candidates and templates

| Family | Source | Current evidence | Required before mainnet |
| --- | --- | --- | --- |
| Marketplace V2 | `contracts/WTFMarketplaceV2.py` | Local Marketplace V1.2/V2/Barter tests pass. Historical Shadownet V2 `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy` passed the full existing-contract workflow. | Decide whether the legacy production marketplace must be migrated; refresh artifact identity and ownership plan before any origination. |
| WTF→XTZ exchange | `contracts/wtf-xtz-exchange/WtfXtzExchange.py` | Current local tests and exchange/dummy-FA2 compilations pass. Historical Shadownet exchange `KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF`. Fresh 2026-07-23 run blocked before signing because `KILN_API_TOKEN` was unavailable. | Fresh Shadownet economic workflow; explicit price/treasury/admin decision; bounded liquidity; generated mainnet artifact; contract-admin ownership; mainnet smoke. |
| Casino membership | `contracts/wtf-casino-membership/WtfCasinoMembership.py` | Current tests pass; compiled Michelson is 901 bytes. | Fresh Shadownet membership lifecycle, app verification, admin/treasury policy, mainnet artifact and smoke. |
| Club dues next release | `contracts/wtf-club-dues/WtfClubDues.py` | Current tests pass; compiled Michelson is 18,629 bytes. Existing mainnet contract is live under the legacy operator. | Rehearse two-step or contract-supported admin migration, prove all manager flows on Shadownet, then rotate the existing contract or originate a replacement without breaking member state. |
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
