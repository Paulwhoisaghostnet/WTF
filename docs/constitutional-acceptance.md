# Constitutional Acceptance Register

## Status

`P6.CA1/08` completed the first Phase 6 acceptance slice: private board hygiene plus a public doctrine map. It does not publish private exploit details.

`P6.CA2/08` adds the admin mutation audit rule. Successful `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api/admin` now create normalized `admin_mutation` system events with actor, method, path, status, route/body metadata, and this phase rule id. Failed or rejected requests are not recorded as completed admin actions.

`P6.CA3/08` adds the reward and inventory traceability rule. In-app market inventory grants from EXP checkout and verified WTF chain purchases now stamp owner, source, source id, domain, state, visibility, currency, purchase id, payment intent, and chain evidence where present. EXP deductions also record their payment-intent cause in `xp_events` metadata.

`P6.CA4/08` adds the app/package/plugin acceptance rule. Desktop apps, creation tools, console stock cartridges, project bundle manifests, and integration plugins now require recorded provenance, permission summary, rollback method, and non-destructive uninstall/disable coverage. Blocked integrations stay explicitly blocked until the correct live repo contains concrete host/tooling proof; no stale wrong-repo package or mock-only provider is accepted as production readiness evidence.

`P6.CA5/08` audits the active `Fixed`/`Verified` boundary. Verified rows without completed verification evidence are kept in active triage as `Fixed`, and only rows with convincing recorded verification are moved to the private completed archive. The public register records aggregate posture only and does not publish private exploit details.

`P6.CA6/08` audits blocked tooling rows. Blocked rows stay blocked unless the required external proof exists, and each blocked row must name the exact missing artifact or host action needed for clearance. Local policy tests, mock providers, and stale reference repos do not clear production/host-tooling requirements by themselves.

`P6.CA7/08` completes the phase-level verification gates for this acceptance pass: focused policy tests, admin/app package acceptance tests, `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, `npm audit --omit=dev --audit-level=high`, GitHub Quality Gates, SmartPy contract checks, and Hetzner deploy checks.

`P6.CA8/08` closes Phase 6 with production health evidence. Live `https://wtfgameshow.app/api/health` reported commit `195d907`, DB ok, chain ok on mainnet, `tzktBase` `https://api.tzkt.io/v1`, `tezosRpcUrl` `https://rpc.tzkt.io/mainnet`, jobs ok, and zero recent job errors after deploy.

## Law Test Plan

The Law does not define a Phase 7. After Phase 6 closeout, the next canonical chapter is the explicit Test Plan. These IDs are the tracking surface for that chapter:

| ID | Acceptance surface | Current proof |
| --- | --- | --- |
| `LAW.TP1/07` | Landing and public entry. | Playwright smoke asserts the public landing, login, and registration entry points. |
| `LAW.TP2/07` | Auth/session boundary. | Playwright smoke asserts anonymous `/api/auth/user` rejection and authenticated Mission Control access. |
| `LAW.TP3/07` | Mission Control. | Playwright smoke asserts location, active wallet, system health, next action, failures, changes, rewards, and wallet preflight visibility. |
| `LAW.TP4/07` | TV playback/error path. | Playwright smoke asserts the TV shell and no-signal/offline recovery message. |
| `LAW.TP5/07` | Marketplace/wallet preflight. | Playwright smoke asserts market create remains wallet-gated before value writes. |
| `LAW.TP6/07` | Media ownership. | Playwright smoke asserts owned gallery and public gallery surfaces stay separated. |
| `LAW.TP7/07` | Admin observability. | Playwright smoke asserts strict-admin visibility and host-role exclusion for admin surfaces. |

## Law Targeted Test Plan

The targeted test chapter follows the Playwright smoke chapter without adding new product scope:

