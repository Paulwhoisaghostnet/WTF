# Tezos Intelligence Source Map

Sources:

- `../Tezos analytics/Guidance`: SQLite/archive guidance data and prefill scripts.
- `../Tezos analytics/Tezos-Intel`: archive importer and worker references.
- `../Tezos analytics/Objkt-Advisor`: scoring methodology and creator scoring references.
- `../Tezos analytics/Tezos-Scout`: creator compare/read API reference.
- `../Tezos analytics/tezpulse`: market pulse UI reference.
- `../Tezos analytics/wallet-constellations`: wallet visualization reference, not promoted in this pass.
- `../Tezos analytics/web3 simulator`: simulation reference, not promoted in this pass.
- `../Tezos analytics/objkt-owned-editions-sorter`: standalone browser extension.

WTF targets:

- `scripts/import-intel-csv.ts`: retained as the importer CLI wrapper.
- `server/features/tezos-intel`: read-only creator scoring, compare, market pulse, and source descriptors.
- `client/src/features/tezos-intel`: panels and query hooks.
- `client/src/pages/TezosIntel.tsx`: thin route wrapper.
- `extensions/objkt-owned-editions-sorter`: independently packaged browser extension.

Runtime env:

- `TEZOS_INTEL_API_ENABLED=false` disables the new read-only API surface.

First verification commands:

- `npx tsx server/features/tezos-intel/scoring.test.ts`
- `npm run check`
