# Commission execution baseline

Captured: 2026-08-29 America/Los_Angeles  
Execution branch: `codex/commission-fulfillment`  
Source baseline: `70b7cc46cc82`  
Production readiness observed: `be912715`, database/chain/jobs ready

## Production facts

- `GET https://wtfos.app/api/health/ready` returned ready with database, chain, and jobs healthy.
- `GET https://wtfos.app/api/apps/desktop` returned commissioned Arcade, Casino, Game Studio, Studio, IPFS Pinning, and Pasta Protocol disabled.
- The same app response returned stale documentation registrations for most catalog apps.
- `GET https://wtfos.app/api/faq` returned an empty list.
- `GET https://wtfos.app/api/arcade/stats` returned 8 published games, 144 plays, 29 players, 15 scores, 0 creator games, and 0 Game Studio games.

## Retained worktree groups

The pre-existing dirty tree was moved intact from `main` to the execution branch before new commission edits.

1. `WTF-BB-617`: PixAlerce export bridge and destination-aware Mint Manager, including owned Media entry points and indexed receipt verification.
2. `WTF-BB-618`: Macaroni hosted-publishing denial and recovery guidance.
3. `WTF-BB-619`: App Gates schema-error presentation and retry behavior.
4. `WTF-BB-620`: strict Admin route authorization and unique surface ownership.
5. `WTF-BB-621`: Contact Admin desktop launcher handoff.
6. Complete rebuilt PixAlerce asset graph and provenance. Content-hashed modules are retained as one build and must not be mixed with older chunks.
7. Existing inventory, live-puppet, lesson, bounty, and environment-documentation updates that prove the five corrections.

## Bound product decisions

- **D-001:** September Casino acceptance is a creator-submittable, explicitly non-wagered practice sandbox. Value-bearing wagering remains fail-closed under `WTF-BB-138`.
- **D-002:** Store drafts/submissions require existing `trusted_market_creator` permission; operators approve publication. Other users receive a visible access-request path.
- **D-003:** WTFIAM, Arcade, Calendar, Inbox, Contact Admin, and the entry-level creation/mint runway are commissioned core access paths. Casino may retain an explained membership gate. Specialist tools may retain role gates only with recovery guidance.
- **D-004:** The five verified dirty-tree groups above are the retained baseline on `codex/commission-fulfillment`; they will be committed before new feature work.

## Test-harness discrepancy

`package.json` declares `test:e2e:live:phases`, but the audited worktree does not contain most referenced `tests/playwright/live/phase*.spec.mjs` files. The working live directory currently contains only Gamma board, Macaroni Shadownet, Marketplace Shadownet, and puppet orchestration specs. The phased command cannot be cited as commission evidence until its references are restored or corrected.

**Resolved in the candidate:** the historical phased command now delegates to the maintained directory-discovered `test:e2e:live:puppets` lane, and a policy test prevents the dead file list from returning.
