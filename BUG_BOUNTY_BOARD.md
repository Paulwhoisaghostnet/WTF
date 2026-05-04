# WTF Bug Bounty Board

Created: 2026-04-27

This is the revolving board for audit red flags, operational smells, security risks, and bugs that should be tackled in focused swarm sessions.

Agents should treat this file as the source of truth for known work. When new findings appear, add them here with evidence, scoring, and a suggested verification path. When an issue is fixed, update the status and leave a short note with the commit, PR, or local verification command.

## Workflow

1. Pick the highest-priority open issue that matches your task scope.
2. Claim it by updating `Status` and `Owner/Session` before editing code.
3. Investigate root cause before patching.
4. Keep fixes narrow. Do not bundle unrelated bounty items unless the same root cause truly covers them.
5. Add or update tests/checks when practical.
6. Before closing an item, add verification evidence and update `Last touched`.

## Status Values

- `Open`: Confirmed enough to track, not currently owned.
- `Claimed`: Someone is actively investigating.
- `In Progress`: A fix is being implemented.
- `Blocked`: Needs user decision, credentials, production data, or dependency work.
- `Fixed`: Code/config change exists but has not been fully verified in the target environment.
- `Verified`: Fix has been tested in the target environment or with a convincing reproduction.
- `Archived`: Kept for history; no longer actionable.

## Scoring

Each issue gets a bounty score from four inputs:

| Field | Range | Meaning |
| --- | ---: | --- |
| `C` Complexity | 1-5 | Engineering difficulty and blast radius of the likely fix. |
| `F` Functionality danger | 0-5 | Risk to core WTF app behavior, deployability, data integrity, or uptime. |
| `S` Security danger | 0-5 | Risk to secrets, auth, data exposure, privilege boundaries, or supply chain. |
| `P` Priority bonus | 1-5 | P0 = 5, P1 = 4, P2 = 3, P3 = 2, P4 = 1. |

`Points = C + F + S + P`

Priority labels:

- `P0`: Production blocker, data-loss risk, active security risk, or repeatedly breaking deploys.
- `P1`: High-impact bug or configuration flaw likely to hurt production soon.
- `P2`: Important hardening or reliability problem with moderate blast radius.
- `P3`: Cleanup, performance, or maintainability issue worth scheduling.
- `P4`: Nice-to-have polish or low-risk debt.

## Open Board

| ID | Status | Owner/Session | Last touched | Category | Priority | Points | Rank | C | F | S | Title |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| WTF-BB-001 | Fixed | Swarm A1 | 2026-04-28 | Deploy / DB migrations | P0 | 16 | 1 | 4 | 5 | 2 | Overlapping migration systems run every deploy |
| WTF-BB-002 | Verified | Codex deploy hardening pass | 2026-05-03 | Startup / background jobs | P1 | 12 | 7 | 3 | 4 | 1 | App starts production jobs before deploy-time migrations complete |
| WTF-BB-003 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / DB migrations | P0 | 14 | 3 | 2 | 5 | 2 | Migration failures are swallowed and deploy continues |
| WTF-BB-004 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / DB migrations | P0 | 15 | 2 | 3 | 4 | 3 | `drizzle-kit push --force` prompts in non-interactive production shell |
| WTF-BB-005 | Open | - | 2026-04-27 | Data integrity / analytics | P1 | 13 | 5 | 4 | 4 | 1 | `token_sales` duplicates make unique-index migrations impossible |
| WTF-BB-006 | Open | - | 2026-04-27 | DB migrations | P1 | 10 | 10 | 2 | 3 | 1 | `0031_wtf_recapture.sql` is not idempotent for enum type creation |
| WTF-BB-007 | Verified | Codex deploy hardening pass | 2026-05-03 | Runtime / supply chain | P1 | 12 | 7 | 2 | 3 | 3 | Production runtime image includes DB schema mutation tooling |
| WTF-BB-008 | Fixed | gardener session | 2026-04-27 | Build / secrets | P0 | 15 | 2 | 2 | 3 | 5 | Missing `.dockerignore` likely sends `.env` into Docker build context |
| WTF-BB-009 | Open | - | 2026-04-27 | Build config | P2 | 9 | 12 | 2 | 2 | 2 | Vite build loads `.env` with unsupported `NODE_ENV=production` |
| WTF-BB-010 | Fixed | Swarm A1 | 2026-04-28 | Startup performance | P2 | 9 | 12 | 2 | 3 | 1 | Entrypoint recursively `chown -R`s mounted volumes every boot |
| WTF-BB-011 | Open | - | 2026-04-27 | Frontend bundle | P3 | 9 | 13 | 4 | 2 | 1 | Wallet/Tezos bundle chunks are huge and pull Node core externals |
| WTF-BB-012 | Open | - | 2026-04-27 | Dependencies / security | P1 | 14 | 4 | 4 | 2 | 4 | Runtime install reports deprecated auth packages and audit vulnerabilities |
| WTF-BB-013 | Verified | Swarm A3 | 2026-04-28 | Security / CORS | P0 | 15 | 2 | 2 | 3 | 5 | Production CORS fallback reflects any origin with credentials |
| WTF-BB-014 | Open | - | 2026-04-27 | Auth / CSRF | P2 | 13 | 6 | 3 | 3 | 4 | Cookie-authenticated write routes have no visible CSRF token layer |
| WTF-BB-015 | Fixed | Codex TV hardening pass | 2026-05-03 | Media / access control | P1 | 14 | 4 | 3 | 3 | 4 | Uploaded media files are unauthenticated and enumerable by ID |
| WTF-BB-016 | Fixed | Codex TV hardening pass | 2026-05-03 | Abuse prevention / rate limits | P1 | 14 | 4 | 3 | 4 | 3 | Media rate-limit bypass is broad enough to cover write-heavy endpoints |
| WTF-BB-017 | Fixed | Codex TV hardening pass | 2026-05-03 | TV cache / SSRF-DoS | P1 | 14 | 4 | 3 | 4 | 3 | Unauthenticated TV prefetch can force large public media downloads |
| WTF-BB-018 | Fixed | Swarm A4 | 2026-04-28 | Studio / media processing | P1 | 14 | 4 | 4 | 3 | 3 | Studio preview ffmpeg jobs run inline without timeout or concurrency guard |
| WTF-BB-019 | Open | - | 2026-04-27 | Secrets / key management | P1 | 13 | 5 | 3 | 2 | 4 | OAuth and Studio secret encryption fall back to `SESSION_SECRET` |
| WTF-BB-020 | Fixed | Swarm A3 | 2026-04-28 | DB connectivity / TLS | P1 | 13 | 5 | 2 | 2 | 5 | Supabase migration and connection scripts disable TLS certificate verification |
| WTF-BB-021 | Fixed | Swarm A8 | 2026-04-28 | Backup / reliability | P2 | 11 | 9 | 3 | 3 | 2 | Backup upload path keeps full pg_dump output in memory |
| WTF-BB-022 | Open | - | 2026-04-27 | Deploy / DB operations | P2 | 9 | 12 | 2 | 3 | 1 | Backfill pipeline defaults to `us-west-2` when Supabase region is missing |
| WTF-BB-023 | In Progress | - | 2026-04-27 | Operations / workers | P1 | 12 | 7 | 3 | 3 | 2 | Add host-level heartbeat and native repo doctor backfill worker |
| WTF-BB-024 | Fixed | Swarm A2 | 2026-04-28 | Data integrity / workers | P2 | 9 | 12 | 3 | 3 | 1 | Backfill skip statuses can be overwritten as completed |
| WTF-BB-025 | Open | - | 2026-04-27 | API / reliability | P1 | 13 | 5 | 4 | 4 | 1 | Route-level Tezos fetches bypass shared upstream rate-limit control |
| WTF-BB-026 | Open | - | 2026-04-27 | API / reliability | P2 | 10 | 11 | 3 | 2 | 1 | Profile and metadata fetchers duplicate hardcoded upstream paths |
| WTF-BB-027 | Open | - | 2026-04-27 | Marketplace / data pipeline | P2 | 10 | 11 | 2 | 4 | 1 | External marketplace listing backfill returns empty by default |
| WTF-BB-028 | Fixed | Swarm A2 | 2026-04-28 | Data quality / pipeline | P2 | 10 | 11 | 3 | 3 | 1 | Seeder `LIMIT` queries have no deterministic order |
| WTF-BB-029 | Open | - | 2026-04-27 | Data quality / scalability | P1 | 11 | 8 | 3 | 4 | 1 | `/api/w/timeline` loads all verified users before paging or cursoring |
| WTF-BB-030 | Open | - | 2026-04-27 | Data integrity / config | P1 | 12 | 7 | 3 | 3 | 2 | `platform_settings` updates are prone to lost updates across concurrent actors |
| WTF-BB-031 | Open | - | 2026-04-27 | Config reliability | P2 | 9 | 12 | 2 | 2 | 3 | DM conversation resolution hides DB state when setting missing/invalid |
| WTF-BB-032 | Open | - | 2026-04-27 | Data safety / input validation | P2 | 11 | 9 | 3 | 4 | 1 | Unowned media IDs are accepted for W post/DM flows |
| WTF-BB-033 | Open | - | 2026-04-27 | Data integrity / ops | P2 | 10 | 11 | 2 | 3 | 1 | Unbounded `platform_settings` value payload allows oversized conversation lists |
| WTF-BB-034 | Open | - | 2026-04-27 | Data integrity / auth lifecycle | P1 | 10 | 10 | 2 | 3 | 2 | X token refresh updates users table without serialization |
| WTF-BB-035 | Open | - | 2026-04-27 | TV microapp / pagination | P2 | 10 | 11 | 3 | 3 | 2 | TV channel list and detail payloads load unbounded rows |
| WTF-BB-036 | Open | - | 2026-04-27 | TV microapp / data integrity | P1 | 11 | 8 | 3 | 4 | 1 | Channel-video insert path is non-atomic with concurrent requests |
| WTF-BB-037 | Fixed | Swarm A6 | 2026-04-28 | TV microapp / data integrity | P2 | 9 | 12 | 3 | 3 | 2 | Playlist-item replace can lose existing queue on partial failure |
| WTF-BB-038 | Open | - | 2026-04-27 | TV microapp / data integrity | P1 | 11 | 8 | 3 | 3 | 4 | Active playlist flips can race and violate channel state assumptions |
| WTF-BB-039 | Open | - | 2026-04-27 | TV microapp / stream performance | P1 | 12 | 7 | 3 | 3 | 4 | Stream endpoint rebuilds full queue and full bumpers each call |
| WTF-BB-040 | Fixed | Swarm A7 | 2026-04-28 | TV microapp / background jobs | P1 | 11 | 8 | 3 | 4 | 1 | Auto-refresh can be called concurrently from stream read-path traffic |
| WTF-BB-041 | Open | - | 2026-04-27 | TV microapp / config integrity | P1 | 10 | 10 | 3 | 3 | 2 | TV config table has no uniqueness guard on active config row |
| WTF-BB-042 | Open | - | 2026-04-27 | TV microapp / schema drift | P2 | 8 | 14 | 2 | 2 | 2 | Boot-time TV backfill applies schema-like changes without single-writer lock |
| WTF-BB-043 | Open | - | 2026-04-27 | TV microapp / refresh scale | P2 | 7 | 15 | 2 | 2 | 1 | WTF TV refresh currently sorts all wallet rows randomly |
| WTF-BB-044 | Open | - | 2026-04-27 | Data integrity / identity | P1 | 11 | 8 | 3 | 3 | 1 | W identity resolution can collapse duplicate Twitter IDs into one row |
| WTF-BB-045 | Verified | Swarm A6 | 2026-04-28 | TV microapp / config integrity | P1 | 12 | 7 | 3 | 4 | 1 | TV auto-refresh reads an arbitrary config row |
| WTF-BB-046 | Verified | Swarm A5 | 2026-04-28 | Runtime / abuse prevention | P1 | 12 | 7 | 2 | 4 | 2 | API in-memory rate limiter grows without hard cap |
| WTF-BB-047 | Verified | Swarm A5 | 2026-04-28 | Runtime / DB access path | P1 | 11 | 8 | 2 | 3 | 2 | W timeline actor cache grows without eviction |
| WTF-BB-048 | Open | - | 2026-04-27 | TV microapp / availability | P2 | 9 | 12 | 2 | 3 | 1 | TV telemetry endpoint can grow session-tracking memory under spam |
| WTF-BB-049 | Open | - | 2026-04-27 | Dependencies / supply chain | P1 | 14 | 4 | 2 | 4 | 5 | js-dos assets and fallback runtime fetch from CDN are unpinned and uncached |
| WTF-BB-050 | Open | - | 2026-04-27 | Dependencies / security | P1 | 13 | 5 | 3 | 3 | 4 | Runtime auth path still depends on deprecated/unmaintained auth packages |
| WTF-BB-051 | Open | - | 2026-04-27 | Dependencies / reproducibility | P2 | 10 | 11 | 3 | 2 | 2 | `latest` versions in package manifests create non-reproducible dependency behavior |
| WTF-BB-052 | Open | - | 2026-04-27 | Data integrity / analytics | P1 | 12 | 7 | 4 | 3 | 1 | DB health scan shows most public tables empty and top populated tables still sparse |
| WTF-BB-053 | Open | - | 2026-04-27 | TV microapp / reliability | P1 | 13 | 8 | 3 | 4 | 2 | Canonical `/tv` misses TV2 resilience paths (skip/error telemetry, skip-notice UX, session telemetry) |
| WTF-BB-054 | Open | - | 2026-04-27 | TV microapp / platform health | P1 | 12 | 6 | 3 | 3 | 3 | Dual TV implementations (`/tv` and `/tv2`) block safe, staged rollout of player behavior changes |
| WTF-BB-055 | Open | - | 2026-04-27 | TV microapp / test coverage | P2 | 10 | 13 | 3 | 3 | 1 | No automated parity checks between `/tv` and `/tv2` for stream/error-handling edge cases |
| WTF-BB-056 | Open | - | 2026-04-27 | Security / telemetry integrity | P1 | 12 | 7 | 4 | 1 | 4 | Unauthenticated client log ingestion route is exempt from API rate limiting |
| WTF-BB-057 | Open | - | 2026-04-27 | Security / command safety | P1 | 13 | 5 | 4 | 4 | 3 | Supabase backup command builder interpolates DB URL into a shell command |
| WTF-BB-058 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 10 | 2 | 3 | 2 | Shared on-boot/domain-profile caches are global maps without key eviction |
| WTF-BB-059 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 11 | 2 | 3 | 2 | Board webhook rate limiter retains per token+IP keys without TTL-based eviction |
| WTF-BB-060 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 9 | 12 | 2 | 3 | 1 | DEX cache keyspace is unbounded by request params (`counterparts`, `metrics`) |
| WTF-BB-061 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 10 | 13 | 2 | 3 | 3 | TzKT response cache stores arbitrary pagination/address combinations indefinitely |
| WTF-BB-062 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 10 | 10 | 3 | 2 | 2 | X DM cache maps never garbage-collect stale user-context keys |
| WTF-BB-063 | Fixed | Swarm A4 | 2026-04-28 | Runtime / memory hygiene | P2 | 11 | 11 | 3 | 3 | 2 | Studio user Drive caches persist by user ID with no per-process bound |
| WTF-BB-064 | Fixed | gardener session | 2026-04-27 | Kiln integration / deploy | P1 | 13 | 5 | 3 | 4 | 2 | Collection factory depended on sibling Kiln paths and local-only API defaults |
| WTF-BB-065 | Fixed | gardener session | 2026-04-27 | wtf.tez / subdomains | P1 | 12 | 7 | 3 | 4 | 1 | wtf.tez deploy/test/UI paths drifted back to hardcoded `hack.*` parent domains |
| WTF-BB-066 | Open | Codex open-mode pass | 2026-05-03 | Kiln integration / security | P1 | 14 | 4 | 2 | 3 | 5 | Public `kiln.wtfgameshow.app` proxy relies on host Kiln token configuration |
| WTF-BB-067 | Fixed | Codex Kiln 2026 pass | 2026-05-02 | Kiln integration / payable e2e | P1 | 12 | 7 | 3 | 4 | 1 | Kiln execute/e2e APIs cannot attach tez to payable Tezos calls |
| WTF-BB-068 | Open | - | 2026-05-02 | Kiln integration / Shadowbox | P1 | 13 | 5 | 4 | 4 | 1 | Shadowbox is still single-contract and cannot emulate product systems |
| WTF-BB-069 | Open | - | 2026-05-02 | Kiln integration / network metadata | P1 | 10 | 10 | 2 | 3 | 1 | Deployed Kiln may advertise stale Etherlink Ghostnet-era metadata |
| WTF-BB-070 | Open | - | 2026-05-02 | Kiln integration / runtime assertions | P1 | 12 | 7 | 4 | 3 | 1 | Kiln live E2E cannot yet verify storage, balance, and big-map assertions |
| WTF-BB-071 | Open | - | 2026-05-02 | Kiln integration / jstz adapter | P2 | 10 | 11 | 4 | 2 | 1 | jstz is only planned/configurable and has no executable Kiln adapter |
| WTF-BB-072 | Fixed | Codex Kiln 2026 pass | 2026-05-03 | Kiln integration / browser runtime | P1 | 12 | 7 | 3 | 4 | 1 | Kiln CORS allowlist blocked same-origin browser assets |
| WTF-BB-073 | Fixed | Codex Kiln 2026 pass | 2026-05-03 | Kiln integration / observability | P2 | 10 | 11 | 2 | 3 | 2 | Kiln local activity log path can spam EACCES from `/var/log/kiln` |
| WTF-BB-074 | Open | - | 2026-05-03 | Kiln integration / deploy tooling | P2 | 9 | 12 | 2 | 2 | 2 | Netlify CLI rollback path is blocked by root-owned npm cache |
| WTF-BB-075 | Open | Codex open-mode pass | 2026-05-03 | Kiln integration / public test infrastructure | P2 | 10 | 11 | 2 | 3 | 2 | Open Kiln mode exposes Shadownet puppet wallets to public callers |
| WTF-BB-076 | Fixed | Codex TV hardening pass | 2026-05-03 | TV microapp / source ownership | P1 | 13 | 8 | 3 | 4 | 2 | Canonical dial 03 WTF TV is overwritten with platform-wide mixed media instead of owner-scoped media |
| WTF-BB-077 | Fixed | Codex TV storage pass | 2026-05-03 | TV microapp / storage pipeline | P1 | 13 | 6 | 4 | 4 | 1 | TV cache still treats IPFS/external fetch as canonical and does not persist all served TV media into object storage |
| WTF-BB-078 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / runtime env | P1 | 12 | 6 | 3 | 4 | 1 | Compose deployment blanks object-storage env by overriding env-file values with empty strings |
| WTF-BB-079 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / release metadata | P2 | 8 | 14 | 2 | 3 | 0 | `server-deploy.sh` can inherit a stale `COMMIT_SHA` and mislabel the live revision |


