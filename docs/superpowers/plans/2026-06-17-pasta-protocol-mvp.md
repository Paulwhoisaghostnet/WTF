# Pasta Protocol MVP — wtfOS Implementation Plan

> Status: **PLANNING ONLY** (no implementation yet, per owner).
> Structure: **skeleton-first, 5 phases** — Phase 0 scaffolds directories/domain/subdomains +
> registration stubs + per-section subplan docs; Phases 1–4 fill the skeleton in dependency order.
> Supersedes `docs/superpowers/plans/2026-06-17-tortellini-and-fa2-dashboard.md`.
> **Macaroni is NOT renamed.** The earlier "rename Macaroni → Tortellini" effort is cancelled.

**Goal:** Grow Macaroni into **Pasta Protocol** — a cohesive suite of specialized Tezos *publishing*
apps plus shared prep and management layers, all forked from the proven Macaroni wallet/deploy/export
engine with feature modules plugged in and removed per app.

## Owner Directives (binding constraints)

1. **Macaroni is the proven base and stays exactly as-is.** Do not rename, rebrand, or change it. Its
   wallet pairing, strict chain-id safety, origination/deploy, mint, IPFS pinning, CSV ingest, and
   export flows are tested and working. New apps **copy** its code as a starting point; they never
   modify Macaroni itself, and never regress these proven methods.
2. **Tooling, not an index.** Each app's core job is to **compile, configure, deploy, and export**.
   Apps do **not** track, manage, or index user contracts/tokens server-side unless the MVP explicitly
   says so. Default storage/pinning/hosting is **user-provided** (their own Pinata/IPFS node/host).
   See Owner Directive #3 for the trusted-creator exception.
3. **Two distribution modes per app:**
   - **wtfOS-embedded** (running inside wtfOS): **trusted creators** get special privileges —
     wtfOS-backed **storage, IPFS pinning, and hosting** — across *every* Pasta app.
   - **Downloaded / standalone** (the exported/installable build): ships **without** those wtfOS
     backend features. It is user-wallet + user-provided-pinning/storage/hosting only.
   Builds must feature-detect the wtfOS host and only surface trusted-creator backend options when
   embedded in wtfOS for an authorized trusted creator.
4. **Reuse prior art.** Harvest contracts and lessons from `tezos-franchise-factory` (on-chain
   franchise hierarchy + mint modes) and `Bowers` (open-edition + marketplace SmartPy designs), and
   the existing **Kiln** platform signer for trusted-creator origination.
5. **Architecture must not foreclose future franchise ownership.** Wallet → Franchise → Collection →
   Token Products. Design relationship metadata now; full hierarchy implementation can come later.

## App Roster (owner-confirmed naming)

| App | Role | Origin |
| --- | --- | --- |
| **Macaroni** | Blind-mint drop studio / blind-mint collection publisher | Existing, unchanged. Also the fork-base for all others. |
| **Spaghetti** | **Standard Collection Publisher + token-product publisher** — create a collection and populate it, or publish token products into **any compatible contract the user has mint permission to** (their own collection, the **HEN** shared contract, a wtfOS open collection contract) | New. Fork of Macaroni base, blind-mint removed; absorbs Rigatoni (collab/splits) + Orzo (badges/achievements/membership). |
| **CH-EASE** | **App-format-aware prep/packager** — converts uploaded media + metadata into correctly-formatted packages (collection or single-token) for the selected target app | Existing `MacaroniPackager.tsx`, extended. Stays named CH-EASE. |
| **Colander** | **Ownership / management / discovery control panel** — reads owned contracts, gives a per-contract control panel, understands every Pasta contract type, exposes the right transfer/admin/role workflows | New. Absorbs the spec's original "Spaghetti" (discovery/management/graph) + the ownership-layer idea. Deploys nothing. |
| **Gnocchi** | Open Edition publisher (timed / forever / supply-limited / bonding-curve; embedded or standalone) | New. Fork of base + bonding-curve module. |
| **Ravioli** | Bundle publisher (art packs / redeemable / mystery / wrapped) | New. Fork of base + bundle module. |
| **Rotini** | Generative publisher (traits / layers / generative outputs) | New. Fork of base + generative module. |
| **Penne** | Distribution contract publisher (airdrops / claims / participation rewards) | New. Contract product. |
| **Lasagna** | On-chain curation / exhibition publisher (multi-curator, version history) | New. Contract product. |

