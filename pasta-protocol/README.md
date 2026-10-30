# Pasta Protocol — start here

Pasta Protocol is a suite of Tezos creator tools: prepare a collection, publish it through the appropriate tool, and export a portable collector website. **skllz: this is your review entrance; you do not need to understand the rest of wtfOS first.**

This directory is a review hub, not a second implementation or a standalone repository. The source remains in the linked directories below. The desktop suite runs independently of the wtfOS account/database/server; optional hosted integration is mapped separately.

## Current alpha boundary

The October 6 installer below is a historical review snapshot. The current integrated candidate includes later Macaroni V3.5 recovery and desktop fixes, and its Suite and standalone Macaroni setup enforce Shadownet. Use a package built from the reviewed candidate commit and its matching manifest for new alpha testing; do not treat the October 6 installer or its reused version number as proof of those fixes. [Known issues](KNOWN_ISSUES.md) record the funded installed-app path and remaining release boundaries. No Mainnet alpha or public production release is approved by this review hub.

## Historical review installer

Download the **Pasta Suite macOS universal DMG or ZIP** from the [2026-10-06 review prerelease](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/pasta-review-2026-10-06). One app contains Colander and all eight tools. No separate Macaroni install is needed.

- Application version: `1.0.1-alpha.1`; source tag: [`pasta-review-2026-10-06`](https://github.com/Paulwhoisaghostnet/WTF/tree/pasta-review-2026-10-06). Use the release manifest and SHA256SUMS to identify these exact files, not just the version number: older local builds reused that version.
- These are unsigned, unnotarized developer-review builds. Follow [installation and review instructions](REVIEW.md). Do not globally disable macOS security protections.
- This handoff provides macOS installers only. Windows/Linux build definitions exist, but their earlier `1.0.0` releases do **not** contain this V3.5 snapshot.
- Use **Shadownet and disposable test assets/wallets only** for this older installer. Its Mainnet option is exposed, so the instruction is not an enforced restriction. The current candidate has a Shadownet-only alpha guard.

## What each tool does

Typical flow: **Colander → CH-EASE → publisher → exported public page**.

| Tool | Purpose | Source |
| --- | --- | --- |
| Colander | Suite home, projects, contract registry, installed public pages | [Suite assets/launcher generator](../apps/pasta-suite-desktop/scripts/prepare-assets.mjs), [native shell](../apps/pasta-suite-desktop/src/) |
| CH-EASE | Prepare media, metadata, and package handoffs | [CH-EASE](../public/creation-tools/ch-ease/) |
| Macaroni | Blind-mint studio and collector page; V3.5 adds private staging and FIFO fulfillment | [Macaroni](../public/creation-tools/macaroni/), [V3.5 Companion](../companion/macaroni-v35/) |
| Spaghetti | Standard collections | [Spaghetti](../public/creation-tools/spaghetti/) |
| Gnocchi | Open editions | [Gnocchi](../public/creation-tools/gnocchi/) |
| Ravioli | Bundles and pack sales/redemption | [Ravioli](../public/creation-tools/ravioli/) |
| Rotini | Generative collections | [Rotini](../public/creation-tools/rotini/) |
| Penne | Distribution and claims | [Penne](../public/creation-tools/penne/) |
| Lasagna | Exhibitions | [Lasagna](../public/creation-tools/lasagna/) |

## Review in this order

1. Read [the walkthrough](REVIEW.md), then open the desktop suite and inspect the tool flow.
2. Read [the suite/domain overview](../docs/domains/pasta-protocol.md) and [architecture foundation](../docs/superpowers/plans/pasta-protocol/architecture-foundation.md). Historical planning documents describe intent, not proof of completion.
3. For Macaroni V3.5, read the [Companion README](../companion/macaroni-v35/README.md), [API](../companion/macaroni-v35/API.md), [desktop setup](../companion/macaroni-v35/DESKTOP_SETUP.md), and [backup/recovery](../companion/macaroni-v35/BACKUP_RECOVERY.md). The secure path deliberately stays locked until configured and its doctor passes.
4. Review [contracts](../contracts/pasta-protocol/) and the separate [Macaroni V3.5 contract](../contracts/wtf-collections/MacaroniBlindMintFA2V35.py). Start with [known issues](KNOWN_ISSUES.md), especially recovery, settlement evidence, and the wider suite's unverified proof records.
5. Follow the source/test map below. Record findings with tool, source revision, reproduction, expected/actual result, and evidence. Do not include keys, tokens, private CIDs, or private artwork in reports.

## Source and test map

| Review area | Entry point |
| --- | --- |
| All publisher UI, static exports, vendored browser libraries, compiled contract artifacts | [public/creation-tools](../public/creation-tools/) — use the tool links above; this parent also contains unrelated creation tools |
| All-in-one Electron app and installer definition | [apps/pasta-suite-desktop](../apps/pasta-suite-desktop/), [packaging guide](../docs/pasta-suite-desktop-packaging.md) |
| Optional single-tool desktop app | [apps/macaroni-desktop](../apps/macaroni-desktop/); siblings `ch-ease-desktop`, `spaghetti-desktop`, `gnocchi-desktop`, `ravioli-desktop`, `rotini-desktop`, `penne-desktop`, `lasagna-desktop` live under [apps](../apps/) |
| Macaroni private runtime and unit/adapter tests | [companion/macaroni-v35/src](../companion/macaroni-v35/src/), [test](../companion/macaroni-v35/test/) |
| SmartPy source and contract scenarios | [contracts/pasta-protocol](../contracts/pasta-protocol/), [contracts/wtf-collections](../contracts/wtf-collections/) |
| Protocol policies, proof/recovery tooling | [scripts/pasta-protocol](../scripts/pasta-protocol/), [scripts/macaroni](../scripts/macaroni/) |
| Packaged-app evidence harness | [artifact smoke](../scripts/pasta-desktop-artifact-smoke.mjs), [macOS installation smoke](../scripts/pasta-desktop-macos-artifact-smoke.sh) |
| Inventory/browser tests | [inventory tests](../tests/playwright/inventory/), [Macaroni native setup story](../tests/playwright/inventory/macaroni-native-companion-setup.spec.mjs), [static collector story](../tests/playwright/inventory/macaroni-v35-static-collector.spec.mjs), [Pasta live tests](../tests/playwright/live/) |
| Optional hosted wtfOS integration — skip on first pass | [Pasta client features and Colander](../client/src/features/pasta-protocol/), [Macaroni server](../server/features/macaroni/), [routes](../server/routes/macaroni.ts), [schema](../shared/schema-macaroni.ts), [migration](../drizzle/0126_macaroni_v35_infrastructure.sql) |
| Historical coverage and readiness | [coverage report](../PASTA_PROTOCOL_COVERAGE_REPORT.md), [September assessment](../PASTA_PROTOCOL_ALPHA_READINESS_2026-09-03.md), [canonical bounty records](../docs/reference/bug-bounty-records.json) — all are dated evidence, not a current audit signoff |

## Run from source without wtfOS

Use Node.js 22 and npm. From the repository root:

```sh
git clone --branch pasta-review-2026-10-06 https://github.com/Paulwhoisaghostnet/WTF.git
cd WTF
npm ci --prefix apps/pasta-suite-desktop
npm start --prefix apps/pasta-suite-desktop
```

The desktop dependency install prepares its own assets. It does not require the root application's database or environment. Companion tests can be run independently:

```sh
npm ci --prefix companion/macaroni-v35
npm test --prefix companion/macaroni-v35
node apps/macaroni-desktop/scripts/prepare-assets.mjs
node --test scripts/macaroni/v35-contract-policy.test.mjs
```

To run repository policy and inventory checks, first run root `npm ci`, then follow [the verification commands](REVIEW.md#verification).

## Snapshot boundary

This review branch preserves the Pasta/Macaroni work from the local `codex/macaroni-v35` checkout, based on `f4e26986b90172a65be54ad546987fb9bca819d7`, plus the review documentation and packaging hygiene here. It is **not current production `main`**, and does not include unrelated later wtfOS changes. Generated desktop Companion copies are ignored; the canonical source is `companion/macaroni-v35`.

The release manifest identifies the exact clean build commit, installer hashes, and installed ZIP/DMG smoke receipts. Tests and a clean build do not close the unresolved readiness findings. No production deployment or Mainnet approval is part of this handoff.
