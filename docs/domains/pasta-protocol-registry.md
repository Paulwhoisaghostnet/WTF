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
- `gnocchi.edition_published`
- `gnocchi.edition_minted`
- `ravioli.collection_deployed`
- `ravioli.bundle_published`
- `ravioli.redeemed`
- `ravioli.contents_revealed`
- `rotini.collection_deployed`
- `rotini.generated`
- `rotini.tokens_published`
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
