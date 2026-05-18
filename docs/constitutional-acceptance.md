# Constitutional Acceptance Register

## Status

`P6.CA1/08` completed the first Phase 6 acceptance slice: private board hygiene plus a public doctrine map. It does not publish private exploit details.

`P6.CA2/08` adds the admin mutation audit rule. Successful `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api/admin` now create normalized `admin_mutation` system events with actor, method, path, status, route/body metadata, and this phase rule id. Failed or rejected requests are not recorded as completed admin actions.

`P6.CA3/08` adds the reward and inventory traceability rule. In-app market inventory grants from EXP checkout and verified WTF chain purchases now stamp owner, source, source id, domain, state, visibility, currency, purchase id, payment intent, and chain evidence where present. EXP deductions also record their payment-intent cause in `xp_events` metadata.

`P6.CA4/08` adds the app/package/plugin acceptance rule. Desktop apps, creation tools, console stock cartridges, project bundle manifests, and integration plugins now require recorded provenance, permission summary, rollback method, and non-destructive uninstall/disable coverage. Blocked integrations stay explicitly blocked until the correct live repo contains concrete host/tooling proof; locally proven integrations may move to disabled-by-default without claiming production readiness. No stale wrong-repo package or mock-only provider is accepted as production readiness evidence.

`P6.CA5/08` audits the active `Fixed`/`Verified` boundary. Verified rows without completed verification evidence are kept in active triage as `Fixed`, and only rows with convincing recorded verification are moved to the private completed archive. The public register records aggregate posture only and does not publish private exploit details.

`P6.CA6/08` audits blocked tooling rows. Blocked rows stay blocked unless the required external proof exists, and each blocked row must name the exact missing artifact or host action needed for clearance. Local executable proof may clear a local-only adapter claim while keeping production access disabled by default. Local policy tests, mock providers, and stale reference repos do not clear production/host-tooling requirements by themselves.

`P6.CA7/08` completes the phase-level verification gates for this acceptance pass: focused policy tests, admin/app package acceptance tests, `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, `npm audit --omit=dev --audit-level=high`, GitHub Quality Gates, SmartPy contract checks, and Hetzner deploy checks.

`P6.CA8/08` closes Phase 6 with production health evidence. Live `https://wtfgameshow.app/api/health` reported commit `676a6b7`, DB ok, chain ok on mainnet, `tzktBase` `https://api.tzkt.io/v1`, `tezosRpcUrl` `https://rpc.tzkt.io/mainnet`, jobs ok, and zero recent job errors after deploy.

## Law Test Plan

The Law does not define a Phase 7. After Phase 6 closeout, the next canonical chapter is the explicit Test Plan. These IDs are the tracking surface for that chapter:

| ID | Acceptance surface | Current proof |
| --- | --- | --- |
| `LAW.TP1/07` | Landing and public entry. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: public landing, login, and registration entry points passed. |
| `LAW.TP2/07` | Auth/session boundary. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: anonymous `/api/auth/user` rejection and authenticated Mission Control access passed. |
| `LAW.TP3/07` | Mission Control. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: location, active wallet, system health, next action, failures, changes, rewards, and wallet preflight visibility passed. |
| `LAW.TP4/07` | TV playback/error path. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: TV shell and no-signal/offline recovery message passed. |
| `LAW.TP5/07` | Marketplace/wallet preflight. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: market create remains wallet-gated before value writes. |
| `LAW.TP6/07` | Media ownership. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: owned gallery and public gallery surfaces remain separated. |
| `LAW.TP7/07` | Admin observability. | Verified 2026-05-17 with `npx playwright test tests/playwright/law-test-plan.spec.mjs`: strict-admin visibility and host-role exclusion for admin surfaces passed. |

## Law Targeted Test Plan

The targeted test chapter follows the Playwright smoke chapter without adding new product scope:

