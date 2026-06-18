# Subplan — CH-EASE (prep / packager)

Surface: React page (`client/src/features/pasta-protocol/chease/`). Existing `MacaroniPackager.tsx`
work informs it; CH-EASE generalizes from "Macaroni package" to "any Pasta app package".

## Role

App-format-aware prep tool. The user uploads media + metadata, picks a **target app**, and CH-EASE
outputs a correctly-shaped package:

- target = a collection app → **collection package** (cover + collection metadata + token items).
- target = a single-token mint (e.g. Macaroni product, Spaghetti single token) → **single-token
  package** (media + preview + ready TZIP-21 metadata).

## Out of scope

No pinning, no origination, no indexing. CH-EASE formats and exports only.

## Modules

Keep: M3 CSV/metadata import, M4 metadata builder, M5 media handling. Add: target-format validators,
package exporter (JSON + optional zipped media). Remove: wallet, deploy, IPFS-origination modules.

## Handles

`chease.package_exported`, `chease.target_selected`.

## Phases

Phase 1 builds CH-EASE alongside Spaghetti so there is a real producer/consumer pair end to end.

## Phase 1 — DONE (v1 package export)

`client/src/features/pasta-protocol/chease/build-package.ts` (pure, unit-tested in `build-package.test.ts`)
maps the existing CH-EASE package + items into the shared `wtfos.pasta.chease-package.v1` format via the
`@shared/pasta-protocol` builders: `tokenItemFromSource`, `collectionPackageFromSource`,
`singleTokenPackageFromSource` (CIDs → `ipfs://` URIs, relationship block carried through).

`MacaroniPackager.tsx` gained a Pasta export control: pick a target Pasta app (Spaghetti/Gnocchi/…) and
kind (collection / single token), then download the v1 JSON. Logs `chease.target_selected` and
`chease.package_exported`. This is the producer side of the CH-EASE → Spaghetti loop Spaghetti already
imports. Still client-only — no pinning/origination/indexing, per the out-of-scope rule.

REMAINING: optional zipped-media bundle export when artifacts are local rather than already pinned.