## Issue Details

### WTF-BB-001 - Overlapping migration systems run every deploy

- Category: Deploy / DB migrations
- Status: Fixed
- Score: C4 + F5 + S2 + P0(5) = 16
- Evidence: `.github/workflows/deploy.yml` applies `drizzle/cockpit_all.sql`, then all numbered SQL files from `0015+`, then runs `docker compose exec -T app npx drizzle-kit push --force`.
- Why it matters: Multiple schema authorities can repeat work, disagree about target state, and leave the DB half-mutated while the deploy still proceeds.
- Likely correction direction: Pick one production schema path. If SQL-first, make Drizzle push a local/dev tool only. If Drizzle-first, stop replaying broad SQL bundles on every deploy.
- Verification idea: Fresh DB deploy and existing DB deploy both complete without duplicate DDL errors or Drizzle prompts.
- Swarm A1 note (2026-04-28): Deploy now starts only `postgres`, waits for `pg_isready`, applies SQL migrations before the app boots, removes the production `drizzle-kit push --force` step, and no longer installs `drizzle-kit` in the runtime image. Supporting replay guards were added to `drizzle/0031_wtf_recapture.sql` so the SQL-first path can fail closed. Local checks: `git diff --check` passed and `rg` confirmed the production deploy path no longer references `drizzle-kit push`. Still needs a real deploy run before marking `Verified`.

### WTF-BB-002 - App starts production jobs before deploy-time migrations complete

- Category: Startup / background jobs
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence: Deploy runs `docker compose up -d`, sleeps 10 seconds, then applies DB changes. `server/index.ts` starts static serving, background jobs, TV backfill, and gameshow backfill when production starts.
- Why it matters: Jobs can read/write old schema, then run again after `docker compose restart app`.
- Likely correction direction: Run migrations before app start, or start app in a migration-safe mode until schema is ready.
- Local fix note: Added `scripts/server-deploy.sh` so production deploy now builds first, ensures Postgres is healthy, stops the app, applies migrations, and only then starts the new app container. The GitHub Hetzner workflow now calls that script instead of starting the app before schema work.
- Verification: live Hetzner deploy via `bash scripts/server-deploy.sh`; production app restarted only after migration step completed, then returned healthy `/api/health`.
- Verification idea: Deploy logs show migration completion before first production app boot and background-job start.

### WTF-BB-003 - Migration failures are swallowed and deploy continues

- Category: Deploy / DB migrations
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C2 + F5 + S2 + P0(5) = 14
- Evidence: The deploy loop catches failed SQL files and prints `(migration ... failed - continuing; idempotent files should survive duplicate apply)`.
- Why it matters: The log showed failed unique-index creation and failed type creation, yet the deploy moved forward into Drizzle push.
- Likely correction direction: Fail closed on unexpected migration errors; maintain an explicit allowlist only for known no-op duplicate cases.
- Local fix note: Added `scripts/apply-production-migrations.sh`, which creates a production migration ledger and applies only previously unseen numbered SQL migrations. Any migration failure now aborts deploy before the new app starts; the old “continue anyway” loop is gone.
- Verification: live Hetzner deploy via `bash scripts/server-deploy.sh`; numbered migration bootstrap ran before app restart and the deploy would have exited on any `psql` failure.
- Verification idea: A deliberately broken migration fails the deploy before app restart.

### WTF-BB-004 - `drizzle-kit push --force` prompts in non-interactive production shell

- Category: Deploy / DB migrations
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C3 + F4 + S3 + P0(5) = 15
- Evidence: Startup log showed Drizzle asking whether to truncate `discord_identity_claims`, then failing with `Interactive prompts require a TTY terminal`.
- Why it matters: Production deploys can hang/fail after partially applying earlier SQL.
- Likely correction direction: Do not use interactive schema push in deploy. Use deterministic SQL migrations or a non-interactive migration command with explicit review.
- Local fix note: Removed `drizzle-kit push --force` from the Hetzner deploy workflow entirely. Production deploy now uses the production migration script plus tracked SQL files only.
- Verification: live Hetzner deploy completed non-interactively with no Drizzle prompt path and no runtime `drizzle-kit` invocation.
- Verification idea: CI/deploy command exits non-interactively with no prompt paths.

### WTF-BB-005 - `token_sales` duplicates make unique-index migrations impossible

- Category: Data integrity / analytics
- Status: Open
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence: Log showed duplicate keys for `uniq_sales_ophash` in both `0015_analytics_phase1.sql` and `0016_analytics_nullable_seller.sql`.
- Why it matters: The database cannot enforce the intended dedupe invariant until existing duplicates are resolved.
- Likely correction direction: Audit duplicate groups, decide canonical rows, backfill/delete/merge duplicates, then create the unique index.
- Verification idea: Duplicate-count query returns zero before index creation; index creation succeeds on production-like data.

### WTF-BB-006 - `0031_wtf_recapture.sql` is not idempotent for enum type creation

- Category: DB migrations
- Status: Open
- Score: C2 + F3 + S1 + P1(4) = 10
- Evidence: `0031_wtf_recapture.sql` uses `CREATE TYPE buyback_window_status AS ENUM (...)` without a guard; log showed `ERROR: type "buyback_window_status" already exists`.
- Why it matters: The deploy script claims every `0015+` file is idempotent, but this file aborts once the type exists.
- Likely correction direction: Use a guarded `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` pattern or split one-time type creation into a tracked migration.
- Verification idea: Running the migration twice succeeds both times.

### WTF-BB-007 - Production runtime image includes DB schema mutation tooling

- Category: Runtime / supply chain
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C2 + F3 + S3 + P1(4) = 12
- Evidence: `Dockerfile` installs production deps, then runs `npm install --no-save drizzle-kit@0.31.10` in the runtime image.
- Why it matters: The app container can mutate schema in production, increases runtime dependency surface, and makes deploy behavior depend on a tool installed outside `package-lock` intent.
- Likely correction direction: Move schema tooling into a migration image/job or CI step, not the long-lived app image.
- Local fix note: Runtime image no longer installs `drizzle-kit`; only `tsx` remains for operational scripts. Schema mutation moved out of the long-lived app container and into the deploy-time migration script.
- Verification: live Hetzner app image rebuilt and started successfully after removing `drizzle-kit` from the runtime image.
- Verification idea: Runtime image can start the app and backup scripts without `drizzle-kit` installed.

### WTF-BB-078 - Compose deployment blanks object-storage env by overriding env-file values with empty strings

- Category: Deploy / runtime env
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence: `docker-compose.yml` explicitly set `S3_*` and `GDRIVE_REMOTE` with `${VAR:-}` defaults inside the app `environment:` block. During manual deploy, the real runtime secrets lived in `/etc/wtf/wtf.env`, but compose variable interpolation happened before that env file was available to the deploy user, so the container was recreated with empty object-storage values even though the host had valid secrets.
- Why it matters: TV object storage silently disappears on deploy, sending the app back to slower external media paths and making “successful” rollouts semantically broken.
- Likely correction direction: Stop overriding runtime env-file keys with empty-string defaults, and deploy through a script that materializes a readable runtime env file for Compose when the source file is root-protected.
- Local fix note: Removed the empty-string `S3_*`, `GDRIVE_REMOTE`, and `RCLONE_CONFIG` overrides from compose, and `scripts/server-deploy.sh` now creates a temporary readable env file from `/etc/wtf/wtf.env` when needed so both compose interpolation and container `env_file` loading work during deploy.
- Verification: live Hetzner redeploy + `verifyObjectStorageAccess()` from inside the refreshed container returned `{\"ok\":true,\"bucket\":true,\"endpoint\":true}`
- Verification idea: Recreate the app container on the host and confirm in-container `process.env.S3_ENDPOINT` is populated without needing ad-hoc shell exports.

### WTF-BB-079 - `server-deploy.sh` can inherit a stale `COMMIT_SHA` and mislabel the live revision

- Category: Deploy / release metadata
- Status: Verified
- Owner/Session: Codex deploy hardening pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence: The first live run of `scripts/server-deploy.sh` built from repo head `9d30d19`, but `/api/health` still reported `commitRef: "33350da"` because the script respected an inherited host `COMMIT_SHA`.
- Why it matters: Release verification becomes untrustworthy. Operators can misdiagnose a healthy deploy as stale, or worse, trust the wrong revision while investigating production behavior.
- Likely correction direction: Always derive deploy commit metadata from `git rev-parse HEAD` after the server checkout is updated, and export that value for compose/build/runtime labeling.
- Local fix note: `scripts/server-deploy.sh` now unconditionally sets `COMMIT_SHA` from the checked-out repo head instead of allowing ambient host env to override it.
- Verification: live Hetzner redeploy after the fix; `/api/health` now reports the actual deployed commit.
- Verification idea: Compare `git rev-parse --short HEAD` on the host repo to the public/local health endpoint after each deploy.

### WTF-BB-008 - Missing `.dockerignore` likely sends `.env` into Docker build context

- Category: Build / secrets
- Status: Open
- Score: C2 + F3 + S5 + P0(5) = 15
- Evidence: No `WTF/.dockerignore` was present, while `WTF/.env` exists. Docker build output showed Vite injecting env from `.env`.
- Why it matters: Secrets can enter the build context and possibly image layers when `COPY . .` runs in the builder stage.
- Likely correction direction: Add a tight `.dockerignore`, remove secret files from build context, and audit built image history/layers if needed.
- Local fix note: Added `WTF/.dockerignore` to exclude env files, dependency folders, build outputs, local cache/upload/backup volumes, editor metadata, and test reports from Docker build context. Still needs Docker build-context verification before marking `Verified`.
- Verification idea: Docker build context excludes `.env`; build logs no longer report env injection from `.env`.

### WTF-BB-009 - Vite build loads `.env` with unsupported `NODE_ENV=production`

- Category: Build config
- Status: Open
- Score: C2 + F2 + S2 + P2(3) = 9
- Evidence: Build log warned: `NODE_ENV=production is not supported in the .env file`.
- Why it matters: Build-time and runtime environment semantics are mixed, which can lead to wrong client output or accidental secret exposure through Vite env loading.
- Likely correction direction: Keep runtime `NODE_ENV` out of `.env` files used by Vite; use Docker/compose/process env for runtime.
- Verification idea: Production build emits no Vite `NODE_ENV` warning.

### WTF-BB-010 - Entrypoint recursively `chown -R`s mounted volumes every boot

- Category: Startup performance
- Status: Fixed
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence: `docker-entrypoint.sh` loops through `/app/cache /app/uploads /app/backups` and runs `chown -R node:node` whenever the container starts as root.
- Why it matters: As uploads/cache/backups grow, restarts can become slow and unpredictable.
- Likely correction direction: Use a first-boot marker, targeted ownership checks, or volume initialization job.
- Verification idea: Restart time stays flat with large cache/uploads; ownership repair still works for legacy root-owned files.
- Swarm A1 note (2026-04-28): Added a per-volume `.node-owner-ok` marker plus a top-level owner check so the first successful repair still fixes legacy root-owned volumes, but later boots skip the recursive `chown -R` entirely. Local checks: `sh -n docker-entrypoint.sh` and `git diff --check` passed. Still needs container-level boot timing verification before marking `Verified`.

