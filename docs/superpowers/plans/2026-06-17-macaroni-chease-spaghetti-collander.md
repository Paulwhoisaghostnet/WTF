# Macaroni, CH-EASE, Spaghetti, And Collander Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Keep Macaroni exactly as the existing app/brand, refactor CH-EASE into the Pasta package/export compiler, build Spaghetti as the standard Tezos FA2 collection deployment and token-minting app, and define Collander as the owned-contract control-panel layer.

**Architecture:** Macaroni remains its current blind-mint/product app. CH-EASE becomes the universal package preparation layer: it accepts media, previews, metadata, and target-specific settings, then exports the exact package shape expected by the selected Pasta app. Spaghetti is a new Macaroni-adjacent app that consumes CH-EASE packages to deploy standard FA2 collection contracts and add/mint tokens through a private management dashboard. Collander is a separate ownership/control surface that discovers or imports known owned/administered contracts and exposes the correct contract panel by type.

**Tech Stack:** Existing wtfOS app stack, existing creation-tool routing patterns, Tezos L1 RPC defaults from `AGENTS.md`, TzKT/Taquito/Beacon patterns already present in the repo, Drizzle/Postgres migrations, inventory-driven Playwright E2E.

---

## Product Boundaries

### Macaroni

Macaroni stays as-is.

- [ ] Do not rename Macaroni routes, copy, app identifiers, static paths, API namespaces, schemas, telemetry handles, or docs that refer to the existing Macaroni product.
- [ ] Preserve existing Macaroni behavior and package expectations.
- [ ] Treat Macaroni as one CH-EASE export target, not as something being replaced.

### CH-EASE

CH-EASE is the Pasta package/export compiler.

- [ ] Accept user uploads for media, preview media, metadata, and collection-level data.
- [ ] Let the user choose a target Pasta app.
- [ ] Expose the input/configuration fields needed by that selected target.
- [ ] Export target-specific packages with deterministic manifests, files, and metadata.
- [ ] Avoid describing CH-EASE as a contract control panel or transfer-workflow product.

Target examples:

- [ ] Macaroni target: export the media, preview, metadata, and product config expected by the existing Macaroni workflow.
- [ ] Spaghetti target: export collection metadata, token media, token previews, token metadata, mint settings, and admin/deployment config for a standard FA2 collection workflow.

### Spaghetti

Spaghetti is the new standard FA2 collection deployment and token-minting app.

- [ ] Provide a Macaroni-adjacent creation-tool experience focused on standard Tezos FA2 collection contracts.
- [ ] Deploy standard FA2 collection contracts.
- [ ] Add token definitions and metadata to deployed contracts.
- [ ] Mint tokens to recipients from the private management dashboard.
- [ ] Import CH-EASE Spaghetti packages.
- [ ] Produce private dashboard pages/bundles for user-only contract management.
- [ ] Register deployed contracts so Collander can discover/manage them later.

### Collander

Collander is the known-owned-contract control-panel layer.

- [ ] Track contracts the connected user owns, administers, or imports manually.
- [ ] Detect known Pasta contract types and standard FA2 contracts.
- [ ] Expose a control panel appropriate to each contract type.
- [ ] Use Spaghetti deployment records, connected wallet discovery, TzKT lookups, and manual contract import as sources.
- [ ] Keep package preparation out of Collander; that belongs to CH-EASE.

---

## Task 1: Lock The Naming Model

**Files to inspect first**

- [ ] `shared/creation-tools.ts`
- [ ] `server/routes.ts`
- [ ] `server/vite.ts`
- [ ] `public/creation-tools/`
- [ ] `tests/e2e/inventory/`
- [ ] `.agents/docs/live/user-interaction-inventory.md`

**Tests / checks to add or update**

- [ ] Add a naming fixture that asserts Macaroni app handles and routes remain Macaroni.
- [ ] Add a naming fixture that asserts CH-EASE is described as package/export preparation.
- [ ] Add a naming fixture that asserts Spaghetti is the standard FA2 collection deployment/minting app.
- [ ] Add a naming fixture that asserts Collander is the owned-contract control-panel app.

**Verification**

- [ ] Run targeted naming checks with `rg`.
- [ ] Run `npm run test:e2e:inventory:coverage`.

---

## Task 2: Add Pasta Package Target Registry

Create a shared target registry so CH-EASE can expose different package schemas without hard-coding product logic into the UI.

**Implementation sketch**

- [ ] Add `shared/pasta-package-targets.ts`.
- [ ] Define `PastaPackageTargetId = "macaroni" | "spaghetti"`.
- [ ] Define target metadata for display name, package kind, required files, metadata fields, config fields, and export adapter id.
- [ ] Use the registry from CH-EASE UI and API validation.

**Example shape**