| ID | Targeted contract | Current proof |
| --- | --- | --- |
| `LAW.TT1/10` | Migration fail-closed behavior. | Verified 2026-05-17 with `npx tsx --test scripts/production-migrations-policy.test.mjs scripts/deploy-dry-run-policy.test.mjs`: production migrations require `ON_ERROR_STOP`, refuse fresh-DB implicit bootstrap, write the migration ledger only after SQL applies, and restart app/caddy only after migrations pass. |
| `LAW.TT2/10` | TzKT retry/cache. | Verified 2026-05-17 with `npx tsx --test server/lib/upstream.test.ts server/tzkt-policy.test.ts server/tzkt-kernel-policy.test.ts server/tzkt-persistent-cache-policy.test.ts server/tzkt-cursor-pagination.test.ts server/lib/tzkt-response-cache.test.ts docs/runbooks-policy.test.ts`: upstream retry budget, cursor pagination, shared helper use, persistent cache bounds, Operator-wallet reconciliation fail-closed behavior, and ECAD/RPC drift guardrails all passed. |
| `LAW.TT3/10` | Wallet preflight. | Verified 2026-05-17 with `npx tsx --test client/src/lib/tezos/wallet-value-preflight-policy.test.ts client/src/lib/tezos/external-marketplaces-preflight-policy.test.ts server/wallet-preflight-policy.test.ts server/lib/in-app-market-policy.test.ts server/features/casino/audit.test.ts server/routes/collection-factory-policy.test.ts`: linked-wallet rejection, expected signer threading, checkout wallet reconnect, owner mismatch rejection, and unbound send preflights all passed before user-value signing paths. |
| `LAW.TT4/10` | Reward idempotency. | Verified 2026-05-17 with `npx tsx --test server/reward-inventory-idempotency-policy.test.ts`: retry/replay-safe challenge automation inventory grants, challenge automation reward-ledger completion IDs, manual challenge reward source checks, side-quest reward source checks, and CRP nomination reward counters all passed before ledger writes. |
| `LAW.TT5/10` | Inventory ownership. | Verified 2026-05-17 with `npx tsx --test server/lib/in-app-inventory-trace.test.ts server/features/w/w-media-ownership-policy.test.ts`: owner/source metadata, private-media access boundaries, non-market inventory grants, starter-food/challenge-automation trace fields, user-inventory visibility, and the `P6.CA3/08` trace rule all passed. |
| `LAW.TT6/10` | Media access control. | Verified 2026-05-17 with `npx tsx --test server/routes/media-library-access-policy.test.ts server/lib/tv-policy.test.ts server/features/tv/playlist-atomicity-policy.test.ts server/lib/studio/serve-mime.test.ts server/lib/studio/preview/jobs.test.ts`: owner/staff checks, dedicated media limits, channel-scoped TV media routes, safe Studio MIME handling, and personal TV bumper media access all passed. |
| `LAW.TT7/10` | TV concurrency. | Verified 2026-05-17 with `npx tsx --test server/features/tv/playlist-atomicity-policy.test.ts server/features/tv/channel-video-atomicity-policy.test.ts server/features/tv/creator-workflow-policy.test.ts server/lib/tv-policy.test.ts`: active-playlist uniqueness, transactional creation, replacement locks, channel-scoped selector use, idempotent channel-video attachment, and schedule overlap checks all passed. |
| `LAW.TT8/10` | Repo-doctor advisory lock. | Verified 2026-05-17 with `npx tsx --test server/repo-doctor-heartbeat-policy.test.ts server/lib/tv-boot-backfill-lock-policy.test.ts`: host-level timer/service, advisory lock, dry-run, kill switch, audit-only writes, optional host env loading, installer timer visibility, and single-writer boot backfill all passed. |
| `LAW.TT9/10` | Backup command safety. | Verified 2026-05-17 with `npx tsx --test server/lib/backup/restore-drill.test.ts server/lib/supabase-backup.test.ts server/lib/backup/restore-proof.test.ts`: `pg_dump`/`pg_restore` argv isolation, separate restore target enforcement, restore-drill proof writing, and numeric argv boundaries for shell backup retention all passed. |
| `LAW.TT10/10` | Restore proof. | Verified 2026-05-17 with `npx tsx --test server/lib/backup/restore-proof.test.ts server/lib/backup/restore-drill.test.ts`: backup safety claims fail closed without restore drill proof, matching row counts, and checked media manifest proof; stored cursor proof is normalized and re-derived before Backup Manager can expose `canClaimSafety`. |