> **Tortellini is not a product** under this structure. Macaroni is the blind-mint collection
> publisher; there is no separate Tortellini app.

## Core Architecture: Contract Products vs Token Products

- **Contract Product** = creates a new Tezos contract (Collection, Blind-Mint Collection, Distribution,
  Exhibition, future Franchise/Brand). May contain Token Products.
- **Token Product** = a token definition inside a collection (1/1, editions, OE, bonding-curve OE,
  membership, badge, reward, bundle). Never contains Contract Products. Portable across collections.
- **Ownership relationship metadata** (designed now, populated incrementally) lives in contract/token
  metadata JSON: `parent_contract`, `franchise_contract`, `related_contracts`, `collection_group`,
  `publisher_contract`, `ownership_chain`. No franchise enforcement required for MVP, but no schema may
  block it.

## Spaghetti (standard collection + token-product publishing)

Spaghetti embodies the spec rule "Token Products can exist within many different Contract Products." It
publishes token products into whatever compatible contract the creator is allowed to mint to.

- **Create-and-populate:** originate a new standard collection contract, then add token products to it.
- **Publish-into-existing:** mint token products into an existing contract **without** deploying a new
  one — e.g. the **HEN** shared minting contract, or a **wtfOS open collection contract**.
- **Mint-target selection at publish time:** the user chooses the destination contract from a list of
  **contracts they have mint permission to**. Spaghetti must resolve eligibility per target:
  - own collection: user is admin/minter,
  - shared open contract (HEN-style): open mint allowed to anyone,
  - wtfOS open collection: permission granted by wtfOS policy / trusted-creator status.
- The selected target's FA2 mint ABI determines the exact mint call (per the Bowers lesson: align the
  mint entrypoint to the actual contract, never assume a single ABI).
- Standalone/downloaded builds keep create-and-populate + publish-into-public-contracts; wtfOS-only
  open collections appear only when embedded in wtfOS.

## CH-EASE (corrected role)

CH-EASE is the suite's **universal intake/packager**, not an ownership tool. It understands what each
Pasta app expects as input and exports a package shaped for the selected app/product.

- Today: user uploads artifacts and defines metadata **one item at a time**, stored as a **collection
  package** for Macaroni (`MacaroniPackager.tsx`, `macaroni_packages` / `macaroni_package_items`). This
  continues unchanged for Macaroni.
- New: **target-app awareness.** When the user picks a target app, CH-EASE formats the export to that
  app's exact requirements.
- **Collection package** (for originating a new collection contract): includes the **collection cover
  image**, **collection-level metadata** (name, description, symbol, royalties, links, etc.), and the
  per-token items — i.e. **everything needed to mint a new collection contract**, not just token files.
- **Single-token package** (for publishing one token into an app/contract): media file, preview file,
  and the token metadata set, ready to plug straight into the selected product/contract.
- CH-EASE does not deploy or mint. It compiles + configures + exports packages that the publishing apps
  consume.

## Colander (ownership / management / discovery)

One front-end, many contract-type-aware adapters. It reads the user's owned contracts and renders the
correct authority/transfer workflow per contract type — never assuming uniform ownership:

| Contract type | Authority roles exposed |
| --- | --- |
| Macaroni / Spaghetti collection | owner/admin, admins, collaborators, royalty recipients |
| Gnocchi open edition | publisher, revenue recipient |
| Lasagna exhibition | curators, archive managers |
| Penne distribution | distribution manager |
| Franchise node (future) | node admin, parent, root, child links |

Requirement (from spec): every Pasta-published contract must expose a Colander adapter, so each
publisher ships the adapter for the contract it deploys. Colander reads live on-chain state and builds
the exact entrypoint call (`set_admin` / `add_curator` / `transfer_curator` / …); the user signs with
their own wallet. It will eventually visualize Wallet → Franchise → Collection → Token Products.

## The Proven Macaroni Module Set (fork source of truth)

From `public/creation-tools/macaroni/` (copied, never modified in place):

