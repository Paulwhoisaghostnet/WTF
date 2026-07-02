# Pasta Protocol Specification

Generated from the current wtfOS Pasta Protocol source, plans, route fixtures, and shared helpers. This tree is intentionally documentation and validation-spec only. It satisfies the request to complete stories and tests before implementation coding.

## Contents

- `apps/`: app and supporting-service dossiers.
- `features/`: standalone feature specs with success, failure, and validation tests.
- `stories/individual/`: role-based stories for every app feature.
- `stories/crossapp/`: every directed pair plus meaningful chains.
- `stories/token-products/`: token lifecycle stories.
- `stories/contract-products/`: contract lifecycle stories.
- `stories/shadownet/`: Shadownet rehearsal stories.
- `stories/wtfme/`: hosted mint/collection/landing stories.
- `stories/wtfos/`: pinning and recovery stories.
- `stories/puppets/`: actor-backed puppet collection stories.
- `stories/end-to-end/`: 112 full ecosystem stories.
- `adversarial/`: break-the-story review matrix.
- `gaps/`: remaining implementation and environment gaps.
- `validation/`: coverage matrix.
- `tests/`: generated validation manifest, feature test catalog, cross-app catalog, deployment catalog, adversarial catalog, and requirements traceability.

## Binding Product Notes

- Macaroni remains Macaroni and is the proven base. Do not rename or rebrand it.
- Tortellini is intentionally not a product in the current owner-approved model. `CH-EASE -> Tortellini` is a blocked-flow story, not permission to create a Tortellini app.
- New Pasta apps use the AGENTS.md Tezos RPC defaults.
- Embedded wtfOS pinning/hosting is trusted-creator-only and must not appear in standalone downloads.
