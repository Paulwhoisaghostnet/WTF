# Constitutional Acceptance Register

## Status

`P6.CA1/08` completed the first Phase 6 acceptance slice: private board hygiene plus a public doctrine map. It does not publish private exploit details.

`P6.CA2/08` adds the admin mutation audit rule. Successful `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api/admin` now create normalized `admin_mutation` system events with actor, method, path, status, route/body metadata, and this phase rule id. Failed or rejected requests are not recorded as completed admin actions.

`P6.CA3/08` adds the reward and inventory traceability rule. In-app market inventory grants from EXP checkout and verified WTF chain purchases now stamp owner, source, source id, domain, state, visibility, currency, purchase id, payment intent, and chain evidence where present. EXP deductions also record their payment-intent cause in `xp_events` metadata.

`P6.CA4/08` adds the app/package/plugin acceptance rule. Desktop apps, creation tools, console stock cartridges, project bundle manifests, and integration plugins now require recorded provenance, permission summary, rollback method, and non-destructive uninstall/disable coverage. Blocked integrations stay explicitly blocked until the correct live repo contains concrete host/tooling proof; no stale wrong-repo package or mock-only provider is accepted as production readiness evidence.

`P6.CA5/08` audits the active `Fixed`/`Verified` boundary. Verified rows without completed verification evidence are kept in active triage as `Fixed`, and only rows with convincing recorded verification are moved to the private completed archive. The public register records aggregate posture only and does not publish private exploit details.

Current private board posture after this slice:

| Bucket | Count |
| --- | ---: |
| Immediate | 0 |
| Urgent | 34 |
| Walking Wounded | 25 |
| Outpatient Care | 0 |
| Verified Healthy | 0 |
| Archived Completed | 80 |

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
- `P6.CA6/08`: Keep blocked tooling rows blocked with exact external proof requirements.
- `P6.CA7/08`: Run phase-level verification gates.
- `P6.CA8/08`: Close Phase 6 with production health evidence.