### WTF-BB-011 - Wallet/Tezos bundle chunks are huge and pull Node core externals

- Category: Frontend bundle
- Status: Open
- Score: C4 + F2 + S1 + P3(2) = 9
- Evidence: Build log showed multi-hundred-kB to multi-MB chunks and Vite warnings for browser-externalized `fs` and `crypto` from wallet UI packages.
- Why it matters: Slower loads, possible runtime breakage in wallet paths, and difficult-to-debug browser compatibility issues.
- Likely correction direction: Lazy-load wallet-heavy flows, isolate Tezos/wallet code, and verify browser paths with Playwright.
- Verification idea: Main route loads without wallet mega-chunks; wallet flows still work after lazy import.

### WTF-BB-012 - Runtime install reports deprecated auth packages and audit vulnerabilities

- Category: Dependencies / security
- Status: Open
- Score: C4 + F2 + S4 + P1(4) = 14
- Evidence: `npm ci --omit=dev` reported deprecated `passport-discord`, deprecated WalletConnect package, and `31 vulnerabilities (19 low, 11 moderate, 1 critical)` after adding `drizzle-kit`.
- Why it matters: Auth and wallet dependencies are sensitive surfaces; runtime vulnerability count also changes when deploy installs extra tooling.
- Likely correction direction: Run `npm audit --production`, classify reachable issues, replace abandoned auth packages, and avoid runtime-only dependency drift.
- Verification idea: Dependency audit has no untriaged criticals; deprecated auth package has a migration plan or replacement.

### WTF-BB-013 - Production CORS fallback reflects any origin with credentials

- Category: Security / CORS
- Status: Verified
- Owner/Session: Swarm A3
- Score: C2 + F3 + S5 + P0(5) = 15
- Evidence: `server/app.ts:120-128` returns `{ origin: true, credentials: true }` whenever no allowed origins are resolved, including production after only logging a warning.
- Why it matters: A missing `PUBLIC_SITE_URL` or allowlist converts CORS into credentialed origin reflection. That makes future cookie, SameSite, subdomain, or token-bearing API changes much easier to abuse.
- Likely correction direction: Fail closed in production when the allowlist is empty, and make local/dev permissiveness explicit.
- Local fix note: `server/app.ts` now throws during production boot when neither `PUBLIC_SITE_URL` nor `CORS_ALLOWED_ORIGINS` resolves an origin. The permissive reflected-origin fallback remains available only outside production.
- Verification:
  - `NODE_ENV=production DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres' PUBLIC_SITE_URL='' CORS_ALLOWED_ORIGINS='' npx tsx --eval "import { createApp } from './server/app.ts'; (async () => { await createApp(); console.log('UNEXPECTED_OK'); })().catch((err) => { console.error(String(err?.message || err)); process.exit(1); });"` → exited `1` with `[cors] No allowed origins resolved in production...`
  - `NODE_ENV=production DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres' PUBLIC_SITE_URL='https://wtf.example.com' CORS_ALLOWED_ORIGINS='' npx tsx --eval "import { createApp } from './server/app.ts'; (async () => { await createApp(); console.log('CREATE_APP_OK'); process.exit(0); })().catch((err) => { console.error(String(err?.message || err)); process.exit(1); });"` → exited `0` and printed `CREATE_APP_OK`
  - `npm run check` → passed
- Verification idea: Production boot without an allowed-origin config fails clearly, or cross-origin credentialed requests are rejected.

### WTF-BB-014 - Cookie-authenticated write routes have no visible CSRF token layer

- Category: Auth / CSRF
- Status: Claimed
- Owner/Session: Swarm A3
- Score: C3 + F3 + S4 + P2(3) = 13
- Evidence: `server/auth/passport.ts:39-50` uses cookie-backed sessions with `sameSite: "lax"`. A shallow scan found many authenticated `POST`/`PUT`/`PATCH`/`DELETE` routes, but no `csrf`, `csurf`, `csrfToken`, or `x-csrf` middleware/package in server/client code.
- Why it matters: SameSite=Lax is useful, but it is a policy mitigation rather than an app-level write-token check. This leaves less defense if CORS, same-site subdomains, embeds, or cookie settings change.
- Likely correction direction: Decide the intended CSRF strategy for cookie-authenticated APIs, then add token issuance/verification or document why each write surface is otherwise protected.
- Verification idea: A forged cross-site write request without a valid CSRF token is rejected while normal app writes still pass.

### WTF-BB-015 - Uploaded media files are unauthenticated and enumerable by ID

- Category: Media / access control
- Status: Fixed
- Owner/Session: Codex TV hardening pass
- Score: C3 + F3 + S4 + P1(4) = 14
- Evidence: `server/routes/media-library.ts:189-249` requires auth to upload and stores `playbackUrl = /api/media/:id/file`, but `server/routes/media-library.ts:256-310` serves that file without `isAuthenticated`, owner checks, status checks, or a signed/public-token gate.
- Why it matters: User uploads can be fetched by numeric ID, even before a user intentionally places them in a public TV/channel context. That is a privacy and access-control footgun.
- Likely correction direction: Split private library file access from public playback access, or require signed playback URLs for upload-backed media.
- Local fix note: `GET /api/media/:id/file` now requires auth and owner-or-staff access, while public TV playback for upload-backed media moved to `/api/tv/channels/:channelId/media/:mediaItemId/file` with channel-visibility checks plus an explicit channel/media association check. Both routes now serve through the shared object-storage + hot-cache helper so TV playback uses the Hetzner-backed storage path instead of leaking raw library IDs.
- Verification: `node --import tsx/esm --test server/lib/tv-policy.test.ts`; `npm run check`
- Verification idea: A logged-out request to another user's private upload ID returns 401/403, while intentional public TV playback still works.

### WTF-BB-016 - Media rate-limit bypass is broad enough to cover write-heavy endpoints

- Category: Abuse prevention / rate limits
- Status: Fixed
- Owner/Session: Codex TV hardening pass
- Score: C3 + F4 + S3 + P1(4) = 14
- Evidence: `server/app.ts:105-112` exempts `/api/tv/cache/`, `/api/tv/channels/`, `/api/tv/bumpers/`, `/api/media/`, and `/api/uploads/` from the generic `/api/` limiter via `skip: isMediaStreamRequest` at `server/app.ts:253-260`. That prefix also covers `POST /api/media/upload` at `server/routes/media-library.ts:189` and `POST /api/tv/cache/prefetch` at `server/routes/tv.ts:4430`.
- Why it matters: Playback reads need special handling, but broad prefix skips also remove the default guard from upload, cache-warming, and channel mutation paths that can consume CPU, disk, database, and network.
- Likely correction direction: Narrow the bypass to specific safe read/stream routes and add endpoint-specific limits for uploads, prefetch, and cache mutation.
- Local fix note: The generic `/api` limiter now exempts only read-only playback routes (cache proxy, stream/now/current, bumper media, and file-serving endpoints) via method-aware exact patterns instead of prefix-wide TV/media skips. Dedicated in-memory limiters were added for `/api/tv/cache/prefetch` and `/api/media/upload`.
- Verification: `npm run check`
- Verification idea: Streaming remains smooth, but repeated uploads/prefetches hit a clear endpoint-specific rate limit.

### WTF-BB-017 - Unauthenticated TV prefetch can force large public media downloads

- Category: TV cache / SSRF-DoS
- Status: Fixed
- Owner/Session: Codex TV hardening pass
- Score: C3 + F4 + S3 + P1(4) = 14
- Evidence: `server/routes/tv.ts:4430-4453` accepts unauthenticated `POST /api/tv/cache/prefetch` requests, normalizes up to 10 submitted URLs, and calls `prefetchMediaAsync`. `server/lib/network-safety.ts:21-39` allows any public host when the allowlist is empty, `.env.example:193` leaves `TV_CACHE_ALLOWED_HOSTS=` blank, and `server/routes/tv.ts:70-85` defaults the remote-file cap to 500 MB with a 25s fetch timeout.
- Why it matters: Attackers can make the server spend outbound bandwidth and disk/cache churn against arbitrary public media hosts, even if private/local hosts are blocked.
- Likely correction direction: Require auth or a signed viewer token for prefetch, set a real host allowlist for production, lower public defaults, and rate-limit this route separately.
- Local fix note: `POST /api/tv/cache/prefetch` now requires authentication and sits behind a dedicated 12-requests-per-minute limiter. The TV clients were also updated to only attempt server-side prefetch when a user session exists, so anonymous public viewers stop generating useless 401 churn against the warm-cache path.
- Verification: `npm run check`
- Verification idea: Anonymous prefetch requests are rejected or tightly capped; allowed channel playback still warms expected IPFS media.

### WTF-BB-076 - Canonical dial 03 WTF TV is overwritten with platform-wide mixed media instead of owner-scoped media

- Category: TV microapp / source ownership
- Status: Fixed
- Owner/Session: Codex TV hardening pass
- Score: C3 + F4 + S2 + P1(4) = 13
- Evidence: The post-refactor TV audit found that channel 03 (`WTF TV`) still gets rewritten by the WTF auto-refresh path with `all_users` semantics, even though the canonical dial-03 channel belongs to `paulwhoisaghost`. That makes the owner channel behave like a second platform-wide aggregate channel instead of a user-owned channel with community bumpers layered in.
- Why it matters: The channel model becomes semantically dishonest. Ownership, curation, and user expectations all drift because a named creator channel silently turns into an "everything bucket" that duplicates dial 69 `WTF Platform`.
- Likely correction direction: Keep dial 03 owner-scoped by default unless the config explicitly targets selected users or specific wallets, and route all upload-backed playback through channel-aware URLs so the public TV surface does not depend on raw library file IDs.
- Local fix note: `refreshWtfPlaylist()` now resolves its effective source scope through channel metadata. The canonical dial-03 / `paulwhoisaghost` / `paulwhoisaghost-wtf-tv` channel falls back from `all_users` to `selected_users=[owner]` unless the config explicitly selects users or wallets, while non-canonical WTF refresh channels keep their configured scope.
- Verification: `node --import tsx/esm --test server/lib/tv-policy.test.ts`; `npm run check`
- Verification idea: A default `all_users` refresh on the canonical dial-03 channel resolves to `selected_users=[owner]`, while non-canonical WTF refresh channels keep their configured scope.

### WTF-BB-077 - TV cache still treats IPFS/external fetch as canonical and does not persist all served TV media into object storage

- Category: TV microapp / storage pipeline
- Status: Fixed
- Owner/Session: Codex TV storage pass
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence: The pre-pass TV cache in `server/routes/tv.ts` only persisted fetched token media to the local cache volume. A cold local miss always fell back to public IPFS/external fetch instead of promoting from object storage, and warm cache hits did not backfill the object store at all. That meant the system still treated IPFS as the real source of truth for most TV playback.
- Why it matters: Every cache eviction, redeploy, or cold host boot could throw the app back onto the slowest, least predictable pipeline. The whole point of the attached volume + Hetzner object storage setup is to make IPFS a source-ingest rail, not the viewer delivery rail.
- Likely correction direction: Mirror all TV cache fills into object storage, promote local cache misses from object storage before touching IPFS, and let warm sweeps backfill the object store from existing local cache.
- Local fix note: Added deterministic TV cache object keys under `tv-cache/v1`, mirror-on-fill for cached TV media, promotion from object storage on local cache miss, and background backfill from warm local cache hits. The serving order is now volume first, object storage second, IPFS/external host last. Upload-backed TV media continues to use its own object-storage + hot-cache path through the channel-aware file route.
- Verification: `npm run check`; `node --import tsx/esm --test server/lib/tv-policy.test.ts`
- Verification idea: On a host with S3 env configured, evict a local TV cache entry but leave the mirrored object in place; the next TV request should log an object-storage promotion/hit path instead of a fresh IPFS gateway miss.

### WTF-BB-018 - Studio preview ffmpeg jobs run inline without timeout or concurrency guard

- Category: Studio / media processing
- Status: Fixed
- Owner/Session: Swarm A4
- Score: C4 + F3 + S3 + P1(4) = 14
- Evidence: `server/routes/studio-files.ts:184-285` handles uploads in the request path and awaits `generatePreview`. `server/lib/studio/preview/pipeline.ts:158-185` spawns `ffmpeg`/`ffprobe` without an explicit timeout or kill path, and video/audio preview calls at `server/lib/studio/preview/pipeline.ts:294-326` and `359+` process user-provided media buffers inline.
- Why it matters: A malformed or expensive upload can tie up Node request handling and external processes. Auth and upload caps reduce exposure, but there is no obvious worker queue, global concurrency cap, or process timeout around the heavy preview stage.
- Likely correction direction: Move preview generation to a bounded worker queue, add ffmpeg/ffprobe timeouts, and return upload success before derivative generation when practical.
- Local fix note: Added bounded in-process preview slots plus explicit `ffmpeg`/`ffprobe` kill timeouts in `server/lib/studio/preview/pipeline.ts` so heavy preview jobs fail closed instead of hanging indefinitely.
- Verification: `npm run check`
- Verification idea: A slow/corrupt media file cannot keep an ffmpeg process alive past the timeout and does not block unrelated Studio requests.

### WTF-BB-019 - OAuth and Studio secret encryption fall back to `SESSION_SECRET`

- Category: Secrets / key management
- Status: Open
- Owner/Session: -
- Score: C3 + F2 + S4 + P1(4) = 13
- Evidence: `server/auth/oauth-crypto.ts:8-22` uses `SESSION_SECRET` when `TWITTER_TOKEN_ENCRYPTION_KEY` is missing. `server/lib/studio/crypto.ts:35-50` uses `SESSION_SECRET` when `STUDIO_CRYPTO_KEY` is missing.
- Why it matters: Session signing, Twitter OAuth token encryption, and Studio credential encryption can collapse onto one secret. That couples rotation plans and widens blast radius if one secret leaks or must be rotated quickly.
- Likely correction direction: Require dedicated encryption keys in production, add startup diagnostics, and document a rotation/backfill path for already encrypted payloads.
- Verification idea: Production boot fails or marks integrations unavailable when dedicated encryption keys are missing; session rotation does not invalidate encrypted OAuth/Studio secrets.

### WTF-BB-020 - Supabase migration and connection scripts disable TLS certificate verification