```ts
export type PastaPackageTargetId = "macaroni" | "spaghetti";

export const PASTA_PACKAGE_TARGETS = {
  macaroni: {
    id: "macaroni",
    name: "Macaroni",
    packageKind: "macaroni-product-package",
  },
  spaghetti: {
    id: "spaghetti",
    name: "Spaghetti",
    packageKind: "standard-fa2-collection-package",
  },
} as const;
```

**Verification**

- [ ] Typecheck registry consumers.
- [ ] Confirm no target-specific UI forks duplicate schema definitions.

---

## Task 3: Refactor CH-EASE Package Storage And API

This task only renames package-preparation concepts that belong to CH-EASE. It must not rename the Macaroni app.

**Database**

- [ ] Add a migration such as `migrations/0105_chease_packages.sql`.
- [ ] Use CH-EASE-owned table names for package storage if current tables are actually generic package-prep tables.
- [ ] Preserve compatibility for existing Macaroni product records.
- [ ] Store target id, package manifest, uploaded file records, metadata JSON, target config JSON, export state, and audit fields.

**Server**

- [ ] Add or update `server/features/chease/`.
- [ ] Add `server/features/chease/target-adapters.ts`.
- [ ] Add `server/routes/chease.ts` or follow the existing route pattern.
- [ ] Expose `/api/ch-ease/packages`.
- [ ] Expose `/api/ch-ease/packages/:id/export/:targetId`.
- [ ] Expose handoff routes for opening a package in Macaroni or Spaghetti.

**Events**

- [ ] `chease.package_created`
- [ ] `chease.package_item_uploaded`
- [ ] `chease.package_preview_uploaded`
- [ ] `chease.package_metadata_updated`
- [ ] `chease.package_target_config_updated`
- [ ] `chease.package_finalized`
- [ ] `chease.package_export_downloaded`
- [ ] `chease.package_handoff_opened`

**Verification**

- [ ] Unit-test target validation.
- [ ] API-test package create/update/export for Macaroni and Spaghetti targets.
- [ ] Confirm Macaroni routes and current app behavior still pass existing tests.

---

## Task 4: Rework CH-EASE UI Around Target Package Export

**Behavior**

- [ ] Keep the app name CH-EASE.
- [ ] Present CH-EASE as a universal ownership/package preparation layer.
- [ ] Let the user select a target: Macaroni or Spaghetti.
- [ ] Dynamically render only the fields required by the selected target.
- [ ] Show package completeness and validation state.
- [ ] Let users export a package or hand it directly to the selected app.

**Macaroni target UI**

- [ ] Media upload.
- [ ] Preview upload when required by the current Macaroni schema.
- [ ] Metadata editor.
- [ ] Existing Macaroni product/drop configuration fields.
- [ ] Handoff action: load package in Macaroni.

**Spaghetti target UI**

- [ ] Collection metadata editor.
- [ ] Token media uploads.
- [ ] Token preview uploads.
- [ ] Token metadata editor.
- [ ] Minting defaults: recipient, amount, royalties/creators where applicable.
- [ ] Deployment defaults: network, admin wallet, collection options.
- [ ] Handoff action: load package in Spaghetti.

**Verification**

- [ ] Inventory route smoke for CH-EASE.
- [ ] Playwright test for selecting Macaroni and exporting a Macaroni package.
- [ ] Playwright test for selecting Spaghetti and exporting a Spaghetti package.

---

## Task 5: Build Spaghetti As The Standard FA2 Collection App

**Routes and static app**

- [ ] Add `public/creation-tools/spaghetti/`.
- [ ] Add `/tools/spaghetti` using the existing creation-tool route pattern.
- [ ] Add app registry entry for Spaghetti.
- [ ] Add Spaghetti desktop/start-menu metadata if wtfOS uses one for creation tools.

**Server and schema**

- [ ] Add `shared/schema-spaghetti.ts`.
- [ ] Add `server/features/spaghetti/`.
- [ ] Add `server/routes/spaghetti.ts`.
- [ ] Add migration `migrations/0106_spaghetti_collections.sql`.
- [ ] Persist imported package id, collection draft, deployment status, contract address, network, token drafts, token ids, mint records, and private dashboard publication state.

**Contract lifecycle**

- [ ] Compile or load the standard FA2 collection contract template.
- [ ] Keep Tezos mainnet and Shadownet RPC choices explicit.
- [ ] Support wallet-based deployment with clear network labeling.
- [ ] Store deployment operation hashes and originated contract addresses.
- [ ] Support token metadata upload/import.
- [ ] Support adding token definitions to the collection contract.
- [ ] Support minting tokens to selected recipients.

**Private dashboard output**