## Law Abuse Test Plan

The abuse chapter follows the explicit Law requirement for rate-limit and cache keyspace bounds without adding new product features:

| ID | Abuse boundary | Current proof |
| --- | --- | --- |
| `LAW.AB1/05` | Board webhook keyspace. | Verified 2026-05-17 with `npx tsx --test server/lib/board-webhook-rate-limit.test.ts server/lib/in-memory-rate-limit.test.ts`: incoming board webhooks use token/IP-scoped bounded keys, keep per-token request ceilings, sweep stale keys, and cap tracked key cardinality under churn. |
| `LAW.AB2/05` | Client diagnostics. | Verified 2026-05-17 with `npx tsx --test server/routes/system-logs.test.ts server/lib/client-log-rate-limit.test.ts server/lib/system-log.test.ts client/src/lib/system-log.test.ts server/app-client-log-policy.test.ts`: client system-log ingestion bounds metadata, omits nested objects, redacts/truncates diagnostic payloads, orders the endpoint limiter before the generic API limiter, and caps public diagnostic floods by user/IP. |
| `LAW.AB3/05` | TV telemetry. | Verified 2026-05-17 with `npx tsx --test server/features/tv/telemetry-rate-limit-policy.test.ts server/lib/tv-telemetry.test.ts server/features/tv/canonical-tv-route-policy.test.ts server/features/tv/stream-snapshot-prefetch-policy.test.ts`: public TV item-end/playback telemetry uses bounded per-client rate-limit keys, playback health caps video/bumper error journals, and stream snapshots stay bounded before media can be blacklisted. |
| `LAW.AB4/05` | Generic in-memory primitives. | Verified 2026-05-17 with `npx tsx --test server/lib/in-memory-rate-limit.test.ts server/lib/bounded-expiring-cache.test.ts`: shared in-memory rate-limit and expiring-cache primitives enforce request windows, drop expired entries, sweep stale keys, and cap tracked-key cardinality under high churn. |
| `LAW.AB5/05` | Persistent hot-route caches. | Verified 2026-05-17 with `npx tsx --test server/tzkt-persistent-cache-policy.test.ts server/lib/tzkt-response-cache.test.ts server/tzkt-policy.test.ts`: TzKT hot-route cache entries are persistent, expiring, pruned behind a bounded limit, and guarded by direct max-entry and TTL clamp tests. |

## Law Deploy Dry-Run Evidence

The deploy dry-run chapter follows the explicit Law requirement for production-like deploy evidence without running an unsafe local production mutation:

| ID | Deploy boundary | Current proof |
| --- | --- | --- |
| `LAW.DR1/04` | Migration failure behavior. | Verified 2026-05-17 with `npx tsx --test scripts/deploy-dry-run-policy.test.mjs scripts/production-migrations-policy.test.mjs`: deploy dry-run evidence requires `set -euo pipefail`, `ON_ERROR_STOP=1`, no swallowed SQL-file failures, migration ledger writes only after SQL applies, and fresh-database bootstrap refusal. |
| `LAW.DR2/04` | No interactive prompts. | Verified 2026-05-17 with `npx tsx --test scripts/deploy-dry-run-policy.test.mjs`: deploy dry-run policy rejects interactive schema prompt paths such as `db:push`, `drizzle-kit push`, shell `read -p`, prompt `select`, and non-`-T` Docker exec usage in deploy scripts. |
| `LAW.DR3/04` | Schema readiness before app start. | Verified 2026-05-17 with `npx tsx --test scripts/deploy-dry-run-policy.test.mjs scripts/production-migrations-policy.test.mjs`: deploy dry-run policy requires Postgres readiness, app stop, production migration application, then app/Caddy start, followed by local `/api/health` polling and app failure logs. |
| `LAW.DR4/04` | Health readiness fields. | Verified 2026-05-17 with `npx tsx --test scripts/deploy-dry-run-policy.test.mjs server/lib/health.test.ts docs/runbooks-policy.test.ts`: health tests and deploy dry-run policy lock DB, chain/contracts, version, runtime, jobs, compact job issues, failure states, and runbook gates into the `/api/health` readiness snapshot. |

