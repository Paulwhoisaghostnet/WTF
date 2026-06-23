# Shadownet Stories

## Creator deploys everything to Shadownet

As a Creator
I want every contract-producing Pasta app to deploy on Tezos Shadownet
So that mainnet behavior is rehearsed with the same wallet lifecycle and explicit chain guard.

Acceptance Criteria:

Given Tezos Shadownet RPC `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`
When the creator deploys Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna outputs
Then each wallet request is bound to Shadownet, produces a KT1/op hash, and stores Shadownet-labeled evidence.

## Creator tests everything on Shadownet

As a Creator
I want to run each app's deploy, mint, role, and export validation on Shadownet
So that mainnet deployment does not fork from the rehearsed path.

Acceptance Criteria:

Given a deployed Shadownet contract from each app
When the creator runs the app-specific validation suite
Then storage, operation, metadata, and page checks all read from the Shadownet contract bundle.

## Collector interacts on Shadownet

As a Collector
I want collector mint/claim/redeem/purchase flows to operate on Shadownet
So that wallet preflight, quantities, price, and metadata resolution are verified before mainnet.

Acceptance Criteria:

Given Shadownet collector puppet wallets
When collectors mint Macaroni/Gnocchi, claim Penne, redeem Ravioli, or view Lasagna/Spaghetti/Rotini outputs
Then each collector sees chain, price, quantity, and metadata status before signing.

## Marketplace interactions occur on Shadownet

As a Marketplace User
I want Pasta-produced tokens to enter marketplace-like listing/transfer validation on Shadownet
So that hidden quantity, price, and ownership risks are caught before mainnet.

Acceptance Criteria:

Given Pasta token ownership on Shadownet
When a marketplace preview, transfer, offer, or purchase flow reads the token
Then it shows contract, token id, edition amount, owner, price, chain, and adapter type.

## Failures are recoverable

As an Administrator
I want failed Shadownet tests to preserve the last durable artifact
So that the next run can resume without duplicate deployments or blind retries.

Acceptance Criteria:

Given an RPC, indexer, pinner, wallet, or contract call failure
When the suite records the failure
Then the report names the boundary, the last durable CID/KT1/op hash, and the retry rule.