- [ ] Generate a user-only management dashboard/bundle for each deployed collection.
- [ ] Include contract address, network, admin wallet, token list, mint actions, and metadata actions.
- [ ] Avoid public drop-page language in Spaghetti copy.
- [ ] Register the deployed contract for Collander discovery.

**Verification**

- [ ] Unit-test package import validation.
- [ ] Integration-test draft creation from a CH-EASE Spaghetti export.
- [ ] Shadownet smoke test for deploy/add-token/mint when credentials and wallet test harness are available.

---

## Task 6: Build Collander As The Owned-Contract Control Panel

**Scope**

Collander is not a package builder. It is the place users go when they already have contracts and need the right management panel.

**Routes and app shell**

- [ ] Add Collander route, preferably `/collander` if it is a top-level wtfOS control app.
- [ ] Add `/api/collander/contracts`.
- [ ] Add app registry/desktop metadata for Collander.

**Schema**

- [ ] Add `shared/schema-collander.ts`.
- [ ] Add migration `migrations/0107_collander_contracts.sql`.
- [ ] Store network, chain id, contract address, contract type, source app, owner/admin wallet, permissions, last indexed level, last storage snapshot, and panel kind.

**Discovery sources**

- [ ] Connected wallet contracts.
- [ ] TzKT lookup for admin/owner relationships.
- [ ] Spaghetti deployment records.
- [ ] Existing Macaroni contract/product records where applicable.
- [ ] Manual import by contract address.

**Panel adapters**

- [ ] Macaroni blind-mint contract panel.
- [ ] Spaghetti standard FA2 collection panel.
- [ ] Generic FA2 read-only panel.
- [ ] Future Pasta contract adapters.

**Verification**

- [ ] Unit-test contract type detection.
- [ ] API-test manual import.
- [ ] Playwright-test connected wallet/manual contract list happy path with mocked indexer responses.

---

## Task 7: Update Inventory, E2E Registry, And Documentation

**Inventory**

- [ ] Update `.agents/docs/live/user-interaction-inventory.md`.
- [ ] Add or update entries for CH-EASE package export, Spaghetti FA2 collection management, and Collander owned-contract panels.
- [ ] Keep existing Macaroni inventory entries intact.

**E2E registry**

- [ ] Add route fixture for `/tools/ch-ease`.
- [ ] Add route fixture for `/tools/spaghetti`.
- [ ] Add route fixture for `/collander` or the chosen Collander route.
- [ ] Preserve existing `/tools/macaroni` and `/creation-tools/macaroni` fixtures.

**Canonical handles**

- [ ] `chease.pasta-package-export`
- [ ] `spaghetti.standard-fa2-collection-management`
- [ ] `collander.owned-contract-control-panels`
- [ ] Existing Macaroni handles unchanged.

**Verification**

- [ ] `npm run test:e2e:inventory:coverage`
- [ ] `npm run test:e2e:inventory`

---

## Task 8: Full Verification Pass

**Static checks**

- [ ] `rg -n -i "macaroni" shared server client public tests .agents docs`
- [ ] Confirm Macaroni references are intentional and still point to the existing app.
- [ ] `rg -n -i "spaghetti" shared server client public tests .agents docs`
- [ ] Confirm Spaghetti references point to the new FA2 deployment/minting app.
- [ ] `rg -n -i "collander" shared server client public tests .agents docs`
- [ ] Confirm Collander references point to owned-contract control panels.
- [ ] `rg -n -i "transfer workflow|control panel" public/creation-tools/ch-ease client server docs`
- [ ] Confirm CH-EASE is not described as the contract-control app.

**Build/test**

- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npm run test:e2e:inventory:coverage`
- [ ] `npm run test:e2e:inventory`
- [ ] Focused Playwright checks for CH-EASE, Spaghetti, Collander, and existing Macaroni routes.

**Tezos verification**

- [ ] Verify default Tezos RPCs follow `AGENTS.md`.
- [ ] Keep Shadownet labels explicit in code and UI.
- [ ] Do not use Etherlink relay endpoints as general RPC fallbacks.

---

## Implementation Order

1. Lock names and product boundaries in docs/tests.
2. Add the shared Pasta package target registry.
3. Refactor CH-EASE package storage/API around target exports.
4. Rework CH-EASE UI to render target-specific package inputs.
5. Build Spaghetti package import, draft, deploy, add-token, and mint flows.
6. Build Collander contract registry and panel adapter shell.
7. Wire inventory and E2E coverage.
8. Run full verification and update lessons/bug board only if implementation uncovers or fixes defects.

---

## Non-Goals

- [ ] Do not rename or rebrand Macaroni.
- [ ] Do not turn CH-EASE into a contract dashboard.
- [ ] Do not make Spaghetti a public drop-page builder.
- [ ] Do not put package authoring inside Collander.
- [ ] Do not mix Etherlink defaults into Tezos L1 contract flows.