Current private board posture after this slice:

| Bucket | Count |
| --- | ---: |
| Immediate | 0 |
| Urgent | 2 |
| Walking Wounded | 2 |
| Outpatient Care | 0 |
| Verified Healthy | 0 |
| Archived Completed | 135 |

No `Verified` rows remain in active triage. `Fixed` rows stay in triage until their required verification level is complete. `Blocked` rows stay in triage with an external proof/tooling requirement.

`WTF-BB-070` was archived on 2026-05-17 after the production Kiln Shadownet proof returned storage, balance, and big-map assertion evidence with no missing assertion kinds.

`WTF-BB-068` was archived on 2026-05-17 after live Kiln Shadowbox command-provider proof returned multi-contract evidence with a payable step plus storage, balance, and big-map assertions passing. Kiln host main `b8bd9e2` was deployed through the Hetzner deploy script; production job `sbox_ae493400-ebed-433e-9cb8-1456e6888d31` reported `2/2` steps passed, warnings empty, storage `ready`, balance `1000000`, and big-map value `7`.

`WTF-BB-071` was locally verified on 2026-05-18 after the official `@jstz-dev/cli@0.1.1-alpha.5` and `docker.io/jstzdev/jstzd:0.1.1-alpha.5` sandbox deployed a counter smart function and returned `Current value is 0`, `Incremented. Current value is 1`, and `Current value is 1`. This clears only the local executable adapter proof; jstz remains disabled-by-default for production until stable endpoints and host config are deliberately enabled.

## Bounty Doctrine Map

Every active bounty must map to one of these constitutional concerns or be archived as obsolete:

| Active concern | Doctrine rule | Required acceptance evidence |
| --- | --- | --- |
| Dependencies, secrets, auth, CSRF, CORS, public agents | User first, server security third, developer convenience last. | Targeted security tests, dependency/audit evidence, no secret fallback, no public mutation without auth/rate boundaries. |
| Wallets, Tezos, market, rewards, settlement, recapture | Wallet policy where value is touched; every reward traces to verified cause. | Expected-account preflight, network/contract/entrypoint/amount verification, TzKT or chain evidence, idempotent grant tests. |
| Media, TV, Studio, Gallery, filesystem | User value needs ownership, restore path, shell placement, and feedback. | Ownership/access tests, bounded media/cache policy, playback/preview smoke, backup or provenance story for durable user value. |
| Kernel jobs, caches, backfills, repo doctor, deploy | Timed/stateful work needs scheduler, cache, health, and admin observability. | Overlap guards, bounded caches, job run records, `/api/health` readiness, deploy/runbook evidence. |
| Desktop shell, app gates, admin surfaces, settings | User first; admin second; no admin dashboard takeover of user OS. | Route/app registry entry, permission gate, shell placement, event output, settings/admin visibility where failure matters. |
| Kiln, jstz, Shadowbox, integrations, plugins | Provenance, permission summary, rollback, uninstall, and explicit blocked states. | Host/tooling proof or blocked reason, no mock-provider clearance, no stale wrong-repo import, rollback/runbook notes. |

## Feature Acceptance Matrix

The domain docs are the current feature ownership map. A domain is accepted only when its features have the relevant columns below.