| ID | Targeted contract | Current proof |
| --- | --- | --- |
| `LAW.TT1/10` | Migration fail-closed behavior. | Policy test locks production migrations to `ON_ERROR_STOP`, fresh-DB bootstrap refusal, post-apply ledger writes, and app restart only after migration success. |
| `LAW.TT2/10` | TzKT retry/cache. | Existing upstream, TzKT cursor, kernel, and persistent-cache tests cover retry budget, cursor pagination, shared helper use, and bounded expiring hot-route cache. Operator-wallet reconciliation is included in the shared-kernel policy so admin repair paths cannot bypass TzKT retry/cache or own a separate base URL. |
| `LAW.TT3/10` | Wallet preflight. | Existing wallet preflight policy tests cover linked-wallet rejection before user-value payment paths. Tezos client policy now also rejects unbound send preflights: marketplace, barter, in-app market, club dues, casino, DEX, and token writes must pass the expected wallet address into `assertNetworkReadyForSend(...)` before the user signs. |
| `LAW.TT4/10` | Reward idempotency. | Reward/inventory idempotency tests cover retry/replay-safe challenge automation inventory grants, challenge automation reward-ledger completion IDs, manual challenge reward source checks, side-quest reward source checks, and CRP nomination reward counters before ledger writes. |
| `LAW.TT5/10` | Inventory ownership. | Inventory traceability and media ownership tests cover owner/source metadata, private-media access boundaries, and non-market inventory grants. Starter-food and challenge-automation inventory grants stamp source type/id, domain, owner type, owned state, user-inventory visibility, and the `P6.CA3/08` trace rule. |
| `LAW.TT6/10` | Media access control. | Media access policy tests cover owner/staff checks, dedicated media limits, channel-scoped TV media routes, and personal TV bumper media. Personal bumper bytes require owner/staff access or a visible channel owned by the bumper owner; community bumpers remain public. |
| `LAW.TT7/10` | TV concurrency. | Playlist atomicity tests cover active-playlist uniqueness, transactional creation, replacement locks, channel-scoped selector use, and schedule overlap checks under the channel row lock before insert. |
| `LAW.TT8/10` | Repo-doctor advisory lock. | Repo-doctor heartbeat policy tests cover host-level timer/service, advisory lock, dry-run, kill switch, audit-only writes, optional host env loading, and installer timer visibility for verification. |
| `LAW.TT9/10` | Backup command safety. | Backup command and restore-drill tests cover `pg_dump`/`pg_restore` argv isolation, separate restore target enforcement, and numeric argv boundaries for shell backup retention. |
| `LAW.TT10/10` | Restore proof. | Restore-proof tests refuse backup safety claims without matching restore drill row counts and media manifest proof. Stored cursor proof is normalized and re-derived before Backup Manager can expose `canClaimSafety`. |

## Law Abuse Test Plan

The abuse chapter follows the explicit Law requirement for rate-limit and cache keyspace bounds without adding new product features:

| ID | Abuse boundary | Current proof |
| --- | --- | --- |
| `LAW.AB1/05` | Board webhook keyspace. | Incoming board webhooks use the shared bounded in-memory rate limiter with token/IP-scoped keys, bounded key parts, and churn tests proving tracked keys stay capped. |
| `LAW.AB2/05` | Client diagnostics. | Client system-log ingestion keeps payload metadata bounded, omits nested objects before events enter the system log, and uses a bounded per-user/IP limiter for public diagnostic floods. |
| `LAW.AB3/05` | TV telemetry. | Public TV item-end and playback-event telemetry routes use bounded per-client rate-limit keys, and TV playback health keeps bounded video/bumper error journals before media can be blacklisted. |
| `LAW.AB4/05` | Generic in-memory primitives. | Shared in-memory rate-limit and expiring-cache tests prove stale-key sweeping and tracked-key caps under high churn. |
| `LAW.AB5/05` | Persistent hot-route caches. | TzKT hot-route cache policy keeps persistent entries expiring and pruned behind a bounded limit, with direct tests for max-entry and TTL clamp boundaries. |

## Law Deploy Dry-Run Evidence

The deploy dry-run chapter follows the explicit Law requirement for production-like deploy evidence without running an unsafe local production mutation:

| ID | Deploy boundary | Current proof |
| --- | --- | --- |
| `LAW.DR1/04` | Migration failure behavior. | Deploy dry-run policy tests require `set -euo pipefail`, `ON_ERROR_STOP=1`, no swallowed SQL-file failures, and fresh-database bootstrap refusal. |
| `LAW.DR2/04` | No interactive prompts. | Deploy dry-run policy tests reject interactive schema prompt paths such as `db:push`, `drizzle-kit push`, shell `read -p`, prompt `select`, and non-`-T` Docker exec usage in deploy scripts. |
| `LAW.DR3/04` | Schema readiness before app start. | Deploy dry-run policy tests require Postgres readiness, app stop, production migration application, then app/Caddy start, followed by local `/api/health` polling and failure logs. |
| `LAW.DR4/04` | Health readiness fields. | Health tests and deploy dry-run policy lock DB, chain/contracts, version, runtime, and jobs into the `/api/health` readiness snapshot. |

Current private board posture after this slice:

| Bucket | Count |
| --- | ---: |
| Immediate | 0 |
| Urgent | 5 |
| Walking Wounded | 18 |
| Outpatient Care | 0 |
| Verified Healthy | 0 |
| Archived Completed | 116 |

No `Verified` rows remain in active triage. `Fixed` rows stay in triage until their required verification level is complete. `Blocked` rows stay in triage with an external proof/tooling requirement.

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

## Phase 6 Next Steps

- `P6.CA2/08`: Completed by the admin mutation audit middleware and policy tests.
- `P6.CA3/08`: Completed for in-app market purchase inventory and EXP deduction traceability.
- `P6.CA4/08`: Completed by the app/package/plugin acceptance manifest and policy tests.
- `P6.CA5/08`: Completed for current active `Fixed`/`Verified` boundary audit.
- `P6.CA6/08`: Completed for current blocked tooling proof requirements.
- `P6.CA7/08`: Completed phase-level verification gates.
- `P6.CA8/08`: Completed Phase 6 production health closeout.