- Category: DB connectivity / TLS
- Status: Fixed
- Owner/Session: Swarm A3
- Score: C2 + F2 + S5 + P1(4) = 13
- Evidence: `scripts/db-push.mjs` rewrites Supabase URLs with `sslmode=no-verify`, `scripts/run-boot-backfill.ts` defaults to `&sslmode=no-verify`, and `scripts/check-db-connection.mjs` creates a Supabase `Client` with `ssl: { rejectUnauthorized: false }`.
- Why it matters: Disabling certificate verification in DB connection paths allows active network interception of credentials and query traffic if the transport layer is compromised.
- Likely correction direction: Remove forced SSL overrides, require TLS verification by default, and gate exceptions behind an explicit, auditable emergency flag with environment-based allowlisting.
- Local fix note: `scripts/db-push.mjs` and `scripts/run-boot-backfill.ts` now default Supabase URLs to `sslmode=require`, while `scripts/check-db-connection.mjs` verifies certificates by default. The only remaining downgrade path is `ALLOW_INSECURE_DB_TLS=1`, which logs a warning when used.
- Verification:
  - `rg -n "sslmode=no-verify|rejectUnauthorized:\\s*false|ALLOW_INSECURE_DB_TLS|sslmode=require" scripts/db-push.mjs scripts/run-boot-backfill.ts scripts/check-db-connection.mjs` → default URL builders now emit `sslmode=require`; remaining `no-verify` references are warning text tied to `ALLOW_INSECURE_DB_TLS=1`
  - `node --check scripts/db-push.mjs` → passed
  - `node --check scripts/check-db-connection.mjs` → passed
  - `npm run check` → passed
- Verification idea: Connection helpers fail when presented with an invalid certificate in staging; production scripts connect only with verified TLS and log verification policy.

### WTF-BB-021 - Backup upload path keeps full pg_dump output in memory

- Category: Backup / reliability
- Status: Fixed
- Owner/Session: Swarm A8
- Score: C3 + F3 + S2 + P2(3) = 11
- Evidence: `server/lib/supabase-backup.ts` reads entire backup file content via `fs.readFile(localPath)` and stores it in a `Buffer` before calling `uploadFile`.
- Why it matters: Large databases can cause high memory pressure or OOM kills during backup jobs, especially in limited-memory containers, which is an uptime and data-recovery risk.
- Likely correction direction: Stream backup uploads directly to the destination (S3/GCS/Supabase storage upload stream or multipart upload), avoiding full-buffer materialization.
- Verification idea: Run a large synthetic dump locally and observe stable memory profile versus file size while backup uploads still complete.
- Local fix note: Replaced the buffered TUS PATCH body with `createReadStream(localPath)`, preserving the existing resumable upload flow while removing the full-file heap allocation.
- Verification:
  - `npm run check` -> passed on 2026-04-28.
  - `git diff --check` -> passed on 2026-04-28.

### WTF-BB-022 - Backfill pipeline defaults to `us-west-2` when Supabase region is missing

- Category: Deploy / DB operations
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + P2(3) + S1 = 9
- Evidence: `scripts/run-boot-backfill.ts` resolves region as `process.env.SUPABASE_REGION || "us-west-2"` and builds `aws-1-${region}.pooler.supabase.com`, coupled with forced no-verify SSL mode.
- Why it matters: In non-western environments this can target the wrong pooler endpoint, causing failed backfill runs, partial state updates, or accidental connect-to-wrong-region behavior during ops.
- Likely correction direction: Fail fast if region is required and absent, and pin the exact production connection target via validated environment configuration.
- Verification idea: Remove `SUPABASE_REGION` in a non-`us-west-2` test setup and verify the script refuses to run rather than connecting to an unintended host.

### WTF-BB-023 - Add host-level heartbeat and native repo doctor backfill worker

- Category: Operations / workers
- Status: In Progress
- Owner/Session: -
- Score: C3 + F3 + S2 + P1(4) = 12
- Evidence: Existing periodic logic is in-process (`server/lib/scheduler.ts`) and requires the WTF app process to be running; no host-level scheduler definitions were found in the repo (`systemd`, `cron`, or host timer configuration).
- Why it matters: Missing/empty DB fields in active tables (`users`, `backfill_manifest`, `sync_runs`, `system_event_logs`) can only be repaired if workers can wake independently and run when app runtime is not healthy.
- Likely correction direction: Implement a dedicated Hetzner-host heartbeat (`systemd` timer + one-shot service) that:
  - runs outside Docker compose,
  - acquires a DB advisory lock,
  - executes bounded repo-doctor backfill passes,
  - records success/fail telemetry, and
  - exposes a manual wake-up command for ops.
- Progress update:
  - Plan drafted in `WTF/REPO_DOCTOR_HEARTBEAT_PLAN.md`.
  - Next step: deploy and enable `repo-doctor-heartbeat.timer` on Hetzner host (no code changes in repo required).
- Verification idea:
  - Create and persist the install plan in `WTF/REPO_DOCTOR_HEARTBEAT_PLAN.md`.
  - Validate `systemctl` starts, stops, and auto-restarts independent of the app container.
  - Confirm no overlapping worker runs via advisory lock and dedupe logging in run records.

### WTF-BB-024 - Backfill skip statuses can be overwritten as completed

- Category: Data integrity / workers
- Status: Fixed
- Owner/Session: Swarm A2
- Score: C3 + F3 + S1 + P2(3) = 9
- Evidence:
  - `server/lib/backfill-dispatcher.ts:111-117` always calls `complete(mine.id)` after handler returns.
  - `server/lib/backfill-manifest.ts:177-187` sets status to `completed` with no current-state condition.
- Why it matters:
  - A row marked `skipped` by a handler can become `completed`, erasing terminal failure state and making skip accounting unreliable.
  - That weakens observability and can hide unrecoverable data gaps until manual audit.
- Likely correction direction:
  - Make completion conditional on current row status, or persist handler outcome in dispatcher state.
- Verification idea:
  - Inject a test handler that calls `skip(...)` then returns normally and verify persisted state remains `skipped`.
- Fix note:
  - `complete()` now updates only rows still in `in_progress` and returns whether it actually transitioned the row; the dispatcher counts a false return as `skipped` instead of `ok`.
- Verification:
  - `./node_modules/.bin/tsc --noEmit --pretty false` exited `0` on 2026-04-28 after the manifest/dispatcher change.

### WTF-BB-025 - Route-level Tezos fetches bypass shared upstream rate-limit control

- Category: API / reliability
- Status: Open
- Owner/Session: -
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - `server/routes/contract-activity.ts:135-139` defines local `fetchJson` using raw `fetch`.
  - `server/routes/barter.ts:191-214` and `server/routes/marketplace.ts:226-231` use local raw fetch wrappers.
  - `server/routes/operator-wallet.ts:742-747` directly fetches `/operations/${opHash}` from TzKT.
  - `server/routes/w.ts:250-260` hardcodes `https://api.tzkt.io/v1/tokens?...`.
- Why it matters:
  - Requests bypass `server/lib/upstream.ts`, so quota coordination and retry policy are fragmented.
  - Mixed inline reads and backfill paths can increase 429 pressure and create inconsistent data availability under load.
- Likely correction direction:
  - Replace route-level ad-hoc fetches with shared `upstream.ts` clients for TzKT/Objkt and reuse configured base URLs.
- Verification idea:
  - Replay mixed backfill + read traffic and confirm upstream request rates and retry paths are now centralized.

### WTF-BB-026 - Profile and metadata fetchers duplicate hardcoded upstream paths

- Category: API / reliability
- Status: Open
- Owner/Session: -
- Score: C3 + F2 + S1 + P2(3) = 10
- Evidence:
  - `server/tzprofiles.ts:1-3`, `:8-10`, `:41-47` use hardcoded endpoints and raw `fetch`.
  - `server/lib/contract-metadata-sync.ts:63-75` and `server/lib/tzkt-ops.ts:33-38` duplicate raw fetch flows.
  - `server/lib/operator-wallet-balances.ts:24-27` and other files keep local TZKT constants, causing config drift.
- Why it matters:
  - Different code paths now have independent fetch behavior and observability.
  - It increases API drift risk and makes chain/network migration harder.
- Likely correction direction:
  - Move these readers onto shared upstream clients and centralized endpoint config.
- Verification idea:
  - In staging, override `TZKT_API_URL` and verify these paths hit the overridden host with shared timeout/retry behavior.

### WTF-BB-027 - External marketplace listing backfill returns empty by default

- Category: Marketplace / data pipeline
- Status: Open
- Owner/Session: -
- Score: C2 + F4 + S1 + P2(3) = 10
- Evidence:
  - `server/lib/external-listings.ts:49-67` stubs both Teia and Objkt fetchers with `return []`.
  - `server/lib/external-listings.ts:6-9` marks the module as currently disabled by default.
  - `server/lib/background-jobs.ts` does not register the external listings job during startup.
- Why it matters:
  - Listing state from external marketplaces is not imported, so marketplace history and liquidity context is incomplete.
- Likely correction direction:
  - Implement both fetchers and register scheduler wiring behind explicit feature flags.
- Verification idea:
  - After enabling, run a dry-run on known wallets and check `collection_items` for non-empty expected listing snapshots.

### WTF-BB-028 - Seeder `LIMIT` queries have no deterministic order

- Category: Data quality / pipeline
- Status: Fixed
- Owner/Session: Swarm A2
- Score: C3 + F3 + S1 + P2(3) = 10
- Evidence:
  - `server/lib/backfill-seeders.ts:132`, `201`, `286`, `345`, `388`, and `493` apply `LIMIT` without explicit `ORDER BY`.
- Why it matters:
  - Under stable SQL semantics, these queries can return arbitrary rows between runs, causing uneven backlog drainage.
  - Some critical rows can be delayed while other rows are repeatedly reprocessed.
- Likely correction direction:
  - Add deterministic `ORDER BY` on freshness/priority/id and checkpoint pagination for large candidate windows.
- Verification idea:
- Run repeated seeder passes on fixed sample data and confirm stable candidate ordering/coverage metrics.
- Fix note:
  - Added explicit deterministic ordering ahead of every bounded seeder `LIMIT`, using stable task-specific keys (`priority`, freshness timestamps, `id`, wallet/token/address identifiers).
- Verification:
  - `./node_modules/.bin/tsc --noEmit --pretty false` exited `0` on 2026-04-28 after the seeder query changes.

### WTF-BB-029 - `/api/w/timeline` loads all verified users before paging or cursoring

- Category: Data quality / scalability
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence: `server/routes/w.ts:2564-2579` queries all rows with verified Twitter IDs from `users` with no `ORDER BY` and no `LIMIT`/`OFFSET`. The result is converted to `accounts`, then every matching user is iterated synchronously at `server/routes/w.ts:2652-2660`.
- Why it matters:
  - As the user table grows, a single request can build arbitrarily large in-memory account/timeline payloads before any caching, causing latency spikes and potential memory pressure.
  - API consumers can trigger repeated expensive fetches simply by hitting one endpoint.
- Likely correction direction:
  - Add pagination or a cursor for users participating in W timeline, or move W timeline to a precomputed table/cache with staleness policy.
- Verification idea:
  - Seed 100k verified Twitter users and observe request time/memory before/after introducing page or prefetch job.

### WTF-BB-030 - `platform_settings` updates are prone to lost updates across concurrent actors

- Category: Data integrity / config
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S2 + P1(4) = 12
- Evidence: `server/routes/w.ts:1075-1083` inserts or upserts `platform_settings`, and `server/routes/w.ts:1084-1090` replaces whole row values whenever called, with no version/lock check.
- Why it matters:
  - Multiple admins/processes writing `w.gameshow_dm_conversation_id(s)` can overwrite each other nondeterministically.
  - Operational config becomes lossy because no write ordering or intent logging is captured for this single global key.
- Likely correction direction:
  - Add optimistic concurrency control (`updatedAt` check or revision token) and event/audit logging before updates.
- Verification idea:
  - Simulate two writes in parallel and verify one does not silently clobber the other without explicit resolution.

### WTF-BB-031 - DM conversation resolution hides DB state when setting missing/invalid

- Category: Config reliability
- Status: Open
- Owner/Session: -
- Score: C2 + F2 + S3 + P3(2) = 9
- Evidence: `server/routes/w.ts:1108-1114` loads the DB setting first and falls back to env/default even when DB is unset, and the same path is used by admin and runtime reads.
- Why it matters:
  - Operators lose observability into whether DM config is truly stored in DB versus only env-backed fallback.
  - In rollback/incidents, the app can continue using env default while DB rows appear empty, making root-cause recovery slower and riskier.
- Likely correction direction:
  - Split precedence into explicit modes (`db_preferred`, `env_override`), and surface DB-vs-env source in `/api/w/admin/groupchat` and diagnostics.
- Verification idea:
  - Remove DB row and clear env in controlled tests; expect clear "unconfigured" signal instead of silent fallback.

### WTF-BB-032 - Unowned media IDs are accepted for W post/DM flows

- Category: Data safety / input validation
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence:
  - `/api/w/post` only checks `mediaIds` format (`isDigits`) and sends raw IDs to X at `server/routes/w.ts:1615-1617` and `1630-1637`.
  - `/api/w/groupchat/messages`, `/api/w/user-dms/direct`, and `/api/w/direct-messages` do the same for `mediaId` validation at `server/routes/w.ts:2196`, `2447`, and `2518`.
- Why it matters:
  - There is no DB or auth-based correlation between the logged-in WTF user and the `mediaId` in payload.
  - Malicious clients can inject arbitrary numeric media IDs, which increases abuse surface and complicates audit assumptions around media provenance.
- Likely correction direction:
  - Track uploaded media ownership in DB and validate IDs against the caller before attaching to platform requests.
- Verification idea:
  - Add a rejected test where user A submits a valid-known media ID not owned by user A.

### WTF-BB-033 - Unbounded `platform_settings` value payload allows oversized conversation lists

- Category: Data integrity / ops
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 10
- Evidence: `server/routes/w.ts:1075-1083` writes caller-supplied JSON string directly to `platform_settings.value`; `parseConversationIds` (1094-1105) accepts arbitrary arrays/strings and trims only by ID format.
- Why it matters:
  - A bug or compromised admin session could write an unbounded array/garbage to `platform_settings`, affecting startup and endpoint behavior that depends on DM configuration.
  - Without row-level constraints, malformed payloads become a DB-sized resilience risk.
- Likely correction direction:
  - Enforce length/element-count caps on setter + strict JSON schema for this setting, plus validation before persistence.
- Verification idea:
  - Attempt to write oversized/invalid payloads and verify endpoint rejects with deterministic 4xx, not silently accepting.

### WTF-BB-034 - X token refresh updates users table without serialization

- Category: Data integrity / auth lifecycle
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S3 + P1(4) = 10
- Evidence: `server/lib/x-oauth2.ts:143-154` updates `users` fields after token refresh in a plain update statement; there is no row lock, no optimistic version check, and no retry-safe wrapper.
- Why it matters:
  - Concurrent `/api/w` requests for the same user near token expiry can race and update tokens out-of-order.
  - A stale completion can persist and mask refresh failures, creating intermittent auth failures that are hard to reproduce.
- Likely correction direction:
  - Introduce an advisory lock or compare-and-swap (`updatedAt`/token version) around refresh/write operations.
- Verification idea:
  - Fire parallel endpoints that all trigger refresh and verify one refresh path is authoritative and stable final token state is consistent.

### WTF-BB-035 - TV channel list and detail payloads load unbounded rows

- Category: TV microapp / pagination
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S2 + P2(3) = 10
- Evidence:
  - `server/routes/tv.ts:2718-2765` fetches all channels with joins and no hard `LIMIT`.
  - `server/routes/tv.ts:2803-2832` returns all videos and playlists for a channel without any page cap.