| Domain | Shell placement | Event output | Permissions | User feedback and admin observability | Cache/scheduler policy | Wallet/value policy | Backup/restore/provenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [WTF OS](domains/wtf-os.md) | Desktop shell, command palette, windows, settings. | Shell actions and interaction inventory handles. | Role-filtered routes and admin registry. | Mission Control, Recovery Mode, Notification Center, admin surfaces. | Shell state and app/session behavior bounded by registry contracts. | Wallet state appears through safe tray/preflight surfaces. | Recovery reports, settings restore, backup links. |
| [Identity And Social](domains/identity-and-social.md) | Profile, messages, W, board, notifications. | Account, post, message, reward, and interaction events. | Session, OAuth, wallet-link, and social visibility policy. | User profile feedback plus staff/admin moderation visibility. | W and social sync must be bounded and observable. | Wallet identity separate from local identity. | Avatar/media ownership and account recovery state. |
| [Arcade, Console, And Game Studio](domains/arcade-console-game-studio.md) | Arcade, Console, Casino, Game Studio apps. | Score/session/report/play-card events. | App gates, staff controls, casino fail-closed boundary. | Game status, reports, admin catalogs, source/import diagnostics. | Source import and table/session jobs must not overlap or fan out unbounded. | Paid play and wagering stay preflighted or fail-closed. | Game bundles, provenance, source license, export notes. |
| [Commerce And Wallets](domains/commerce-and-wallets.md) | Market, Hoard, swap, in-app market, wallet actions. | Listing, purchase, bid, reward, inventory events. | User wallet versus platform signer separation. | User transaction explanations plus admin/operator ledgers. | Marketplace verifier and cache jobs visible and bounded. | Expected-account and chain preflight before value writes. | Inventory source, sale evidence, restoreable ledger state. |
| [Wallet Connect Boundary](domains/wallet-connect-boundary.md) | Wallet chooser/status through WTF OS wallet surfaces. | Wallet connect/disconnect/preflight events where meaningful. | User wallet consent and CSP frame boundaries. | Recovery guidance for chooser/frame/network failures. | No duplicate wallet client storms. | Octez primary, Beacon fallback, account/network checks. | Runbook and live CSP verification. |
| [Media, TV, And Studio](domains/media-tv-studio.md) | TV, Studio, media libraries, galleries. | Playback, import, upload, preview, cache events. | Public/owned/private media access boundaries. | Playback errors, creator credits, admin media/storage status. | TV refresh/cache/transcode jobs bounded and visible. | Token media and ownership reads use chain-backed evidence when needed. | Project bundles, media manifests, restore proof, IPFS provenance. |
| [Tezos Platform](domains/tezos-platform.md) | Tezos Intel, domains, contract factory, wallet panels. | Chain, wallet, contract, indexer, domain events. | Browser wallet, platform signer, and operator boundaries. | `/api/health`, Tezos organ/admin visibility, runbooks. | TzKT/Objkt/Domain fetches use shared retry/cache policies. | Network/chain/contract policy for every operation. | Contract/deploy provenance and upstream runbook. |
| [Operations](domains/operations.md) | Admin-visible health/status only, not normal user shell control. | Deploy, backup, job, health, and incident events. | Host secrets remain outside WTF OS and public repo. | Backup Manager, health endpoints, deploy/runbook evidence. | Background jobs and deploy scripts fail closed. | Platform signer custody stays host-side and audited. | Restore proof required for backup claims. |

## Law Feature Acceptance Gate

`LAW.FA1/01` locks the Feature Acceptance Matrix itself: the matrix must keep the expected acceptance columns, every domain row must link to a real domain guide, every acceptance cell must stay non-empty, and each domain guide must keep the common doctrine skeleton: Purpose, WTF OS Connection, Main Code, and Notes. Verified 2026-05-18 with `npx tsx --test docs/constitutional-acceptance-policy.test.ts`.

## Phase 6 Next Steps

- `P6.CA2/08`: Completed by the admin mutation audit middleware and policy tests.
- `P6.CA3/08`: Completed for in-app market purchase inventory and EXP deduction traceability.
- `P6.CA4/08`: Completed by the app/package/plugin acceptance manifest and policy tests.
- `P6.CA5/08`: Completed for current active `Fixed`/`Verified` boundary audit.
- `P6.CA6/08`: Completed for current blocked tooling proof requirements.
- `P6.CA7/08`: Completed phase-level verification gates.
- `P6.CA8/08`: Completed Phase 6 production health closeout.
