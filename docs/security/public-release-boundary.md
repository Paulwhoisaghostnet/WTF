# Public release boundary

The Git repository is a public source and design artifact, not an operations evidence store.

Public material belongs under `docs/`, including architecture decisions, protocols, product design, public runbooks that contain no live topology or credentials, and the generated environment-variable inventory. Three `.agents` files remain public because they are executable engineering governance inputs: the bug-bounty board, append-only lessons, and interaction inventory.

Reviewed chain transparency evidence is published through the machine-readable
`publicReleaseEvidence` list. The current release set includes the
[wtfOS contract registry](../reference/wtfos-contract-registry.md) and the
[Marketplace V2 mainnet receipt](../reference/wtf-marketplace-v2-mainnet-release-20260724.md).

Everything else under `.agents/docs` is host-local evidence. Archived contract runs, deployment transcripts, security audit working papers, spreadsheets, inspection exports, production triage, and operator runbooks are ignored and removed from the current Git index. A document must be reviewed and copied into `docs/` before it can cross back into the public boundary.

## Secret-history scan

Before any history rewrite, the full repository history and current worktree were scanned with Gitleaks 8.30.1 using 100% redaction.

- Full history: 111 heuristic findings; 44 were in `.agents` operational/contract evidence.
- One high-confidence historic Twitter credential signature exists in the already-deleted `.env.public` history at commit `47323aeab6f8`. No credential value is reproduced here.
- The local worktree scan also identified ignored environment files containing credential-shaped values. They remain host-local and are not part of Git.
- No history rewrite was performed. The credential owner must first validate and rotate the historic credential, review false positives, and explicitly coordinate a force-push window before history can be rewritten safely.

The machine-readable classification is `config/public-release-boundary.json`; `npm run security:public-release-boundary` rejects tracked internal agent evidence, tracked environment files, private keys, and high-signal credential assignments.