- Why it matters:
  - As TV content grows, single requests become heavier, increase memory/time per request, and can time out under load.
  - The endpoint can return very large JSON payloads, increasing mobile and low-bandwidth client strain.
- Likely correction direction:
  - Add explicit pagination/cursor strategy on both listing and detail routes and cap nested include payload sizes.
- Verification idea:
  - Simulate large synthetic TV data and confirm response time and payload size stay bounded under expected SLAs.

### WTF-BB-036 - Channel-video insert path is non-atomic with concurrent requests

- Category: TV microapp / data integrity
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence:
  - `server/routes/tv.ts:3350-3373` performs select+insert logic to dedupe by `(channel_id,video_id)` before write.
  - `server/routes/tv.ts:3377-3415` returns success and writes without `ON CONFLICT` or transaction boundaries.
- Why it matters:
  - Two racey requests can both pass checks and create duplicate/overlapping channel-videos states or violate expectations under high concurrency.
  - Retry storms can amplify DB load and create idempotency bugs in client UX.
- Likely correction direction:
  - Use a single `INSERT ... ON CONFLICT` statement or explicit transaction with unique constraints for deterministic upsert behavior.
- Verification idea:
  - Parallel POSTs for same video/channel produce one canonical row and one idempotent no-op response.

### WTF-BB-037 - Playlist-item replace can lose existing queue on partial failure

- Category: TV microapp / data integrity
- Status: Fixed
- Owner/Session: Swarm A6
- Score: C3 + F3 + S2 + P2(3) = 9
- Evidence:
  - `server/routes/tv.ts:3760-3797` deletes all playlist items then inserts requested items in sequence.
  - `server/routes/tv.ts:3774-3797` writes multiple inserts with no transaction and no all-or-nothing rollback.
- Why it matters:
  - A failure after partial insert can leave a playlist with missing or partially written items.
  - Admin edits to critical playback queues can silently become corrupt.
- Likely correction direction:
  - Wrap replace flow in a transaction (`DELETE` + batch insert together) and keep a backup of previous item ordering for rollback.
- Verification idea:
  - Simulate failure in middle of insert and confirm playlist either fully old-state or fully new-state remains.
- Local fix note:
  - Wrapped the playlist replace path in `server/routes/tv.ts` in a single DB transaction so `DELETE` and replacement `INSERT` succeed or fail together.
  - Verification: `npm run check`.

### WTF-BB-038 - Active playlist flips can race and violate channel state assumptions

- Category: TV microapp / data integrity
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S3 + P1(4) = 11
- Evidence:
  - `server/routes/tv.ts:3655-3670` updates all other playlists to inactive then inserts/updates a new one.
- Why it matters:
  - Concurrent edits can interleave and leave no active playlist or multiple active rows depending on timing.
  - Stream and UI logic expecting one active playlist can behave unpredictably.
- Likely correction direction:
  - Add DB-level unique partial index/constraint for active playlist per channel or enforce atomic transaction + lock around activation.
- Verification idea:
  - Fire concurrent playlist updates and verify invariant: at most one active playlist per channel.

### WTF-BB-039 - Stream endpoint rebuilds full queue and full bumpers each call

- Category: TV microapp / stream performance
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S4 + P1(4) = 12
- Evidence:
  - `server/routes/tv.ts:3969-4001` loads all playlist rows and `server/routes/tv.ts:4017-4023` loads all bumpers every request.
  - `server/routes/tv.ts:4090-4110` performs shuffle/assembly in process memory each call.
- Why it matters:
  - High-traffic stream reads can repeatedly burn CPU and memory, creating latency spikes and potential request amplification.
  - Stream endpoint can become a reliability bottleneck during events or spikes in viewership.
- Likely correction direction:
  - Add indexed precomputed queue materialization and cache keyed by playlist revision, with bounded reshuffle windows.
- Verification idea:
  - Benchmark repeated stream calls before/after and compare 95th percentile latency and memory profile.

### WTF-BB-040 - Auto-refresh can be called concurrently from stream read-path traffic

- Category: TV microapp / background jobs
- Status: Fixed
- Owner/Session: Swarm A7
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence:
  - `server/routes/tv.ts:4931-4946` has auto-refresh logic with no explicit advisory locking.
- Why it matters:
  - Concurrent stream hits can fan-out into overlapping refresh jobs, duplicating upstream work and causing stampedes.
  - Multiple concurrent workers can mutate refresh metadata out-of-order.
- Likely correction direction:
  - Add single-flight locks (`pg_try_advisory_lock`/leader election) and idempotency keys around auto-refresh operations.
- Verification idea:
  - Burst concurrent stream requests and verify only one refresh run is active at a time.
- Swarm A7 note (2026-04-28): Added a per-channel Postgres advisory lock around the due-refresh path plus an inside-the-lock re-read of `lastRefreshedAt` so concurrent stream hits collapse onto one refresh winner and losers observe the fresh timestamp instead of rerunning immediately. Local checks: `npm run check` passed and `rg -n "pg_try_advisory_lock|withTvWtfRefreshLock|maybeAutoRefreshWtfChannel" server/routes/tv.ts` confirmed the lock + freshness recheck on the stream-triggered path. Still needs a live concurrent request burst against a running app/DB before marking `Verified`.

### WTF-BB-041 - TV config table has no uniqueness guard on active config row

- Category: TV microapp / config integrity
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S2 + P1(4) = 10
- Evidence:
  - `shared/schema.ts:2100-2116` defines `tvWtfChannelConfig.channelId` nullable and without uniqueness constraints.
- Why it matters:
  - Multiple active rows can exist, while app reads `LIMIT 1`, creating nondeterministic config behavior.
  - Hard to debug behavior changes during admin edits or migrations.
- Likely correction direction:
  - Enforce uniqueness by channel and create explicit precedence/versioning rules (or a single-row config table model).
- Verification idea:
  - Attempt inserting duplicate active config rows and verify DB rejects inconsistent state.

### WTF-BB-042 - Boot-time TV backfill applies schema-like changes without single-writer lock

- Category: TV microapp / schema drift
- Status: Open
- Owner/Session: -
- Score: C2 + F2 + S2 + P2(3) = 8
- Evidence:
  - `server/lib/tv-boot-backfill.ts:64-117` runs DDL-like/seed actions as part of startup.
  - `server/index.ts:64-66` imports and executes this during app init, including when multiple app instances boot.
- Why it matters:
  - Concurrent starts can race schema/data bootstrap logic and produce partial or duplicate boot changes.
  - Increases deployment fragility where rolling restarts can trip each other.
- Likely correction direction:
  - Move bootstrap actions behind single-instance lock + explicit run-state table and make startup idempotent.
- Verification idea:
  - Parallel startup simulation (2-3 instances) shows only one active writer and clean completion in all instances.

### WTF-BB-043 - WTF TV refresh currently sorts all wallet rows randomly

- Category: TV microapp / refresh scale
- Status: Open
- Owner/Session: -
- Score: C2 + F2 + S1 + P3(2) = 7
- Evidence:
  - `server/routes/tv.ts:4777-4780` includes a wallet candidate query with `ORDER BY RANDOM()`.
- Why it matters:
  - `ORDER BY RANDOM()` scales poorly and can become expensive for large wallet tables.
  - Refresh loops can become slower and less deterministic as dataset size increases.
- Likely correction direction:
  - Replace random sort with cursor/priority strategy or reservoir sampling via indexed state and deterministic batching.
- Verification idea:
  - Compare refresh wall-time on production-like wallet counts and verify coverage remains stable across runs.

### WTF-BB-044 - W identity resolution can collapse duplicate Twitter IDs into one row

- Category: Data integrity / identity
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S1 + P1(4) = 11
- Evidence:
  - `shared/schema.ts:234` defines `users.twitterId` without a uniqueness constraint.
  - `server/routes/w.ts:1390-1410` stores users in a `Map` keyed by `twitterId`.
- Why it matters:
  - Any duplicate `twitterId` rows (or merge drift over time) will be overwritten in-memory.
  - Conversation filtering can map the wrong internal user and return incorrect W users or deny valid peers.
- Likely correction direction:
  - Enforce identity uniqueness in schema (e.g. partial unique over verified+connected users), and resolve conversations by `users.id` when possible.
- Verification idea:
  - Add duplicate-twitter fixture rows and verify route responses are deterministic or reject duplicates.

### WTF-BB-045 - TV auto-refresh reads an arbitrary config row

- Category: TV microapp / config integrity
- Status: Verified
- Owner/Session: Swarm A6
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - `server/routes/tv.ts:4776-4780` selects `tvWtfChannelConfig` with `limit(1)` and no `channelId`/ordering predicate.
  - `shared/schema.ts:2100` makes `tv_wtf_channel_config.channel_id` nullable and unique constraints are absent.
- Why it matters:
  - Refresh behavior depends on unspecified row order when multiple config rows exist.
  - This can refresh the wrong channel or ignore the intended active config during admin operations.
- Likely correction direction:
  - Enforce one active config per channel and make refresh target a deterministic config path.
  - Add explicit ordering or filter by explicit channel/active state before selecting config.
- Verification idea:
  - Seed multiple config rows and verify refresh picks deterministic, expected config and logs mismatch when multiple active rows exist.
- Local fix note:
  - Added `server/lib/tv-wtf-config.ts` to deterministically prefer rows with a real `channel_id`, then enabled rows, then the newest update/highest id.
  - Swapped WTF TV config selection in `server/routes/tv.ts`, `server/routes/admin.ts`, and `server/lib/tv-boot-backfill.ts` off the bare `LIMIT 1` path.
  - Verification: `node --import tsx --test server/lib/tv-wtf-config.test.ts` and `npm run check`.

### WTF-BB-046 - API in-memory rate limiter grows without hard cap

- Category: Runtime / abuse prevention
- Status: Verified
- Owner/Session: Swarm A5
- Score: C2 + F4 + S2 + P1(4) = 12
- Evidence:
  - `server/app.ts:62-65` stores limiter hits in the process-local `hits` `Map`.
  - `createInMemoryRateLimit` trims timestamps but never deletes keys from `hits`, so each distinct source that gets at least one request stays resident.
- `server/app.ts:253-260` wires the limiter directly into public `/api/*` routes, so key count grows with traffic.
- Why it matters:
  - A busy or hostile fleet can produce an unbounded key set and steadily increase memory usage.
  - Memory pressure on the API worker can lead to latency spikes or process restarts before upstream rate controls can protect anything.
- Likely correction direction:
  - Add bounded key retention (LRU/TTL + max entry cap) and periodic key cleanup.
  - Consider moving rate-limit state to shared middleware backing store for multi-instance deployments.
- Fix note: Moved the limiter into `server/lib/in-memory-rate-limit.ts` with periodic stale-key sweeps plus a hard max tracked-key cap before `/api/*` requests add more state.
- Verification note: `node --test --import tsx server/lib/in-memory-rate-limit.test.ts server/lib/bounded-expiring-cache.test.ts` -> 6/6 pass; `npm run check` -> exit 0.
- Verification idea:
  - Simulate high-churn source keys over time and verify `hits` map growth is bounded.

### WTF-BB-047 - W timeline actor cache grows without eviction

- Category: Runtime / DB access path
- Status: Verified
- Owner/Session: Swarm A5
- Score: C2 + F3 + S2 + P1(4) = 11
- Evidence:
  - `server/routes/w.ts:62` creates `xUserIdCache` as a global `Map` with no size cap.
  - `server/routes/w.ts:793-809` writes `xUserIdCache` entries keyed by `user.id + accessToken` snippet whenever resolution misses cache.
  - Expired entries are only checked, not deleted (`server/routes/w.ts:794-808`), so stale keys accumulate.
- Why it matters:
  - Large authenticated-user traffic can leak memory over time and increase GC pressure on the server process.
  - As the cache grows, this path may become less predictable under peak load when timeline actions need token lookups.
- Likely correction direction:
  - Add max-size / TTL-based eviction in the cache and periodic cleanup of stale entries.
  - Keep only short-lived identity hints and rely on DB/HTTP token introspection for long-tail users.
- Fix note: Replaced the raw `xUserIdCache` map with `server/lib/bounded-expiring-cache.ts`, so cached actor IDs now expire, sweep stale keys, and cap retained cardinality.
- Verification note: `node --test --import tsx server/lib/in-memory-rate-limit.test.ts server/lib/bounded-expiring-cache.test.ts` -> 6/6 pass; `npm run check` -> exit 0.
- Verification idea:
  - Repeatedly resolve many actor users and verify `xUserIdCache` cardinality stabilizes instead of linearly growing.

### WTF-BB-048 - TV telemetry endpoint can grow session-tracking memory under spam

- Category: TV microapp / availability
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence:
  - `server/routes/tv.ts:2645-2671` accepts unauthenticated `POST /api/tv/telemetry/item-end` with arbitrary `sessionId`.
  - `server/routes/tv.ts:2570-2577` stores distinct error session IDs in a `Set` per video/bumper bucket.
  - Buckets remain alive for recent activity, with only time-based pruning (`server/routes/tv.ts:2591-2599`), so session sets can expand under churn.
- Why it matters:
  - A malicious client can fill sets with synthetic session IDs while keeping activity fresh.
  - This can inflate process memory and distort blackout logic (blacklisting after limited distinct errors).
- Likely correction direction:
  - Add route-level auth/rate limiting and per-bucket cap on unique `erroredSessionIds`.
  - Add periodic hard cap/reaping for telemetry maps and consider bounded cardinality for session identifiers.
- Verification idea:
  - Replay flood traffic with varied `sessionId`s and verify memory and queue-blacklist behavior remain bounded.

### WTF-BB-049 - js-dos assets and fallback runtime fetch from CDN are unpinned and uncached

- Category: Dependencies / supply chain
- Status: Open
- Owner/Session: -
- Score: C2 + F4 + S5 + P1(4) = 14
- Evidence:
  - `WTF/scripts/install-games.mjs:65-86` defines `JSDOS_ASSETS` with hardcoded `https://v8.js-dos.com/latest/...` URLs.
  - The same file downloads each asset with `fetch(asset.url)` and no checksum/integrity validation.
  - The script comments explicitly describe those fetches as “no external runtime dependencies after the initial download.”
- Why it matters:
  - Any compromise of that CDN path (or upstream tampering/misconfiguration) can inject unreviewed JS/WASM into all game installs.
  - `latest` paths can silently move forward, so installs are not reproducible in time.
- Likely correction direction:
  - Pin js-dos assets to immutable versioned URLs and verify integrity before writing files.
  - Preload these versioned assets into repo artifacts or a private cache/CDN under repo governance.
  - Add an allowlist/checksum file and automate updates through PRs rather than live fetch at install time.
- Verification idea:
  - Force a mocked CDN response and confirm install fails closed.
  - Re-run install twice with same lockfile and confirm zero diffs in `public/games/_vendor/js-dos`.

### WTF-BB-050 - Runtime auth path still depends on deprecated/unmaintained auth packages