| Module | File(s) | Role | Shared / app-specific |
| --- | --- | --- | --- |
| M1 Network + Wallet kernel | `js/common.js`, `js/octez-wallet.js`, `vendor/*` | Octez-primary→Beacon, strict `assertOperationSafety` chain-id guard, session restore | **Shared, never diverge** |
| M2 IPFS pinning/storage/hosting providers | `js/common.js` (`pinBlob`: wtfos/pinata/node) | User brings own by default; the `wtfos` provider (storage+pinning+hosting) is enabled only when embedded in wtfOS for a trusted creator, and is stripped from downloaded builds | **Shared** |
| M3 CSV ingest + media match | `js/common.js`, `js/studio.js` | Batch token intake | Shared (batch publishers + CH-EASE) |
| M4 Token metadata builder | `js/studio.js` (`buildTokenMetadata`, TZIP-21) | Token JSON | **Shared** |
| M5 Contract artifact loader + originate | `js/studio.js`, `contract/*.json` | **Proven deploy method — do not regress** | **Shared** |
| M6 Studio config UI | `js/studio.js`, `studio.html`, `css/theme.css` | Theme/fonts/royalty config | Shared, configurable |
| M7 Blind-mint reveal | `js/studio.js` (instant/delayed, placeholder pool, random assign) | Blind distribution | **Macaroni only** |
| M8 Minter royalties | `js/studio.js` (`first_minter`/`rolling_pool`) | Optional | Optional |
| M9 Creator/collaborator splits | `js/studio.js` royalty shares | Absorbs **Rigatoni** | Spaghetti + others |
| M10 Public drop/mint page | `js/drop.js`, `drop.html` | Collector sale UI | Sale-publishing apps only |
| M11 Export / site bundle | `js/site-bundle.js` | Static export | **Shared** |
| M12 Editions (fixed/open supply) | `js/studio.js`, `contract/macaroni-v2` | Token-product supply modes | Token publishers |

Net-new modules:

| Module | Source of design | App |
| --- | --- | --- |
| M13 Bonding-curve pricing (±increment, base/min/max) | `tezos-franchise-factory` `mint_editions` step pricing | Gnocchi (optional Macaroni) |
| M14 Bundle composition (packs/redeemable/mystery/wrapped) | net-new | Ravioli |
| M15 Generative trait/layer engine | net-new (client-side compose) | Rotini |
| M16 Distribution / airdrop / claim campaigns | net-new (claim contract) | Penne |
| M17 On-chain exhibition / curation | net-new (curator contract) | Lasagna |
| M18 Ownership/transfer adapters (per contract type) | reads each contract's admin/role storage | Colander |
| M19 Discovery / classification / relationship graph | TzKT reads only | Colander |
| M20 Badges / achievements / membership tokens | net-new token kinds (absorbs **Orzo**) | Spaghetti |
| M21 App-format-aware export + single-token prep | net-new on existing CH-EASE | CH-EASE |

## Per-App Module Matrix

| App | Product type | Keeps | Adds | Removes vs base |
| --- | --- | --- | --- | --- |
| **Macaroni** | Contract (blind mint) | everything (unchanged) | — | — |
| **Spaghetti** | Contract + token publisher | M1–M6, M9, M11, M12 | M20 badges/achievements/membership, token-product registration, relationship metadata, **mint-target selection** (own / HEN shared / wtfOS open collection) + per-target permission resolution + per-target mint ABI | M7 blind mint |
| **Gnocchi** | Token publisher (OE) | M1–M6, M10, M11 | M13 bonding curve, OE modes; embedded + standalone | M7; CSV-batch optional |
| **Ravioli** | Token publisher (bundles) | M1–M6, M11 | M14 bundle composition; embedded + standalone | M7, M10 |
| **Rotini** | Token publisher (generative) | M1–M6, M11 | M15 trait/layer engine; output to Macaroni/Spaghetti/standalone | M7 |
| **Penne** | Contract (distribution) | M1–M5 | M16 airdrop/claims | M7, M10 sale |
| **Lasagna** | Contract (curation) | M1–M5 | M17 exhibitions, multi-curator, version history | M7, M10, mint |
| **CH-EASE** | Prep/packager | M2, M3, M4, M11 | M21 app-format-aware export + single-token prep | deploys nothing |
| **Colander** | Ownership/management/discovery | M1 wallet, TzKT reads | M18 adapters + M19 graph | all publishing |

