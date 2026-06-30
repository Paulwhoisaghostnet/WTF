# Pasta Repo Cleanup Audit

Last audited: 2026-06-30
Auditor: Codex Pasta live-readiness continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is `origin/main` at `455641f05f011134841a48617fc4a6d87be982c1`.
- Live health reports `commitRef: "455641f"` and `nodeEnv: "production"`.
- Deploy to Hetzner run `28468017848` succeeded for commit `455641f`.
- Main Quality Gates run `28468017850` succeeded for commit `455641f`.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Live Pasta/Macaroni static wallet bundles for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna` passed stale-Taquito and Octez RPC marker probes.

## Cleanup Performed

- Ran `git fetch --all --prune`; no ref changes were needed.
- Ran `git worktree prune -v` after dry-run proof and removed seven dead worktree metadata records whose `/private/tmp` paths no longer existed.
- Left existing checked-out worktrees untouched, especially dirty ones, because they may contain user context.

## Worktree Classification

| Worktree | Branch/Head | Dirty Count | Classification | Action |
| --- | --- | ---: | --- | --- |
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / `455641f` | 0 | Valid current Pasta/live-readiness record | Keep until the broader goal is fully audited; it is the clean evidence branch. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 295 | Stale mixed scratch checkout | Do not deploy from it. It is behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | `pasta-protocol` / `f6256708` | 29 | Superseded Pasta prototype | Do not promote wholesale. See stale Pasta findings below. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-macaroni-fullsend` | `codex/macaroni-direct-upload-lane` / `6706df2` | 0 | Historical Macaroni branch now ancestor of `origin/main` | Candidate for archival after user confirms no local notes are needed. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-ipfs-fullsend` | `codex/ipfs-pinning-organ` / `d40ab44` | 0 | Historical IPFS branch now ancestor of `origin/main` | Out of current Pasta installer scope; candidate archival. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-maplab-fullsend` | `codex/maplab-demo-fullsend` / `83d5a57` | 6 | Non-Pasta dirty work | Leave for separate Map Lab pass. |
| `.config/superpowers/worktrees/WTF/wtf-tv-roger-radio` | `codex/wtf-tv-roger-radio` / `a7a430f` | 20 | Non-Pasta dirty work | Leave for separate TV pass. |
| Gamma/Beta worktrees | assorted | 0 | Explicitly out of scope | Ignore for this goal unless files contaminate main production release work. |

## Stale Pasta Findings

The old `WTF-pasta-deploy` checkout is not a valid ongoing release branch:

- Most untracked Pasta app surfaces already exist on `origin/main`: `client/src/features/pasta-protocol`, `client/src/pages/Colander.tsx`, `client/src/pages/MacaroniPackager.tsx`, `contracts/pasta-protocol`, `docs/domains/pasta-protocol.md`, all six new static Pasta tools, `scripts/pasta-protocol`, `server/features/macaroni/packages.ts`, `shared/pasta-protocol`, `shared/schema-macaroni.ts`, `tests/playwright/inventory/macaroni-packager.spec.mjs`, and `tests/unit`.
- `drizzle/0103_macaroni_packages.sql` is superseded by tracked `drizzle/0104_macaroni_packages.sql` on `origin/main`.
- `server/features/pasta-protocol` contains only `.gitkeep`, so it does not carry product behavior.
- Its dirty `server/routes/macaroni.ts` would remove live installer checksum exposure, advertise the old Windows `.msi` filename, and allow remote `http:` installer URLs again. Those are supply-chain regressions compared with current production.
- Its dirty inventory and route files also remove newer app routes and presentation entries; those differences are old checkout drift, not a clean Pasta change.

Conclusion: mine this checkout only for human notes if needed. Do not apply its patch to main.

## Remaining Product Gaps

- Pasta suite installer/download is not proven. The repo has `apps/macaroni-desktop` and the `macaroni-desktop-installers.yml` workflow for individual Macaroni Desktop installers, but no discovered workflow or verifier for a bundled Pasta suite installer.
- Full Pasta contract/product workflow proof remains broader than static bundle availability: Shadownet deploy, mint/collect, failure recovery, WTF.ME hosting, wtfOS pinning, and cross-app Colander management should remain open until executable evidence exists.
- Local `main` at the original workspace should be fast-forwarded, reset, or archived only after the user confirms whether its dirty scratch content should be preserved.

## Recommended Next Actions

1. Add an explicit Pasta suite packaging plan or workflow, or decide that "suite" means the web-hosted wtfOS Pasta tool suite rather than a native installer.
2. Build a narrow executable proof for one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page or artifact resolution.
3. After user confirmation, archive/delete merged historical Macaroni branches and clean checked-out worktrees that are ancestors of `origin/main`.
4. Keep `WTF-BB-332` open until the stale `WTF-pasta-deploy` checkout is archived/reset or explicitly retained with a warning note.