- Category: Dependencies / security
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S4 + P1(4) = 13
- Evidence:
  - `WTF/package.json:57` includes `passport-discord` and `passport-github2`.
  - `WTF/package-lock.json` marks `node_modules/passport-discord` as “no longer maintained.”
  - `WTF/package-lock.json:5690` shows `passport-twitter` pulling `xtraverse`, and `passport-twitter` is still part of auth runtime route coverage.
- Why it matters:
  - Unmaintained packages and older OAuth adapter stacks increase long-tail security and breakage risk for login/sign-in.
  - This stack also increases review complexity because of fragile transitive XML parser/auth dependencies.
- Likely correction direction:
  - Replace deprecated/discontinued adapters with maintained equivalents and cut unused legacy auth providers where possible.
  - Re-run dependency audit/fix and add auth integration smoke tests for each provider in a pre-release lane.
- Verification idea:
  - Run `npm audit --omit=dev --audit-level=high` and confirm deprecated/auth-adjacent findings are removed or justified.

### WTF-BB-051 - `latest` versions in package manifests create non-reproducible dependency behavior

- Category: Dependencies / reproducibility
- Status: Open
- Owner/Session: -
- Score: C3 + F2 + S2 + P2(3) = 10
- Evidence:
  - `collekt-wtf/package.json` sets `@radix-ui/react-slot`, `@react-three/drei`, `@react-three/fiber`, and `three` to `latest`.
- Why it matters:
  - Running install at different times can produce different dependency trees with same lock intent, causing random breakages and hard-to-reproduce bugs.
  - This is especially painful for CI, long-running branches, and security scanning consistency.
- Likely correction direction:
  - Replace `latest` with explicit semver ranges and keep lockfile-only updates under controlled PRs.
  - Regenerate lockfiles after pin bumps and require Dependabot/Renovate PRs for upgrades.
- Verification idea:
  - Run two clean installs on different days and compare lockfile/`npm ci` result stability.
  - Ensure no direct `latest` entries remain in `dependencies` or `devDependencies`.

### WTF-BB-052 - DB health scan shows most public tables empty and top populated tables still sparse

- Category: Data integrity / analytics
- Status: Open
- Owner/Session: -
- Score: C4 + F3 + S1 + P1(4) = 12
- Evidence:
  - Ran `WTF/scripts/db-health-completion.sql` against local DB `postgresql://wtf@localhost:5432/wtf`.
  - Public schema totals: `total_public_tables = 106`, `populated_tables = 15`, `zero_row_tables = 91`.
  - Populated tables with lowest completion:
    - `public.users` (2 rows) — `39.39%` complete, `60.61%` empty.
    - `public.backfill_manifest` (2,856 rows) — `62.06%` complete.
    - `public.sync_runs` (24 rows) — `69.44%` complete.
    - `public.system_event_logs` (57,074 rows) — `75.55%` complete, `24.45%` empty.
    - `public.console_games` — `84.62%` complete, `15.38%` empty.
  - Worst sparse columns from row_count > 0 sample (rows>=50):
    - `public.backfill_manifest.payload`, `.last_error`, `.next_attempt_at` at `0%`.
    - `public.system_event_logs.error_stack` at `0%` (`57072` empty / `57074` rows).
    - `public.system_event_logs.error_name`, `.error_message` at `3.11%`.
    - `public.backfill_manifest.last_attempt_at`, `.completed_at` at `3.36%`.
    - `public.system_event_logs.user_id` at `13.42%`.
- Why it matters:
  - 91 of 106 public tables are currently zero-row in this environment, indicating no provisioned data for most domains.
  - Sparse fields in populated tables weaken analytics quality and can hide backfill failures.
- Likely correction direction:
  - Add a regular completion job around `WTF/scripts/db-health-completion.sql` and fail fast for critical tables below your threshold.
  - Prioritize `backfill_manifest` and `system_event_logs` sparse columns first, then user metadata fields that are expected to be required by downstream logic.
- Verification idea:
  - Re-run this same health script on staging and production snapshots and compare top-25 table/column drops from prior runs.
  - Add a dashboard card for `zero_row_tables` and top-25 sparse columns so regressions are visible to ops.

### WTF-BB-053 - Canonical `/tv` misses TV2 resilience paths (skip/error telemetry, skip-notice UX, session telemetry)

- Category: TV microapp / reliability
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S2 + P1(4) = 13
- Evidence:
  - `client/src/pages/TV2.tsx` adds a user-visible skip notice (`SkipNoticeBanner`) and explicit error state messaging on item failures.
  - `client/src/pages/TV2.tsx` adds client-side `reportItemEnd`/`sessionId` telemetry emission to `/api/tv/telemetry/item-end` and per-session failure tracking for queue health.
  - `/api/tv/telemetry/item-end` is implemented server-side with session-distinct blacklisting logic in `server/routes/tv.ts`.
  - `client/src/pages/TV.tsx` currently runs on `/tv` without those TV2-only resilience components/features.
- Why it matters:
  - In `/tv`, broken or repeatedly flaky media can still degrade the viewer experience with silent recovery paths and without the session-level failure signals that TV2 now uses.
  - Recovery behavior is less observable and harder to harden under repeated failures.
- Likely correction direction:
  - Backport TV2 resilience logic into `client/src/pages/TV.tsx` under a staged flag and keep existing behavior defaulted until parity testing passes.
  - Reuse existing TV2 helper strategy for session-scoped failure tracking and telemetry emission.
- Verification idea:
  - Inject a synthetic broken clip and confirm:
    - clear skip notice appears,
    - queue advances without long stalls,
    - telemetry item-end events are persisted in server-side bucket state.

### WTF-BB-054 - Dual TV implementations (`/tv` and `/tv2`) block safe, staged rollout of player behavior changes

- Category: TV microapp / platform health
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S3 + P1(4) = 12
- Evidence:
  - `client/src/App.tsx` keeps `/tv` mapped to `TV.tsx` and `/tv2` as a hidden experimental route pointing at `TV2.tsx`.
  - The two code paths are independently maintained and currently diverge in behavior without a shared TV core.
- Why it matters:
  - Without a consolidation strategy, reliability work lands in one implementation and leaves `/tv` users on a different behavior set.
  - Rollout and rollback are coarse, making production-safe changes harder and increasing support burden.
- Likely correction direction:
  - Introduce a shared TV adapter layer and feature flags for TV2 behavior in `/tv`.
  - Add `/tv2` as a compatibility lane and retire it once `/tv` owns the same features and tests.
- Verification idea:
  - Verify both routes can be switched via flag, and that production default uses `/tv` with new behavior behind a bounded rollout stage.

### WTF-BB-055 - No automated parity checks between `/tv` and `/tv2` for stream/error-handling edge cases

- Category: TV microapp / test coverage
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S1 + P2(3) = 10
- Evidence:
  - `client/src/pages/TV.tsx` and `client/src/pages/TV2.tsx` share routes and API contracts but diverge in controls, error handling, and fallback behavior.
- Why it matters:
  - Future edits can regress one TV implementation while the other stays unaffected, with no test guard catching parity breaks in stream lifecycle, skip timing, or telemetry behavior.
  - This increases the chance of production-only regressions after small refactors.
- Likely correction direction:
  - Add regression tests for stream lifecycle + error cases at component and route integration level.
  - Build shared contract fixtures for TV stream payloads and verify both implementations produce equivalent externally observable behavior for canonical cases.
- Verification idea:
  - CI test job includes a TV parity suite comparing `/api/tv/channels/:id/stream`, power transitions, channel switching, and error-path fallback across both implementations.

### WTF-BB-056 - Unauthenticated client log ingestion route is exempt from API rate limiting

- Category: Security / telemetry integrity
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - `server/routes/system-logs.ts:36` registers `POST /api/system/logs/client` without `isAuthenticated` / permission middleware.
  - `server/app.ts:106` includes `/api/system/logs/client` in `MEDIA_RATE_LIMIT_BYPASS_PREFIXES`, so requests skip the global API limiter.
  - The endpoint writes to `system_event_logs` through `logSystemEvent` with unbounded request-side frequency.
- Why it matters:
  - Attackers can POST arbitrary events repeatedly without identity and without limiter protection, creating a storage-amplification / noisy-logs risk and reducing observability quality under abuse.
  - This also allows low-effort DB churn from unauthenticated traffic.
- Likely correction direction:
  - Require a signed source token for client log writes and add endpoint-specific, authenticated rate limiting separate from viewer exception paths.
- Verification idea:
  - Verify anonymous burst traffic to this endpoint no longer succeeds when limits are exceeded and log table growth remains bounded.

### WTF-BB-057 - Supabase backup command builder interpolates DB URL into a shell command

- Category: Security / command safety
- Status: Open
- Owner/Session: -
- Score: C4 + F4 + S3 + P1(4) = 13
- Evidence:
  - `server/lib/supabase-backup.ts:338` executes `pg_dump` with `execAsync` and a string template:
    - ``pg_dump --format=custom --no-owner --file="${filepath}" "${dbUrl}"``.
  - `dbUrl` comes from runtime environment through `getDatabaseUrl()` and is interpolated into shell command text.
- Why it matters:
  - Even though DB credentials are usually server-managed secrets, shell interpolation of a URL turns the backup path into a command-injection sink if env config is ever compromised or misconfigured.
  - It increases the blast radius of any config handling mistake in backup scheduling paths.
- Likely correction direction:
  - Switch to `execFile` with argument arrays (or spawn-safe helpers), or move to a backup library/driver path that avoids shell interpretation.
- Verification idea:
  - Add a regression test that ensures unusual URL characters are escaped safely without command parsing side effects.

### WTF-BB-058 - Shared on-boot/domain-profile caches are global maps without key eviction

- Category: Runtime / memory hygiene
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S2 + P2(3) = 10
- Evidence:
  - `server/teznames.ts` uses `const domainCache = new Map...` and never removes stale keys.
  - `server/tzprofiles.ts` uses `const profileCache = new Map...` with only timestamp checks and no key cleanup.
  - Both are hit from wallet/profile resolution paths and can grow with user/address cardinality.
- Why it matters:
  - Unbounded cache growth can accumulate over long uptimes under high distinct-address traffic, increasing memory pressure without a clear cleanup path.
  - This can become a recurring reliability issue during high-volume periods or long-lived process runs.
- Likely correction direction:
  - Add bounded eviction, periodic stale-key reaping, and hard caps per map, with tests for cardinality stabilization.
- Verification idea:
  - Replay many unique addresses and confirm resident map size stabilizes after TTL/eviction policy.

### WTF-BB-059 - Board webhook rate limiter retains per token+IP keys without TTL-based eviction

- Category: Runtime / memory hygiene
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S2 + P2(3) = 10
- Evidence:
  - `server/routes/board.ts:38` defines `webhookHits` as a module-level `Map<string, number[]>`.
  - `server/routes/board.ts:80-90` filters stale timestamps but never deletes the parent key when a webhook sender becomes quiet.
  - `server/routes/board.ts:1043-1044` generates keys as `${req.params.token}:${sourceIp}`, allowing unbounded growth from token/IP cardinality.
- Why it matters:
  - A burst of unique tokens or spoofed source IPs can grow this map unbounded during long uptime, adding memory pressure on public board webhook traffic.
- Likely correction direction:
  - Add periodic key reaping and hard cap by map size + per-key entry count; keep a fixed-size ring or token bucket state instead of unlimited arrays.
- Verification idea:
  - Replay a high-cardinality flood of webhook calls and confirm map size stabilizes under TTL/eviction policy.

### WTF-BB-060 - DEX cache keyspace grows with arbitrary user-supplied params

- Category: Runtime / API scaling
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence:
  - `server/routes/dex.ts:18` stores all cache entries in a single process module map.
  - `server/routes/dex.ts:200` and `server/routes/dex.ts:267` create cache keys from `:tag` and `:pairId` path params.
  - `server/routes/dex.ts` does not cap map length or run background cleanup; keys stay until TTL check hits and are recomputed per distinct input.
- Why it matters:
  - A malicious/high-volume caller can force unique cache keys by passing rare tags/pairs, leaving stale cache entries to accumulate across process lifetime.
- Likely correction direction:
  - Normalize/validate the allowed key cardinality, cap per-prefix entry counts, and periodically prune stale keys outside TTL.
- Verification idea:
  - Drive high-cardinality DEX queries and confirm the cache never exceeds a configured cap.

### WTF-BB-061 - TzKT pagination cache is a global unbounded map keyed by offset/limit

- Category: Runtime / API scaling
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S3 + P2(3) = 10
- Evidence:
  - `server/tzkt.ts:19` defines a module `cache` map used by all public TzKT resolvers.
  - `server/tzkt.ts:43`, `78`, and `94` build keys with caller-provided `limit`/`offset` and addresses.
  - There is no periodic global reaping; stale keys are removed only for exact key lookup hits past TTL.
- Why it matters:
  - Attackers can issue many unique pagination windows and wallet addresses, forcing map growth tied to query cardinality rather than business entities.
- Likely correction direction:
  - Add per-prefix cap and age-based global cleanup sweeps; keep only active page windows or derive a bounded cache policy.
- Verification idea:
  - Hit thousands of offset windows for a fixed address and verify map size remains bounded.

### WTF-BB-062 - X DM cache and rate-limit maps retain stale user-context keys indefinitely

- Category: Runtime / API scaling
- Status: Open
- Owner/Session: -
- Score: C3 + F2 + S2 + P2(3) = 10
- Evidence:
  - `server/lib/x-dm-cache.ts:36-37` declares separate `cache` and `rateLimits` maps used by all callers.
  - `server/lib/x-dm-cache.ts:43-75` supports stale and fresh reads, but only removes keys when a specific rate-limit window expires.
  - `server/lib/x-dm-cache.ts:165` offers `clearDmCache()`, but no time-based or size-based map reaping in normal operation.
- Why it matters:
  - Every distinct `dmCacheKey()` (user/app/session-derived) can remain until reuse/expiry conditions, allowing long-lived memory growth under multi-tenant polling.
- Likely correction direction:
  - Add capped LRU/TTL sweeps and observability for cache-hit/miss + retained key count.
- Verification idea:
  - Simulate a large stream of unique DM key patterns and confirm bounded key count and bounded memory over time.

### WTF-BB-063 - Studio user-drive client/app-usage caches are unbounded per user

- Category: Runtime / memory hygiene
- Status: Fixed
- Owner/Session: Swarm A4
- Score: C3 + F3 + S2 + P2(3) = 11
- Evidence:
  - `server/lib/studio/user-drive.ts:303-311` keeps `userClientCache` and `userAppUsageCache` as global maps keyed by `userId`.
  - `server/lib/studio/user-drive.ts:338-340` and `:387` mutate/read these maps without key-count caps or periodic eviction.
  - `server/lib/studio/user-drive.ts:313` only deletes one user on invalidation, never applying global pruning.
- Why it matters:
  - Large or adversarial user churn in a long-lived process can accumulate user-bound cache state and OAuth client objects with no upper bound.
- Likely correction direction:
  - Implement bounded cache policy (TTL + max entries + eviction), with explicit memory and cardinality metrics.