## Prior-Art Reuse Map

- **`tezos-franchise-factory/contracts/franchise_factory.py`** — clone/sterile FA2 nodes + deployer
  (`CREATE_CONTRACT` recursion workaround) + 4 mint modes (open edition, allowlist, bonding curve,
  blind mint) + `parent`/`root`/`generation`/`label` lineage. Backbone for the franchise future,
  Gnocchi bonding curve, and contract-product relationships. Gotchas: child artifact budget < ~180 KB,
  deployer < ~800 KB, no global constants inside `CREATE_CONTRACT`, embed child code.
- **`Bowers` SmartPy** (`attached_assets/BowersOpenEditionFA2_v5_*.py`, `BowersFA2_partial_fill_offer_*.py`)
  — open-edition + secondary-market designs. Reuse designs after SmartPy compile + tests.
  **Lessons (do NOT repeat): never fake KT1 deploy or DB-only mint on failure; align mint ABI per
  contract style; verify chain state before persisting; no Ghostnet hardcode — use explicit network/RPC.**
- **Kiln** (`server/lib/kiln-client.ts`) — platform signer/origination for trusted-creator backend
  flows only. User-wallet flows remain the default per Owner Directive #2.

## RPC Policy

- **Macaroni (unchanged):** keep the working `rpc.tzkt.io/mainnet` and `rpc.shadownet.teztnets.com`.
- **New apps (Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna, Colander):** follow `AGENTS.md`
  doctrine — Tezos Mainnet `https://tezos-mainnet.octez.io/` (fallback `https://tcinfra.net/rpc/tezos/mainnet`),
  Tezos Shadownet `https://tezos-shadownet.octez.io/` (fallback `https://tcinfra.net/rpc/tezos/shadownet`).
  Forks start from Macaroni's `common.js` but swap the `NETWORKS` RPCs to the doctrine endpoints.

## Open Decisions (need owner confirmation)

- **D1 — Tortellini: RESOLVED (owner).** Not a product under this structure. Macaroni is the blind-mint
  collection publisher; no separate Tortellini app.
- **D2 — Colander name: RESOLVED (owner).** The ownership/management/discovery layer is named **Colander**.
- **D3 — Trusted-creator backend scope: RESOLVED (owner).** wtfOS trusted-creator storage, pinning,
  and hosting privileges persist across **all** Pasta apps when used **inside wtfOS**. Downloaded /
  standalone app builds ship **without** those wtfOS backend features (user-provided everything).

## Phased Execution Roadmap (5 phases; PLANNING ONLY)

Build **skeleton-first**. Phase 0 scaffolds every directory, the Pasta Protocol domain + subdomains,
buildable registration stubs across all WTF surfaces, and one subplan document per section. Phases 1–4
fill the skeleton in dependency order. Each phase keeps the build green and Macaroni untouched.

### App placement in WTF (target shape)

| App | wtfOS surface | Directory |
| --- | --- | --- |
| Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna | static creation tool (iframe, fork of Macaroni) | `public/creation-tools/<id>/` |
| CH-EASE | React page (exists: `MacaroniPackager.tsx`) | `client/src/pages/` + `client/src/features/pasta-protocol/chease/` |
| Colander | React page (reads contracts, control panels) | `client/src/pages/Colander.tsx` + `client/src/features/pasta-protocol/colander/` |

### Phase 0 — Skeleton (directories, domain/subdomains, registration stubs, subplan docs)

**New domain:** add `pastaProtocol: { label: "Pasta Protocol", guide: "docs/domains/pasta-protocol.md" }`
to `domainGuides` in `shared/wtf-app-packages.ts`; create `docs/domains/pasta-protocol.md`; add
`"pasta-protocol"` to `CreationToolDomain` in `client/src/features/creation-tools/tool-registry.ts`.

**Subdomains (one per app):** CH-EASE, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna, Colander —
under the "Pasta Protocol" domain in `.agents/docs/live/user-interaction-inventory.md` and
`tests/e2e/inventory/*`.

**Directories to create:**

