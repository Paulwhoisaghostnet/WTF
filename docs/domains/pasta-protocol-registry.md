# Pasta Protocol Registry

## Owner Surface

- Desktop app key: `pasta-protocol`
- Admin surface: `pasta-protocol`
- Routes: `/tools/colander`, `/tools/spaghetti`, `/tools/gnocchi`, `/tools/ravioli`, `/tools/rotini`, `/tools/penne`, `/tools/lasagna`
- Neighbor app: `ch-ease` owns wtfOS-stored media/package preparation and trusted-creator package storage.

## Access Policy

Signed-in users may open Pasta publishers and Colander for self-managed wallet signing, self-managed Pinata pinning, and own-node IPFS workflows. Hosted wtfOS platform pinning remains a trusted-market-creator capability enforced by `/api/macaroni/ipfs/pin` and hidden in the static publishers until the embedded session proves that permission.

## Event Handles

- `chease.package_handoff_opened`
- `spaghetti.collection_deployed`
- `spaghetti.token_published`
- `spaghetti.exported`
- `gnocchi.collection_deployed`
- `gnocchi.collection_verified`
- `gnocchi.collection_editions_viewed`
- `gnocchi.edition_published`
- `gnocchi.edition_minted`
- `gnocchi.edition_vaulted`
- `gnocchi.edition_unvaulted`
- `ravioli.collection_deployed`
- `ravioli.bundle_published`
- `ravioli.redeemed`
- `ravioli.contents_revealed`
- `rotini.collection_deployed`
- `rotini.generated`
- `rotini.project_published`
- `rotini.iteration_minted`
- `rotini.package_exported`
- `penne.collection_deployed`
- `penne.distribution_configured`
- `lasagna.exhibition_published`
- `lasagna.registry_updated`
- `colander.contract_opened`
- `colander.handoff_opened`
- `colander.transfer_submitted`
- `colander.role_updated`
- `colander.graph_viewed`

## Operating Notes

Pasta apps use the project RPC defaults from `AGENTS.md`: Tezos Mainnet via `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet via `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`. Keep Shadownet labels explicit in UI, tests, and fixtures.

Rotini v2 generator publication does not create an NFT. A collector first calls `reserve_iteration`, locally materializes and pins a normal PNG, animated GIF, or dependency-free interactive ZIP plus TZIP-21 metadata, then calls `finalize_iteration`. The contract binds the finalized artifact URI, MIME type, display/thumbnail URI, and SHA-256 to the new token. Colander routes the complex materialization/finalization story back to Rotini and exposes close/reopen plus expired-reservation recovery as contract management.

Gnocchi uses one multi-token `PastaOpenEditionFA2` contract for independently configured Timed OEs, Forever OEs, and Limited Editions. The Studio can originate a new collection or verify the current interface, network, and connected administrator before appending the next token id to an existing KT1. Creator reserves count inside cumulative lifetime mint totals; locked policies prevent start/end/cap mutation, and burns do not reopen capped issuance. Colander routes both public minting and the complex add-edition/policy workflow back to Gnocchi.
