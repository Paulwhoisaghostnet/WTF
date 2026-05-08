# WTF Integration Index

This folder tracks formerly external WTF-adjacent software as it moves into domain-owned modules.

## Active Integration Tracks

| Priority | Domain | Source | Target Owner | Runtime Shape | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Operator signer | `../building/wtf-operator-signer` | `extensions/wtf-operator-signer` + `server/features/operator-signer` | daemon + server client | integrated |
| 2 | WTF Tezos domains | `../wtf tez/hack-tez`, `../wtf tez/wtf.tez` | `server/features/wtf-subdomains`, `client/src/features/wtf-subdomains`, `contracts/wtf-subdomains`, `extensions/wtf-domain-bot` | server/client/contract/bot | integrated |
| 3 | Collekt | `../collekt-wtf` | `apps/collekt`, `server/features/collekt`, `client/src/features/collekt` | app + bridge APIs | integrated |
| 4 | IPFS creation tools | `../jack-industries-ipfs-bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`, `../particle-system-capture-ipfs-Qmf6ZkGLgzJBFiAG2iXueCo3utYWHDgVJ1brhyzrcBxmy5` | `public/creation-tools/*`, `client/src/features/creation-tools` | static creation tool asset bundles | integrated |
| 5 | Particle Painter references | `../PP-UI-update-reference`, `../Particle Painting/particle-studio` | `PP/src/features/*` | Vite creation tool module | integrated |
| 6 | Tezos intelligence | `../Tezos analytics/*` | `server/features/tezos-intel`, `client/src/features/tezos-intel`, `extensions/objkt-owned-editions-sorter` | server/client/extension | integrated |
| 7 | Discord community bot features | `../building/Discord Bots` | `extensions/wtf-gameshow-bot/src/features/*` | bot feature modules | integrated |
| 8 | UX lab leftovers | `../WTF-ux-interoperability-clone` | `client/src/features/ux-lab` | dev-only client harness | integrated |
| 9 | Bot deployment deltas | `../building/wtf-gameshow-bot` | `extensions/wtf-gameshow-bot/infrastructure` | workflow/scripts | integrated |

## Baseline

- Branch: `codex/modular-integration-pass`
- Baseline check: `npm run check` passed before this pass began.
