# Subplan — Colander (ownership / management / discovery) — DONE (Phase 4)

Surface: React page (`client/src/features/pasta-protocol/colander/`).

## Status (Phase 4 complete)

- **Adapter registry (composable core)**: `shared/pasta-protocol/adapters.ts` — pure, dependency-free.
  Each Pasta contract type (standard collection, open edition, bundle, distribution, exhibition) plus a
  generic-FA2 fallback is described once with a detection `signature` (entrypoints that must be present),
  a `specificity` for disambiguation, and its supported actions (id, label, group, entrypoint, access,
  typed inputs, optional `external` deep-link). `detectPastaContract(entrypoints)` returns the
  highest-specificity match (or null); `availableActions(adapter, entrypoints)` filters to actions whose
  entrypoint actually exists. Unit-tested (49 foundation tests green), including the distribution-vs-standard
  disambiguation (both expose `create_token`).
- **Colander React app**: `client/src/features/pasta-protocol/colander/ColanderApp.tsx`. Opens any KT1,
  reads its entrypoints via Taquito, detects the type from the adapter registry, reads storage
  (admin/pending admin/token & revision counts) and the contract metadata relationship block
  (`extractRelationshipMetadata` over the pinned JSON), then renders a per-type control panel that offers
  only supported workflows. Transfers/roles/admin handoff/sale toggle/claim window/set-current-revision
  run as wallet-signed calls; bulk/complex actions (load recipients, airdrop, publish revision) deep-link
  to the owning publisher (Penne/Lasagna) instead of duplicating their UIs. Renders the
  Wallet → Franchise → Collection → Token graph from relationship metadata.
- **Discovery model**: reads the public chain + the opened contract at runtime only; indexes/stores
  nothing (Owner Directive #3). Uses the client's configured network/RPC and the existing wallet kernel
  (`connectWallet`/`getActiveAccount`/`getTezos`).
- **Handles**: emits `colander.contract_opened` + `colander.graph_viewed` on open,
  `colander.transfer_submitted` on transfer, `colander.role_updated` on role/admin actions
  (`logClientSystemEvent`). Route, page-def, inventory row, and e2e fixtures were already wired in Phase 0.

### Blocker note
`npm run test:e2e:inventory` (live UI) needs a running server/DB and a connected wallet to exercise
on-chain reads/writes; not run in this pass. Adapter detection (the type-routing core) is covered by unit
tests, and the route/handle coverage gate (`test:e2e:inventory:coverage`) passes.

## Role

The control panel. Colander reads contracts a wallet owns/administers, understands each Pasta contract
type, and exposes the correct per-contract workflow: transfer, role/admin management, mint-more (where
allowed), pause, metadata edits, and relationship-graph view (Wallet → Franchise → Collection → Token).

This is discovery + management, distinct from CH-EASE (prep) and the publishers (create).

## How it understands contracts

Each publisher exposes a small **adapter** describing its contract type: detectable signature, the
admin/transfer actions it supports, and how to read its state. Colander composes these adapters; it does
not hardcode per-app logic.

## Data sourcing

Discovery uses on-chain/indexer reads. Per Owner Directive #3, standalone builds read public data and
the user's wallet only; wtfOS-embedded trusted creators may use wtfOS-backed enrichment. No app
indexes/stores user data beyond what the control panel needs at runtime.

## Modules

New app (not a Macaroni fork): contract discovery, adapter registry, per-type control panels,
relationship-graph renderer.

## Handles

`colander.contract_opened`, `colander.transfer_submitted`, `colander.role_updated`,
`colander.graph_viewed`.

## Phase 4 — consumes the adapters every prior phase registers.