- Local fix note:
  - Added TTL + max-entry pruning around the user Drive client cache and app-usage cache, and touched entries on read so old user-bound state naturally ages out.
- Verification: `npm run check`
- Verification idea:
  - Replay a large set of unique user IDs and check cache cardinality plateaus under configured bounds.

### WTF-BB-064 - Collection factory depended on sibling Kiln paths and local-only API defaults

- Category: Kiln integration / deploy
- Status: Fixed
- Owner/Session: gardener session
- Score: C3 + F4 + S2 + P1(4) = 13
- Evidence:
  - `server/routes/collection-factory.ts` defaulted Kiln API traffic to `http://127.0.0.1:3080`, which only works from a local dev process and not from the Docker app container.
  - Collection template seed paths pointed at `building/shadownet kiln/contracts/...`, a sibling workspace path absent from the app image.
  - Kiln HTTP calls had no timeout, allowing factory requests to hang indefinitely when the host-side Kiln process stalls.
- Local fix note:
  - Vendored required SmartPy templates under `WTF/contracts/...`, updated seed/backfill paths, copied contracts into the runtime image, added production Kiln default `http://host.docker.internal:3001`, added token env aliases, and wrapped Kiln fetches with an abort timeout.
- Why it matters:
  - Factory deployments could fail only after shipping because the app image did not contain the source templates and could not reach `127.0.0.1:3080` from inside Docker.
- Likely correction direction:
  - Keep contract templates as versioned app assets or package artifacts; keep Kiln service URL/token/timeout explicit in deploy env.
- Verification idea:
  - Build the app image, run a dry-run collection deployment against host Kiln, and confirm missing/slow Kiln fails fast with a 503 instead of hanging.

### WTF-BB-065 - wtf.tez deploy/test/UI paths drifted back to hardcoded `hack.*` parent domains

- Category: wtf.tez / subdomains
- Status: Fixed
- Owner/Session: gardener session
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - `scripts/deploy-mainnet.ts` hardcoded `parent_name` bytes for `hack.tez`, queried `*.hack.tez`, and printed operator instructions for the `hack.tez` NFT.
  - `scripts/redeploy-ghostnet.ts` hardcoded `*.hack.gho` and `6861636b2e67686f`, making ghostnet deployments target the wrong parent for a `wtf` build.
  - UI/profile/search/pending-commit paths rendered or fetched `label.hack.${tld}` despite `src/config/tezos.ts` already supporting `VITE_PARENT_DOMAIN_LABEL=wtf`.
- Local fix note:
  - Added parent-domain helpers, switched deploy/test scripts to derive query suffix and `parent_name` storage bytes from env/defaults, updated UI domain formatting helpers, and made wiki/signing defaults follow the configured parent domain.
- Why it matters:
  - A deployment or user flow could appear branded/configured for `wtf.tez` while registering, verifying, or instructing operators against `hack.tez`/`hack.gho`.
- Likely correction direction:
  - Keep all domain construction behind shared helpers; make scripts consume the same parent-domain env names as the frontend where practical.
- Verification idea:
  - Run `PARENT_DOMAIN=wtf.tez npx tsx scripts/deploy-mainnet.ts --dry-run` and `PARENT_DOMAIN=wtf.tez npx tsx scripts/test-ghostnet.ts --check-only` against known contracts, then confirm logs/storage expectations show `wtf.tez`/`wtf.gho`.

### WTF-BB-066 - Public Kiln proxy relies on host Kiln token configuration

- Category: Kiln integration / security
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S5 + P1(4) = 14
- Evidence:
  - `Caddyfile` exposes `kiln.wtfgameshow.app` to `host.docker.internal:3001`.
  - The sibling Kiln service protects mutation routes only when `API_AUTH_TOKEN` is set; health is intentionally public.
  - The app now forwards `KILN_API_TOKEN`/`WTF_KILN_API_TOKEN`/`API_AUTH_TOKEN`, but no repo-local deploy guard proves the host Kiln service actually has a non-empty token.
- Why it matters:
  - If host Kiln starts without its token, public deploy/upload endpoints could be reachable through the subdomain.
- Likely correction direction:
  - Add a deploy-time or host-health assertion that refuses to expose/reload the Caddy Kiln route unless Kiln auth is configured, or restrict the Caddy route to authenticated/internal callers.
- Verification idea:
  - Curl a protected Kiln mutation through `kiln.wtfgameshow.app` without a token and verify it returns 401/403 in production before marking verified.
- Codex WTF XTZ exchange note (2026-05-02):
  - Public probe through `kiln.wtfgameshow.app` returned HTTP 401 for unauthenticated `/api/kiln/workflow/run`, captured in `docs/wtf-xtz-exchange/shadownet-deployment-log.md`. Current host auth appears active, but the deploy-time guard/host-health assertion is still missing, so this remains open.
- Codex Kiln auth-mode note (2026-05-03):
  - The sibling Kiln app now supports `KILN_API_AUTH_REQUIRED=false` to deliberately run as an open public builder while keeping `API_AUTH_TOKEN` configured for quick rollback.
  - The platform risk is public use of Bert/Ernie Shadownet signers and runtime resources, not custody of connected users' wallets. Connected-wallet users still approve their own operations.
  - This item remains open until production is either intentionally left open with documented rate/runtime caps or re-locked with `KILN_API_AUTH_REQUIRED=true` plus a deploy-time auth assertion.
- Codex open-mode production note (2026-05-03):
  - Host env was intentionally flipped to `KILN_API_AUTH_REQUIRED=false` and `kiln.service` restarted successfully.
  - Public `https://kiln.wtfgameshow.app/api/health` reports `auth.required=false`, `auth.mode=open`, and `auth.tokenConfigured=true`.
  - Public unauthenticated `https://kiln.wtfgameshow.app/api/kiln/balances` now returns HTTP 200 with Bert/Ernie Shadownet balances, so the earlier unauthenticated-401 verification is no longer the desired production behavior.
  - Fast rollback remains one env edit: set `KILN_API_AUTH_REQUIRED=true` and restart `kiln.service`.

### WTF-BB-067 - Kiln execute/e2e APIs cannot attach tez to payable Tezos calls

- Category: Kiln integration / payable e2e
- Status: Fixed
- Owner/Session: Codex Kiln 2026 pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - `../building/shadownet kiln/src/lib/api-schemas.ts` defines `/api/kiln/execute` with `contractAddress`, `entrypoint`, `args`, and `wallet`, but no `amount` or `mutez` field.
  - The same schema defines `/api/kiln/e2e/run` steps with `entrypoint`, `args`, and `wallet`, also without an amount field.
  - `../building/shadownet kiln/src/lib/tezos-service.ts` sends contract calls through Taquito `.send()` without amount options.
- Why it matters:
  - Payable Tezos entrypoints such as `create_listing` cannot be exercised through Kiln post-deploy E2E even though they are core contract functionality.
- Likely correction direction:
  - Extend execute and e2e payload schemas with an optional `amountMutez` field, validate it as a non-negative safe integer, and pass `{ amount: amountMutez, mutez: true }` to Taquito `.send()` when present.
- Verification idea:
  - Add a minimal payable Shadownet contract test where Kiln executes a call with attached mutez and verifies storage/balance changed.
- Local fix note (2026-05-02):
  - The sibling Kiln app now accepts `amountMutez` on `/api/kiln/execute` and per `/api/kiln/e2e/run` step, validates it as a non-negative safe integer, and passes `{ amount, mutez: true }` to Taquito `.send()`.
  - Added unit coverage in `tests/tezos-service.test.ts` and `tests/server-app.test.ts`.
  - Not yet verified on live Shadownet because this Codex session has no authenticated Kiln API token and no permission to use funded Bert/Ernie secrets.

### WTF-BB-068 - Shadowbox is still single-contract and cannot emulate product systems

- Category: Kiln integration / Shadowbox
- Status: Open
- Owner/Session: -
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - `../building/shadownet kiln/scripts/shadowbox/flextesa_runner.py` still originates one contract named `shadowbox`.
  - Multi-contract targets, FA2 operator flows across contracts, Objkt-like service state, Tezos Domains, wallet emulation, and TzKT-style assertions are not implemented in the real runner.
- Why it matters:
  - NFT marketplaces and token swaps are systems, not one entrypoint on one KT1. A one-contract runner can miss the exact failures that Shadownet E2E must catch.
- Likely correction direction:
  - Replace the single-contract runner with a fixed multi-contract runtime worker that originates contracts from a manifest, substitutes addresses, executes scenario steps, and reads storage/balances/big maps.
- Verification idea:
  - Run Shadowbox scenario: FA2 mint -> update operator -> marketplace listing -> payable purchase -> storage and balance assertions.

### WTF-BB-069 - Deployed Kiln may advertise stale Etherlink Ghostnet-era metadata

- Category: Kiln integration / network metadata
- Status: Fixed
- Owner/Session: Codex Kiln 2026 pass
- Score: C2 + F3 + S1 + P1(4) = 10
- Evidence:
  - Browser/API probes of `kiln.wtfgameshow.app` showed the public catalog advertising Etherlink testnet at `https://node.ghostnet.etherlink.com`, chain ID `128123`.
  - Official Etherlink docs identify Etherlink Shadownet as RPC `https://node.shadownet.etherlink.com`, chain ID `127823`.
  - Public re-probe on 2026-05-02 still returned `etherlink-testnet` as active/supported and `/api/kiln/capabilities?networkId=etherlink-shadownet` still reported Tezos Shadownet runtime defaults.
- Why it matters:
  - Builders will deploy and test against the wrong L2 test rail if the public network card remains stale.
- Likely correction direction:
  - Deploy the local Kiln network catalog update and verify `/api/networks` lists `etherlink-shadownet` with chain ID `127823`.
- Verification idea:
  - Curl production `/api/networks` and `/api/kiln/capabilities?networkId=etherlink-shadownet` after deploy.
- Local fix note (2026-05-02):
  - The sibling Kiln app now lists `etherlink-shadownet` locally with chain ID `127823`, leaves old `etherlink-testnet` as planned/legacy, and resolves requested-network capabilities locally.
- Production verification note (2026-05-03):
  - Deployed commit `09ca113` to `kiln.wtfgameshow.app`.
  - Public `/api/networks` now lists `etherlink-shadownet` with RPC `https://node.shadownet.etherlink.com` and chain ID `127823`.
  - Public `/api/kiln/capabilities?networkId=etherlink-shadownet` now reports `runtimeNetwork: etherlink-shadownet`, Solidity source support, and explicit no-stub blocker statuses.

### WTF-BB-070 - Kiln live E2E cannot yet verify storage, balance, and big-map assertions

- Category: Kiln integration / runtime assertions
- Status: Open
- Owner/Session: -
- Score: C4 + F3 + S1 + P1(4) = 12
- Evidence:
  - The local Kiln API schema now accepts assertion objects, but live Tezos E2E fails closed when assertions are present because runtime readers are not implemented yet.
- Why it matters:
  - Without post-call storage and balance verification, E2E can prove operation inclusion but not application-level correctness.
- Likely correction direction:
  - Add RPC/TzKT-backed readers for contract storage, balances, and big maps with deterministic assertion evaluation and operation-level evidence.
- Verification idea:
  - E2E scenario creates a listing, swaps, reads `remaining_escrow_mutez`, and asserts the expected post-swap value.

### WTF-BB-071 - jstz is only planned/configurable and has no executable Kiln adapter

- Category: Kiln integration / jstz adapter
- Status: Open
- Owner/Session: -
- Score: C4 + F2 + S1 + P2(3) = 10
- Evidence:
  - jstz docs say there is not yet a stable production network; local Kiln now marks jstz as planned/local only and does not expose active execution.
- Why it matters:
  - Kiln should be future-facing without giving builders a fake green path for jstz deploy/test.
- Likely correction direction:
  - Add a real jstz CLI/sandbox adapter for local smart-function deploy/run and make external jstz networks configurable only when endpoints are provided.
- Verification idea:
  - Deploy and run a local jstz counter function through Kiln, capturing request/response evidence and failure output.

### WTF-BB-072 - Kiln CORS allowlist blocked same-origin browser assets

- Category: Kiln integration / browser runtime
- Status: Fixed
- Owner/Session: Codex Kiln 2026 pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - Local browser probe of `http://localhost:3001/#build` showed an empty React root.
  - Playwright captured asset failures: `/assets/*.js` and `/assets/*.css` returned HTTP 500; CSS was rejected as `text/html`.
  - Kiln server logs showed `Origin http://localhost:3001 is not allowed by CORS` for same-origin asset requests.
- Why it matters:
  - Kiln cannot be trusted as an e2e builder if the browser shell can fail before React hydrates under a normal local/prod-like config.
- Correction:
  - The sibling Kiln app now allows origins whose host exactly matches the request `Host` header before applying the external `CORS_ORIGINS` allowlist.
  - Added server coverage for same-origin `Origin: http://localhost:3001` with a non-local configured allowlist.
- Production verification note (2026-05-03):
  - Deployed commit `09ca113`; public frontend serves `assets/index-D3yZ8s-r.js`.
  - Browser smoke loaded `https://kiln.wtfgameshow.app/#build` and found `Project workspace`, `kiln.project.json`, and `Contract graph`.
- Verification idea:
  - Load `http://localhost:3001/#build` with `CORS_ORIGINS` configured and confirm body text includes the Build UI plus `Project workspace`.

### WTF-BB-073 - Kiln local activity log path can spam EACCES from `/var/log/kiln`

- Category: Kiln integration / observability
- Status: Fixed
- Owner/Session: Codex Kiln 2026 pass
- Score: C2 + F3 + S2 + P2(3) = 10
- Evidence:
  - Local browser verification produced repeated `Failed to persist activity log: Error: EACCES: permission denied, mkdir '/var/log/kiln'`.
  - `.env.example` recommends repo-relative `logs/kiln-activity.log` for local dev, but a prod-like local env can still point to `/var/log/kiln` without the required writable directory.
- Why it matters:
  - Noisy failed logging can bury the actual e2e failure output that Kiln is supposed to preserve.
- Correction:
  - The sibling Kiln activity logger now emits only one console error per distinct write failure path/code instead of spamming every request.
  - Added unit coverage that forces an unwritable activity-log path and verifies only one warning is emitted for repeated failures.
- Production verification note (2026-05-03):
  - Deployed commit `09ca113`; host deploy completed and `kiln.service` passed health on attempt 2.
- Verification idea:
  - Start Kiln with an unwritable log path and verify one clear warning plus no repeated per-request stack spam. A future enhancement can still expose logging health through `/api/health`.

### WTF-BB-074 - Netlify CLI rollback path is blocked by root-owned npm cache

- Category: Kiln integration / deploy tooling
- Status: Open
- Owner/Session: -
- Score: C2 + F2 + S2 + P2(3) = 9
- Evidence:
  - `npx netlify status` failed locally with `EACCES` opening a file under `/Users/joshuafarnworth/.npm/_cacache/...`.
  - npm reported the cache contains root-owned files and recommended `sudo chown -R 501:20 "/Users/joshuafarnworth/.npm"`.
