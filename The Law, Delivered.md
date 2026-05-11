# The Law, Delivered

## Summary

This is the single replacement master plan for WTF OS. It consolidates `WTF-Bible.md`, the first five GhostOS/WTF OS chapters, Appendix WT-F, Appendix Omega, the bug bounty board, the reference grafting plan, and the repo-doctor heartbeat plan.

After this file exists, the superseded plans are removed:

- `GRAFTING_PLAN_2026-04-19.md`
- `REPO_DOCTOR_HEARTBEAT_PLAN.md`

`WTF-Bible.md` remains doctrine. `BUG_BOUNTY_BOARD.md` remains the issue ledger. This plan is the all-inclusive execution order.

## Doctrine

GhostOS is the base genome. WTF OS must mutate from it without losing any organ. Every GhostOS service, app, permission, file boundary, media boundary, wallet boundary, backup path, and developer surface must become a WTF OS feature, planned feature, or explicit user-rejected feature.

The first five chapters of `WTF-Bible.md` define the required build order:

1. Kernel and core foundation.
2. Local identity and wallet identity.
3. Human filesystem and project bundles.
4. System services: search, media, chain, sync, automation.
5. Security: sandbox, transaction firewall, readable permissions.

The constitutional order is fixed:

1. User first.
2. Admin second.
3. Server security third.
4. Developer convenience, internal cleanliness, and feature vanity after that.

An implementation is not done unless it has shell placement, kernel service, permissions, event output, user feedback, admin observability, cache/scheduler policy where relevant, wallet policy where value is touched, backup/restore story where user value is stored, and verification.

## Phase 0 - Stop The Bleeding

Resolve deploy, schema, security, and production-risk blockers before feature work.

Covered bounties:

- Deploy and migration law: `WTF-BB-001`, `WTF-BB-002`, `WTF-BB-003`, `WTF-BB-004`, `WTF-BB-006`, `WTF-BB-007`, `WTF-BB-009`, `WTF-BB-010`, `WTF-BB-022`
- Security and secrets: `WTF-BB-012`, `WTF-BB-013`, `WTF-BB-014`, `WTF-BB-019`, `WTF-BB-020`, `WTF-BB-049`, `WTF-BB-050`, `WTF-BB-056`, `WTF-BB-057`, `WTF-BB-066`
- Historical fixed lessons to preserve: `WTF-BB-008`, `WTF-BB-064`, `WTF-BB-065`

Implementation direction:

- Choose one production schema authority. Production deploy must not replay broad SQL bundles and then run interactive Drizzle schema push.
- Remove interactive schema mutation from the long-lived runtime image. Schema tooling belongs in a migration job, CI step, or reviewed one-shot operation.
- Fail closed on unexpected migration errors. Keep only explicit no-op duplicate allowlists where unavoidable.
- Start production app and background jobs only after schema readiness.
- Keep `.env`, private keys, signer secrets, and sensitive local-only guidance out of Docker build context and public deploy paths.
- Fix production CORS so credentialed requests never reflect arbitrary origins.
- Add or enforce CSRF boundaries for cookie-authenticated writes.
- Fix TLS certificate verification for Supabase and DB scripts.
- Replace shell-interpolated backup command construction with argument-safe process invocation.
- Pin/cache runtime assets and remove `latest` dependency ambiguity.
- Keep public Kiln proxy behind explicit host token configuration and audit.

Verification gates:

- Production-like deploy dry run has no interactive prompt.
- Deliberately broken migration fails deploy before app restart.
- Runtime app image starts without schema mutation tooling.
- `/api/health` reports DB, chain, contracts, version, and job-readiness status.
- `npm run check` and production build pass.

## Phase 1 - Build The Kernel

Build the hidden authority layer before adding spectacle.

Covered bounties:

- Operations and workers: `WTF-BB-023`, `WTF-BB-024`
- API reliability and scaling: `WTF-BB-025`, `WTF-BB-026`, `WTF-BB-029`, `WTF-BB-046`, `WTF-BB-047`, `WTF-BB-058`, `WTF-BB-059`, `WTF-BB-060`, `WTF-BB-061`, `WTF-BB-062`, `WTF-BB-063`
- Data/config integrity: `WTF-BB-028`, `WTF-BB-030`, `WTF-BB-031`, `WTF-BB-033`, `WTF-BB-034`, `WTF-BB-052`

Implementation direction:

- Add robust TzKT/http retry client with 429/5xx backoff, retry budget, cursor pagination, and request floor.
- Route TzKT-adjacent fetches through shared retry/caching primitives.
- Add server-side chain-id guard before verifier/reconcile passes.
- Add scheduler overlap guards for token sync, nonce cleanup, marketplace verifier, wallet sweeps, and TV refresh work.
- Add bounded caches and TTL eviction for rate limiters, actor caches, board webhook keys, DEX/TzKT request keys, X DM keys, profile/domain maps, and Studio user Drive caches.
- Add job run visibility: started, ended, status, error, counts, duration, next run.
- Enforce optimistic/concurrent update discipline for platform settings and X token refresh.

Repo Doctor requirements:

- Install host-level `repo-doctor-heartbeat` as a systemd timer and one-shot service, outside Docker.
- Run even when the app container is stopped.
- Use a DB advisory lock and structured heartbeat logs.
- Support dry-run and kill-switch mode.
- Apply only deterministic safe backfills, with source derivation and confidence. Never blindly fill nullable social/profile fields.
- Treat zero-row feature tables as inactive/not-yet-populated unless doctrine says they must be populated.
- Cap writes per run, use guarded `WHERE` clauses, batch in small chunks, and emit system events.

Verification gates:

- Repo doctor runs every configured interval while app is stopped.
- Concurrent worker invocation exits cleanly with lock-skipped status.
- Job run dashboard or admin route shows all background jobs and failures.
- Cache/keyspace memory growth is bounded under spam tests.

## Phase 2 - Build Identity, Wallet, Inventory, And Reward Law

Separate local identity, wallet identity, inventory memory, and reward flow.

Covered bounties:

- Analytics and uniqueness: `WTF-BB-005`, `WTF-BB-052`
- Media ownership and post safety: `WTF-BB-032`
- Identity and auth lifecycle: `WTF-BB-034`, `WTF-BB-044`
- Marketplace and Tezos data: `WTF-BB-025`, `WTF-BB-026`, `WTF-BB-027`

Implementation direction:

- Make local identity more than a session: username, avatar, theme, desktop state, pet state, app state, project state, permissions, recovery.
- Keep wallet identity as the system wallet service. Apps request ownership checks, signatures, reads, and prepared transactions; the kernel controls approval.
- Enforce live wallet preflight for every user-wallet write: provider, account, expected account, network, contract, entrypoint, amount, simulation, final explanation.
- Keep platform signer and user wallet boundaries separate and audited.
- Resolve `token_sales` duplicates before enforcing unique indexes.
- Reject unowned media IDs for W posts and DMs.
- Prevent duplicate Twitter identity collapse.
- Serialize X token refresh updates.
- Add known marketplace contract map and sale classification.
- Add Tezos Domains GraphQL for reverse and owned-domain support.
- Add server-side op verification for residual audit items that can be solved by existing `verifyContractCall` patterns.

Verification gates:

- Wallet mismatch fails before signing.
- Reward and inventory grants are idempotent under retry/replay.
- Media post/DM flows reject unowned media.
- Known sale fixtures classify marketplace and operation metadata.
- Duplicate token-sales query returns zero before unique index creation.

## Phase 3 - Build Filesystem, Project Bundles, Media, And Backup Memory

Give every work a home and every valuable state a restore path.

Covered bounties:

- Media and Studio: `WTF-BB-015`, `WTF-BB-016`, `WTF-BB-017`, `WTF-BB-018`, `WTF-BB-021`
- TV data and playback: `WTF-BB-035` through `WTF-BB-045`, `WTF-BB-048`, `WTF-BB-053`, `WTF-BB-054`, `WTF-BB-055`

Implementation direction:

- Establish WTF dwellings: Desktop, Projects, Media, Documents, Downloads, Vault, Apps, Chain, Archives, Shared.
- Define project bundle manifests for Studio, Game Studio, TV, gallery, board/story assets, challenge definitions, reward configs, contract references, licenses, provenance, attribution, logs, exports, IPFS CIDs, and deploy notes.
- Build shared media service for preview, playback, metadata, thumbnails, transcoding, waveforms, frame extraction, export state, archive state, and ownership.
- Add multi-gateway IPFS rendering fallback.
- Move Studio preview/ffmpeg work out of inline request paths; add timeouts, queues/locks, and admin-visible job state.
- Harden media rate limits and access control.
- Prevent unauthenticated TV prefetch from forcing large media downloads.
- Canonicalize TV configuration and active playlist semantics with uniqueness and atomic writes.
- Merge `/tv` and `/tv2` only after resilience parity: skip/error telemetry, skip-notice UX, stream edge cases, and session telemetry.
- Make Backup Manager doctrine real: no backup claim without restore proof; avoid full pg_dump output in memory.

Verification gates:

- Media URLs cannot be enumerated without public/ownership policy.
- TV stream path does not rebuild unbounded queues on each call.
- TV refresh cannot overlap from read-path traffic.
- Playlist replacement is atomic and rollback-safe.
- Backup restore proof exists for the backup path being claimed.

