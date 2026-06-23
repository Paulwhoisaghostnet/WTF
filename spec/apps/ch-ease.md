# CH-EASE

## Classification

- App ID: `ch-ease`
- Surface: `/tools/ch-ease`
- Aliases: `/tools/macaroni-packager`
- Product type: Prep/packager
- Current status: Existing React packager extended for Pasta handoff

## Purpose

Creator Handoff: Edit, Arrange, Stage, Export. Converts uploaded assets and metadata into target-app-aware Pasta packages.

## Inputs

- uploaded media files with arbitrary names
- metadata edits and attributes JSON
- collection title, symbol, cover, and drop config
- target app choice
- existing package source rows

## Outputs

- wtfos.pasta.chease-package.v1 collection packages
- single-token packages
- platform CSV/manifest archives
- sessionStorage handoff payloads for publisher apps
- audit/system events

## Dependencies

- server/features/macaroni package APIs
- shared/pasta-protocol package builders
- wtfOS object storage and IPFS pinning path
- creation-tool routes for publisher handoff

## Produced Assets

- normalized media filenames
- token metadata rows
- collection and single-token package JSON
- target-specific CSVs
- handoff event records

## Consumed Assets

- creator uploads
- metadata edits
- existing Macaroni package records
- target app schema

## Feature Inventory

- [Package creation and source load](../features/ch-ease/package-creation-and-source-load.md)
- [Media upload and normalization](../features/ch-ease/media-upload-and-normalization.md)
- [Metadata and attributes editing](../features/ch-ease/metadata-and-attributes-editing.md)
- [Target app selection](../features/ch-ease/target-app-selection.md)
- [Collection package export](../features/ch-ease/collection-package-export.md)
- [Single-token package export](../features/ch-ease/single-token-package-export.md)
- [Platform CSV and manifest download](../features/ch-ease/platform-csv-and-manifest-download.md)
- [Publisher handoff via sessionStorage](../features/ch-ease/publisher-handoff-via-sessionstorage.md)
- [IPFS/object-storage pinning of package assets](../features/ch-ease/ipfs-object-storage-pinning-of-package-assets.md)
- [Package validation and audit events](../features/ch-ease/package-validation-and-audit-events.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
