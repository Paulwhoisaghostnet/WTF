# Subplan — Ravioli (bundle publisher) — DONE (static studio, Phase 2)

Surface: static creation tool (`public/creation-tools/ravioli/`), forked from the Spaghetti kernel
(itself the proven Macaroni kernel).

## Status

DONE (Phase 2 static studio). Remaining: live Shadownet rehearsal of originate → create_bundle → mint →
redeem → reveal before mainnet.

Implemented:

- Shared bundle manifest builder `shared/pasta-protocol/bundle.ts` (`buildBundleManifest`,
  `normalizeBundleMember`, `BUNDLE_MANIFEST_SCHEMA_VERSION` = `wtfos.pasta.bundle-manifest.v1`),
  exported from the barrel, mirrored in the browser foundation port, and parity-tested + unit-tested.
- Contract `contracts/pasta-protocol/PastaBundleFA2.py` (SmartPy 0.24.x `assert` syntax, FA2 core forked
  from `PastaStandardCollectionFA2`) with a per-token `bundles` config (redeemable, mystery, item_count,
  contents_uri) and an honest on-chain `redeem` that burns the wrapper edition(s) from the holder and
  records the redemption durably (`redeemed` total + `redeemed_by` per holder). `set_bundle_contents`
  reveals/updates the off-chain contents manifest URI (mystery reveal). SmartPy scenario covers mint,
  redeem (balance/supply/counter mutation), over-redeem revert, non-redeemable revert, mystery reveal,
  and admin handoff.
- Compile via `node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaBundleFA2.py pasta-bundle ravioli`.
- Static studio reusing the copied kernel (`ravioli.wallet.session.v1`) + vendored Taquito/octez:
  composes members, builds + pins the contents manifest, deploys (or targets an administered contract),
  registers the bundle wrapper + config, mints editions, and provides redeem + mystery-reveal panels.
  Decision: **redeem mutates on-chain** (burn wrapper + record redemption); **contents delivery is
  off-chain** via the pinned manifest URI, withheld on-chain for mystery packs until `set_bundle_contents`.
- Registered assets in `tool-registry.ts` (verified by `npm run creation-tools:check`).

## Role

Publish bundle Token Products: art packs, redeemable bundles, mystery packs, wrapped sets — a single
token that represents/unlocks a set.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M5 media, M6 origination, M9 export.
Add: M14 bundle composition (select member tokens/media into a bundle definition), optional redeemable
flag, mystery (hidden contents until reveal/redeem).
Remove: M7 blind-mint reveal scheduling (redeem flow differs).

## Contract

`contracts/pasta-protocol/` SmartPy FA2 with bundle/redeem extension. Define what "redeem" mutates
on-chain vs off-chain in Phase 2.

## Handles

`ravioli.collection_deployed`, `ravioli.bundle_published`, `ravioli.redeemed`.

## Phase 2.