## Phase 4 - Build Shell, Mission Control, And User Rights

Make the browser-delivered OS understandable, navigable, and alive.

Implementation direction:

- Prioritize Mission Control, File Manager, Settings, Terminal, command palette, Notification Center, Backup Manager, Browser boundaries, Recovery Mode, and Theme Builder before speculative features.
- Mission Control must tell the user: where they are, what is active, what counts, what rewards exist, what failed, what changed, what happens next, what wallet is active, what transaction costs, and whether rewards are claimable.
- Shell must expose desktop, windows, launcher, taskbar, tray, notifications, theme state, and desktop interaction without becoming an admin dashboard.
- Command palette must open rounds, find rewards, show wallet activity, locate media, pin to IPFS, open bundles, start local services, run checks, export logs, and restore backups.
- Browser must separate normal browsing, wallet-safe mode, local development, media capture, archive/save-to-project, and admin surfaces.
- Recovery Mode must reset permissions, rollback apps, restore backup, disconnect wallet, reset network, check filesystem, export logs, disable drivers, and open emergency shell.

Verification gates:

- A new user can answer “where am I, what counts, what failed, what happens next?” without admin tools.
- Shell actions emit events where meaningful.
- Admin tools remain permission-gated and do not dominate user space.

## Phase 5 - Graft Reference Organs

Carry forward useful reference-project grafts, but obey WTF doctrine and security.

Required graft tracks:

- Robust TzKT client with backoff, cursor pagination, and retry budget.
- Shared HTTP retry helper for TzKT, Objkt, Tezos Domains, and future chain-adjacent calls.
- IPFS gateway fallback rendering.
- Known marketplace contract map and sale classification.
- Tezos Domains GraphQL reverse and owned-domain support.
- Enriched health endpoint.
- Persistent bounded TzKT cache for hot routes.
- Request-ticket dedupe for racing client fetches where useful.
- Cursor-based token-balance sync.
- Objkt GraphQL secondary source, only after core chain client is safe.
- Background job run tables/admin visibility.
- WalletConnect-ready CSP first; transport only after wallet QA.
- Playwright e2e harness and CI gate.
- Deployment runbook, wallet runbook, and TzKT cheatsheet.

Explicitly rejected grafts:

- Client-bundled Pinata JWT.
- Global unsafe-eval CSP.
- Unbounded polling dashboards.
- Dual deploy targets that dilute the Hetzner/Docker path.
- Reference code that duplicates stronger WTF-native preflight, contract config, or wallet surveillance patterns.

Deferred features:

- Creator scoring.
- Wallet relationship graph.
- Browser-based SmartPy test UX.
- WalletConnect transport.
- Mint-from-WTF pipeline.

These may begin only after Phases 0 and 1 are verified.

## Phase 6 - Constitutional Acceptance

Every bounty and feature must map to doctrine.

Acceptance rules:

- Every active bounty maps to a constitutional violation or is archived as obsolete.
- Every feature has shell placement, event output, permissions, user feedback, admin observability if it can fail, cache policy if stateful, scheduler policy if timed, and wallet policy if it touches value.
- Every admin action affecting rewards, challenges, users, inventory, rounds, seasons, wallet operations, visibility, moderation, or feature state creates an audit record.
- Every reward traces back to challenge, event, purchase, admin action, verified chain state, or explicit system rule.
- Every inventory item has owner, type, state, source, visibility, and inventory domain.
- Every backup claim includes restore proof.
- Every app/package/plugin includes provenance, permission summary, rollback, and uninstall.
- No organ may be called bloat until its event, ritual, reward, social, discovery, and doctrine roles are judged.

## Test Plan

- Run `npm run check` and production build after every phase.
- Add Playwright smoke tests for landing, auth/session, Mission Control, TV playback/error path, marketplace/wallet preflight, media ownership, and admin observability.
- Add targeted tests for migration fail-closed behavior, TzKT retry/cache, wallet preflight, reward idempotency, inventory ownership, media access control, TV concurrency, repo-doctor advisory lock, backup command safety, and restore proof.
- Add deploy dry-run evidence: migrations fail closed, no interactive prompts, app starts only after schema readiness, and `/api/health` reports chain/db/contracts/job status.
- Add abuse tests for rate-limit and cache keyspace bounds.

## Assumptions

- This file is the all-inclusive execution plan and replaces the two removed plans.
- `WTF-Bible.md` remains the doctrine source.
- `BUG_BOUNTY_BOARD.md` remains the issue ledger.
- Work proceeds in phases; speculative feature expansion waits until Phase 0 and Phase 1 pass verification.
- The private workbench remains local/private inside `WTF combo`; live/public deployment happens only through deliberate repo/deploy channels.