- Why it matters:
  - Hetzner is the primary deploy path, but Netlify is documented as rollback. A broken local Netlify CLI blocks fast rollback/preview deploy checks.
- Likely correction direction:
  - Repair npm cache ownership or run Netlify CLI with a project-local npm cache path, then re-run `npx netlify status`.
- Verification idea:
  - `npm_config_cache=.npm-cache npx netlify status` or repaired default cache should complete without `EACCES`.

### WTF-BB-075 - Open Kiln mode exposes Shadownet puppet wallets to public callers

- Category: Kiln integration / public test infrastructure
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S2 + P2(3) = 10
- Evidence:
  - `KILN_API_AUTH_REQUIRED=false` intentionally bypasses token auth on protected routes while keeping `API_AUTH_TOKEN` configured for fast rollback.
  - Public routes can then execute server-side Bert/Ernie Shadownet deploy/call flows subject to rate limits and network capability checks.
  - Production was flipped open on 2026-05-03; `/api/health` reports `auth.mode=open` and unauthenticated `/api/kiln/balances` returns HTTP 200.
- Why it matters:
  - This does not let users lose connected-wallet funds without signing, but it can drain Shadownet puppet balances, spam throwaway contracts, consume RPC/runtime quota, and fill logs.
- Likely correction direction:
  - Keep `API_RATE_LIMIT_MAX` and Shadowbox concurrency/source/step limits conservative in open mode; add public-mode UI copy and host-level monitoring before inviting broad traffic.
- Verification idea:
  - With open mode enabled, unauthenticated `/api/kiln/balances` should return 200, `/api/health` should report `auth.mode=open`, and protected mutation routes should remain rate limited.

### WTF-BB-076 - Any authenticated user can force-run registered cockpit jobs

- Category: Authorization / background jobs
- Status: Open
- Owner/Session: -
- Score: C4 + F4 + S3 + P1(4) = 15
- Evidence:
  - `server/routes/cockpit.ts:361-365` exposes `POST /api/cockpit/sync/run/:jobName` with only `isAuthenticated`.
  - The route passes the path parameter directly to `runJob(name)`.
  - Registered jobs include expensive or sensitive jobs such as `supabase-backup`, `tv-cache-warm`, `tv-transcode-sweep`, `portfolio-sync`, `x-dm-sync`, wallet/event sync workers, and recapture watchers.
- Why it matters:
  - Any logged-in account can trigger costly jobs, upstream API calls, media cache fetches, backup work, or privileged maintenance paths. Combined with cookie CSRF this becomes a broad cross-site trigger surface.
- Likely correction direction:
  - Require a privileged permission such as `manage_settings` or a dedicated `manage_background_jobs` permission, and allowlist only safe manually-runnable job names.
- Verification idea:
  - As a contestant/witness, the forced-run route should return 403 for every job name; staff-only job runs should be audited.

### WTF-BB-077 - Manual cockpit wallet sync accepts arbitrary wallet targets

- Category: Authorization / Tezos indexing
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S2 + P2(3) = 12
- Evidence:
  - `server/routes/cockpit.ts:292-304` documents a manual sync for one of the caller's wallets, but never verifies that `req.params.wallet` belongs to the authenticated user.
  - The route enqueues `{ target: wallet, targetKind: "wallet", reason: "manual", userId: caller }` for any non-empty string.
- Why it matters:
  - Any account can push arbitrary wallet targets into the indexing queue, causing upstream TzKT work, noisy attribution, and possible data-pollution/backlog pressure.
- Likely correction direction:
  - Validate Tezos address format and require a matching `user_wallets` row for the caller before enqueueing, unless the caller has a staff permission.
- Verification idea:
  - A user should be able to enqueue only linked wallets; arbitrary or unlinked addresses should return 403/404.

### WTF-BB-078 - Legacy channel message endpoints bypass board channel permissions

- Category: Authorization / message board
- Status: Open
- Owner/Session: -
- Score: C4 + F4 + S2 + P1(4) = 14
- Evidence:
  - `server/routes.ts:97` mounts `messagesRoutes` before `boardRoutes`.
  - `server/routes/messages.ts:1311-1342` reads legacy channel messages for any authenticated user without checking `canViewChannel`.
  - `server/routes/messages.ts:1348-1366` inserts a message into any numeric `channelId` for any authenticated user without checking channel existence, `canPostInChannel`, locked state, slow mode, or role permissions.
  - The newer board implementation has the needed channel permission helpers in `server/lib/board-channel-permissions.ts`.
- Why it matters:
  - Restricted/locked board channels can be read or posted to through older compatibility routes if a caller knows or guesses the channel id.
- Likely correction direction:
  - Either remove the legacy `/api/channels/*` message endpoints or adapt them to load the board channel and enforce the same `canViewChannel`/`canPostInChannel` checks as `server/routes/board.ts`.
- Verification idea:
  - Create a locked/staff-only channel; a witness/contestant should receive 403 from both legacy and new board endpoints for reads and writes.

### WTF-BB-079 - Buyback swap intent is trusted before on-chain confirmation

- Category: Tezos / reward integrity
- Status: Open
- Owner/Session: -
- Score: C4 + F3 + S2 + P1(4) = 13
- Evidence:
  - `server/routes/buyback-windows.ts:445-490` lets a user submit `{ allowlistId, opHash, amountWtf }` and immediately updates `buyback_allowlist.swapped_wtf`, `swapped_at`, and `swap_op_hash`.
  - `server/routes/side-quests.ts:204-236` auto-verifies `wtf_swapped_in_buyback` by trusting `buyback_allowlist.swapped_wtf`.
  - The watcher in `server/lib/wtf-recapture-watcher.ts` later reads confirmed wallet events, but this auto-verification path does not wait for that confirmed evidence.
- Why it matters:
  - A user can mark a buyback swap as completed before the chain confirms it, then satisfy auto-verified side quests and potentially receive XP/WTF reward ledger entries.
- Likely correction direction:
  - Store user submissions as pending attestations. Only update confirmed swap totals from the watcher after matching sender, operator wallet, contract, token id, amount, window, and op hash.
- Verification idea:
  - Submit a fake/unknown op hash for a buyback window; `wtf_swapped_in_buyback` should remain false until the watcher observes a matching on-chain event.

### WTF-BB-080 - Paid side-quest completion does not require confirmed entry-fee payment

- Category: Authorization / Tezos payment gating
- Status: Open
- Owner/Session: -
- Score: C4 + F3 + S2 + P1(4) = 13
- Evidence:
  - `server/routes/side-quests.ts:470-539` accepts completion submissions and can auto-approve/reward them without checking `entryFeeWtf`.
  - `server/routes/wtf-recapture.ts:167-230` records entry-fee attestations as `pending`, but the completion path does not require a matching confirmed fee row.
- Why it matters:
  - A paid quest can be completed, manually approved, or auto-approved without confirmed payment, undermining pay-to-enter game mechanics.
- Likely correction direction:
  - When `entryFeeWtf > 0`, require a confirmed `side_quest_entry_fees` row for the user before accepting completion or before auto-approval/reward distribution.
- Verification idea:
  - Configure an active side quest with a non-zero entry fee; a user without a confirmed fee should be blocked from completion and reward issuance.

### WTF-BB-081 - Wallet-login proof is not bound to the submitted wallet address

- Category: Authentication / Tezos wallet proof
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S2 + P2(3) = 11
- Evidence:
  - `server/auth/wallet-verify.ts:1-5` builds a challenge from only a nonce.
  - `server/auth/routes.ts:861-917` derives an address from `publicKey`, falls back to the client-supplied `walletAddress`, and does not call `verifyPublicKeyOwnership(walletAddress, publicKey)`.
  - `server/auth/routes.ts:926-960` repeats the same pattern for wallet registration.
  - The authenticated wallet-link route does perform the ownership check at `server/routes/wallets.ts:119-123`, so the stronger pattern already exists.
- Why it matters:
  - The signed statement does not commit to the wallet address, origin, or action. This weakens phishing resistance and makes address/account attribution rely on fallback logic rather than a single canonical proof.
- Likely correction direction:
  - Include wallet address, site origin, action, and expiry in the challenge message; require `verifyPublicKeyOwnership(walletAddress, publicKey)` before consuming the nonce.
- Verification idea:
  - A valid signature from one public key should never satisfy a challenge requested for a different wallet address.

### WTF-BB-082 - Backup pipeline defaults do not create an immutable off-host dump

- Category: Backup / disaster recovery
- Status: Open
- Owner/Session: -
- Score: C5 + F3 + S3 + P1(4) = 15
- Evidence:
  - `server/lib/backup/targets/local.ts:10-24` keeps local dump artifacts for only `BACKUP_LOCAL_KEEP_DAYS`, defaulting to 2 days.
  - `server/lib/backup/targets/supabase.ts:126-181` defaults `SUPABASE_BACKUP_MODE` to `manifest`, uploading JSON metadata while leaving dump bytes local.
  - `server/lib/backup/pipeline.ts:151-154` treats local and Supabase target completion as the available backup target set.
- Why it matters:
  - If the host volume is deleted or corrupted, the default configured "off-site" target may contain only a manifest and hash, not restorable database bytes.
- Likely correction direction:
  - Add at least one immutable/off-host dump target (Drive/S3/B2/restic/borg) with retention, restore drills, and deletion protection. Make launch fail or alert when only manifest-mode remote backup is configured.
- Verification idea:
  - Restore a fresh database from the remote-only artifact after deleting local `/app/backups`; document RPO/RTO and require a passing restore drill before public launch.

### WTF-BB-083 - W link preview follows redirects before validating every target

- Category: SSRF / remote fetch
- Status: Open
- Owner/Session: -
- Score: C3 + F3 + S2 + P2(3) = 11
- Evidence:
  - `server/routes/w.ts:3762-3773` exposes an authenticated link-preview fetcher for arbitrary URLs.
  - `server/routes/w.ts:519-527` calls `fetch(url, { redirect: "follow" })`.
  - The code normalizes `response.url` only after the fetch has already followed redirects.
  - TV media fetching already has a safer manual redirect guard in `server/routes/tv.ts:642-666`.
- Why it matters:
  - A public URL can redirect the server-side fetch to a private/local host before validation, creating an SSRF-style probe/fetch path.
- Likely correction direction:
  - Reuse a shared manual redirect guard: `redirect: "manual"`, validate each `Location`, cap redirects, and reject private/local/DNS-pinned targets before issuing the next request.
- Verification idea:
  - Unit-test redirect chains where the first URL is public and the second URL is private/local; the route should return no preview without making the second fetch.

### WTF-BB-084 - Particle Painter frontend expects a Pinata JWT in Vite client env

- Category: Secret handling / frontend bundle
- Status: Open
- Owner/Session: -
- Score: C4 + F2 + S1 + P1(4) = 11
- Evidence:
  - `PP/src/services/teiaService.ts:39-64` reads `import.meta.env.VITE_PINATA_JWT` and sends it as a browser `Authorization` header to Pinata.
  - Existing planning docs already warn not to graft this flow directly into WTF without a server-side pinning relay.
- Why it matters:
  - Any `VITE_*` value is bundled into the frontend. A real Pinata JWT configured this way would be visible to every browser user and reusable outside the app.
- Likely correction direction:
  - Replace the client JWT with a server-side `POST /api/media/pin` relay that authenticates the user, validates file type/size, stores the Pinata token only server-side, and returns the CID.
- Verification idea:
  - Built frontend assets should contain no Pinata JWT or other private pinning credentials; uploads should still work through the authenticated server relay.

### WTF-BB-085 - Root production dependency tree carries critical xmldom via legacy passport-twitter

- Category: Supply chain
- Status: Open
- Owner/Session: -
- Score: C4 + F2 + S1 + P1(4) = 11
- Evidence:
  - `package.json:64` depends on `passport-twitter`.
  - `server/auth/passport.ts:141-179` dynamically enables the legacy Twitter OAuth 1.0 strategy when `TWITTER_CONSUMER_KEY` and `TWITTER_CONSUMER_SECRET` are set.
  - `npm audit --omit=dev --json` on 2026-05-03 reported one critical production advisory from `passport-twitter -> xtraverse -> xmldom@0.6.0`.
- Why it matters:
  - Even if OAuth2 is the preferred X path, enabling legacy OAuth 1.0 keeps a vulnerable XML dependency in the production install and leaves an older auth path available by environment flag.
- Likely correction direction:
  - Remove `passport-twitter` and the legacy `/api/auth/twitter` OAuth 1.0 routes if OAuth2 fully replaces it, or pin/replace the strategy with a maintained implementation that does not depend on vulnerable `xmldom`.
- Verification idea:
  - `npm audit --omit=dev --json` should report zero critical production vulnerabilities; `/api/auth/social/config` should not advertise legacy Twitter when OAuth2 is configured.

### WTF-BB-086 - Profile PFP update stores arbitrary image URLs without sanitizer or ownership check

- Category: Privacy / media validation
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence:
  - `server/routes/profile.ts:236-256` stores `imageUrl` directly into both `pfpImageUrl` and `avatarUrl`.
  - The same file imports and uses `sanitizeThumbnailUrl` for token-derived PFP candidates, but the update endpoint bypasses it.
- Why it matters:
  - Users can make profile/avatar surfaces load arbitrary external URLs, enabling tracking pixels and inconsistent handling of disallowed schemes/hosts compared with the rest of the NFT media pipeline.
- Likely correction direction:
  - Require the chosen PFP URL to pass `sanitizeThumbnailUrl`, and when `tokenContract`/`tokenId` are supplied, require a positive holding row for that user.
- Verification idea:
  - Attempt to set a PFP to an unallowlisted host or non-http(s)/ipfs URI; the API should reject it and leave the existing avatar unchanged.

### WTF-BB-087 - Broad cohost default permissions include destructive user-management actions

- Category: RBAC / blast radius
- Status: Open
- Owner/Session: -
- Score: C4 + F2 + S2 + P2(3) = 11
- Evidence:
  - `shared/types.ts:468-473` grants cohosts every permission except `manage_roles` and `manage_rewards`.
  - `server/routes/admin.ts:301-386` allows any role with `manage_users` to delete users and cascade/delete related submissions, listings, messages, board threads, and other rows. Only admin/host targets are protected from non-admin deletion.
- Why it matters:
  - A compromised or misassigned cohost account has enough privilege to delete large amounts of user content and account data. This is exactly the kind of blast radius a rogue insider scenario exploits.
- Likely correction direction:
  - Split `manage_users` into low-risk profile support, temp-password support, and destructive delete/disable permissions. Prefer soft-disable over hard delete for pre-launch public accounts.
- Verification idea:
  - A cohost should be able to perform intended support actions but should receive 403 for hard delete unless explicitly granted a dedicated destructive permission.

## Backlog Intake Template

Copy this when adding a new issue:

```md
### WTF-BB-XXX - Short title

- Category:
- Status: Open
- Owner/Session: -
- Score: C_ + F_ + S_ + P_(priority bonus) = _
- Evidence:
- Why it matters:
- Likely correction direction:
- Verification idea:
```