| Path | Purpose |
| --- | --- |
| `public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/` (each: `index.html`, `studio.html` where relevant, `js/`, `css/`, `contract/`, `vendor/` mirroring Macaroni) | static publisher tools |
| `client/src/features/pasta-protocol/` (`chease/`, `colander/`, `shared/`) | React glue: mint-target selection, package-format types, wtfOS-embed detection |
| `client/src/pages/Colander.tsx` | Colander React page |
| `server/features/pasta-protocol/` | shared trusted-creator backend helpers (embedded-only) |
| `contracts/pasta-protocol/` | new SmartPy (bonding curve, distribution, curation), reusing franchise-factory designs |
| `scripts/pasta-protocol/` | contract compile scripts |
| `shared/pasta-protocol/` | Contract Product / Token Product / relationship-metadata + CH-EASE package-format types |
| `docs/superpowers/plans/pasta-protocol/` | per-section subplan documents |

**Registration stubs (per app — buildable placeholders that pass coverage):** tool-registry entry
(publishers), `client/src/routes/page-defs.ts` route, `shared/wtf-browser-routes.ts`, start-menu model +
`start-menu-app-gates.ts`, `client/src/features/admin-os/admin-surface-registry.ts`,
`shared/wtf-app-packages.ts` acceptance entry, inventory rows, `tests/e2e/inventory/*` fixtures,
`tests/playwright/inventory/<app>.spec.mjs` route smoke.

**Subplan documents to author (one per section):**
`architecture-foundation.md` (Contract/Token Product + relationship metadata), `package-format.md`
(CH-EASE collection + single-token export schema — the contract every app consumes),
`distribution-modes.md` (wtfOS-embedded vs downloaded feature-gating), then one each:
`chease.md`, `spaghetti.md`, `gnocchi.md`, `ravioli.md`, `rotini.md`, `penne.md`, `lasagna.md`,
`colander.md`.

**Phase 0 gate:** `npm run check`, `npm run build`, and `npm run test:e2e:inventory:coverage` pass with
every Pasta app present as a registered stub surface and every subplan doc written. Macaroni untouched.

### Phase 1 — CH-EASE + Spaghetti + architecture foundation
Implement the shared foundation in `shared/pasta-protocol/` (Contract Product / Token Product /
relationship-metadata + CH-EASE package format). Extend CH-EASE to be target-app-aware (collection
package: cover image + collection metadata + everything to originate a new contract; single-token
package: media + preview + metadata) while keeping the current Macaroni collection flow unchanged. Build
Spaghetti by copying `public/creation-tools/macaroni/` → `spaghetti/`, removing M7 blind-mint, adding
M9 collaborator splits, M20 badges/achievements/membership, token-product registration, relationship
metadata, and **mint-target selection** (new collection / HEN shared contract / wtfOS open collection)
with per-target permission + per-target mint ABI. Swap RPCs to doctrine endpoints. Fill inventory + E2E.

### Phase 2 — Token-product publishers
Gnocchi (bonding-curve OE; embedded into an existing collection or standalone), Ravioli (bundles),
Rotini (generative). Author/compile required SmartPy (bonding curve from franchise-factory) with
Shadownet tests. Embedded mode reuses M5 against an existing KT1; standalone deploys a fresh contract.

### Phase 3 — Contract-product publishers
Penne (distribution/airdrop/claims contract) and Lasagna (on-chain exhibition/curation contract,
multi-curator, version history, curator transfer). Author/compile SmartPy with Shadownet tests.

### Phase 4 — Colander (ownership / management / discovery)
Per-contract-type ownership/transfer adapters (never assume uniform ownership) + discovery and the
relationship graph (read-only; visualizes Wallet → Franchise → Collection → Token Products). Consumes
the adapters each publisher shipped in Phases 1–3.

## Mandatory per-change obligations (every phase)
Update `.agents/docs/live/user-interaction-inventory.md`, the relevant `tests/e2e/inventory/` fixture,
run `npm run test:e2e:inventory:coverage`, and add domain-owned behavior assertions for any
state-changing interaction (not just route smoke). Read `LESSONS_LEARNED.md` + `BUG_BOUNTY_BOARD.md`
before each phase; append lessons after debugging. **Never modify the Macaroni app itself.**
