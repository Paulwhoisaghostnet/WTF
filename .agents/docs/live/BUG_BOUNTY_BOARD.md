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
| WTF-BB-148 | Verified | Codex TTC calendar full-send | 2026-05-24 | Browser security / CSP | P1 | 11 | 9 | 2 | 4 | 1 | TTC submit iframe blocked by production CSP frame-src |
| WTF-BB-001 | Fixed | Swarm A1 | 2026-04-28 | Deploy / DB migrations | P0 | 16 | 1 | 4 | 5 | 2 | Overlapping migration systems run every deploy |
| WTF-BB-002 | Verified | Codex deploy hardening pass | 2026-05-03 | Startup / background jobs | P1 | 12 | 7 | 3 | 4 | 1 | App starts production jobs before deploy-time migrations complete |
| WTF-BB-003 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / DB migrations | P0 | 14 | 3 | 2 | 5 | 2 | Migration failures are swallowed and deploy continues |
| WTF-BB-004 | Verified | Codex deploy hardening pass | 2026-05-03 | Deploy / DB migrations | P0 | 15 | 2 | 3 | 4 | 3 | `drizzle-kit push --force` prompts in non-interactive production shell |
| WTF-BB-005 | In Progress | Codex Tezos open-tools transplant | 2026-05-06 | Data integrity / analytics | P1 | 13 | 5 | 4 | 4 | 1 | `token_sales` duplicates make unique-index migrations impossible |
| WTF-BB-006 | Open | - | 2026-04-27 | DB migrations | P1 | 10 | 10 | 2 | 3 | 1 | `0031_wtf_recapture.sql` is not idempotent for enum type creation |
| WTF-BB-007 | Verified | Codex deploy hardening pass | 2026-05-03 | Runtime / supply chain | P1 | 12 | 7 | 2 | 3 | 3 | Production runtime image includes DB schema mutation tooling |
| WTF-BB-008 | Fixed | gardener session | 2026-04-27 | Build / secrets | P0 | 15 | 2 | 2 | 3 | 5 | Missing `.dockerignore` likely sends `.env` into Docker build context |
| WTF-BB-009 | Fixed | Codex warning cleanup pass | 2026-05-06 | Build config | P2 | 9 | 12 | 2 | 2 | 2 | Vite build loads `.env` with unsupported `NODE_ENV=production` |
| WTF-BB-010 | Fixed | Swarm A1 | 2026-04-28 | Startup performance | P2 | 9 | 12 | 2 | 3 | 1 | Entrypoint recursively `chown -R`s mounted volumes every boot |
| WTF-BB-011 | Fixed | Codex warning cleanup pass | 2026-05-06 | Frontend bundle | P3 | 9 | 13 | 4 | 2 | 1 | Wallet/Tezos bundle chunks are huge and pull Node core externals |
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
| WTF-BB-025 | In Progress | Codex Tezos open-tools transplant | 2026-05-06 | API / reliability | P1 | 13 | 5 | 4 | 4 | 1 | Route-level Tezos fetches bypass shared upstream rate-limit control |
| WTF-BB-026 | Open | - | 2026-04-27 | API / reliability | P2 | 10 | 11 | 3 | 2 | 1 | Profile and metadata fetchers duplicate hardcoded upstream paths |
| WTF-BB-027 | In Progress | Codex Tezos open-tools transplant | 2026-05-06 | Marketplace / data pipeline | P2 | 10 | 11 | 2 | 4 | 1 | External marketplace listing backfill returns empty by default |
| WTF-BB-028 | Fixed | Swarm A2 | 2026-04-28 | Data quality / pipeline | P2 | 10 | 11 | 3 | 3 | 1 | Seeder `LIMIT` queries have no deterministic order |
| WTF-BB-029 | Fixed | Codex modular architecture refactor | 2026-05-05 | Data quality / scalability | P1 | 11 | 8 | 3 | 4 | 1 | `/api/w/timeline` loads all verified users before paging or cursoring |
| WTF-BB-030 | Open | - | 2026-04-27 | Data integrity / config | P1 | 12 | 7 | 3 | 3 | 2 | `platform_settings` updates are prone to lost updates across concurrent actors |
| WTF-BB-031 | Verified | Codex W repair pass | 2026-05-24 | Config reliability | P2 | 9 | 12 | 2 | 2 | 3 | DM conversation resolution hides DB state when setting missing/invalid |
| WTF-BB-032 | Verified | Codex W repair pass | 2026-05-24 | Data safety / input validation | P2 | 11 | 9 | 3 | 4 | 1 | Unowned media IDs are accepted for W post/DM flows |
| WTF-BB-033 | Open | - | 2026-04-27 | Data integrity / ops | P2 | 10 | 11 | 2 | 3 | 1 | Unbounded `platform_settings` value payload allows oversized conversation lists |
| WTF-BB-034 | Open | - | 2026-04-27 | Data integrity / auth lifecycle | P1 | 10 | 10 | 2 | 3 | 2 | X token refresh updates users table without serialization |
| WTF-BB-035 | Fixed | Codex TV pagination hardening pass | 2026-05-04 | TV microapp / pagination | P2 | 10 | 11 | 3 | 3 | 2 | TV channel list and detail payloads load unbounded rows |
| WTF-BB-036 | Fixed | Codex TV integrity pass | 2026-05-04 | TV microapp / data integrity | P1 | 11 | 8 | 3 | 4 | 1 | Channel-video insert path is non-atomic with concurrent requests |
| WTF-BB-037 | Fixed | Swarm A6 | 2026-04-28 | TV microapp / data integrity | P2 | 9 | 12 | 3 | 3 | 2 | Playlist-item replace can lose existing queue on partial failure |
| WTF-BB-038 | Fixed | Codex TV integrity pass | 2026-05-04 | TV microapp / data integrity | P1 | 11 | 8 | 3 | 3 | 4 | Active playlist flips can race and violate channel state assumptions |
| WTF-BB-039 | Fixed | Codex TV stream snapshot cache pass | 2026-05-04 | TV microapp / stream performance | P1 | 12 | 7 | 3 | 3 | 4 | Stream endpoint rebuilds full queue and full bumpers each call |
| WTF-BB-040 | Fixed | Swarm A7 | 2026-04-28 | TV microapp / background jobs | P1 | 11 | 8 | 3 | 4 | 1 | Auto-refresh can be called concurrently from stream read-path traffic |
| WTF-BB-041 | Open | - | 2026-04-27 | TV microapp / config integrity | P1 | 10 | 10 | 3 | 3 | 2 | TV config table has no uniqueness guard on active config row |
| WTF-BB-042 | Open | - | 2026-04-27 | TV microapp / schema drift | P2 | 8 | 14 | 2 | 2 | 2 | Boot-time TV backfill applies schema-like changes without single-writer lock |
| WTF-BB-043 | Open | - | 2026-04-27 | TV microapp / refresh scale | P2 | 7 | 15 | 2 | 2 | 1 | WTF TV refresh currently sorts all wallet rows randomly |
| WTF-BB-044 | Open | - | 2026-04-27 | Data integrity / identity | P1 | 11 | 8 | 3 | 3 | 1 | W identity resolution can collapse duplicate Twitter IDs into one row |
| WTF-BB-045 | Verified | Swarm A6 | 2026-04-28 | TV microapp / config integrity | P1 | 12 | 7 | 3 | 4 | 1 | TV auto-refresh reads an arbitrary config row |
| WTF-BB-046 | Verified | Swarm A5 | 2026-04-28 | Runtime / abuse prevention | P1 | 12 | 7 | 2 | 4 | 2 | API in-memory rate limiter grows without hard cap |
| WTF-BB-047 | Verified | Swarm A5 | 2026-04-28 | Runtime / DB access path | P1 | 11 | 8 | 2 | 3 | 2 | W timeline actor cache grows without eviction |
| WTF-BB-048 | Fixed | Codex TV telemetry hardening pass | 2026-05-04 | TV microapp / availability | P2 | 9 | 12 | 2 | 3 | 1 | TV telemetry endpoint can grow session-tracking memory under spam |
| WTF-BB-049 | Open | - | 2026-04-27 | Dependencies / supply chain | P1 | 14 | 4 | 2 | 4 | 5 | js-dos assets and fallback runtime fetch from CDN are unpinned and uncached |
| WTF-BB-050 | Open | - | 2026-04-27 | Dependencies / security | P1 | 13 | 5 | 3 | 3 | 4 | Runtime auth path still depends on deprecated/unmaintained auth packages |
| WTF-BB-051 | Open | - | 2026-04-27 | Dependencies / reproducibility | P2 | 10 | 11 | 3 | 2 | 2 | `latest` versions in package manifests create non-reproducible dependency behavior |
| WTF-BB-052 | Open | - | 2026-04-27 | Data integrity / analytics | P1 | 12 | 7 | 4 | 3 | 1 | DB health scan shows most public tables empty and top populated tables still sparse |
| WTF-BB-053 | Fixed | Codex TV resilience pass | 2026-05-04 | TV microapp / reliability | P1 | 13 | 8 | 3 | 4 | 2 | Canonical `/tv` misses TV2 resilience paths (skip/error telemetry, skip-notice UX, session telemetry) |
| WTF-BB-054 | Fixed | Codex TV2 retirement pass | 2026-05-04 | TV microapp / platform health | P1 | 12 | 6 | 3 | 3 | 3 | Dual TV implementations (`/tv` and `/tv2`) block safe, staged rollout of player behavior changes |
| WTF-BB-055 | Archived | Codex TV2 retirement pass | 2026-05-04 | TV microapp / test coverage | P2 | 10 | 13 | 3 | 3 | 1 | No automated parity checks between `/tv` and `/tv2` for stream/error-handling edge cases |
| WTF-BB-056 | Open | - | 2026-04-27 | Security / telemetry integrity | P1 | 12 | 7 | 4 | 1 | 4 | Unauthenticated client log ingestion route is exempt from API rate limiting |
| WTF-BB-057 | Open | - | 2026-04-27 | Security / command safety | P1 | 13 | 5 | 4 | 4 | 3 | Supabase backup command builder interpolates DB URL into a shell command |
| WTF-BB-058 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 10 | 2 | 3 | 2 | Shared on-boot/domain-profile caches are global maps without key eviction |
| WTF-BB-059 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 11 | 2 | 3 | 2 | Board webhook rate limiter retains per token+IP keys without TTL-based eviction |
| WTF-BB-060 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 9 | 12 | 2 | 3 | 1 | DEX cache keyspace is unbounded by request params (`counterparts`, `metrics`) |
| WTF-BB-061 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 10 | 13 | 2 | 3 | 3 | TzKT response cache stores arbitrary pagination/address combinations indefinitely |
| WTF-BB-062 | Verified | Codex W repair pass | 2026-05-24 | Runtime / API scaling | P2 | 10 | 10 | 3 | 2 | 2 | X DM cache maps never garbage-collect stale user-context keys |
| WTF-BB-063 | Fixed | Swarm A4 | 2026-04-28 | Runtime / memory hygiene | P2 | 11 | 11 | 3 | 3 | 2 | Studio user Drive caches persist by user ID with no per-process bound |
| WTF-BB-064 | Fixed | gardener session | 2026-04-27 | Kiln integration / deploy | P1 | 13 | 5 | 3 | 4 | 2 | Collection factory depended on sibling Kiln paths and local-only API defaults |
| WTF-BB-065 | Fixed | gardener session | 2026-04-27 | wtf.tez / subdomains | P1 | 12 | 7 | 3 | 4 | 1 | wtf.tez deploy/test/UI paths drifted back to hardcoded `hack.*` parent domains |
| WTF-BB-066 | Open | Codex in-app market pass | 2026-05-05 | Kiln integration / security | P1 | 14 | 4 | 2 | 3 | 5 | Public `kiln.wtfgameshow.app` proxy relies on host Kiln token configuration |
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
| WTF-BB-088 | Fixed | Codex aired-race pass | 2026-05-04 | TV microapp / playback race | P1 | 12 | 7 | 3 | 4 | 1 | Stream refetch can swap the currently airing item before cursor resync |
| WTF-BB-089 | Fixed | Codex channel-switch playback pass | 2026-05-04 | TV microapp / playback race | P1 | 12 | 7 | 3 | 4 | 1 | Channel switch reuses the previous airing item until it ends instead of cutting to the new feed |
| WTF-BB-090 | Fixed | Codex broadcast playback pass | 2026-05-04 | TV microapp / playback architecture | P0 | 14 | 3 | 4 | 5 | 0 | Client-owned cursor and local bumper gates compete with the server feed, causing overlapping media and DVD-style playback |
| WTF-BB-091 | Fixed | Codex TV overlay metadata pass | 2026-05-04 | TV microapp / metadata UX | P1 | 11 | 9 | 3 | 4 | 0 | TV overlay credits fall back to wallet addresses, imported library tokens lose title-card metadata, and uploaded media cannot carry editable creator credits or Objkt links |
| WTF-BB-092 | Fixed | Codex MCP agent layer pass | 2026-05-04 | MCP / agent access control | P1 | 14 | 4 | 4 | 4 | 2 | Public MCP agent layer needs per-user token auth, rate limits, public-data boundaries, and admin feature gates |
| WTF-BB-093 | Fixed | Codex TV creator workflow pass | 2026-05-04 | TV microapp / creator workflow UX | P1 | 11 | 9 | 3 | 4 | 0 | Playlist editing is trapped behind the active-playlist path, media management conflates detach with delete, and public bumper-pool removal is exposed only as destructive delete |
| WTF-BB-094 | Verified | Codex in-app market shrink pass | 2026-05-05 | Tezos / contract size | P1 | 11 | 9 | 2 | 4 | 1 | In-app market SmartPy contract exceeds Kiln Shadowbox source limit |
| WTF-BB-095 | Verified | Codex in-app market cart pass | 2026-05-05 | In-app market / data integrity | P1 | 11 | 9 | 2 | 4 | 1 | Single-transfer purchase uniqueness blocks multi-item cart grants |
| WTF-BB-096 | Verified | Codex in-app market cart pass | 2026-05-05 | In-app market / listing IDs | P2 | 8 | 14 | 1 | 3 | 1 | Seeded item listing id collides with cart router sentinel |
| WTF-BB-097 | Verified | Codex pet ball account cap pass | 2026-05-05 | In-app market / render budget | P1 | 11 | 9 | 2 | 4 | 1 | Pet ball cap must be account-owned active inventory, not cart-local |
| WTF-BB-098 | Fixed | Codex modular architecture refactor | 2026-05-05 | Desktop OS / modularity | P2 | 10 | 11 | 4 | 3 | 0 | Desktop shell owns cursor, icon physics, and pet actors inline |
| WTF-BB-099 | Fixed | Codex modular architecture refactor | 2026-05-05 | Desktop OS / modularity | P2 | 10 | 11 | 4 | 3 | 0 | Desktop pet feature still bundles care tray, market, toys, and shared-world simulation |
| WTF-BB-100 | Verified | Codex server verifier pass | 2026-05-05 | Tezos / in-app market verification | P1 | 11 | 9 | 2 | 4 | 1 | In-app market verifier misses live TzKT entrypoint shape |
| WTF-BB-101 | Verified | Codex server verifier pass | 2026-05-05 | In-app market / catalog policy | P1 | 12 | 7 | 2 | 4 | 2 | Direct listing fallback can grant inactive catalog items |
| WTF-BB-102 | Fixed | Division 04 TVMenuScreens leader | 2026-05-06 | TV microapp / modularity | P2 | 10 | 11 | 4 | 3 | 0 | TV server router and client page block parallel domain work |
| WTF-BB-103 | Fixed | Codex modular architecture refactor | 2026-05-06 | W microapp / modularity | P2 | 10 | 11 | 4 | 3 | 0 | W server router and client page block parallel social-domain work |
| WTF-BB-104 | Fixed | Codex modular architecture refactor | 2026-05-06 | Admin console / modularity | P2 | 10 | 11 | 4 | 3 | 0 | Admin route and page bundle unrelated ops panels into one change surface |
| WTF-BB-105 | Fixed | Division 06 Marketplace client leader | 2026-05-05 | Marketplace client / modularity | P2 | 10 | 11 | 4 | 3 | 0 | Marketplace client page bundles listing, auction, trade-board, and wallet action flows |
| WTF-BB-106 | Fixed | Division 01 StudioProject leader | 2026-05-06 | Studio client / modularity | P2 | 10 | 11 | 4 | 3 | 0 | StudioProject client page blocks parallel project-workspace work |
| WTF-BB-107 | Verified | Codex pet care market removal pass | 2026-05-06 | Desktop pet / in-app market inventory | P1 | 12 | 7 | 3 | 4 | 1 | Pet care tray exposes market capability while food inventory defaults are not guaranteed |
| WTF-BB-108 | Verified | Codex pet rest test unblock pass | 2026-05-06 | Desktop pet / care tool UX | P1 | 9 | 12 | 1 | 4 | 0 | Rest tool is gated by shoebox inventory during live pet testing |
| WTF-BB-109 | Fixed | Codex desktop item interaction pass | 2026-05-06 | Desktop pet / item interactions | P2 | 10 | 11 | 4 | 3 | 0 | Desktop items need element-owned interaction rules |
| WTF-BB-110 | Fixed | Codex desktop artifact ownership correction | 2026-05-06 | Desktop OS / in-app items | P1 | 12 | 7 | 4 | 4 | 0 | Desktop artifacts are incorrectly owned by pet care tray |
| WTF-BB-111 | Fixed | Codex desktop mutator product pass | 2026-05-06 | Desktop OS / item architecture | P1 | 12 | 7 | 4 | 4 | 0 | Desktop mutators, tools, media unlocks, and environment elements need modular domain wiring |
| WTF-BB-112 | Verified | Codex arcade/console split pass | 2026-05-07 | Frontend / link safety | P2 | 9 | 12 | 1 | 2 | 3 | Provenance/support links failed external-link safety gate |
| WTF-BB-113 | Verified | Codex arcade/console split pass | 2026-05-07 | Frontend / public route runtime | P1 | 11 | 8 | 1 | 5 | 1 | Public WTF Arcade route crashed on vendored ZIP loader import |
| WTF-BB-114 | Verified | Codex arcade/console split pass | 2026-05-08 | Console catalog / manifest parity | P2 | 7 | 15 | 1 | 3 | 0 | Console stock classifier and installed manifest drifted |
| WTF-BB-115 | Verified | Codex arcade/console split pass | 2026-05-08 | MCP / agent discoverability | P2 | 8 | 14 | 1 | 3 | 1 | Arcade MCP tools drifted from capabilities and scopes |
| WTF-BB-116 | Verified | Codex arcade/console split pass | 2026-05-08 | Arcade catalog / data migration | P2 | 8 | 14 | 1 | 4 | 0 | Existing source rows emitted legacy Console proxy paths |
| WTF-BB-117 | Verified | Codex arcade/console split pass | 2026-05-08 | Game Studio / domain boundaries | P3 | 5 | 16 | 1 | 2 | 0 | Studio publish handoff leaked Console ownership after Arcade split |
| WTF-BB-118 | Verified | Codex arcade/console split pass | 2026-05-08 | Console catalog / dedupe | P2 | 7 | 15 | 1 | 3 | 0 | DB-backed stock rows duplicated installed Console cartridges |
| WTF-BB-119 | Verified | Codex game-studio hardening pass | 2026-05-08 | Game Studio / upload validation | P2 | 8 | 14 | 2 | 3 | 0 | Studio drafts accepted local asset payloads before enforcing upload limits |
| WTF-BB-120 | Verified | Codex arcade/console boundary pass | 2026-05-08 | SDK / domain boundaries | P3 | 5 | 16 | 1 | 2 | 0 | Regular Console SDK exposed source compatibility alias |
| WTF-BB-121 | Verified | Codex release-readiness pass | 2026-05-08 | Deploy / DB migrations | P2 | 7 | 15 | 1 | 3 | 0 | Arcade migrations reused existing migration numbers |
| WTF-BB-122 | Fixed | Codex wallet/RPC emergency pass | 2026-05-08 | Tezos wallet / checkout | P1 | 11 | 9 | 2 | 4 | 1 | Persisted wallet address can reach checkout without Taquito wallet provider |
| WTF-BB-123 | Fixed | Codex wallet/RPC emergency pass | 2026-05-08 | Tezos RPC / deploy config | P0 | 13 | 5 | 2 | 5 | 1 | ECAD RPC defaults will break Tezos operations after provider shutdown |
| WTF-BB-124 | Open | - | 2026-05-08 | Tezos marketplace / wallet binding | P1 | 13 | 5 | 3 | 4 | 2 | Marketplace and barter writes do not bind contract sends to the expected wallet |
| WTF-BB-125 | Open | - | 2026-05-08 | Tezos external marketplace / wallet preflight | P1 | 11 | 9 | 2 | 4 | 1 | External marketplace batch builders can touch Taquito wallet contracts before signer preflight |
| WTF-BB-126 | Open | - | 2026-05-08 | Tezos recapture / settlement | P1 | 14 | 4 | 4 | 4 | 2 | Recapture, auction, ante, and entry-fee flows rely on manual op-hash attestations instead of wallet-backed sends |
| WTF-BB-127 | In Progress | Codex side quest UX claim pass | 2026-05-22 | Rewards / side quest automation | P1 | 11 | 9 | 2 | 4 | 1 | Side-quest auto-verification schema includes unimplemented reward handles |
| WTF-BB-128 | Fixed | Codex WTF OS admin surface pass | 2026-05-08 | Admin tooling / WTF OS | P1 | 12 | 7 | 4 | 4 | 0 | WTF OS apps lack a complete strict-admin native/admin-panel settings surface registry |
| WTF-BB-129 | Fixed | Codex platform wallet keyring pass | 2026-05-08 | Tezos platform wallets / key custody | P1 | 14 | 4 | 4 | 4 | 2 | Platform wallet custody depends on one legacy env secret instead of a role-aware keyring |
| WTF-BB-130 | Fixed | Codex docs cleanup pass | 2026-05-08 | Public repo / operational intel | P1 | 14 | 4 | 3 | 3 | 4 | Public GitHub exposes internal attack map and live-risk backlog |
| WTF-BB-131 | Fixed | Codex public-repo risk audit | 2026-05-08 | Build context / key custody | P1 | 13 | 5 | 1 | 3 | 5 | Docker context did not ignore platform wallet keyring artifacts |
| WTF-BB-132 | Verified | Codex desktop icon stability pass | 2026-05-08 | Desktop OS / icon layout | P2 | 8 | 14 | 2 | 3 | 0 | Desktop icon layout allow-list drift caused moved icons to reset |
| WTF-BB-133 | Verified | Codex platform wallet custody cleanup | 2026-05-08 | Tezos platform wallets / key custody | P1 | 12 | 7 | 2 | 3 | 3 | Platform wallet helper defaulted public manifests into the repo |
| WTF-BB-134 | Verified | Codex desktop wiring pass | 2026-05-08 | Desktop OS / event and route wiring | P2 | 9 | 12 | 3 | 3 | 0 | Desktop icon/item automation and route wiring drifted after restructuring |
| WTF-BB-135 | Verified | Codex inventory E2E scheme pass | 2026-05-08 | E2E / interaction monitoring | P1 | 12 | 7 | 4 | 4 | 0 | Interaction inventory lacks an executable domain/subdomain E2E coverage gate |
| WTF-BB-136 | Verified | Codex inventory depth pass | 2026-05-08 | E2E / coverage claims | P2 | 7 | 15 | 1 | 3 | 0 | Inventory E2E skeleton could be mistaken for full feature behavior coverage |
| WTF-BB-137 | Verified | Codex live puppet orchestration pass | 2026-05-08 | E2E / live actor orchestration | P1 | 13 | 6 | 3 | 5 | 1 | Inventory E2E needed actor-backed puppet users and signer wallets |
| WTF-BB-138 | In Progress | Codex casino backend audit pass | 2026-05-09 | Casino / compliance and economy | P1 | 16 | 1 | 4 | 5 | 3 | Casino wagering must stay fail-closed until compliance, settlement, and house accounting exist |
| WTF-BB-139 | Verified | Codex admin polish/app-gate pass | 2026-05-09 | Desktop OS / admin UX | P2 | 10 | 11 | 3 | 4 | 0 | Desktop app gates hide icons but leave Start Menu entries live |
| WTF-BB-140 | Fixed | Codex Studio media preview pass | 2026-05-09 | Studio / media review UX | P2 | 9 | 12 | 2 | 4 | 0 | Studio image previews and open-original affordances are unreliable or unclear |
| WTF-BB-141 | Verified | Codex Hackcade arcade playback pass | 2026-05-09 | Arcade / source-game runtime | P1 | 11 | 9 | 2 | 5 | 0 | Hackcade-source Arcade games crash under the published-game sandbox |
| WTF-BB-142 | Verified | Codex Arcade pass-card/layout pass | 2026-05-09 | Arcade / economy and UX | P1 | 12 | 7 | 3 | 5 | 0 | Arcade catalog layout buries games and paid play does not require a Play Pass Card |
| WTF-BB-143 | Verified | Codex post-send deploy polish | 2026-05-09 | CI / deploy workflow | P2 | 7 | 15 | 1 | 3 | 0 | Hetzner deploy workflow uses a deprecated GitHub Actions Node runtime |
| WTF-BB-144 | Verified | Codex OS cohesion pass | 2026-05-09 | Desktop OS / shell cohesion | P1 | 12 | 7 | 3 | 5 | 0 | WTF OS launcher ownership is split and app crashes can collapse the desktop |
| WTF-BB-145 | Verified | Codex OS mechanics pass | 2026-05-09 | Desktop OS / window management | P2 | 9 | 12 | 3 | 3 | 0 | WTF OS windows do not behave like durable OS sessions |
| WTF-BB-146 | Verified | Codex OS broken-window sweep | 2026-05-09 | App route resilience / inventory E2E | P1 | 11 | 9 | 3 | 4 | 0 | Inventory route smoke exposed app windows that crash on sparse API payloads |
| WTF-BB-147 | Verified | Codex wallet refresh pass | 2026-05-24 | Wallet auth / passive session refresh | P1 | 12 | 7 | 2 | 5 | 1 | Passive page refresh can request wallet ownership signatures for unlinked cached wallets |
| WTF-BB-148 | Verified | Codex Skywire registration hotfix | 2026-05-24 | Skywire / AT Protocol registration UX | P2 | 8 | 14 | 2 | 4 | 0 | Skywire registration autofill can submit WTF username as email |
| WTF-BB-149 | Verified | Codex Skywire PDS error hotfix | 2026-05-24 | Skywire / AT Protocol registration UX | P1 | 11 | 9 | 3 | 4 | 1 | Skywire PDS createAccount rejections can escape as 500s |
| WTF-BB-150 | Verified | Codex Skywire phone verification flow | 2026-05-24 | Skywire / AT Protocol registration UX | P1 | 12 | 8 | 3 | 5 | 0 | Skywire reports required phone verification but does not offer the AT Protocol verification flow |
| WTF-BB-151 | Verified | Codex Skywire external phone verification pass | 2026-05-24 | Skywire / AT Protocol registration UX | P1 | 12 | 8 | 3 | 5 | 0 | `bsky.social` requires phone verification but rejects public phone-code requests |
| WTF-BB-152 | Verified | Codex Skywire official signup UI pass | 2026-05-24 | Skywire / AT Protocol registration UX | P2 | 9 | 12 | 2 | 4 | 0 | Official-signup-managed PDSes still expose Skywire registration form fields |
| WTF-BB-153 | Verified | Codex Skywire OAuth connect hardening pass | 2026-05-24 | Skywire / AT Protocol connection UX | P2 | 9 | 12 | 2 | 4 | 0 | Bluesky connect can fail before OAuth when given a short username |
| WTF-BB-154 | Open | - | 2026-05-24 | Build / dirty worktree isolation | P1 | 12 | 7 | 3 | 4 | 1 | Unrelated dirty Mastodon/Subdomains work can block scoped W verification |
| WTF-BB-155 | Verified | Codex Skywire OAuth/Tezos identity pass | 2026-05-24 | Skywire / AT Protocol identity bridge | P1 | 12 | 8 | 3 | 5 | 0 | AT OAuth callback can complete without linking and Tezos domains stay buried in wallets |
| WTF-BB-156 | Fixed | Codex Skywire OAuth callback persistence repair | 2026-05-24 | Skywire / AT Protocol connection UX | P1 | 12 | 8 | 3 | 5 | 0 | OAuth callback stores sessions too late for profile hydration and can strand the popup |
| WTF-BB-157 | Fixed | Codex Skywire full-send gate repair | 2026-05-24 | Build / shared DTO typing | P2 | 8 | 14 | 1 | 4 | 0 | Communication route resolver leaks nullable browser policy reason into non-null DTO |
| WTF-BB-158 | Fixed | Codex Skywire Bluesky client pass | 2026-05-24 | Skywire / Bluesky client UX | P1 | 13 | 6 | 4 | 5 | 0 | Skywire links accounts but does not behave like a usable Bluesky client |
| WTF-BB-159 | Fixed | Codex Skywire OAuth restore hotfix | 2026-05-24 | Skywire / AT Protocol OAuth session restore | P0 | 15 | 2 | 2 | 5 | 3 | Restored OAuth token sets omit the DID subject and break every authenticated Skywire tab |
| WTF-BB-160 | Fixed | Codex Skywire session persistence hardening | 2026-05-24 | Skywire / AT Protocol session lifecycle | P0 | 16 | 1 | 3 | 5 | 3 | OAuth SDK delete/restore paths can erase or hide persisted AT sessions across refreshes |
| WTF-BB-161 | Fixed | Codex Skywire feed/session live-test pass | 2026-05-24 | Skywire / AT Protocol feed delivery | P0 | 17 | 1 | 4 | 5 | 3 | Restored OAuth sessions still fail client-auth shape and read tabs use the wrong AT surface |
| WTF-BB-162 | Fixed | Codex inventory route smoke unblock | 2026-05-24 | Wallet / WTF Domains route resilience | P2 | 9 | 12 | 2 | 4 | 0 | WTF Domains route crashes when hack.tez config is sparse |
| WTF-BB-163 | Fixed | Codex inventory route smoke unblock | 2026-05-24 | Comms / Digest route resilience | P2 | 9 | 12 | 2 | 4 | 0 | Digest route crashes when comms items payload is sparse |

## Issue Details

### WTF-BB-163 - Digest route crashes when comms items payload is sparse

- Category: Comms / Digest route resilience
- Status: Fixed
- Owner/Session: Codex inventory route smoke unblock
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed the route smoke for `/digest` with `TypeError: Cannot read properties of undefined (reading 'map')`.
  - The Digest page assumed `itemsQuery.data.items` always existed after the query resolved.
- Why it matters:
  - Sparse or unexpected comms payloads should show an empty digest, not crash the desktop app window or block unrelated production fixes.
- Fix:
  - Digest now normalizes `itemsQuery.data?.items ?? []` before rendering and empty-state checks.
- Verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Unified timeline"`
  - `npm run test:e2e:inventory`

### WTF-BB-162 - WTF Domains route crashes when hack.tez config is sparse

- Category: Wallet / WTF Domains route resilience
- Status: Fixed
- Owner/Session: Codex inventory route smoke unblock
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed the route smoke for `/wtf-subdomains` with `TypeError: Cannot read properties of undefined (reading 'productName')`.
  - The Playwright harness intentionally returns a sparse `{ ok: true, grants: [], config: {}, items: [] }` fallback for unmatched WTF subdomain API paths, which left `HackTezPanel` with no `attribution` object.
- Why it matters:
  - Inventory route smoke should prove every desktop route survives sparse API payloads. One brittle sibling route can block unrelated live Skywire fixes.
- Fix:
  - `HackTezPanel` now optional-chains the `attribution` object itself before reading product, org, creator profile, or creator username.
- Verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "WTF Domains"`
  - `npm run test:e2e:inventory`

### WTF-BB-161 - Restored OAuth sessions still fail client-auth shape and read tabs use the wrong AT surface

- Category: Skywire / AT Protocol feed delivery
- Status: Fixed
- Owner/Session: Codex Skywire feed/session live-test pass
- Score: C4 + F5 + S3 + P0(5) = 17
- Evidence:
  - User live-testing report on 2026-05-24: reconnect completes, but Home still says Skywire needs a reconnect; WTF/Tezos tabs show `forbidden`; Discover shows the connected user and a follow affordance.
  - Production logs show OAuth restore failing with `Client authentication method "undefined" no longer supported`.
  - Local SDK inspection shows `NodeSavedSession.authMethod` must be an object such as `{ method: "none" }`, not the string `"none"`.
  - Skywire read-only search/discovery feeds were routed through the connected account session/PDS when Bluesky search/actor/official-feed reads should use the public AppView, while the WTF tab used keyword search instead of the official account's author feed.
- Why it matters:
  - Skywire must deliver the connected user's home timeline, the official WTFgameshow account feed, and other connected Skywire users without asking users to reconnect or showing raw upstream authorization failures.
- Likely correction direction:
  - Restore OAuth rows with the SDK's exact `authMethod` shape, keep Home authenticated, route read-only search/discovery/official author feeds through public AppView, and recommend WTF users with linked AT accounts while excluding self-follow.
- Fix:
  - Restored OAuth rows now rebuild `authMethod` as `{ method: "none" }`, matching the installed SDK's `NodeSavedSession` contract.
  - The WTF feed tab now reads the configured official account through `app.bsky.feed.getAuthorFeed`.
  - Tezos/search/actor discovery/author-feed reads now use the public Bluesky AppView instead of the connected user's PDS session.
  - Discover now recommends WTF users with linked AT Protocol accounts through `/api/skywire/actors/recommended` and disables self-follow affordances.
- Verification:
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run check:external-links`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "WTF Domains"`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Unified timeline"`
  - `npm run test:e2e:inventory`

### WTF-BB-160 - OAuth SDK delete/restore paths can erase or hide persisted AT sessions across refreshes

- Category: Skywire / AT Protocol session lifecycle
- Status: Fixed
- Owner/Session: Codex Skywire session persistence hardening
- Score: C3 + F5 + S3 + P0(5) = 16
- Evidence:
  - User live-testing report on 2026-05-24 after the `sub` hotfix: "This session was deleted by another process" and normal page refreshes should preserve session state.
  - The AT OAuth SDK emits that message when its store returns no saved session for the DID being restored.
  - Skywire's `sessionStore.del` cleared encrypted DB tokens for any SDK delete request, so a transient restore-shape bug could permanently convert a linked account into a tokenless row.
  - Restored OAuth rows depended on separately persisted issuer/audience metadata even though the pending SDK session already contains `tokenSet.aud`.
- Why it matters:
  - A linked AT account must survive page refreshes, server restarts, and deploys. Losing the encrypted session makes Skywire look connected while every authenticated Bluesky action requires reauth or throws raw SDK errors.
- Fix:
  - Persist the full OAuth restore contract into server storage, including subject, issuer, audience, token expiry, and DPoP key material.
  - Make SDK cache deletion non-destructive for persisted DB tokens; only explicit unlink should clear encrypted tokens.
  - Expose reconnect-required account state when stored tokens are truly missing, and let public-read Skywire surfaces fall back to appview instead of breaking every tab.
- Verification:
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`
  - `npm run test:e2e:inventory`
  - `npm run check:external-links`

### WTF-BB-159 - Restored OAuth token sets omit the DID subject and break every authenticated Skywire tab

- Category: Skywire / AT Protocol OAuth session restore
- Status: Fixed
- Owner/Session: Codex Skywire OAuth restore hotfix
- Score: C2 + F5 + S3 + P0(5) = 15
- Evidence:
  - User live-testing report on 2026-05-24: Home tab and every Skywire tab show "Token set does not match the expected sub".
  - `@atproto/oauth-client` throws that exact error when `client.restore(did)` loads a stored session whose `tokenSet.sub` does not match the requested DID.
  - Skywire's DB restore path rebuilt OAuth token sets with access/refresh tokens, scope, and token type only, dropping `sub`, `iss`, and `aud`.
- Why it matters:
  - The OAuth connection can appear linked while every authenticated AT Protocol read/write call fails, making Skywire unusable during live testing.
- Likely correction direction:
  - Rebuild stored OAuth sessions with the identity-bearing token fields required by the SDK: `sub`, `iss`, `aud`, token type, scope, access/refresh tokens, and ISO expiration.
- Verification:
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`

### WTF-BB-158 - Skywire links accounts but does not behave like a usable Bluesky client

- Category: Skywire / Bluesky client UX
- Status: Fixed
- Owner/Session: Codex Skywire Bluesky client pass
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - User verified OAuth linking now works but reported Skywire is a "garbage bluesky client" where content/actions do not feel usable.
  - `server/routes/skywire.ts` already has a real `feedType=following` home timeline path, but `client/src/pages/Skywire.tsx` never exposes that tab; users land on account tools plus keyword-search feeds.
  - Current feed cards render raw AT payload fragments without avatars, timestamps, metrics, embed previews, repost/reply context, source links, or pagination.
- Why it matters:
  - Skywire's first post-link experience should be the user's Bluesky home timeline. If the app links identity but cannot browse, post, reply, like, and follow in a recognizable way, users are better off leaving WTF OS.
- Likely correction direction:
  - Promote the authenticated Bluesky home timeline to the default Skywire surface, normalize AT feed payloads server-side, add cursor pagination, and render Bluesky-grade cards while keeping WTF-native AT repo extensions as secondary tabs.
- Fix:
  - Added a normalized Skywire feed contract for Bluesky home timeline, search feeds, author feeds, and notifications.
  - Promoted connected users to a Home tab backed by `app.bsky.feed.getTimeline`.
  - Replaced raw payload rendering with reusable feed cards that include author identity, timestamps, embeds, metrics, viewer like/repost state, source links, replies, and cursor pagination.
  - Updated the social inventory workflow to probe Skywire home/WTF/Tezos feed APIs and notification behavior.
- Verification:
  - `npm run check:external-links`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`
  - `HARNESS_PORT=4177 npm run test:e2e:inventory`

### WTF-BB-157 - Communication route resolver leaks nullable browser policy reason into non-null DTO

- Category: Build / shared DTO typing
- Status: Fixed
- Owner/Session: Codex Skywire full-send gate repair
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - After rebasing onto `origin/main`, `npm run check -- --pretty false` failed with `server/features/comms/route-resolver.ts(59,7): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.`
- Why it matters:
  - The production TypeScript gate blocks deploy even though this was unrelated to the Skywire fix.
- Fix:
  - Normalize `policy.reason ?? "browser_policy_blocked"` before returning the shared `CommunicationRouteTarget`.
- Verification:
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `HARNESS_PORT=4176 npm run test:e2e:inventory`

### WTF-BB-156 - OAuth callback stores sessions too late for profile hydration and can strand the popup

- Category: Skywire / AT Protocol connection UX
- Status: Fixed
- Owner/Session: Codex Skywire OAuth callback persistence repair
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-05-24: approving Bluesky OAuth opens a second WTF instance in the popup and shows "Bluesky connection did not complete. Try connecting again."
  - Production app logs for the attempt show `[skywire] atproto oauth callback failed: _XRPCError: The session was deleted by another process`.
  - SDK tracing shows `OAuthSession.fetchHandler` reloads the session from `sessionStore` before profile hydration; Skywire's store could return `undefined` during callback because new-account sessions were pending before the account row existed, but `sessionStore.get` only checked the database.
- Why it matters:
  - OAuth approval is the user's trust handoff. A successful upstream authorization must not become a second WTF desktop window with a vague failure notice.
- Fix direction:
  - Make pending OAuth sessions readable from the session store during callback and route popup callback results through a tiny completion page instead of loading the full Skywire app in the popup.
- Fix:
  - `sessionStore.get` now checks pending OAuth sessions before the DB, so the SDK-returned callback session can hydrate the profile before the account row exists.
  - Popup callback/start failures now render a minimal completion page that writes a same-origin storage event for the open Skywire window instead of redirecting the popup into the full WTF desktop.
  - Restored OAuth sessions now use `new Agent(session)` rather than a bound private fetch handler.
- Verification:
  - Production logs captured the root error: `_XRPCError: The session was deleted by another process`.
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts shared/tezos-identity.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `HARNESS_PORT=4176 npm run test:e2e:inventory`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`
  - `HARNESS_PORT=4175 npm run test:e2e:inventory`

### WTF-BB-154 - Unrelated dirty Mastodon/Subdomains work can block scoped W verification
| WTF-BB-147 | Open | - | 2026-05-24 | Build / dirty worktree isolation | P1 | 12 | 7 | 3 | 4 | 1 | Untracked Mastodon/Subdomains work can block unrelated W verification |

## Issue Details

### WTF-BB-147 - Untracked Mastodon/Subdomains work can block unrelated W verification

- Category: Build / dirty worktree isolation
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - During the W polish pass, broad verification in the original checkout failed on files outside W scope: `client/src/features/wtf-subdomains/CommitRevealPanel.tsx`, `server/features/wtf-subdomains/registrar-commit.test.ts`, and `shared/schema-mastodon.ts`.
- Why it matters:
  - A dirty worktree with unrelated feature drafts can make a scoped W repair look unshippable and can obscure whether the changed production surface is healthy.
- Likely correction direction:
  - Finish or isolate the Mastodon/Subdomains work on its own branch/worktree before using the original checkout for broad release gates.
- Verification idea:
  - With the unrelated files fixed or isolated, rerun `npm run check -- --pretty false`, `npm run build`, and `npm run test:e2e:inventory`.

### WTF-BB-155 - AT OAuth callback can complete without linking and Tezos domains stay buried in wallets

- Category: Skywire / AT Protocol identity bridge
- Status: Verified
- Owner/Session: Codex Skywire OAuth/Tezos identity pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-05-24: after official Bluesky signup, AT OAuth permission approval opened Bluesky in the new window but Skywire did not show the account as connected.
  - The callback path created an authenticated AT agent through a restored private fetch handler instead of the OAuth client library's documented `new Agent(session)` path.
  - The OAuth session store writes during callback happen before a new `atproto_accounts` row exists, so the first token persistence attempt can update zero rows and relied on a private cache recovery path.
  - `/api/atproto/me` exposed only one wallet `tezDomain` string even though linked wallets can resolve reverse and owned `.tez` domains through Tezos Domains.
- Why it matters:
  - Skywire is supposed to be the WTF OS AT Protocol identity app. OAuth approval must result in a visible linked account, and Tezos identity should be a first-class account bridge rather than hidden wallet decoration.
- Fix:
  - Added an explicit pending OAuth session handoff for callback sessions created before the account row exists, switched profile hydration to the documented `new Agent(session)` path, and added popup completion that refreshes the open Skywire app.
  - Added a shared user Tezos identity resolver, exposed preferred/reverse/owned `.tez` identity data from `/api/atproto/me`, enriched `/api/wallets`, and added `/api/wallets/:id/tezos-domain` so users can select a detected domain as their preferred Tezos identity.
  - Updated Skywire's Identity Bridge and Profile/Dashboard wallet displays to show preferred Tezos identity and detected owned domains.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts shared/tezos-identity.test.ts`
  - `npm run test:e2e:inventory:coverage`

### WTF-BB-150 - Skywire reports required phone verification but does not offer the AT Protocol verification flow

- Category: Skywire / AT Protocol registration UX
- Status: Verified
- Owner/Session: Codex Skywire phone verification flow
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User correctly pushed back that telling users to verify elsewhere is not enough.
  - The installed `@atproto/api` lexicons expose `com.atproto.temp.requestPhoneVerification`, and `com.atproto.server.createAccount` accepts `verificationPhone` plus `verificationCode`.
- Why it matters:
  - Skywire is meant to be a first-class AT Protocol app for WTF OS. If a PDS requires verification, the product should run the supported PDS verification flow in-app whenever the PDS exposes it.
- Fix notes:
  - Added an in-app PDS phone verification endpoint using `com.atproto.temp.requestPhoneVerification`, passed `verificationPhone` and `verificationCode` through Skywire registration, added phone/code controls to the registration UI, and registered `atproto.phone_verification.requested` in inventory coverage.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts`
  - `npm run check`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`
  - `npm run test:e2e:inventory`

### WTF-BB-153 - Bluesky connect can fail before OAuth when given a short username

- Category: Skywire / AT Protocol connection UX
- Status: Verified
- Owner/Session: Codex Skywire OAuth connect hardening pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - Skywire registration accepts short handles by appending the default `bsky.social` suffix, but the connect flow sent the handle as typed and the server validated it as a full DNS handle.
  - OAuth start failures returned raw errors or redirects without a visible Skywire message.
- Why it matters:
  - Users naturally type the same short Bluesky username in both registration and connect paths. Connect should normalize consistently and fail back into the app.
- Fix notes:
  - The client and `/api/atproto/oauth/start` now normalize short connect handles with the default registration suffix. OAuth start errors redirect back to Skywire with a visible connection notice and sanitized server logging.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts`
  - `npm run check`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`

### WTF-BB-152 - Official-signup-managed PDSes still expose Skywire registration form fields

- Category: Skywire / AT Protocol registration UX
- Status: Verified
- Owner/Session: Codex Skywire official signup UI pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - After routing `bsky.social` to official signup, the UI still rendered handle, email, password, invite, and disabled register controls in the same group.
- Why it matters:
  - A disabled local registration form implies Skywire might still create the account directly and invites users to fill out fields that will not be used for the official Bluesky signup path.
- Fix notes:
  - Skywire now shows only the official Bluesky signup action and OAuth connect flow. The direct account-creation form was removed from the user-facing app instead of being left behind a provider-mode branch.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts`
  - `npm run check`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`

### WTF-BB-151 - `bsky.social` requires phone verification but rejects public phone-code requests

- Category: Skywire / AT Protocol registration UX
- Status: Verified
- Owner/Session: Codex Skywire external phone verification pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - Production users could reach Skywire's new phone-code request button, but the selected PDS returned `InvalidRequest: phone verification not enabled`.
  - `https://bsky.social/xrpc/com.atproto.server.describeServer` reports `phoneVerificationRequired: true`, while `com.atproto.temp.requestPhoneVerification` rejects direct phone-code requests.
- Why it matters:
  - Skywire must not send users into a circular remediation flow. A PDS can require phone verification while managing that verification in its official signup surface instead of through the public temporary phone endpoint.
- Fix direction:
  - Keep the in-app AT Protocol phone-code request path for PDSes that expose it, but expose registration options that mark PDSes such as `bsky.social` as official-signup-managed and give users an in-app handoff to the PDS signup path before OAuth connection.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts`
  - `npm run check`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`
  - `npm run test:e2e:inventory`

### WTF-BB-149 - Skywire PDS createAccount rejections can escape as 500s

- Category: Skywire / AT Protocol registration UX
- Status: Verified
- Owner/Session: Codex Skywire PDS error hotfix
- Score: C3 + F4 + S1 + P1(3) = 11
- Evidence:
  - User reported Internal Server Error when registering with a real email address.
  - Production app logs showed `agent.createAccount` rejected with `InvalidPhoneVerification` and the message `Verification is now required on this server`.
- Why it matters:
  - AT Protocol registration depends on third-party PDS policy. A PDS-side invite, email, handle, phone, captcha, or verification rejection must tell the user what action is possible instead of looking like WTF infrastructure failed.
- Fix notes:
  - Wrapped Skywire `createAccount` in a PDS error boundary, returned sanitized 4xx JSON with PDS status/error metadata, and added phone-verification guidance for `bsky.social`.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts server/features/atproto/skywire-policy.test.ts`
  - `npm run check`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Skywire AT Protocol bridge"`

### WTF-BB-148 - Skywire registration autofill can submit WTF username as email

- Category: Skywire / AT Protocol registration UX
- Status: Verified
- Owner/Session: Codex Skywire registration hotfix
- Score: C2 + F4 + S0 + P2(2) = 8
- Evidence:
  - User reported `Invalid AT Protocol registration payload` while registering `wtfgameshow`.
  - The registration email field was rendered as a generic text input, so browser autofill could place the WTF username into the email slot.
- Why it matters:
  - AT identity registration must make field-level failures obvious; otherwise users cannot distinguish bad handle syntax from bad email, password, invite code, or PDS configuration.
- Fix notes:
  - Added explicit email/password/handle autocomplete semantics, client-side email-shape submit gating, default `.bsky.social` suffix normalization for short handles, and server field-level parser errors.
- Verification:
  - Focused AT/Skywire policy tests, typecheck, build, and Skywire route smoke.

### WTF-BB-147 - Passive page refresh can request wallet ownership signatures for unlinked cached wallets

- Category: Wallet auth / passive session refresh
- Status: Verified
- Owner/Session: Codex wallet refresh pass
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - `WalletProvider` rehydrates a cached Tezos wallet address from localStorage on page load.
  - Once the web session user is available, the passive refresh path checks `/api/wallets`.
  - If the cached wallet is not already linked to the logged-in account, the same passive path requests `/api/wallets/challenge` and calls `signPayload`, prompting the wallet out of the blue.
- Why it matters:
  - A page refresh should observe cached wallet display state and sync already-linked wallets, not create account identity state or ask for wallet proof.
- Likely correction direction:
  - Keep passive refresh in a read/sync-only mode. Only user-initiated wallet connection, login/register, or participation flows that require wallet proof may request a challenge signature.
- Verification idea:
  - Add a policy test proving passive refresh calls the wallet linker with signature linking disabled, while explicit `connect()` still permits signature-backed linking.
- Fix notes:
  - `WalletProvider` now calls the wallet linker in read/sync-only mode from passive page-load rehydration.
  - Signature-backed linking remains enabled for explicit user-initiated wallet connect flows.
  - The interaction inventory and behavior assertion registry now document that passive wallet rehydration must not request ownership proof.
- Verification:
  - `npx tsx --test client/src/lib/wallet-context-policy.test.ts` passed.
  - `npm run test:e2e:inventory:coverage` passed with 134 inventory rows, 611 handles, 79 route fixtures, 13 domain workflows, and 45 admin surfaces.
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory` passed 235/235.
  - During the W polish pass, `npm run check -- --pretty false` failed on untracked/adjacent files outside the W scope: `client/src/features/wtf-subdomains/CommitRevealPanel.tsx` and `server/features/wtf-subdomains/registrar-commit.test.ts`.
  - The same pass's `npm run build` completed Vite transformation but failed at the server bundle on `shared/schema-mastodon.ts:49` with `Unexpected ")"`.
- Why it matters:
  - A dirty worktree with unrelated untracked feature files can make a scoped W repair look unshippable, block E2E commands that run build first, and obscure whether the touched surface is actually healthy.
- Likely correction direction:
  - Either finish/fix the Mastodon/Subdomains work or isolate it on its own branch/worktree before running broad release gates for unrelated W changes.
- Verification idea:
  - With the unrelated untracked files fixed or isolated, rerun `npm run check -- --pretty false`, `npm run build`, and `npm run test:e2e:inventory`.

### WTF-BB-146 - Inventory route smoke exposed app windows that crash on sparse API payloads

- Category: App route resilience / inventory E2E
- Status: Verified
- Owner/Session: Codex OS broken-window sweep
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - Full inventory route smoke failed on `/tezos-intel` with `Cannot read properties of undefined (reading 'map')`.
  - After fixing that, broader smoke exposed `/marketplace` crashing on missing `listings`, `/my-gallery` crashing on missing pagination `total`, and `/studio/1` crashing on missing Studio project detail plus an unnecessary websocket attempt.
- Why it matters:
  - WTF OS can isolate a crashed app window, but the OS still feels broken if route fixtures regularly open crashed windows. App shells need to tolerate empty and partial API payloads as first-class empty states.
- Likely correction direction:
  - Normalize sparse route data at feature boundaries and gate realtime connections until required project data exists.
- Verification idea:
  - Run targeted inventory route smoke for each crashed route, then rerun the full inventory suite.
- Fix notes:
  - Defaulted Tezos Intel creator/market/source arrays to empty arrays before rendering lists.
  - Normalized marketplace on-chain state so listings, auctions, offers, and counts exist even when the payload is sparse.
  - Normalized My Gallery items/facets/pagination before rendering counts and filters.
  - Made Studio Project guard missing project detail and delay realtime socket connection until an actual project payload is present.
- Verification:
  - Targeted inventory route smoke passed for `/tezos-intel`, `/marketplace`, `/my-gallery`, `/studio/1`, and `/studio`.
  - `HARNESS_PORT=4177 npm run test:e2e:inventory` passed 211/211.

### WTF-BB-145 - WTF OS windows do not behave like durable OS sessions

- Category: Desktop OS / window management
- Status: Verified
- Owner/Session: Codex OS mechanics pass
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - Open windows, focus, minimized/maximized state, positions, and sizes are memory-only and disappear on refresh.
  - The taskbar can toggle individual windows but lacks a Show Desktop affordance, all-window restore semantics, and quick close behavior.
  - Keyboard users do not have a shell-level focus cycle for open windows.
- Why it matters:
  - A desktop shell feels like an OS when workspace state is durable and window management is fast. Losing the entire working set on refresh makes WTF OS feel like a themed page rather than an operating environment.
- Likely correction direction:
  - Persist the window session locally, add shell-level show-desktop/minimize-all/restore behavior, add focus cycling, and cover the pure window mechanics with tests.
- Verification idea:
  - Run focused window-state tests, `npm run check -- --pretty false`, inventory coverage, build, and a browser smoke for taskbar window controls.
- Fix notes:
  - Added a versioned local window-session store that persists open windows, titles, positions, sizes, minimized/maximized state, focus, and top z-index across refreshes.
  - Added shell-level Show Desktop / Restore Windows behavior in the taskbar, a minimize-all keyboard shortcut, and visible taskbar state for the whole workspace.
  - Added keyboard focus cycling with `Ctrl+Alt+ArrowLeft` and `Ctrl+Alt+ArrowRight`, plus middle-click close on taskbar window buttons.
  - Added a styled-components prop-forwarding filter at the app root so React95 shell props no longer flood browser logs as DOM attribute errors.
  - Covered the pure window state model with focused tests and updated the interaction inventory with the new shell handles.
- Verification:
  - `npx tsx --test client/src/lib/window-state.test.ts client/src/components/layout/start-menu-app-gates.test.ts` passed.
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed with 123 inventory rows, 541 unique handles, 66 route fixtures, 13 domain workflows, and 36 admin surfaces.
  - `npm run build` passed.
  - Browser smoke on `http://localhost:3317`: `/links` opens as a window, Show Desktop persists it minimized, Restore returns it, and reload rehydrates the window session.
  - Browser smoke on `http://localhost:3317`: `/links` plus `/faq` persisted as two open windows; `Ctrl+Alt+ArrowLeft` focused `/links`, `Ctrl+Alt+ArrowRight` focused `/faq`, and `Ctrl+Alt+M` minimized both windows and returned to `/`.
  - Post-filter browser smoke had no page errors and no React95 prop-warning console errors; the remaining console errors were expected unauthenticated `401` resource probes.
  - `HARNESS_PORT=4177 npm run test:e2e:inventory` passed 211/211 after the broken-window sweep.

### WTF-BB-144 - WTF OS launcher ownership is split and app crashes can collapse the desktop

- Category: Desktop OS / shell cohesion
- Status: Verified
- Owner/Session: Codex OS cohesion pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - `PAGE_DEFS` is the route registry, but the Start Menu still owns a separate hardcoded app list and duplicated grouping decisions.
  - `PAGE_DEFS` contains a duplicate `/control-board` entry, making route metadata order-dependent.
  - Route rendering has only the root error boundary, so a single page render failure can replace the entire OS instead of failing inside one app window.
- Why it matters:
  - A cohesive OS needs one source of truth for launchable apps, predictable window behavior, and per-app failure containment.
- Likely correction direction:
  - Build Start Menu groups from the page registry, remove duplicate route metadata, add per-window crash isolation, and verify the launcher/gate model with focused tests plus inventory coverage.
- Verification idea:
  - Run focused Start Menu model tests, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and a build/browser smoke pass.
- Fix notes:
  - Added a registry-backed Start Menu model with explicit sections: Apps, Gameshow/Social/On Chain/Gaming/My Media, account/system/admin entries, Browse, then session action.
  - Moved Casino, Arcade, and Game Console under Gaming; moved My Games under My Media; and made Casino menu entries render visible but inactive when `/api/casino/status` reports no active membership card.
  - Added per-window error isolation so a route render failure shows an in-window recovery surface instead of collapsing the whole desktop.
  - Removed duplicate `/control-board` route metadata and changed new windows to open as windowed cascades on desktop.
  - Fixed development CORS to include the active `PORT`, which unblocked local browser smoke on non-default ports.
  - Verified with `npx tsx --test server/lib/cors-origins.test.ts client/src/components/layout/start-menu-app-gates.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, `npm run build`, and Playwright smoke against `http://localhost:3317`.

### WTF-BB-143 - Hetzner deploy workflow uses a deprecated GitHub Actions Node runtime

- Category: CI / deploy workflow
- Status: Verified
- Owner/Session: Codex post-send deploy polish
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence:
  - The successful `d87b0ba` Hetzner deploy emitted a GitHub Actions warning that Node.js 20 actions are deprecated and `actions/checkout@v4` will need Node 24 compatibility before the runner cutoff.
- Why it matters:
  - Full-send relies on the `main` push workflow. Leaving the deploy action runtime on a deprecation path risks a future production push failing for toolchain reasons unrelated to app code.
- Likely correction direction:
  - Move the checkout action to a Node 24-backed release while the deploy path is known healthy.
- Verification idea:
  - Push the workflow-only polish commit to `main`, watch the Hetzner deploy pass, and confirm the warning no longer appears.
- Fix notes:
  - Upgraded `.github/workflows/deploy.yml` from `actions/checkout@v4` to `actions/checkout@v5`, whose action metadata uses `node24`.
  - Verified with GitHub run `25608409139`: deploy completed successfully on `main` at `768ab8f`, all workflow steps passed, and the previous Node 20 compatibility annotation no longer appeared.

### WTF-BB-139 - Desktop app gates hide icons but leave Start Menu entries live

- Category: Desktop OS / admin UX
- Status: Verified
- Owner/Session: Codex admin polish/app-gate pass
- Score: C3 + F4 + S0 + P2(3) = 10
- Evidence:
  - The desktop icon renderer reads `/api/apps/desktop` and hides disabled app icons.
  - The Start Menu/Stuffs menu is hardcoded and still shows gated apps such as WTF Casino, WTF Arcade, WTF Console, WTF TV, Studio, Game Studio, and WTF IAM after an admin turns the desktop app off.
  - The central Admin Panel has many long tab labels in one fixed strip, making the admin surface feel cramped even when the OS window is maximized.
- Why it matters:
  - Operators expect a disabled WTF OS app to disappear from both launch surfaces. Leaving the Start Menu path visible makes the admin control misleading and keeps users one click away from a supposedly disabled app.
- Likely correction direction:
  - Make Start Menu entries use the same desktop-app gate state as icons, keep gate-aware labels explicit in the admin UI, and make the admin panel body/tabs use all available window space.
- Verification idea:
  - Run a pure gate-filter test, inventory coverage, and UI build/type checks. When practical, smoke the Start Menu after toggling an app gate.
- Fix notes:
  - Added shared Start Menu app-gate filtering so disabled desktop apps are also hidden from Start Menu app entries.
  - Reworked the central Admin Panel shell with compact titled tabs, a flexing full-height body, and clearer app-gate copy/actions.
  - Updated inventory docs and system specs for the Start Menu gate semantics.
  - Verified with `npx tsx --test client/src/components/layout/start-menu-app-gates.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run build`, `npx playwright test tests/playwright/inventory/system-integration.spec.mjs`, and `npm run test:e2e:inventory` (209 passed).
  - `npm run check -- --pretty false` remains blocked by unrelated dirty-worktree type errors in `client/src/pages/Hoard.tsx` and `server/features/game-studio/catalog.ts`.

### WTF-BB-140 - Studio image previews and open-original affordances are unreliable or unclear

- Category: Studio / media review UX
- Status: Fixed
- Owner/Session: Codex Studio media preview pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - Studio generated image/video preview and thumbnail derivatives are stored separately from originals, but the local disk driver streams them back as `application/octet-stream`.
  - With `X-Content-Type-Options: nosniff`, browser image surfaces can fail to render those derivatives inline, leaving uploaded images looking broken in the review canvas or file tree.
  - The active Studio canvas exposes pin and box tools, but the open-original path is only visible for unsupported file types, making it unclear whether Studio is meant for shared media review.
- Why it matters:
  - Studio is the collaboration room for creators. If uploaded or imported images do not visibly render, collaborators cannot discuss, annotate, or verify the media in context.
- Likely correction direction:
  - Serve generated Studio derivatives with deterministic safe image MIME fallbacks, make image previews fall back to the original when a derivative is missing or broken, and expose a clear open-original action for every selected file.
- Verification idea:
  - Add a MIME fallback unit test, run TypeScript/build checks, run inventory coverage, and smoke Studio image preview/open-original behavior when practical.
- Fix notes:
  - Added deterministic safe MIME fallbacks for Studio preview and thumbnail derivative streams, so local disk derivatives render as `image/webp` or `image/jpeg` instead of `application/octet-stream`.
  - Made image preview rendering fall back to the original file if a generated preview fails, and exposed an open-original action for selected Studio files.
  - Verified with `npx tsx --test server/lib/studio/serve-mime.test.ts`, `npm run build`, and `npm run test:e2e:inventory:coverage`.
  - `npm run check -- --pretty false` is blocked by unrelated dirty-tree TypeScript errors in `client/src/pages/Hoard.tsx` and `server/features/game-studio/catalog.ts`.
  - `npm run test:e2e:inventory` built successfully, then failed 46 route/market smoke tests after the harness server stopped accepting `127.0.0.1:4173/__test/state`; 163 inventory tests still passed, including Studio subdomain ownership.

### WTF-BB-141 - Hackcade-source Arcade games crash under the published-game sandbox

- Category: Arcade / source-game runtime
- Status: Verified
- Owner/Session: Codex Hackcade arcade playback pass
- Score: C2 + F5 + S0 + P1(4) = 11

- Evidence:
  - Hackcade-source games are imported as published Arcade cartridges and run inside the stricter published-game iframe sandbox.
  - Chromium throws `SecurityError: Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.`
  - Current Hackcade-source samples such as Flappy Bower and Hackatar Match read `localStorage` at module top level, so the iframe can load but the game logic crashes before play starts.
  - After storage fallback, Flappy Bower still showed the start screen with an inert button because sandboxed module requests send `Origin: null`; the global CORS allowlist rejected `/api/arcade/source/*/game.js` and `/hackcade-sdk.js` before the source proxy could attach public asset headers.
- Why it matters:
  - WTF Arcade shows these imported public games as playable, but the runtime sandbox prevents common Hackcade game code from booting.
- Likely correction direction:
  - Keep the stricter published-game sandbox, and make the Hackcade compatibility SDK provide safe in-frame storage fallbacks when native storage is unavailable.
- Verification idea:
  - Add a runtime test proving the compatibility SDK installs storage fallbacks in a sandbox without `allow-same-origin`, then run the Arcade source import/proxy unit tests and inventory coverage.
- Fix notes:
  - Added localStorage/sessionStorage fallbacks to the Hackcade compatibility SDK served by `/api/arcade/source/*/hackcade-sdk.js`.
  - Kept the stricter published-game iframe sandbox intact instead of granting all published games `allow-same-origin`.
  - Added a narrow CORS exception for `Origin: null` on public Arcade source asset paths only, while preserving normal CORS rejection for authenticated APIs such as `/api/auth/me`.
  - Updated the interaction inventory for the Arcade play runtime behavior.
  - Verified with `npx tsx --test server/lib/cors-origins.test.ts server/features/arcade/source-proxy.test.ts server/features/arcade/source-import.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and a local Playwright smoke of the real `/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/v1/index.html` iframe where clicking Start hid the overlay and ran the countdown.

### WTF-BB-142 - Arcade catalog layout buries games and paid play does not require a Play Pass Card

- Category: Arcade / economy and UX
- Status: Verified
- Owner/Session: Codex Arcade pass-card/layout pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - The public Arcade page stacked stats, discovery, champions, top players, recent scores, and player lookup above the game grid, leaving the visible game-selection area at roughly one row in common app-window sizes.
  - Session start consumed the `arcade-play-ticket` inventory item but did not require the user to own the `arcade-play-card`, so credits were not actually tied to a Play Pass Card.
  - Admin moderation exposed score caps and publish controls, but not the requested non-user-submitted game credit/free-play rule.
- Why it matters:
  - Users should immediately see and select games in the Arcade, and paid games must fail closed unless a user has both the card and enough loaded credits.
- Likely correction direction:
  - Give the game grid the main Arcade viewport, move score/community rails to a side panel, enforce card+credit checks on the server before session creation, keep market purchases as the mainnet WTF-backed grant path for credits, and add admin pricing controls for non-user-submitted Arcade games.
- Verification idea:
  - Add focused Arcade credit rule tests, run TypeScript and inventory coverage, and smoke the Arcade page at desktop/mobile widths plus a no-card/no-credit session failure.
- Fix notes:
  - Reworked the public Arcade layout so the game catalog owns the main viewport and score/community/player lookup data moves into a side rail on desktop, stacking below the catalog on narrow screens.
  - Added per-game Arcade credit rule fields, admin pricing controls for non-user-submitted games, and a server fail-closed play gate that requires both an `arcade-play-card` and enough `arcade-play-ticket` credits before a paid session opens.
  - Changed failed paid starts to return a Windows-style Arcade error message, and kept the market items free at inventory-seed time so real WTF/mainnet purchase enforcement stays with the market contract path.
  - Updated the interaction inventory and inventory-driven E2E registry for Play Pass status, credit consumption, rejected sessions, and admin credit rule changes.
  - Verified with `npx tsx --test server/features/arcade/payment.test.ts`, `npx tsx --test server/features/arcade/source-import.test.ts server/features/arcade/source-proxy.test.ts server/lib/cors-origins.test.ts`, `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` (211 passed).
  - Locally smoked the Arcade layout with Playwright route mocks at 1280px and 390px. A real-data local smoke was blocked by the local database missing the new Arcade credit columns until the schema migration is applied.
  - Full-send verification passed on production: GitHub run `25608307457` deployed `d87b0ba`, live `/api/health` reported that commit, `/arcade` returned HTTP 200, and `/api/arcade/games` returned published games with `arcadeCreditsRequired` and `arcadeCreditPrice` fields.

### WTF-BB-138 - Casino wagering must stay fail-closed until compliance, settlement, and house accounting exist

- Category: Casino / compliance and economy
- Status: In Progress
- Owner/Session: Codex casino backend audit pass
- Score: C4 + F5 + S3 + P1(4) = 16
- Evidence:
  - The new WTF Casino domain introduces app-pass access, an XTZ membership card, a table registry, and future games of chance where WTF tokens can be wagered.
  - WTF Does This Button Do?!!? is now a mocked-playable Casino table with deterministic XTZ balances, wallet-specific quotes, strict/flexible price protection, Rug Clash resolution, no-contest refunds, daily WTF minimum math, and a simulation runner. Real XTZ movement remains disabled.
  - Rug Pull: The Game is now being promoted to a mocked-playable Casino table with deterministic XTZ balances, join/delay/press/witness/vote mock APIs, Panic Mode share settlement, and a React95 pressure-table UI. Real XTZ movement remains disabled.
  - Guinea Pig Raceway is now being promoted to a mocked-playable Casino table with deterministic WTF balances, race-card/odds math, GLB racer assets, a Three.js race scene, mocked bet/effect APIs, settlement/replay metadata, and asset validation tests. Real WTF wagering remains disabled.
  - The current implementation intentionally exposes only the shell, access checks, membership verification, mocked table state, deterministic rule math, and payout helpers. `wageringEnabled` remains false and no game can create a live wager session yet.
  - Wagered games add regulatory, economic, replay, settlement, and fairness risks beyond Arcade/Console score-play.
- Why it matters:
  - Casino flows can transfer value and produce winners/losers with a house take. Enabling tables before age/geo/compliance policy, wallet-bound settlement, house accounting, replay guards, and audit trails would create a high-impact economy and security gap.
- Likely correction direction:
  - Keep the Casino table registry fail-closed until each game owns a modular wager-session engine, server verifier, house-take configuration, ledger/audit trail, role/admin controls, anti-replay checks, and compliance gate.
  - For Rug Pull specifically, prove button-lock caps, same-wallet delay rejection, Panic Mode share decay, witness vote modifier selection, next-round seeding, and settlement dust distribution in contract and live puppet tests.
  - For Guinea Pig Raceway specifically, prove betting lockout enforcement, intro timing, randomness commit/reveal or beacon integrity, underdog probability floor, effect caps/cooldowns, house take, no-winner carryover, replay manifest immutability, and multi-angle replay availability in contract and live puppet tests.
  - For WTF Button specifically, keep mocked XTZ behind clean payment interfaces until Tezos escrow, verifiable randomness, winner cooldown, quote replay, house accounting, and settlement audit logs have contract-backed tests.
  - Add actor-backed live puppet coverage for app pass + membership entry, then game-specific behavior tests for every wager table before enabling `wageringEnabled`.
- Verification idea:
  - Attempt Casino entry without app pass, without membership, with expired/replayed membership, and with no installed games; assert fail-closed responses.
  - For future games, run wallet-backed settlement tests that prove bet debit, payout, house take, replay rejection, and audit log persistence before release.
- Current progress notes:
  - 2026-05-09: Added WTF Button as a mocked-playable Casino table with pure mutez math, mocked balance/payment service, `/api/casino/wtf-button/*` endpoints, `/casino/wtf-button` React95 table UI, simulation runner, and 22 core mechanics tests. Clean worktree verification passed with `npx tsx --test server/features/casino/games/wtf-button/rules.test.ts`, `npm run casino:wtf-button:simulation -- --seed=codex-wtf-button-fullsend --days=20`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, `npm run build`, and `npm run test:e2e:inventory` (205 passed). `npm run test:e2e:live:puppets` is blocked locally because `DATABASE_URL` is unset before puppet seeding can start.
  - 2026-05-09: Promoted Rug Pull and Guinea Pig Raceway from planned/WIP to mocked-playable, Casino-gated modules with route pages, mock APIs, registry entries, tests, Raceway GLB assets, and inventory coverage while keeping real value transfer fail-closed.
  - 2026-05-09: Rug Pull verification passed with `npx tsx --test server/features/casino/games/rug-pull/rules.test.ts server/features/casino/games/rug-pull/service.test.ts`; Guinea Pig Raceway verification passed with `npx tsx --test server/features/casino/games/guinea-pig-raceway/rules.test.ts server/features/casino/games/guinea-pig-raceway/service.test.ts`, `npx tsx --test server/features/casino/games/guinea-pig-raceway/assets.test.ts`, `npm run casino:tables:simulation`, `npx playwright test tests/playwright/casino-raceway-assets.spec.mjs`, and `npx playwright test tests/playwright/casino-raceway-scene.spec.mjs`. Shared release checks passed with `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` (209 passed). `npm run test:e2e:live:puppets` remains blocked locally because `DATABASE_URL` is unset before puppet seeding can start.
  - 2026-05-09: Added an entertainment-only Raceway tote layer: Win/Place/Show/Exacta/Trifecta ticket normalization, separate pool summaries, takeout, breakage, unhit-pool carryover, refund settlement, official-result status, ticket result ledger, and settlement audit hash. Focused verification passed with `npx tsx --test server/features/casino/games/guinea-pig-raceway/tote.test.ts server/features/casino/games/guinea-pig-raceway/rules.test.ts server/features/casino/games/guinea-pig-raceway/service.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, `npm run build`, `npx playwright test tests/playwright/casino-raceway-scene.spec.mjs`, and a targeted rerun of the only full-inventory flake: `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Rounds / /rounds/:id"`.
  - 2026-05-09: Added a shared Casino audit journal for mocked table services. WTF Button, Rug Pull, and Guinea Pig Raceway now expose bounded tamper-evident audit summaries with hashed actors, stable payload hashes, chained event hashes, and action/rejection/settlement events while still keeping live wager movement disabled.

### WTF-BB-137 - Inventory E2E needed actor-backed puppet users and signer wallets

- Category: E2E / live actor orchestration
- Status: Verified
- Owner/Session: Codex live puppet orchestration pass
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - Static inventory, route smoke, and mocked API coverage did not prove that real local users could log in, hold linked wallets, sign wallet challenges, reach admin-only routes with the correct role, or exercise stateful domain workflows against the database.
  - The first live puppet runs exposed real gaps: ESM wallet verification loading, local E2E rate-limit/session behavior, schema drift across market/challenge/pet tables, a pet starter-food SQL parameter ambiguity, and non-admin actors hitting admin-only API probes.
- Why it matters:
  - Rewards, cheat detection, challenges, admin tooling, and wallet-sensitive flows all depend on real users and real session/wallet/database behavior. A smoke-only suite can look complete while missing the failures most likely to break production workflows.
- Likely correction direction:
  - Seed 12 local-only puppet users with strong ignored passwords and platform-keyring-backed wallets, add local-only DB preparation for required idempotent migrations, run route/domain workflows with role-aware actors, and require future workers to extend the live harness when auth, wallet, reward, admin, persistence, or cross-domain behavior changes.
- Verification idea:
  - Run `npm run test:e2e:puppets:prepare-db -- --dry-run`, `npm run test:e2e:puppets:seed`, and `npm run test:e2e:live:puppets`.
- Fix notes:
  - Added local DB prep, live puppet seeding, signer-backed wallet challenge verification, role-aware actor selection, live route/domain orchestration, richer API failure reporting, and worker-rule documentation for maintaining the live harness.
  - Verified with `npm run test:e2e:live:puppets` returning 73 passed.

### WTF-BB-136 - Inventory E2E skeleton could be mistaken for full feature behavior coverage

- Category: E2E / coverage claims
- Status: Verified
- Owner/Session: Codex inventory depth pass
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence:
  - The inventory suite correctly generated subdomain, route, domain, and system tests, but the previous coverage output did not distinguish complete skeleton coverage from exhaustive feature-behavior assertions.
  - That made it easy for future workers to say "every feature is tested" when the suite was actually proving reachability, normalized handles, mocked API compatibility, admin visibility, and representative workflows.
- Why it matters:
  - E2E skeleton coverage is valuable, but reward, wallet, persistence, permissions, and chain-backed flows need deeper assertions before they can be treated as fully behavior-covered.
- Likely correction direction:
  - Add a machine-readable coverage-layer report, a Playwright depth spec, documentation, and worker rules that keep skeleton and behavior coverage claims separate.
- Verification idea:
  - Run `npm run test:e2e:inventory:coverage` and the feature-depth Playwright spec.
- Fix notes:
  - Added `tests/e2e/inventory/coverage-layers.mjs` and `tests/playwright/inventory/feature-depth.spec.mjs`.
  - Updated coverage output to report `e2eSkeletonComplete: true` and `fullFeatureBehaviorComplete: false`.
  - Updated inventory docs plus AGENTS, Claude, Codex, Cursor, and shared system-prompt rules to require durable behavior assertions for state-changing feature claims.
  - Verified with `npm run test:e2e:inventory:coverage` and `npx playwright test tests/playwright/inventory/feature-depth.spec.mjs`.

### WTF-BB-135 - Interaction inventory lacks an executable domain/subdomain E2E coverage gate

- Category: E2E / interaction monitoring
- Status: Verified
- Owner/Session: Codex inventory E2E scheme pass
- Score: C4 + F4 + S0 + P1(4) = 12
- Evidence:
  - `.agents/docs/live/user-interaction-inventory.md` is the source for reward, monitoring, abuse, and cheat-detection handles, but there was no coverage gate ensuring every inventory row and handle produces an E2E test case.
  - Existing Playwright coverage was W-specific and did not enforce route, domain, subdomain, admin surface, or normalized-event coverage when new WTF OS elements are added.
  - Agent instruction files did not require future workers to update the inventory-driven E2E fixtures when adding app elements.
- Why it matters:
  - Reward automation, challenge logic, monitoring, cheat detection, and app-wide interoperability can drift silently if interaction handles remain documentation-only.
- Likely correction direction:
  - Add an inventory parser, modular domain/subdomain fixtures, Playwright specs, route/admin-surface coverage checks, package scripts, and agent/system-prompt rules that force future changes through the E2E scheme.
- Verification idea:
  - Run the inventory coverage gate, Playwright inventory suite, TypeScript, and build.
- Fix notes:
  - Added an inventory parser and coverage gate, 60 route fixtures, 11 domain interoperability workflows, system integration checks, and Playwright specs that generate subdomain tests for every inventory row and normalized-event checks for every canonical handle.
  - Expanded the Playwright harness with inventory-safe API shapes for app shell, admin, dashboard, colleKT, Mint Portal, desktop, commerce, media, gameshow, Arcade/Console, and challenge automation paths.
  - Added package scripts: `test:e2e`, `test:e2e:inventory`, `test:e2e:inventory:coverage`, and `test:e2e:full`.
  - Added the ongoing requirement to `AGENTS.md`, `CLAUDE.md`, `.codex/PROJECT_RULES.md`, `.cursor/rules/e2e-inventory.mdc`, and `.agents/systemprompts/interaction-e2e-requirement.md`.
  - Verified with `npm run test:e2e:inventory:coverage`, `npm run check`, `git diff --check`, and `npm run test:e2e:inventory` (build plus 185 Playwright inventory tests).

### WTF-BB-134 - Desktop icon/item automation and route wiring drifted after restructuring

- Category: Desktop OS / event and route wiring
- Status: Verified
- Owner/Session: Codex desktop wiring pass
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - `server/routes-wiring.test.ts` still inspected `client/src/App.tsx` for route patterns and `shared/schema.ts` for game-show tables after those owners moved to route/page and schema modules.
  - Desktop admin surfaces advertised icon/object automation handles, but normal icon opens, icon moves, desktop item clicks, tool selections, artifact spawns, portal placement, and icon-layout resets had no shared client-to-server event bridge.
  - Inventory-backed desktop artifacts normalized from localStorage only at first load, so desktop bounds changes could leave elements outside the current surface.
- Why it matters:
  - Server restructuring can make tests pass against dead aggregate files while real desktop routes/events drift. Desktop icons and inventory items need consistent handling across UI, storage, admin handles, challenge events, and route registries.
- Likely correction direction:
  - Keep wiring tests pointed at the owning route/schema registries, add one authenticated desktop event ingestion path, and ensure every emitted desktop item/icon action is normalized before persistence or event ingestion.
- Verification idea:
  - Run desktop item/storage tests, shared desktop settings tests, server route-wiring tests, TypeScript, and a static source scan comparing desktop app/icon keys to route/admin registries.
- Fix notes:
  - Added `/api/desktop/events` with challenge event ingestion plus normalized `app.interaction.tracked`, wired desktop icon/item/tool/artifact/layout-reset actions to it, re-normalized artifact positions on bounds changes, aligned admin automation handles, and updated route-wiring tests to read `page-defs.ts` and `schema-gameshow.ts`.
  - Verified with `npx tsx --test shared/desktop.test.ts client/src/features/desktop/items/itemInteractions.test.ts server/lib/desktop-world.test.ts server/routes-wiring.test.ts`, `npm run check`, a desktop static wiring source scan, and `git diff --check`.

### WTF-BB-133 - Platform wallet helper defaulted public manifests into the repo

- Category: Tezos platform wallets / key custody
- Status: Verified
- Owner/Session: Codex platform wallet custody cleanup
- Score: C2 + F3 + S3 + P1(4) = 12
- Evidence:
  - The encrypted keyring and master key lived outside the repo, but `scripts/platform-wallets.ts` defaulted generated wallet manifests to a repo-local docs path.
  - Ignored local manifest files existed under the Git worktree after platform wallet creation/listing.
- Why it matters:
  - Even public wallet metadata should not be generated into the GitHub-enabled app tree by default. It creates visible custody-adjacent artifacts and raises the chance of future packaging or review leaks.
- Likely correction direction:
  - Keep all default wallet tooling outputs in the host-local signer directory and treat repo ignore patterns only as a fail-safe.
- Verification idea:
  - Remove repo-local manifests, scan the repo for wallet addresses/custody filenames, and typecheck the helper after changing its default manifest path.
- Fix notes:
  - Deleted repo-local manifests and the temporary archive copy, changed the helper default manifest to `~/.wtf-gameshow/platform-wallets-manifest.json`, scanned for wallet addresses/custody filenames, and verified with `npm run check -- --pretty false` plus `git diff --check`.

### WTF-BB-132 - Desktop icon layout allow-list drift caused moved icons to reset

- Category: Desktop OS / icon layout
- Status: Verified
- Owner/Session: Codex desktop icon stability pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - `client/src/features/desktop/DesktopIcons.tsx` rendered `wtfiam`, `arcade`, and `game-studio` desktop icons.
  - `server/routes/desktop.ts` normalized persisted icon layouts through an older local key list that omitted those icons, so saving a moved layout stripped their coordinates.
  - The desktop client rehydrated icon positions from settings data and size changes, making the dropped coordinates appear as periodic rubberband/default resets.
- Why it matters:
  - Users can drag icons and see local movement, but persistence silently deleting valid icon keys makes the desktop feel unstable and undermines settings sync.
- Likely correction direction:
  - Keep first-party desktop icon keys in a shared registry used by the client, settings route, and agent/MCP helpers. Preserve local drag state during active edits and clamp current positions on resize.
- Verification idea:
  - Run a source check comparing rendered icon keys with the shared registry, run `shared/desktop.test.ts`, and run TypeScript over desktop settings/client code.
- Fix notes:
  - Added `DESKTOP_ICON_LAYOUT_KEYS` in `shared/desktop.ts`, updated the settings route and MCP helper to use it, added a shared regression test, and adjusted client icon hydration/drag release state handling.
  - Verified with the icon-key source check, `npx tsx --test shared/desktop.test.ts`, and `npm run check`.

### WTF-BB-131 - Docker context did not ignore platform wallet keyring artifacts

- Category: Build context / key custody
- Status: Fixed
- Owner/Session: Codex public-repo risk audit
- Score: C1 + F3 + S5 + P1(4) = 13
- Evidence:
  - `.gitignore` excluded platform wallet keyrings, master-key files, local wallet manifests, and host-local signer directories, but `.dockerignore` did not mirror those patterns.
  - `Dockerfile` copies the full Docker build context during the builder stage, so a host-local custody artifact created inside the repo could enter build context/layers even while staying out of git.
  - A local ignored `docs/platform-wallets/` directory exists from platform wallet tooling, proving this artifact class is generated in the working tree.
- Why it matters:
  - Wallet custody controls need every packaging boundary to fail closed. Git hygiene alone does not protect Docker contexts, image layers, CI artifact uploads, or future build cache exports.
- Likely correction direction:
  - Mirror platform-wallet custody patterns in `.dockerignore`, keep keyring defaults outside the repo tree, and add a public-release/build-context gate that checks secret-related ignore parity.
- Verification idea:
  - Confirm `.dockerignore` excludes `.wtf-gameshow`, `.wtf-platform-keyring`, platform keyring JSON, master-key files, and local wallet manifests; then run diff whitespace checks and a Docker-context dry run before production image builds.
- Fix notes:
  - Added the platform wallet custody ignore patterns to `.dockerignore`.

### WTF-BB-130 - Public GitHub exposes internal attack map and live-risk backlog

- Category: Public repo / operational intel
- Status: Fixed
- Owner/Session: Codex docs cleanup pass
- Score: C3 + F3 + S4 + P1(4) = 14
- Evidence:
  - The GitHub repo is public, while tracked docs and workflow files expose internal risk triage, deploy topology, diagnostic routes, audit findings, reward/economy handles, and monitoring assumptions.
  - `BUG_BOUNTY_BOARD.md` currently lists open security and economy issues with affected domains and likely correction paths.
  - `docs/user-interaction-inventory.md` exposes reward triggers, automation handles, cheat-detection anchors, and coverage gaps that should not double as a public adversarial roadmap.
  - Historical workflow files include diagnostic env-shape and deploy-probe patterns that should be treated as disclosed operational metadata even if raw secrets were not found in current tracked files.
- Why it matters:
  - A public codebase can be open source without publishing the live production attack map. Agent-assisted attackers can prioritize open bounties, diagnostic workflows, and economy/chain-control gaps faster than a human reader.
- Likely correction direction:
  - Split the project into a sanitized public mirror and a private deploy/ops repo. Move live bounty boards, lessons, internal audits, deploy workflows, SQL/log diagnostics, signer policy overlays, and reward/economy tuning into the private repo. Keep the public mirror limited to OSS-safe code, contracts/interfaces, safe docs, and tests.
- Verification idea:
  - Add a public-release denylist gate and require `git ls-files` in the public mirror to return no private-only docs, ops workflows, wallet policy overlays, local manifests, audit backlogs, or production diagnostic scripts.
- Fix notes:
  - Moved root audits, stale plans, run logs, active bounty/lesson docs, integration source maps, ops notes, contract deployment logs, and interaction inventory out of the public docs path and into `.agents/docs/live` or `.agents/docs/archive`.
  - Replaced the root README and architecture map with public-facing docs, added compact domain guides under `docs/domains`, and updated helper scripts/comments to point at the new internal locations.
  - Residual risk: `.agents/docs` is still tracked in this repo per current owner direction, so this fixes the public-facing GitHub clutter and path exposure but does not create a separate private ops mirror.

### WTF-BB-129 - Platform wallet custody depends on one legacy env secret instead of a role-aware keyring

- Category: Tezos platform wallets / key custody
- Status: Fixed
- Owner/Session: Codex platform wallet keyring pass
- Score: C4 + F4 + S2 + P1(4) = 14
- Evidence:
  - The signer previously loaded a single `WTF_OPERATOR_SIGNER_SECRET`, so reward disbursements, buyback operations, and future Arcade treasury flows would have shared one broad hot-wallet identity.
  - Adding Arcade credit redemption and creator earnings needs wallet roles such as `arcade_treasury`, `reward_disburser`, and `contract_admin` without printing or handing private keys to the app.
- Why it matters:
  - A monolithic hot-wallet env var makes wallet rotation, blast-radius control, audit trails, and future contract-specific allowlists harder. It also encourages adding more raw secrets as new domains need platform custody.
- Likely correction direction:
  - Move platform key custody into the isolated signer process, encrypt generated wallet keys in a host-local keyring, keep creation/listing in server-local tooling, and let backend code target wallet IDs instead of private keys.
- Verification idea:
  - Create an Arcade Treasury wallet in a temp keyring, verify the signer can reload it by wallet ID, assert the keyring file contains no plaintext `edsk`, run signer typecheck/build, and run app typecheck/build.
- Fix notes:
  - Added an encrypted multi-wallet platform keyring inside `wtf-operator-signer`, backed by Taquito `generateSecretKey` + `InMemorySigner` and AES-256-GCM host-local storage.
  - Extended the shared signer/keyring domain with public wallet DTOs, DID/chain-id metadata, and optional `walletId` targeting for future backend-owned signed operations.
  - Removed the `/api/platform-wallets` admin route and Operator Wallet keyring UI so no WTF OS user, including an admin, can create or manipulate platform wallets from the browser.
  - Added server-local `npm run platform-wallets` tooling plus `.gitignore` and server deployment-plan coverage so keyring files, master keys, and generated local manifests stay outside git.
  - Defaulted app-facing signer wallet creation to locked (`WTF_PLATFORM_KEYRING_CREATE_ENABLED=0`) for the long-running signer.
- Local verification:
  - Temp keyring smoke created `arcade-treasury`, reloaded its signer, matched the public address, and confirmed the on-disk keyring did not contain plaintext `edsk`.
  - Local Shadownet keyring created host-local `wtf-os-root` and `arcade-treasury` wallets under `~/.wtf-gameshow/`; generated public manifest is ignored by git.
  - Verified `/api/platform-wallets` and Operator Wallet keyring UI were removed; signer health response strips wallet lists before returning through the app health route.
  - `npm run operator-signer:check`, `npm run operator-signer:build`, `npm run operator-signer:test`, `npm run check -- --pretty false`, `git diff --check`, and `npm run build` passed.

### WTF-BB-128 - WTF OS apps lack a complete strict-admin native/admin-panel settings surface registry

- Category: Admin tooling / WTF OS
- Status: Fixed
- Owner/Session: Codex WTF OS admin surface pass
- Score: C4 + F4 + S0 + P1(4) = 12
- Evidence:
  - Desktop app visibility controls only cover `DESKTOP_APPS`, not every route/sub-app/tool/native desktop item listed in `PAGE_DEFS` and the interaction inventory.
  - Many apps have local moderator/staff affordances, but there is no universal native admin settings surface inside each WTF OS window.
  - Existing admin routes are spread across tabs and feature pages without a registry that maps app/domain/subdomain to admin panel tooling, challenge automation handles, and settings controls.
- Why it matters:
  - The host/admin needs to tune every app and desktop item from the central admin panel and from inside the running app window. Without a registry, new WTF OS modules can ship without admin settings, reward automation wiring, or visibility guarantees.
- Likely correction direction:
  - Add a strict-admin surface registry, central admin coverage tab, and native AppWindow admin/settings panel. Use existing feature admin tabs/routes and the challenge automation builder instead of creating a monolith.
- Verification idea:
  - Typecheck/build; inspect Admin panel for complete surface coverage; smoke a public/non-admin route to ensure no native admin panel renders without strict `admin` role.
- Fix notes:
  - Added `client/src/features/admin-os/admin-surface-registry.ts` as the canonical map from WTF OS route/app/desktop-item surfaces to domain, subdomain, native settings, central admin tabs/routes, and challenge automation handles.
  - Added a native strict-admin `AppWindow` admin/settings panel and a central Admin `OS Admin` tab instead of creating a monolithic settings page.
  - Tightened client admin visibility to strict `user.role === "admin"` and updated admin-only route definitions to use only the `admin` role.
  - Verification run locally: route coverage audit against `PAGE_DEFS`; `npm run check`; `npm run build`.

### WTF-BB-127 - Side-quest auto-verification schema includes unimplemented reward handles

- Category: Rewards / side quest automation
- Status: In Progress
- Owner/Session: Codex side quests reward-account deploy
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - `shared/schema-gameshow.ts` declares `x_space_attendance`, `x_hashtag_post`, `console_hiscore`, `mint_with_tag`, `mint_in_curation`, and `discord_voice_presence` in the `auto_verify_type` enum.
  - `server/routes/side-quests.ts` only whitelists and directly verifies `manual`, profile/social/wallet/message/holding/mint/trade-board checks, `wtf_swapped_in_buyback`, and `wtf_paid_to_operator_at_least`.
  - The default branch in `runAutoVerify` returns "Requires manual verification", so latent enum values are not live reward triggers.
- Why it matters:
  - The interaction inventory and future E2E/reward suites need exact trigger coverage. Treating schema-only values as live would create false confidence for side quests, challenge rewards, Arcade/Console activity rewards, and cheat-monitoring coverage.
- Likely correction direction:
  - Either implement each schema-declared auto-verifier end to end (route whitelist, `runAutoVerify`, UI config, event handle, tests) or archive/remove latent enum values until they are intentionally shipped.
- Verification idea:
  - For every `auto_verify_type`, create a side quest through the API, exercise a passing and failing completion case, and assert the expected completion, XP/reward behavior, and monitoring event handle.
- Progress notes:
  - Added the challenge automation engine tables, normalized event ingestion, trigger/action registries, predicate evaluation, Tezos ownership predicates, reward action wrappers, admin routes/UI, and seeded example challenge definitions.
  - Wired messageboard post creation, XP awards, wallet linking, and desktop pet interactions into normalized `SystemEvent` ingestion.
  - Verification run locally: `npm run check`; `npm run build`.
  - 2026-05-19: Side Quests now owns the user-facing reward account instead of the old Daily Loops launcher copy. Earned WTF ledger entries can be spent through WTFIAM or reserved for cashout with a 20 WTF minimum, while EXP remains in-app only.
  - 2026-05-22: Claimed by Codex side quest UX claim pass to connect canonical daily side-quest automation to the `/side-quests` customer surface and add a user claim step before rewards disburse.
  - 2026-05-22: Daily side quest automation now marks per-user current-UTC-day completions as claim-required instead of auto-disbursing, `/side-quests` renders the canonical daily quest cards with player counts and claim buttons, `/api/challenge-automation/daily-loops/:id/claim` performs idempotent reward action execution, Mission Control uses Side Quests language, and live puppet coverage now claims the messageboard check-in before asserting XP/WTF ledger side effects.
  - 2026-05-22 verification: `npm run check -- --pretty false`; `npx tsx --test client/src/pages/MissionControl.test.ts server/challenges/services/daily-loop-challenges.test.ts`; `npm run test:e2e:inventory:coverage`; `npm run test:e2e:inventory`; targeted live puppet command for `canonical side quests|gameshow launch surfaces` after fixing strict-mode duplicate text and same-UTC-day rerun idempotency in the spec.
  - Remaining direct side-quest work: each latent `auto_verify_type` still needs either a registry-backed side-quest adapter or explicit archival/removal before this bounty can be marked Fixed/Verified.

### WTF-BB-126 - Recapture, auction, ante, and entry-fee flows rely on manual op-hash attestations instead of wallet-backed sends

- Category: Tezos recapture / settlement
- Status: Verified
- Owner/Session: Codex W repair pass
- Score: C4 + F4 + S2 + P1(4) = 14
- Evidence:
  - `client/src/pages/WtfRecapture.tsx` asks users to perform a swap elsewhere and paste the operation hash, while auction bids are recorded as app-side bid rows.
  - `server/routes/buyback-windows.ts`, `server/routes/wtf-recapture.ts`, and `server/routes/wtf-auctions.ts` accept op hashes or bid records without initiating the user's wallet transaction in the UI.
  - `server/routes/wtf-auctions.ts` documents that settlement records the operation hash supplied after an external Beacon transfer lands.
- Why it matters:
  - These UX flows look financially meaningful but are not contract-backed user-wallet sends inside the app. Until they are wired or explicitly labeled as manual attestations, users can hit payment/settlement paths that depend on off-app behavior and later watcher reconciliation.
- Likely correction direction:
  - Add wallet-backed contract or token-transfer sends for these flows, or downgrade the UI copy to an explicit manual/off-app attestation flow. Verify operation hashes against TzKT before mutating app state.
- Verification idea:
  - Browser-test each recapture, auction, ante, and entry-fee action with no wallet connected, wrong wallet connected, and expected wallet connected; confirm state only changes after an on-chain operation matching the expected wallet/contract.

### WTF-BB-125 - External marketplace batch builders can touch Taquito wallet contracts before signer preflight

- Category: Tezos external marketplace / wallet preflight
- Status: Open
- Owner/Session: -
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - `client/src/lib/tezos/external-marketplaces.ts` builds FA2 transfer, listing-cancel, and operator-revoke batch params with `tezos.wallet.at(...).methods...toTransferParams()` before `sendBatch` runs the wallet-provider preflight.
  - This can reproduce the same class of `No signer configured` failure if Taquito requires a wallet provider during operation construction after a refreshed browser session.
- Why it matters:
  - External marketplace clean-up actions can fail before the improved send preflight gets a chance to rehydrate Beacon/Octez and bind the expected wallet.
- Likely correction direction:
  - Move wallet preflight ahead of batch builder calls, or make the builders accept a preflighted wallet toolkit/session so all wallet contract construction happens after provider attachment.
- Verification idea:
  - Refresh the browser with a persisted wallet address, then run cancel/revoke/batch-transfer flows without reconnecting manually; confirm the wallet permission request or send prompt appears instead of a signer error.

### WTF-BB-124 - Marketplace and barter writes do not bind contract sends to the expected wallet

- Category: Tezos marketplace / wallet binding
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S2 + P1(4) = 13
- Evidence:
  - `client/src/lib/tezos/marketplace.ts` calls `assertNetworkReadyForSend()` without an expected wallet for create listing, create auction, buy, bid, settle, cancel, offer, and accept offer sends.
  - `client/src/lib/tezos/barter.ts` binds approval preflights to the active wallet, but create, accept, and cancel trade sends do not pass an expected wallet.
  - `client/src/features/marketplace/CreateMarketEntryPanel.tsx` can select owned tokens across linked wallets, while `useMarketplaceActions` approves and creates marketplace entries with the current active wallet address and does not assert that the selected token wallet matches the active signer.
- Why it matters:
  - A stale or switched wallet can sign follow-on marketplace/barter operations after an approval preflight, causing confusing failures at best and wrong-account actions where contracts permit them.
- Likely correction direction:
  - Thread `expectedWalletAddress` through every marketplace/barter write helper, enforce selected-token owner equals active wallet before approval/create, and add UI guards for handlers that currently rely only on button visibility.
- Verification idea:
  - Test marketplace listing, auction, buy, bid, offer, accept offer, cancel, barter create, barter accept, and barter cancel with no wallet, wrong wallet, and expected wallet connected; assert wrong-wallet sends fail before contract invocation.

### WTF-BB-123 - ECAD RPC defaults will break Tezos operations after provider shutdown

- Category: Tezos RPC / deploy config
- Status: Fixed
- Owner/Session: Codex wallet/RPC emergency pass
- Score: C2 + F5 + S1 + P0(5) = 13
- Evidence:
  - User report on 2026-05-08: ECAD RPC nodes are defunded and will cease operation at the end of May, so WTF/Kiln Tezos connections relying on ECAD will break on May 31.
  - Repo scan found ECAD defaults in shared client RPC config, app env templates, operator signer env examples, and local WTF app env.
- Why it matters:
  - Checkout, marketplace, wallet preflight, operator signing, and Kiln-like Tezos workflows all depend on a live RPC. Leaving ECAD defaults in source or deployment env creates a scheduled outage.
- Likely correction direction:
  - Replace ECAD mainnet defaults with `https://rpc.tzkt.io/mainnet`, replace ECAD Ghostnet defaults with `https://rpc.ghostnet.teztnets.com`, and verify chain IDs before closing.
- Verification idea:
  - Scan for ECAD hostnames, curl the replacement RPC chain IDs, run typecheck/build, and smoke the in-app marketplace wallet preflight path.
- Fix:
  - Replaced ECAD mainnet defaults with `https://rpc.tzkt.io/mainnet` and ECAD Ghostnet defaults with `https://rpc.ghostnet.teztnets.com` across shared client config, env templates, operator signer env, domain/subdomain helpers, and bundled Particle Painter wallet code.
  - Updated local WTF app env references to stop using ECAD RPCs.
- Local verification:
  - `curl -fsS https://rpc.tzkt.io/mainnet/chains/main/chain_id` returned `NetXdQprcVkpaWU`.
  - `curl -fsS https://rpc.ghostnet.teztnets.com/chains/main/chain_id` returned `NetXnHfVqm9iesp`.
  - ECAD hostname scan across source/env targets returned no matches.
  - `npm run check -- --pretty false`, `git diff --check`, and `npm run build` passed.
  - Remaining target verification: production host/deploy env must pick up the new RPC before this is marked Verified.

### WTF-BB-122 - Persisted wallet address can reach checkout without Taquito wallet provider

- Category: Tezos wallet / checkout
- Status: Fixed
- Owner/Session: Codex wallet/RPC emergency pass
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - User screenshot on 2026-05-08 shows Taquito throwing `No signer has been configured. Please configure one by calling setProvider({signer})...` during in-app market checkout.
  - `WalletProvider` rehydrates only the saved address/provider id from localStorage, while `getTezos()` can create a fresh toolkit without an active wallet provider until `connectWallet()` runs again.
  - `WtfIamShell` skips `wallet.connect()` whenever a cached address exists, so the checkout path can call `tezos.wallet.at(...).send()` with no wallet provider attached.
- Why it matters:
  - The in-app market contract can be healthy and still fail every browser checkout after refresh/session rehydration. Arcade play tickets share the same WtfIAM cart path, so paid play can be blocked too.
- Likely correction direction:
  - Add a signed-operation wallet preflight that rehydrates or requests the active wallet account, attaches the wallet provider to the singleton Taquito toolkit, and fails clearly on account mismatch before any write operation.
- Verification idea:
  - Unit-test the preflight/provider behavior where a persisted address exists but no in-memory provider is attached, run typecheck, and smoke WTF checkout after a browser refresh.
- Fix:
  - Added a signed-operation wallet preflight that rehydrates or requests the active wallet account, attaches the wallet provider to the singleton Taquito toolkit, persists the confirmed account, and errors clearly if a prepared operation is for a different wallet.
  - Routed write-path preflight through the new wallet provider guard before chain-id validation.
  - Changed WTF in-app marketplace checkout to call `wallet.connect()` before creating a WTF checkout intent, so stale localStorage addresses cannot create cart intents or send operations without a live provider.
  - Passed expected wallet addresses through in-app market, token transfer, approval, DEX, and external-marketplace send paths where the caller already knows the signer.
- Local verification:
  - `npm run check -- --pretty false`, `git diff --check`, and `npm run build` passed.
  - Remaining target verification: browser checkout with a real Tezos wallet after refresh should be smoke-tested before this is marked Verified.

### WTF-BB-121 - Arcade migrations reused existing migration numbers

- Category: Deploy / DB migrations
- Status: Verified
- Owner/Session: Codex release-readiness pass
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence:
  - The new Arcade migration files were numbered `0060` and `0061` while existing Game Studio build and trusted creator migrations already used those numbers.
- Why it matters:
  - Production tracks migrations by filename, but duplicate numeric prefixes make deploy ordering harder to audit and invite future agents to apply or discuss the wrong migration.
- Fix:
  - Renumbered the Arcade migration slice after the existing files: `0062_arcade_play_ticket.sql`, `0063_arcade_source_slug_rebrand.sql`, `0064_arcade_source_storage_mode_rebrand.sql`, and `0065_arcade_source_route_rebrand.sql`.
  - Updated plan and bounty references to the new migration names.
- Local verification:
  - `ls -1 drizzle | tail -20` shows a clean `0060` through `0065` sequence with no duplicate Arcade prefixes.

### WTF-BB-120 - Regular Console SDK exposed source compatibility alias

- Category: SDK / domain boundaries
- Status: Verified
- Owner/Session: Codex arcade/console boundary pass
- Score: C1 + F2 + S0 + P3(2) = 5
- Evidence:
  - `/api/console/sdk.js` exposed the legacy source compatibility global alongside `window.WTFConsole`.
  - The Game Studio client's Arcade submission selector still used Console-shaped local types/state despite calling `/api/arcade/my-games`.
- Why it matters:
  - WTF Console should be the owned-media SDK surface, while imported/source-compatible game shims belong in the WTF Arcade source adapter. Letting the core SDK expose legacy aliases blurs product ownership and makes future work more likely to route creators toward the wrong surface.
- Fix:
  - Removed the legacy compatibility global from the regular Console SDK.
  - Isolated compatibility globals inside the Arcade compatible-source proxy served only for source-game compatibility paths.
  - Renamed Game Studio client submit-state types and variables to Arcade-owned names and updated admin/MCP/docs copy to use WTF-owned product language.
- Local verification:
  - `node --import tsx --test server/features/arcade/source-import.test.ts server/lib/wtf-mcp.test.ts server/features/game-studio/catalog.test.ts`
  - `npm run check -- --pretty false`
  - Local `http://localhost:3000` smoke confirmed `/api/console/sdk.js` exposes `window.WTFConsole` without the legacy alias and `/api/arcade/source/*/hackcade-sdk.js` keeps the compatibility alias isolated to the source adapter.

### WTF-BB-119 - Studio drafts accepted local asset payloads before enforcing upload limits

- Category: Game Studio / upload validation
- Status: Verified
- Owner/Session: Codex game-studio hardening pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - `normalizeLocalAssets` accepted local asset JSON during Game Studio project create/update without enforcing MIME allowlist, per-asset size, total project upload size, or base64 integrity. Packaging rejected invalid payloads later, but saved drafts could already carry oversized/unsupported data.
- Why it matters:
  - The WTF Game Studio SDK stores uploaded local assets in project state. Validation only at build time protects published bundles but not database bloat, editor performance, or clear creator feedback at save time.
- Fix:
  - Added strict local-asset normalization with MIME, per-file, total, and base64 length checks.
  - Applied strict mode to project create/update and packaging, while keeping DB row DTO reads lenient for old data.
  - Added regression coverage for oversized and unsupported saved local assets.
- Local verification:
  - `node --import tsx --test server/features/game-studio/packaging.test.ts server/features/game-studio/projects.test.ts`
  - `npm run check -- --pretty false`

### WTF-BB-118 - DB-backed stock rows duplicated installed Console cartridges

- Category: Console catalog / dedupe
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence:
  - Local `/api/console/games` smoke returned duplicate `inverse-snake` and `backwards-pong` slugs because installed stock and DB-backed stock rows used different dedupe keys.
- Why it matters:
  - WTF Console should show one personal stock cartridge per stock game. Duplicate rows make the stock library feel broken and can split play/session/accounting paths for the same title.
- Fix:
  - Added a Console catalog dedupe helper that keys stock cartridges by `stock:${slug}` while preserving origin/token keys for non-stock media.
  - Added a regression test for installed-plus-DB stock dedupe.
- Local verification:
  - `node --import tsx --test server/features/console/catalog.test.ts`
  - Re-smoked `/api/console/games` locally and confirmed stock slugs appear once.

### WTF-BB-117 - Studio publish handoff leaked Console ownership after Arcade split

- Category: Game Studio / domain boundaries
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F2 + S0 + P3(2) = 5
- Evidence:
  - `docs/user-interaction-inventory.md` still described Game Studio as submitting games to WTF Console review.
  - `server/features/game-studio/projects.ts` kept a `submitGameStudioProjectToConsole` alias and wrote `consoleGameId`, `consoleSlug`, and `consoleStatus` into project submission metadata for Arcade-targeted publishes.
- Why it matters:
  - Game Studio is the creator SDK/app, WTF Arcade is the public paid-play surface, and WTF Console is personal owned media. Stale Console naming at the handoff boundary makes it easier for future work to route public creator games into the wrong surface.
- Fix:
  - Added an Arcade-owned bundle submission wrapper, routed Game Studio public project publishes through it, removed the stale Console-named alias, and renamed last-submission metadata keys to `arcadeGameId`, `arcadeSlug`, and `arcadeStatus`.
  - Updated the interaction inventory doc so Game Studio submits to WTF Arcade review or exports for owned Console media.
- Local verification:
  - `rg -n "submitGameStudioProjectToConsole|consoleGameId|consoleSlug|consoleStatus|submit game to WTF Console review|WTF Console review" server docs client/src shared` returned no matches.
  - `node --import tsx --test server/features/game-studio/projects.test.ts server/lib/wtf-mcp.test.ts`

### WTF-BB-116 - Existing source rows emitted legacy Console proxy paths

- Category: Arcade catalog / data migration
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence: Local `/api/arcade/games` returned source-imported games with `artifactUri` and `thumbnailUri` under the legacy Console source route even after the code-level Arcade source adapter existed.
- Why it matters: Durable catalog rows can leak stale product routing and force Arcade launches through a Console compatibility path. Product-language cleanup needs to survive old rows as well as new imports.
- Local fix note: Added `normalizeArcadeSourcePublicPath` at the DTO boundary and `drizzle/0065_arcade_source_route_rebrand.sql` to rewrite stored runtime paths.
- Verification: After restarting the dev server, `/api/arcade/games` returned source game runtime and cover paths under `/api/arcade/source/*` with `sourceSlug` parameters; focused tests and typecheck passed locally.
- Verification idea: Keep an API smoke for `/api/arcade/games` that checks no catalog `artifactUri` or `thumbnailUri` uses the legacy Console source route.

### WTF-BB-115 - Arcade MCP tools drifted from capabilities and scopes

- Category: MCP / agent discoverability
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F3 + S1 + P2(3) = 8
- Evidence: `wtf_get_arcade_play_status` and `wtf_run_arcade_source_import` were registered MCP tools but were missing from the `wtf_get_capabilities` tool list. The play-status tool also required `market:read` even though it only needs Arcade read access for paired-user play readiness.
- Why it matters: Agents depend on capability discovery and narrow scopes to choose workflows. Hidden tools or over-broad scopes make the Arcade API feel incomplete and can block default paired-token workflows.
- Local fix note: Added the missing tools to the capability payload and narrowed play-status to `arcade:read`.
- Verification: `node --import tsx --test server/features/console/manifest.test.ts server/features/console/surfaces.test.ts server/features/arcade/source-import.test.ts server/features/arcade/payment.test.ts shared/types.test.ts server/lib/wtf-mcp.test.ts` and `npm run check -- --pretty false` passed locally.
- Verification idea: Add MCP capability regression coverage if the local MCP harness gets a cheap tool-list snapshot.

### WTF-BB-114 - Console stock classifier and installed manifest drifted

- Category: Console catalog / manifest parity
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence: `isConsoleStockSlug` reserved `inverse-snake` and `backwards-pong` for every user's Console, and their files existed under `public/games/wtf/*`, but `public/games/installed/manifest.json` did not list either cartridge.
- Why it matters: The Console/Arcade split depends on one source of truth per surface. If the classifier and installed manifest drift, stock games can disappear from Console while Arcade filtering still appears correct.
- Local fix note: Added `inverse-snake` and `backwards-pong` to the installed manifest and fallback demo cartridge list, then added a manifest parity test.
- Verification: `node --import tsx --test server/features/console/manifest.test.ts server/features/console/surfaces.test.ts server/features/arcade/source-import.test.ts server/features/arcade/payment.test.ts shared/types.test.ts server/lib/wtf-mcp.test.ts` and `npm run check -- --pretty false` passed locally.
- Verification idea: Keep manifest parity tests in the standard Console/Arcade focused suite whenever stock slugs or installed cartridge files change.

### WTF-BB-113 - Public WTF Arcade route crashed on vendored ZIP loader import

- Category: Frontend / public route runtime
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F5 + S1 + P1(4) = 11
- Evidence: Browser smoke for `/arcade` returned the desktop error boundary: `SyntaxError: The requested module '/client/src/lib/vendor/jszip.min.js' does not provide an export named 'default'`.
- Why it matters: WTF Arcade is now a public browsing surface. A lazy import crash prevents anonymous users from seeing the catalog or the play-ticket/sign-in gate.
- Local fix note: Changed the ZIP loader to namespace-import the vendored UMD script and resolve `globalThis.JSZip`, and made `/arcade` public while keeping session/play/payment APIs authenticated.
- Verification: Headless browser smoke opened `/arcade`, found `PUBLIC ARCADE`, clicked a game while signed out, and reached the WTF Arcade ticket gate with sign-in and 1.00 WTF fee visible.
- Verification idea: Keep a browser route smoke for `/arcade` in the frontend quality gate whenever game runtime imports change.

### WTF-BB-112 - Provenance/support links failed external-link safety gate

- Category: Frontend / link safety
- Status: Verified
- Owner/Session: Codex arcade/console split pass
- Score: C1 + F2 + S3 + P2(3) = 9
- Evidence: `npm run check:external-links` reported multiple `target="_blank"` anchors using `rel="noreferrer"` without the required `noopener` token across provenance/support link surfaces.
- Why it matters: External token/support links can open a new browsing context. Missing `noopener` is a browser security regression and keeps the repo quality gate red.
- Local fix note: Updated the reported provenance, marketplace, media, and Game Studio external anchors to `rel="noopener noreferrer"`.
- Verification: `npm run check:external-links` passed locally after the fix.
- Verification idea: Keep the external-link safety check in the standard quality gate whenever new external links are added.

### WTF-BB-111 - Desktop mutators, tools, media unlocks, and environment elements need modular domain wiring

- Category: Desktop OS / item architecture
- Status: Fixed
- Owner/Session: Codex desktop mutator product pass
- Score: C4 + F4 + S0 + P1(4) = 12
- Evidence: New desktop products span marketplace catalog, persistent desktop artifacts, cursor tools, media library routes, and living/physics interactions. Without shared contracts, every item would need bespoke cross-feature checks.
- Why it matters: The desktop environment is becoming the primary game surface. Item behavior needs modular ownership by domain so pet, ants, toys, desktop tools, and media apps can evolve without monolithic shell logic.
- Likely correction direction: Add shared material/mutator/portal contracts, item-owned actors, environment-owned weather state, My Music/Tezamp stubs, and inactive/stock-zero marketplace rows.
- Local fix note: Added shared desktop material, scale, portal, and mutator contracts; item actors for cursor tray, train kit, portal gun/portals, jukebox, and paper shredder; environment-owned weather cloud controls; My Music/Tezamp stubs; audio media import support; and stock-zero/inactive catalog seeds for the new desktop product stack.
- Verification: `node --import tsx/esm --test client/src/features/desktop/items/itemInteractions.test.ts`, `npm run check -- --pretty false`, `git diff --check`, and `npm run build` passed locally.
- Verification idea: After deploy, apply `drizzle/0055_desktop_mutator_product_stack.sql`, confirm Admin In-App Market can stock/visibility-toggle the new SKUs, and spot-check that a granted jukebox opens Tezamp while a granted cursor tray exposes the scale tool.

### WTF-BB-001 - Overlapping migration systems run every deploy

- Category: Deploy / DB migrations
- Status: Verified
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
- 2026-05-06 transplant note: Dashboard P&L now dedupes scoped `token_sales` rows by op/token/counterparty/price/time before lot costing, so duplicate sale rows no longer double-count portfolio P&L. This does not yet clean production duplicates or close the migration/index issue.
- Local verification: `node --import tsx/esm --test server/lib/portfolio-costing.test.ts server/lib/tzkt-ops.test.ts` passed.
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

### WTF-BB-088 - Stream refetch can swap the currently airing item before cursor resync

- Category: TV microapp / playback race
- Status: Verified
- Owner/Session: Codex aired-race pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence: In both `client/src/pages/TV.tsx` and `client/src/pages/TV2.tsx`, render computes the active slot as `queue[clientQueueIdx]` first, the playback effect reacts to `activeKey` changes immediately, and only afterwards does a later `queue.sync.adjust` effect move `clientQueueIdx` to the still-playing item's new index. A stream refetch that reorders/interleaves the queue can therefore mount the wrong `src` long enough to abort the current item and start loading a different one.
- Why it matters: This is exactly the kind of “video starts to load, then cuts to a different clip” behavior users are seeing. It turns harmless queue refreshes into visible playback tears.
- Likely correction direction: Resolve the active render slot against the still-playing `currentKeyRef` before the playback effect runs, and use the same stabilized index for preload/up-next/advance decisions so refetches cannot transiently point the player at the wrong queue entry.
- Local fix note: Added a shared client playback helper that resolves the active slot by pinned item key instead of trusting the old numeric index after a refetch. Both `TV.tsx` and `TV2.tsx` now pin the currently airing item across queue reorders, preserve the previous item snapshot if the server drops it mid-play, and use the stabilized cursor for next-item/preload decisions.
- Verification: `npm run check`; `node --import tsx/esm --test client/src/lib/tv-playback.test.ts server/lib/tv-stream-snapshot-cache.test.ts server/lib/tv-telemetry.test.ts server/lib/tv-policy.test.ts`
- Verification idea: Simulate a queue refresh where the currently playing item moves to a different index or disappears; verify the resolved active item stays pinned until natural advance.

### WTF-BB-092 - Public MCP agent layer needs per-user token auth, rate limits, public-data boundaries, and admin feature gates

- Category: MCP / agent access control
- Status: Fixed
- Owner/Session: Codex MCP agent layer pass
- Score: C4 + F4 + S2 + P1(4) = 14
- Evidence: WTF currently exposes browser/session APIs but has no dedicated MCP pairing token, agent rate limit, or MCP-aware enforcement of admin-disabled sub apps. The requested MCP layer will let agents read public blockchain-derived rows and mutate user-owned settings/pet/account-adjacent state, so it is a new abuse boundary.
- Why it matters: An unauthenticated or over-broad agent surface could leak private user data, ignore operator feature shutdowns, or let an agent spam write paths on behalf of a paired user.
- Likely correction direction: Add a per-user token table storing only hashes, generate/revoke endpoints in user settings, a Streamable HTTP MCP endpoint with token-scoped authentication and rate limits, public-data-only read tools, and tool-level checks against the same admin desktop-app config used by the control panel.
- Local fix note: Added `mcp_agent_tokens` with one-time-visible bearer tokens stored as SHA-256 hashes, `/api/mcp/tokens` generate/list/revoke APIs, a rate-limited Streamable HTTP `/mcp` endpoint, and an MCP tool layer for capabilities, desktop appearance, desktop pet care, public token search, unlisted trade-board discovery, trade-board mutation for the paired user, listing workflow preparation, and public TV channel discovery. Tool handlers check admin desktop-app gates before serving gated sub-app features.
- Verification: `npm run check`; `node --import tsx/esm --test server/lib/mcp-agent-auth.test.ts server/lib/wtf-mcp.test.ts`; `npm run build`
- Verification idea: Unit-test token hashing/auth, feature-gate denial, and public read/write tool behavior; manually confirm generated tokens are shown once and revoked tokens fail.

### WTF-BB-093 - Playlist editing is trapped behind the active-playlist path, media management conflates detach with delete, and public bumper-pool removal is exposed only as destructive delete

- Category: TV microapp / creator workflow UX
- Status: Fixed
- Owner/Session: Codex TV creator workflow pass
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence: `client/src/pages/TV.tsx` only loaded `playlistDraft` from the active playlist, the playlist list used a row click solely to force `isActive`, and the playlist editor could reorder but not add/remove channel videos for arbitrary playlists. The same UI also exposed only `DEL` on library rows and community bumpers, even though the actual user intent is often “detach this from a channel” or “pull this out of the public pool” rather than “delete the asset.”
- Why it matters: The product made users think like the database. Channel attachment, playlist membership, public bumper sharing, and library deletion are different actions with different consequences, but the old UI blurred them together and forced destructive workflows for routine cleanup.
- Likely correction direction: Add first-class detach and bumper-category actions on the server, let the playlist editor target a selected playlist instead of only the active one, and surface manage/remove flows in both TV creator tools and the standalone media library.
- Local fix note: Added `DELETE /api/tv/channels/:channelId/media/:mediaItemId` so library-backed media can be removed from one channel without deleting the source asset, added `PATCH /api/tv/bumpers/:bumperId` so owners can pull bumpers out of the public pool or share them into it, rewired `TV.tsx` so playlists can be selected, renamed, and edited directly with add/remove/reorder controls, and added per-channel detach management to both `TV.tsx` and `MyVideos.tsx`.
- Verification: `npm run check`; `git diff --check`
- Verification idea: In Creator Tools, pick a non-active playlist and confirm videos can be added/removed without forcing that playlist live; in My Media / My Videos, detach a library item from one channel while keeping it in the library; in Bumpers, move a community bumper back to personal without deleting the clip.

### WTF-BB-094 - In-app market SmartPy contract exceeds Kiln Shadowbox source limit

- Category: Tezos / contract size
- Status: Verified
- Owner/Session: Codex in-app market shrink pass
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - The first SmartPy in-app market contract compiled to a 897,072-byte Michelson artifact, above Kiln Shadowbox's 200,000-byte source limit.
  - Kiln validation reported `Contract source is too large for shadowbox (897072 > 200000 bytes)` and skipped origination estimate with `invalid_primitive`.
- Why it matters:
  - The contract only needs to move WTF from a buyer to the gameshow treasury with enough item context for the server to verify. Storing catalog, purchase history, views, admin rotation, and events on-chain turned a simple payment into an operationally brittle artifact.
- Likely correction direction:
  - Keep the catalog and inventory in the app database. Use a tiny payment-router contract that forwards exact WTF amounts to the treasury and leaves item grant decisions to TzKT-verified server evidence.
- Local fix note:
  - Replaced the full on-chain listing/purchase registry with a minimal `purchase(listing_id, amount_wtf_units, purchase_ref)` router. The post-compile script now strips SmartPy comments/annotations from generated `.tz` artifacts before they are handed to Kiln.
- Verification:
  - `bash scripts/test-in-app-market-contract.sh` passes and reports `Compiled in-app market Michelson size: 1048 bytes`.
  - `npm run check`; `npm run build`; `git diff --check`.
  - `npm run contract:deploy:in-app-market:kiln` still blocks without `KILN_API_TOKEN`, but the report now records the compact local artifact size in `docs/wtf-in-app-market/shadownet-kiln-run.md`.
- Verification idea:
  - With a Kiln token, rerun the Shadownet workflow and confirm Shadowbox no longer raises the 200 KB source limit warning.

### WTF-BB-095 - Single-transfer purchase uniqueness blocks multi-item cart grants

- Category: In-app market / data integrity
- Status: Verified
- Owner/Session: Codex in-app market cart pass
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - `in_app_market_purchases.tzkt_transfer_id` was unique and not nullable, which meant a single WTF transfer could only ever create one purchase row.
  - The requested marketplace cart intentionally batches multiple item tickets into one router transaction, so a unique transfer id would either drop later cart lines or force lossy cart-as-one-row grants.
- Why it matters:
  - Users could pay the correct total WTF and receive only one item line, or EXP purchases would have to fake chain identifiers despite never touching Tezos.
- Likely correction direction:
  - Track cart payment intents by `purchase_ref`, allow purchase rows to be keyed per transfer plus SKU for WTF, and allow non-chain EXP purchase rows without fake operation hashes.
- Local fix note:
  - Added `in_app_market_payment_intents`, EXP item prices, nullable non-chain purchase fields, and a partial unique `(tzkt_transfer_id, sku)` index. WTF verifier now expands a cart intent into multiple grant rows, and EXP checkout deducts points atomically before granting inventory.
- Verification:
  - `npm run check`; `npm run build`; `git diff --check`.
- Verification idea:
  - Create a three-line WTF cart intent, pay once through the router, and confirm all three inventory SKUs increase exactly once on repeated verify/sync.

### WTF-BB-096 - Seeded item listing id collides with cart router sentinel

- Category: In-app market / listing IDs
- Status: Verified
- Owner/Session: Codex in-app market cart pass
- Score: C1 + F3 + S1 + P2(3) = 8
- Evidence:
  - The original `0047_in_app_market.sql` seed set `pet-food.contract_listing_id = 0`.
  - The batched cart router intentionally uses `listing_id = 0` as the sentinel meaning “read the real cart lines from `purchase_ref`.”
- Why it matters:
  - Reusing `0` for a real SKU and for the cart payment route makes verifier behavior ambiguous and can break legacy single-listing evidence or future admin tooling that expects positive listing IDs for real items.
- Likely correction direction:
  - Reserve `0` for cart payments only and keep concrete item listing ids positive.
- Local fix note:
  - Updated fresh seed data to use listing ids `1/2/3` for food, medicine, and shoebox, and made `0048` correct existing rows to those values.
- Verification:
  - Applied `0047` then `0048` to the local `localhost:5432/wtf` database and confirmed the three items are seeded as listing ids `1/2/3` with EXP prices `100/250/500`.
- Verification idea:
  - Confirm WTF cart checkout always sends router listing id `0`, while item catalog rows never use `0`.

### WTF-BB-091 - TV overlay credits fall back to wallet addresses, imported library tokens lose title-card metadata, and uploaded media cannot carry editable creator credits or Objkt links

- Category: TV microapp / metadata UX
- Status: Fixed
- Owner/Session: Codex TV overlay metadata pass
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence: `server/routes/tv.ts` picks `metadata.creators[0]` as `creatorName` even when it is just a Tezos address; `client/src/pages/TV.tsx` hides the overlay unless the current asset happens to still be in its asset-relative opening window; `server/routes/media-library.ts` import/upload flows do not preserve or expose enough editable overlay metadata, so later `mediaItemId` channel inserts can lose creator/collection/title-card context entirely.
- Why it matters: The TV feed looks cheap and confused: credits show raw wallet strings, some items have no reliable title card, uploads cannot present meaningful provenance, and token-derived items are missing the obvious jump-out path to Objkt.
- Likely correction direction: Normalize overlay metadata in one shared server helper, preserve token metadata through library import, allow upload creator overrides via media-library metadata, propagate media edits into linked `tv_channel_videos`, and expose token-backed Objkt URLs plus viewer-timed overlay behavior in the client.
- Local fix note: Added `server/lib/tv-overlay-metadata.ts` as the single resolver for creator/collection/mint info, imported token metadata is now persisted into `user_media_library`, upload/library edits can write creator overrides into `metadata.wtfTvOverlay`, linked `tv_channel_videos` rows now inherit those edits, the TV stream payload now emits `objktUrl` plus stable overlay credit fields, and the client overlay now shows on viewer-start/viewer-end instead of trusting asset-start timing.
- Verification: `node --import tsx/esm --test server/lib/tv-overlay-metadata.test.ts server/lib/tv-broadcast.test.ts client/src/lib/tv-playback.test.ts server/lib/tv-stream-snapshot-cache.test.ts server/lib/tv-telemetry.test.ts server/lib/tv-policy.test.ts`; `git diff --check`
- Verification note: repo-wide `npm run check` is currently blocked by unrelated existing Desktop worktree errors in `client/src/components/layout/Desktop.tsx` (missing hamster/pet UI symbols), not by the TV overlay patch.
- Verification idea: Imported token media added through the library should show human-readable creator credit plus Objkt links in TV, upload-backed media without custom credit should show `from <username>'s media`, and overlays should appear at viewer start and viewer end without sticking on screen the whole time.

### WTF-BB-089 - Channel switch reuses the previous airing item until it ends instead of cutting to the new feed

- Category: TV microapp / playback race
- Status: Fixed
- Owner/Session: Codex channel-switch playback pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence: After the aired-item pinning fix, `client/src/pages/TV.tsx` could still render `currentPlaybackItemRef.current` while the selected channel changed but the new stream payload had not arrived yet. The old item snapshot was correctly sticky for same-channel refetches, but wrongly sticky across channel boundaries, so channel flips kept the previous feed on screen until that item naturally ended.
- Why it matters: Changing the channel is supposed to interrupt playback and switch playlists immediately. Keeping the old clip alive makes the UI feel dishonest and makes the TV look slower than it really is even when cache/object storage are hot.
- Likely correction direction: Scope pinned-key and fallback-item reuse to the currently selected channel. Same-channel refetches may preserve the airing item; actual channel changes must clear it immediately and wait for the new channel payload.
- Local fix note: Added `resolveSelectedChannelPlaybackState(...)` in `client/src/lib/tv-playback.ts` and rewired `client/src/pages/TV.tsx` to apply pinned/fallback playback only when it still belongs to the selected channel. Channel switches now blank the old feed immediately, while same-channel refreshes still preserve the airing item through harmless queue churn.
- Verification: `npm run check`; `node --import tsx/esm --test client/src/lib/tv-playback.test.ts`
- Verification idea: Start a clip on one channel, switch channels mid-play, and verify the old clip is interrupted immediately while same-channel stream refetches no longer cut away.

### WTF-BB-090 - Client-owned cursor and local bumper gates compete with the server feed, causing overlapping media and DVD-style playback

- Category: TV microapp / playback architecture
- Status: Fixed
- Owner/Session: Codex broadcast playback pass
- Score: C4 + F5 + S0 + P0(5) = 14
- Evidence: `server/routes/tv.ts` still carried authoritative wall-clock concepts (`offsetSeconds`, loop duration, scheduled current item), but `client/src/pages/TV.tsx` explicitly rejected the server cursor and ran a client-owned queue index, buffer gate, cover bumper overlay, and local advance logic instead. With faster object/object-cache delivery, the main `<video>` could become ready and start under a bumper overlay before the gate state settled, producing exactly the reported symptom: bumper visuals on top, prior video audio underneath, then a cut to some other clip. It also made every viewer effectively start a private session at playlist position zero instead of tuning into a live feed.
- Why it matters: This is not cosmetic. It breaks the TV metaphor, creates competing media elements, and turns fast storage into a liability because the race window gets tighter and more obvious as latency improves.
- Likely correction direction: Restore one playback authority. The server should decide the current queue item and offset from wall clock; the client should seek into that item, preload upcoming rotated items, and refetch the authoritative feed at natural boundaries instead of synthesizing local commercial-cover transitions.
- Local fix note: Added `server/lib/tv-broadcast.ts` to compute a broadcast cursor and rotate the queue around the current on-air item, rewired `/api/tv/channels/:channelId/stream`, `/api/tv/channels/:channelId/now`, and `/api/tv/channels/by-slug/:slug/current` to return authoritative `current` items with real offsets, and changed `client/src/pages/TV.tsx` to render the server's current item, seek to `offsetSeconds`, refetch at boundaries, and stop using local bumper-cover handoffs in the main playback path.
- Verification: `npm run check`; `node --import tsx/esm --test server/lib/tv-broadcast.test.ts client/src/lib/tv-playback.test.ts server/lib/tv-stream-snapshot-cache.test.ts server/lib/tv-telemetry.test.ts server/lib/tv-policy.test.ts`
- Verification idea: Join a channel mid-item from two different clients and confirm both start on the same clip at roughly the same offset, with no bumper/video overlap and no playlist restart from item zero.

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
- 2026-05-06 fix note: Removed `NODE_ENV=production` from `.env`; runtime production mode remains controlled by scripts/process env.
- Verification: `npm run build` completed without the Vite `NODE_ENV` warning.

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
- 2026-05-06 fix note: Added browser-safe aliases for `fs`/`crypto` side-effect imports from wallet UI packages, split wallet dependencies into `vendor-taquito`, `vendor-octez`, `vendor-beacon`, and `vendor-crypto`, and set an explicit 2 MB Vite chunk budget for those lazy wallet chunks.
- Verification: `npm run build` completed without browser-externalized Node core warnings or the generic Vite chunk-size warning.

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
- Status: Verified
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
- Status: Fixed
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
- 2026-05-06 transplant note: `server/lib/tzkt-ops.ts` now uses the shared `tzkt` upstream client for operation-hash verification instead of its own raw fetch path. Other route-level raw fetches listed above still need their own cuts.
- Local verification: `node --import tsx/esm --test server/lib/portfolio-costing.test.ts server/lib/tzkt-ops.test.ts` passed.
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
- 2026-05-06 transplant note: The token-market Objkt listing backfill now preserves full marketplace contract addresses instead of truncating them, and Marketplace Activity now exposes active indexed external listings for linked wallets with supported objkt/Teia cancel operations. The older `external-listings.ts` stub path remains open work.
- Local verification: `git diff --check` passed for the changed transplant files; focused Tezos tests passed.
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
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence: `server/routes/w.ts:2564-2579` queries all rows with verified Twitter IDs from `users` with no `ORDER BY` and no `LIMIT`/`OFFSET`. The result is converted to `accounts`, then every matching user is iterated synchronously at `server/routes/w.ts:2652-2660`.
- Why it matters:
  - As the user table grows, a single request can build arbitrarily large in-memory account/timeline payloads before any caching, causing latency spikes and potential memory pressure.
  - API consumers can trigger repeated expensive fetches simply by hitting one endpoint.
- Likely correction direction:
  - Add pagination or a cursor for users participating in W timeline, or move W timeline to a precomputed table/cache with staleness policy.
- Verification idea:
  - Seed 100k verified Twitter users and observe request time/memory before/after introducing page or prefetch job.
- 2026-05-05 claim note: Claimed for the modular architecture refactor. Scope is to extract W timeline account/payload assembly into a domain module and replace route-local all-user loading with a bounded SQL reader shared by the route and timeline worker.
- 2026-05-05 fix note: Added `loadWTimelineAuthorWindow(maxAccounts)` so the route and worker share a bounded, ordered SQL author window instead of loading every Twitter-linked user into memory. Extracted DB-cache timeline payload assembly into `server/features/w/timeline.ts`, leaving `/api/w/timeline` as the compatibility route.
- Verification:
  - `npm run check` exited 0 on 2026-05-05.
  - `npx tsx -e "import('./server/lib/timeline-db.ts').then(async (m) => { const w = await m.loadWTimelineAuthorWindow(5); console.log(JSON.stringify({ accounts: w.accounts.length, handles: w.handlesLower, totalHandles: w.totalHandles, skippedAccounts: w.skippedAccounts, rowLimit: w.rowLimit })); process.exit(0); }).catch((err) => { console.error(err); process.exit(1); });"` exited 0 against the local sandbox DB and returned a bounded `rowLimit`.

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
- Fix notes:
  - W groupchat reads now serve the persisted official Gameshow conversation cache first through `/api/w/groupchat` and `/api/w/groupchats`, then trigger at most one shared throttled platform refresh for stale or explicit refresh requests. Route diagnostics expose the refresh result.
- Verification:
- Local fix note:
  - W groupchat reads now serve the persisted gameshow conversation cache first, expose `/api/w/groupchat` and `/api/w/groupchats` through the same DB-backed handler, and only trigger a shared throttled platform refresh when the primary cached message is stale or explicitly refreshed. Diagnostics include the route-refresh result so operators can distinguish cache state from upstream refresh state.
- Verification:
  - `npm run check -- --pretty false`
  - `npx tsx --test server/features/w/w-x-surgery-policy.test.ts server/features/w/timeline-stream.test.ts server/features/w/x-activity-stream.test.ts server/features/w/x-usage-budget.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
- Verification idea:
  - Remove DB row and clear env in controlled tests; expect clear "unconfigured" signal instead of silent fallback.

### WTF-BB-032 - Unowned media IDs are accepted for W post/DM flows

- Category: Data safety / input validation
- Status: Verified
- Owner/Session: Codex W repair pass
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence:
  - `/api/w/post` only checks `mediaIds` format (`isDigits`) and sends raw IDs to X at `server/routes/w.ts:1615-1617` and `1630-1637`.
  - `/api/w/groupchat/messages`, `/api/w/user-dms/direct`, and `/api/w/direct-messages` do the same for `mediaId` validation at `server/routes/w.ts:2196`, `2447`, and `2518`.
- Why it matters:
  - There is no DB or auth-based correlation between the logged-in WTF user and the `mediaId` in payload.
  - Malicious clients can inject arbitrary numeric media IDs, which increases abuse surface and complicates audit assumptions around media provenance.
- Likely correction direction:
  - Track uploaded media ownership in DB and validate IDs against the caller before attaching to platform requests.
- Fix notes:
  - W no longer registers compose, media upload, personal DM, or groupchat-send routes. The remaining W writes are rate-limited timeline engagement actions.
- Verification:
- Local fix note:
  - Removed normal W route registration for compose, media upload, direct messages, and groupchat sends. The live W router now registers only timeline engagement actions (`reply`, `like`, `repost`, `quote`) plus read paths, and those actions are rate-limited per user/action before calling X.
- Verification:
  - `npm run check -- --pretty false`
  - `npx tsx --test server/features/w/w-x-surgery-policy.test.ts server/features/w/timeline-stream.test.ts server/features/w/x-activity-stream.test.ts server/features/w/x-usage-budget.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
- Verification idea:
  - Add a rejected test where user A submits a valid-known media ID not owned by user A.

### WTF-BB-033 - Unbounded `platform_settings` value payload allows oversized conversation lists

- Category: Data integrity / ops
- Status: Verified
- Owner/Session: Codex W repair pass
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
- Status: Fixed
- Owner/Session: Codex TV pagination hardening pass
- Score: C3 + F3 + S2 + P2(3) = 10
- Evidence:
  - `server/routes/tv.ts:2718-2765` fetches all channels with joins and no hard `LIMIT`.
  - `server/routes/tv.ts:2803-2832` returns all videos and playlists for a channel without any page cap.
- Why it matters:
  - As TV content grows, single requests become heavier, increase memory/time per request, and can time out under load.
  - The endpoint can return very large JSON payloads, increasing mobile and low-bandwidth client strain.
- Likely correction direction:
  - Add explicit pagination/cursor strategy on both listing and detail routes and cap nested include payload sizes.
- Local fix note:
  - `GET /api/tv/channels` now enforces `limit`/`offset` with a hard cap and surfaces pagination state via `X-WTF-*` headers, while preserving the legacy array response by default.
  - `GET /api/tv/channels/:channelId` now enforces bounded `videoLimit`, `playlistLimit`, and `playlistItemLimit` windows, delegates those limits to the DB instead of slicing in memory, and returns a `pagination` object so channel-management clients can request subsequent pages intentionally.
- Verification: `npm run check`
- Verification idea:
  - Simulate large synthetic TV data and confirm response time and payload size stay bounded under expected SLAs.

### WTF-BB-036 - Channel-video insert path is non-atomic with concurrent requests

- Category: TV microapp / data integrity
- Status: Fixed
- Owner/Session: Codex TV integrity pass
- Score: C3 + F4 + S1 + P1(4) = 11
- Evidence:
  - `server/routes/tv.ts:3350-3373` performs select+insert logic to dedupe by `(channel_id,video_id)` before write.
  - `server/routes/tv.ts:3377-3415` returns success and writes without `ON CONFLICT` or transaction boundaries.
- Why it matters:
  - Two racey requests can both pass checks and create duplicate/overlapping channel-videos states or violate expectations under high concurrency.
  - Retry storms can amplify DB load and create idempotency bugs in client UX.
- Likely correction direction:
  - Use a single `INSERT ... ON CONFLICT` statement or explicit transaction with unique constraints for deterministic upsert behavior.
- Local fix note:
  - Replaced the route's select-then-insert dedupe path with insert-first upsert logic backed by the existing unique indexes on `(channel_id, media_item_id)` and `(channel_id, token_contract, token_id)`.
  - Added recovery for alternate-key unique conflicts so concurrent requests converge on one canonical `tv_channel_videos` row instead of exploding into duplicate-write races.
- Verification: `npm run check`
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
- Status: Fixed
- Owner/Session: Codex TV integrity pass
- Score: C3 + F3 + S3 + P1(4) = 11
- Evidence:
  - `server/routes/tv.ts:3655-3670` updates all other playlists to inactive then inserts/updates a new one.
- Why it matters:
  - Concurrent edits can interleave and leave no active playlist or multiple active rows depending on timing.
  - Stream and UI logic expecting one active playlist can behave unpredictably.
- Likely correction direction:
  - Add DB-level unique partial index/constraint for active playlist per channel or enforce atomic transaction + lock around activation.
- Local fix note:
  - Wrapped active-playlist create/update paths in channel-scoped transactions that lock the parent `tv_channels` row before deactivating peers and promoting the winner.
  - Added `drizzle/0043_tv_concurrency_guards.sql` plus schema reflection for a partial unique index on active playlists per channel, and collapsed any legacy duplicate-active state down to the lowest-id active playlist to preserve current stream selection semantics.
- Verification: `npm run check`
- Verification idea:
  - Fire concurrent playlist updates and verify invariant: at most one active playlist per channel.

### WTF-BB-039 - Stream endpoint rebuilds full queue and full bumpers each call

- Category: TV microapp / stream performance
- Status: Fixed
- Owner/Session: Codex TV stream snapshot cache pass
- Score: C3 + F3 + S4 + P1(4) = 12
- Evidence:
  - `server/routes/tv.ts:3969-4001` loads all playlist rows and `server/routes/tv.ts:4017-4023` loads all bumpers every request.
  - `server/routes/tv.ts:4090-4110` performs shuffle/assembly in process memory each call.
- Why it matters:
  - High-traffic stream reads can repeatedly burn CPU and memory, creating latency spikes and potential request amplification.
  - Stream endpoint can become a reliability bottleneck during events or spikes in viewership.
- Likely correction direction:
  - Add indexed precomputed queue materialization and cache keyed by playlist revision, with bounded reshuffle windows.
- Local fix note:
  - Added `server/lib/tv-stream-snapshot-cache.ts`, a bounded in-memory snapshot cache with in-flight request coalescing so concurrent viewers of the same channel do not all rebuild the same stream payload at once.
  - Reworked `GET /api/tv/channels/:channelId/stream` to keep auth/visibility/schedule resolution live, but cache the expensive assembled queue snapshot behind a key composed from the channel id, resolved playlist id, shuffle window seed, telemetry blacklist signature, and lightweight playlist/bumper revision aggregates.
  - The route now emits `X-WTF-TV-Stream-Cache: HIT|MISS|SHARED` for verification, and only recomputes the playlist rows, bumper pool, seeded shuffle, probe scheduling, and prefetch lookahead on cache misses or revision changes.
- Verification: `node --import tsx/esm --test server/lib/tv-stream-snapshot-cache.test.ts server/lib/tv-telemetry.test.ts server/lib/tv-policy.test.ts`; `npm run check`
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
- Status: Fixed
- Owner/Session: Codex TV telemetry hardening pass
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
- Local fix note:
  - Extracted TV playback telemetry into `server/lib/tv-telemetry.ts`, where hot items now shed expired error sessions inside the rolling window instead of only deleting whole buckets after an hour of silence.
  - Added hard caps on tracked video/bumper buckets and per-item distinct error sessions, plus a dedicated per-route in-memory rate limit on `POST /api/tv/telemetry/item-end`.
  - Added focused regression coverage in `server/lib/tv-telemetry.test.ts` for session expiry, bucket cardinality, and high-churn item eviction.
- Verification: `node --import tsx/esm --test server/lib/tv-telemetry.test.ts server/lib/tv-policy.test.ts`; `npm run check`
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
- Status: Fixed
- Owner/Session: Codex TV resilience pass
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
- Local fix note:
  - Backported item-end telemetry, session ids, and skip-notice UX into `client/src/pages/TV.tsx` so canonical `/tv` now reports natural clip ends and hard failures to `/api/tv/telemetry/item-end`.
  - Patched both `TV.tsx` and `TV2.tsx` so the per-session skip list is not dead state anymore: queue advancement now hops over blacklisted items instead of dutifully replaying them on the next loop.
- Verification: `npm run check`
- Verification idea:
  - Inject a synthetic broken clip and confirm:
    - clear skip notice appears,
    - queue advances without long stalls,
    - telemetry item-end events are persisted in server-side bucket state.

### WTF-BB-054 - Dual TV implementations (`/tv` and `/tv2`) block safe, staged rollout of player behavior changes

- Category: TV microapp / platform health
- Status: Fixed
- Owner/Session: Codex TV2 retirement pass
- Score: C3 + F3 + S3 + P1(4) = 12
- Evidence:
  - `client/src/App.tsx` previously kept `/tv` mapped to `TV.tsx` and `/tv2` as a hidden experimental route pointing at `TV2.tsx`.
  - The two code paths were independently maintained and diverged in behavior without a shared TV core.
- Why it matters:
  - Without a consolidation strategy, reliability work lands in one implementation and leaves `/tv` users on a different behavior set.
  - Rollout and rollback are coarse, making production-safe changes harder and increasing support burden.
- Likely correction direction:
  - Introduce a shared TV adapter layer and feature flags for TV2 behavior in `/tv`.
  - Add `/tv2` as a compatibility lane and retire it once `/tv` owns the same features and tests.
- Local fix note:
  - Removed the hidden `/tv2` route from `client/src/App.tsx`.
  - Deleted `client/src/pages/TV2.tsx` after the useful resilience and playback fixes had already been moved into `TV.tsx`.
  - Cleaned the lingering server comment that still described the skip-banner loop as a TV2-specific path.
- Verification: `npm run check`; `git diff --check`; `rg -n 'TV2|/tv2' client/src server/routes/tv.ts`
- Verification idea:
  - Type `/tv2` directly after deploy and confirm it no longer resolves, while `/tv` still provides the hardened playback behavior.

### WTF-BB-055 - No automated parity checks between `/tv` and `/tv2` for stream/error-handling edge cases

- Category: TV microapp / test coverage
- Status: Archived
- Owner/Session: Codex TV2 retirement pass
- Score: C3 + F3 + S1 + P2(3) = 10
- Evidence:
  - This issue only existed while `client/src/pages/TV.tsx` and `client/src/pages/TV2.tsx` were both routed surfaces.
- Why it matters:
  - Future edits can regress one TV implementation while the other stays unaffected, with no test guard catching parity breaks in stream lifecycle, skip timing, or telemetry behavior.
  - This increases the chance of production-only regressions after small refactors.
- Likely correction direction:
  - Add regression tests for stream lifecycle + error cases at component and route integration level.
  - Build shared contract fixtures for TV stream payloads and verify the single surviving implementation across canonical error and transition cases.
- Archive note:
  - `/tv2` has been removed, so parity between two routed TV clients is no longer a live risk. The remaining work is ordinary `/tv` coverage, not clone parity.
- Verification idea:
  - CI test job covers `/tv` stream lifecycle, power transitions, channel switching, and error-path fallback directly.

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
- Fix notes:
  - W route reads no longer poll personal user-context DM caches. The only chat read surface is the official groupchat mirror, backed by persisted DB messages and a shared route refresh gate.
- Verification:
- Local fix note:
  - Normal users no longer hydrate ad hoc DM caches from W. The single gameshow chat path uses the configured platform gameshow cache with a shared route-level refresh gate, avoiding user-context DM cache growth from page polling while preserving the read-only chat mirror.
- Verification:
  - `npm run check -- --pretty false`
  - `npx tsx --test server/features/w/w-x-surgery-policy.test.ts server/features/w/timeline-stream.test.ts server/features/w/x-activity-stream.test.ts server/features/w/x-usage-budget.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
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
- Codex in-app market note (2026-05-05):
  - Public `https://kiln.wtfgameshow.app/api/health` now reports `auth.required=true`, `auth.mode=token`, and `auth.tokenConfigured=true`.
  - Unauthenticated `/api/kiln/workflow/run` and `/api/kiln/balances` returned HTTP 401, captured in `docs/wtf-in-app-market/shadownet-kiln-run.md`.
  - The WTF in-app market Shadownet deploy/e2e command fails closed without `KILN_API_TOKEN`; this item remains open because host auth posture can still drift and has no repo-local deploy guard.

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

### WTF-BB-097 - Pet ball cap must be account-owned active inventory, not cart-local

- Category: In-app market / render budget
- Status: Verified
- Owner/Session: Codex pet ball account cap pass
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - The 3 ball cap exists to protect desktop rendering and physics load, so checking only a cart or currently visible local balls can allow repeated checkout/grant cycles or active escaped balls to exceed the intended account budget.
  - Pet balls can leave the current desktop through world tunnels, which means visible-local counting alone is not the same as active account-owned slot counting.
- Why it matters:
  - Users could accumulate more live physics/render actors than the budget allows, degrading the desktop simulation and undercutting the marketplace item constraint.
- Fix:
  - Centralized pet-ball account cap decisions in `server/lib/pet-ball-account-cap.ts`, enforced EXP and WTF grant paths against existing owned inventory, and serialized grant-time checks with a transaction advisory lock.
  - Mirrored the active-slot rule in the desktop client by reserving escaped local ball slots while balls are away, so tunnel travel cannot immediately free another local placement slot.
- Verification:
  - `npx tsx --test server/lib/pet-ball-account-cap.test.ts`
  - `npx tsx --test server/lib/desktop-world.test.ts`
  - `npx tsx --test shared/desktop.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`

### WTF-BB-098 - Desktop shell owns cursor, icon physics, and pet actors inline

- Category: Desktop OS / modularity
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - Architecture audit found `client/src/components/layout/Desktop.tsx` at 6,718 lines with OS shell rendering, custom cursor glyphs/pointer tracking, Sunday grass storage/projection/rendering, desktop actors, icon physics, and in-app market behavior in one file.
  - Cursor, Sunday grass, icon drag/physics, and desktop pet/world actors were independent of route/window orchestration but lived in the desktop shell, forcing unrelated feature edits through the largest client file.
- Why it matters:
  - Desktop actor changes become high-conflict and high-regression because every small feature touches the same OS shell surface.
- Fix:
  - Extracted custom cursor glyphs and pointer tracking into `client/src/features/desktop/CustomCursor.tsx`.
  - Extracted Sunday grass persistence/projection/rendering into `client/src/features/desktop/SundayGrass.tsx`.
  - Extracted icon glyphs, desktop icon definitions, drag handling, and icon geometry into `client/src/features/desktop/DesktopIcons.tsx`.
  - Extracted Matter.js icon physics into `client/src/features/desktop/useDesktopPhysics.ts`.
  - Extracted desktop pet, toy, care tray, market panel, and shared-world simulation into `client/src/features/desktop/DesktopPet.tsx`.
  - Extracted shared desktop clamp/seed helpers into `client/src/features/desktop/geometry.ts` for future actor splits.
- Verification:
  - `npm run check`
  - `npm run build`

### WTF-BB-099 - Desktop pet feature still bundles care tray, market, toys, and shared-world simulation

- Category: Desktop OS / modularity
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - The shell extraction moved the desktop pet subsystem into `client/src/features/desktop/DesktopPet.tsx`, and second-level passes reduced that feature module from 4,295 lines to 1,477 lines.
  - The feature now has dedicated care tray, render actor, world actor, market hook, simulation helper, model, storage, API type, ant-domain, and toy-domain modules, but the main file still owns pet state queries/actions, desktop-world heartbeat/visitor handling, and pet movement loops.
- Why it matters:
  - The OS shell is now small, but pet/toy/market changes will still collide inside one second-level feature monolith.
- Likely correction direction:
  - Continue splitting `DesktopPet.tsx` into smaller feature modules: `DesktopPetMarketPanel`, `DesktopToys`, `DesktopDrops`, `useDesktopWorldSimulation`, and shared desktop actor geometry/helpers.
- Verification idea:
  - `client/src/features/desktop/DesktopPet.tsx` should drop below 1,500 lines while `npm run check`, `npm run build`, and a desktop pet/toy browser smoke test still pass.
- 2026-05-05 claim note: Claimed for the continuing modular architecture refactor. Initial scope is to extract presentational care/market panels, care-tool cursor, and actor render components before moving the stateful simulation loop.
- 2026-05-05 progress note: Extracted `DesktopPetCareTray.tsx`, `DesktopPetActors.tsx`, `DesktopPetModel.ts`, `DesktopPetStorage.ts`, and `DesktopPetTypes.ts`. Care/market UI, tool cursor, toy/drop render actors, persisted-state normalization, and shared pet model types no longer live in `DesktopPet.tsx`.
- 2026-05-05 progress note 2: Extracted `DesktopPetSimulation.ts`, `useDesktopPetMarket.ts`, and `DesktopPetWorldActors.tsx`. Pure target/routing/spawn helpers, market/cart/wallet checkout state, and pet-world styled actors no longer live in `DesktopPet.tsx`.
- 2026-05-05 progress note 3: Extracted the ant domain into `client/src/features/desktop/ants/*`. Ant model constants/types, pheromone actors, ant route/pathfinding helpers, desktop/world ant spawn helpers, pheromone aging, colony scheduler state, and the ant RAF loop now live together behind `useDesktopAntSimulation`; `DesktopPet.tsx` only wires shared refs/state and reacts to ant defense/trash events.
- 2026-05-05 progress note 4: Extracted the toy domain into `client/src/features/desktop/toys/*`. Toy model constants/types, ball actor rendering, toy storage normalization, world-ball spawn helpers, toy escape edge rules, toy API actions, and the toy RAF physics/spill/escape loop now live behind `useDesktopToyActions` and `useDesktopToySimulation`; `DesktopPet.tsx` wires shared refs/state and handles cross-domain render callbacks.
- 2026-05-05 progress note 5: Extracted drop, world, persistence, and pet locomotion domains. `client/src/features/desktop/drops/*` owns food/water/poop/pillow/skeleton model, storage normalization, and drop actions; `world/*` owns heartbeat, visitor intake/spawn, pet escape API, world edge helpers, and visiting-pet animation; `persistence/*` owns localStorage restore/save; `pet/useDesktopPetLocomotion.ts` owns the care/scent/escape/defense/digestion movement loop. `DesktopPet.tsx` is now 740 lines and primarily wires state, hooks, query/mutation entrypoints, and render composition.
- 2026-05-06 progress note 6: Extracted `DesktopPetScene.tsx` so pheromones, walkabout/scent cues, drops, toys, ants, visiting pets, the local hamster actor, care tray, and active tool cursor render through a dedicated scene component. `DesktopPet.tsx` is now 555 lines and primarily wires state, refs, simulation hooks, inventory actions, and scene props.
- Local verification: `npm run check -- --pretty false` passed after the pet locomotion and scene extractions. Build and browser smoke remain for the next audit pass before marking `Verified`.
- Verification:
  - `npm run check`
  - `git diff --check`
  - `npm run build`

### WTF-BB-100 - In-app market verifier misses live TzKT entrypoint shape

- Category: Tezos / in-app market verification
- Status: Claimed
- Owner/Session: Codex server verifier pass
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - Live TzKT rows for `opFYjwM15ToKfdZCKeNb5cSqodPAeHygmL77LxtSNLqaH66w2P9` put the called entrypoint at `parameter.entrypoint` (`purchase` for the router call and `transfer` for the internal FA2 call), while the top-level `entrypoint` field is null.
  - `server/lib/tzkt-ops.ts:117-125` filters only `row.entrypoint`, so `findAppliedContractCall(... entrypoint: "purchase")` returns null for the confirmed mainnet in-app-market purchase.
  - `server/lib/in-app-market-sync.ts:399-404` depends on that matcher before granting inventory from verified WTF transfers.
- Why it matters:
  - A wallet purchase can succeed on-chain but fail the app's TzKT verification and background sync path, leaving paid users without inventory until manual repair. The helper is shared by other contract verification paths, so the response-shape drift may have wider blast radius.
- Likely correction direction:
  - Normalize entrypoint extraction in `findAppliedContractCall` to accept `row.entrypoint` or `row.parameter.entrypoint`, return the normalized value, and add a regression fixture using a real TzKT-shaped transaction row.
- Verification idea:
  - Unit-test `findAppliedContractCall` with the live-shaped in-app market purchase rows and confirm `verifyAndGrantInAppMarketPurchaseByHash` can match the purchase call and its internal WTF transfer.
- 2026-05-05 claim note: Claimed to patch the shared TzKT call matcher and add a live-shaped regression fixture.
- Fix:
  - Added shared `transactionEntrypoint` normalization so `findAppliedContractCall` accepts either `row.entrypoint` or live TzKT's `parameter.entrypoint` shape, and returns the normalized entrypoint in the match.
- Verification:
  - `node --import tsx/esm --test server/lib/tzkt-ops.test.ts server/lib/in-app-market-policy.test.ts`
  - `npm run check -- --pretty false`
  - Live sanity probe against `opFYjwM15ToKfdZCKeNb5cSqodPAeHygmL77LxtSNLqaH66w2P9` returned `matched: true`, `entrypoint: "purchase"`, and target `KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE`.

### WTF-BB-101 - Direct listing fallback can grant inactive catalog items

- Category: In-app market / catalog policy
- Status: Verified
- Owner/Session: Codex server verifier pass
- Score: C2 + F4 + S2 + P1(4) = 12
- Evidence:
  - `server/routes/in-app-market.ts:287-364` builds checkout intents only from active `in_app_market_items`.
  - The verifier fallback in `server/lib/in-app-market-sync.ts:456-503` accepts any positive `listing_id` and calls `itemForListing`.
  - `server/lib/in-app-market-sync.ts:218-233` looks up the listing by contract/listing id but does not require `inAppMarketItems.active = true` or a live payment intent.
- Why it matters:
  - After the TzKT entrypoint matcher is corrected, a linked wallet can bypass the current cart/intent path and buy retired, disabled, limited, or otherwise inactive catalog items by calling the public router directly with the old listing id and exact WTF amount.
- Likely correction direction:
  - Prefer requiring a non-expired WTF payment intent for router listing `0`. If legacy direct listing support stays, require `active = true`, cap quantity, and add explicit tests for inactive listings, retired SKUs, and cart-router sentinel behavior.
- Verification idea:
  - Seed an inactive item with a `contract_listing_id`, simulate a matching TzKT purchase call plus WTF transfer, and verify the grant path rejects it while an active item or valid cart intent still grants.
- 2026-05-05 claim note: Claimed to tighten the direct-listing fallback so inactive catalog rows cannot be granted outside a valid payment intent.
- Fix:
  - Added a direct-listing selector that only returns active catalog candidates, blocks an inactive contract-specific listing from falling through to a generic listing, and wired the verifier fallback through that selector.
- Verification:
  - `node --import tsx/esm --test server/lib/tzkt-ops.test.ts server/lib/in-app-market-policy.test.ts`
  - `npm run check -- --pretty false`
  - `git diff --check -- server/lib/tzkt-ops.ts server/lib/tzkt-ops.test.ts server/lib/in-app-market-sync.ts server/lib/in-app-market-policy.ts server/lib/in-app-market-policy.test.ts BUG_BOUNTY_BOARD.md LESSONS_LEARNED.md`

### WTF-BB-102 - TV server router and client page block parallel domain work

- Category: TV microapp / modularity
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - `server/routes/tv.ts` was 6,607 lines and mixed channel listing/detail, stream assembly, cache proxy, transcode, bumpers, schedules, storage playback, telemetry, and WTF auto-refresh.
  - `client/src/pages/TV.tsx` was 5,851 lines and mixed DTOs, CRT/static rendering, playback telemetry, player state, creator console, media manager, bumper manager, playlist editor, schedule UI, and overlay rendering.
- Why it matters:
  - TV fixes collide in the same route/page files, so independent agents cannot safely own cache, bumpers, stream, media library, playlist, schedule, and player work in parallel.
- Likely correction direction:
  - Keep public route paths and the `TV` page export as compatibility wrappers while moving DTOs, pure helpers, telemetry, bumper upload policy, pagination, daypart programming, cache services, stream services, creator-console views, and player components into `server/features/tv/*` and `client/src/features/tv/*`.
- Verification idea:
  - `npm run check`, focused TV tests under `server/lib/tv-*.test.ts`, and browser smoke for `/tv` playback plus creator-console screens.
- 2026-05-05 claim note: Claimed for the continuing modular architecture refactor. First scope is low-risk pure/helper cuts that do not alter route paths, auth gates, query keys, or rendered UI branches.
- 2026-05-05 progress note: Extracted client TV DTO/view types, pure helpers, playback telemetry helpers, the CRT static/WebAudio component, CRT chrome/styled components, the on-screen menu/creator-console switch, the CRT playback surface, React Query data hooks, mutation hooks, creator-console derived data, channel selection, session telemetry, playlist draft sync, stream prefetch, remote-control/dial logic, skip-notice UX, hidden preload tracking, MTV overlay timing, stall-indicator UX, broadcast playback-state resolution, bumper deck/gate selection, playback timer refs, queue-cursor sync, current item lifecycle, media event handlers, power/channel signal reset lifecycle, buffer-gate/bumper transition state, queue advance/refetch controller, playback view model, and shell/chrome layout into `client/src/features/tv/*`; extracted server TV pagination helpers, daypart programming policy, media URL/cache fetch helpers, cache file/config helpers, cache storage/eviction/stats helpers, cache fetch/proxy runtime, cache endpoint wrappers, duration probing, cache warmer, transcode worker, telemetry store/rate-limit helpers, telemetry routes, media metadata helpers, stream snapshot assembly/cache keys, WTF auto-refresh, channel service helpers, bumper upload config/middleware/helpers, bumper routes, live/schedule routes, playlist routes, playback/media-file routes, and channel routes into `server/features/tv/*`. `client/src/pages/TV.tsx` is now 837 lines and `server/routes/tv.ts` is now 19 lines.
- 2026-05-05 Division 04 claim note: Claimed the nested `TVMenuScreens.tsx` client monolith split for wrapper integration and division docs. Worker-owned targets are planned under `client/src/features/tv/menu/*`; the first pass maps screen contracts before any wrapper splice so query/mutation keys, media playback URLs, and creator-console behavior stay unchanged.
- 2026-05-05 Division 04 progress note: Extracted the root TV menu and settings screen into `client/src/features/tv/menu/MenuRootScreen.tsx` and `client/src/features/tv/menu/SettingsScreen.tsx`, reducing `TVMenuScreens.tsx` from 1,887 to 1,832 lines while preserving the `TVMenuScreensProps` wrapper contract. Verification: `npm run check -- --pretty false` passed and IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted the public channel selector into `client/src/features/tv/menu/ChannelsScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,800 lines while preserving dial fallback, selected-channel state, stream tick refresh, and return-to-TV behavior. Verification: `npm run check -- --pretty false` passed and IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted the creator tools index into `client/src/features/tv/menu/CreatorToolsScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,686 lines while preserving channel creation, selected-channel draft hydration, refresh-sources mutation gating, and creator workflow navigation. Verification: `npm run check -- --pretty false` passed and IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted the playlist selector/create/rename screen into `client/src/features/tv/menu/PlaylistsScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,594 lines while preserving playlist selection, rename/save, active playlist mutation, create-playlist gating, and edit-contents navigation. Verification: `npm run check -- --pretty false` and scoped `git diff --check` passed; IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted `ChannelVideosScreen.tsx` and `MediaFormScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,557 lines while preserving channel media removal payloads and the media-form compatibility redirect to `my-media`. Verification: `npm run check -- --pretty false` and scoped `git diff --check` passed; IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted `ChannelEditScreen.tsx` and `PlaylistOrderScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,304 lines while preserving channel update payloads, bumper cadence clamp [0, 20], playlist draft reorder/remove/add behavior, duration clamp, and save-playlist payload shape. Verification: `npm run check -- --pretty false` and scoped `git diff --check` passed; IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted `AddTokensScreen.tsx`, reducing `TVMenuScreens.tsx` to 1,173 lines while preserving playable-token search/sort pagination resets, page navigation, cache-preview fallback, selected-channel add payloads, and empty/error query states. Verification: `npm run check -- --pretty false` and scoped `git diff --check` passed; IDE diagnostics showed no linter errors for the touched TV menu files.
- 2026-05-05 Division 04 progress note: Extracted `BumpersScreen.tsx`, `ScheduleScreen.tsx`, and `MyMediaScreen.tsx`, reducing `TVMenuScreens.tsx` to 466 lines while preserving bumper category caps/upload duration validation, UTC schedule slot rendering/add/delete payloads, media add/manage/delete flows, and TV stream/channel invalidations after media deletion. Verification: `npm run check -- --pretty false`, scoped `git diff --check`, and IDE diagnostics passed for the touched TV menu files.
- Local verification: `npm run check`, `git diff --check`, and focused TV server tests passed during the split; this pass reran `npm run check -- --pretty false`, `git diff --check`, and `npm run build` after the final wrapper checks. A TV verifier found no playback hook regressions. Browser smoke remains for later before marking `Verified`.

### WTF-BB-103 - W server router and client page block parallel social-domain work

- Category: W microapp / modularity
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - `server/routes/w.ts` was over 3,000 lines and mixed timeline reads/cache, compose actions, engagement actions, follows, Spaces, capabilities, DMs, groupchat, stream-rule admin tools, media upload, link previews, OAuth helpers, and diagnostics.
  - `client/src/pages/W.tsx` was over 3,500 lines and mixed timeline rendering, composer state, DM/groupchat UIs, Spaces controls, account status, admin stream tools, and mutation/query wiring.
- Why it matters:
  - Timeline, messages, Spaces, composer, and admin-stream work collide in the same files, blocking parallel W agents and increasing the chance that social/API credit fixes accidentally disturb unrelated UI or route behavior.
- Likely correction direction:
  - Keep `server/routes/w.ts` and `client/src/pages/W.tsx` as compatibility wrappers while moving route registrars, query hooks, mutation hooks, timeline panels, message panels, Spaces/admin tools, and shared W types into `server/features/w/*` and `client/src/features/w/*`.
- Verification idea:
  - `npm run check`, `git diff --check`, route registration scans for `/api/w/*`, and browser smoke for `/w` timeline, compose, DMs/groupchat, Spaces, and admin stream controls.
- 2026-05-05 claim note: Claimed for the continuing modular architecture refactor. Scope is behavior-preserving extraction of W server route groups and W client feature views into domain-owned modules while preserving route paths, query keys, auth gates, and X API token isolation.
- 2026-05-05 progress note: Extracted W server compose/engagement actions, messages/admin DM/groupchat routes, follows/Spaces/capabilities routes, timeline route registration/cache wrapper, timeline helpers, timeline shared types, link-preview route registrar, and link-preview helpers into `server/features/w/*`; extracted W client shared types, data queries, mutations, shell chrome/nav, timeline panel, messages/DM/groupchat panel, and social/settings/Spaces/admin diagnostics panel into `client/src/features/w/*`. `server/routes/w.ts` is now 214 lines and `client/src/pages/W.tsx` is now 660 lines.
- Local verification: `npm run check -- --pretty false` and `git diff --check` passed after the W timeline/messages/social/settings/link-preview cuts. A W server verifier found no duplicate route owners or route-order drift; the type-only timeline/link-preview cycle was cleaned into `server/features/w/timeline-types.ts`. This pass reran `npm run build` successfully before marking fixed.

### WTF-BB-104 - Admin route and page bundle unrelated ops panels into one change surface

- Category: Admin console / modularity
- Status: Fixed
- Owner/Session: Codex modular architecture refactor
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - `server/routes/admin.ts` bundled permissions, WTF TV, media storage, rewards, users, stats, and other operational APIs before extraction.
  - `client/src/pages/Admin.tsx` was over 4,000 lines and mixed overview, seasons, rounds, challenges, side quests, boards, content, XP log, rewards, users, desktop apps, contract ledger, roles, WTF TV, Studio, and WTF Tez panels.
- Why it matters:
  - Admin work spans many unrelated operational concerns. A single-page/server-route change surface makes parallel agents trip over each other even when they are working on totally different admin domains.
- Likely correction direction:
  - Keep `server/routes/admin.ts` and `client/src/pages/Admin.tsx` as compatibility wrappers while moving route registrars, shared hooks, mutation hooks, and tab-owned panels into `server/features/admin/*` and `client/src/features/admin/*`.
- Verification idea:
  - `npm run check`, route scans for `/api/admin/*`, and browser smoke for the Admin tabs that were extracted.
- 2026-05-05 claim note: Claimed for the continuing modular architecture refactor. Scope is behavior-preserving extraction of Admin server route groups and Admin client tab panels while preserving tab numbering, API routes, auth/role gates, query keys, and mutation invalidations.
- 2026-05-05 progress note: Extracted Admin server permissions, WTF TV, media storage, rewards, users, stats, and user subdomain registrars into `server/features/admin/*`; extracted Admin shared types, data queries, mutations, and every Admin tab into `client/src/features/admin/tabs/*`. `server/routes/admin.ts` remains an 18-line registrar, `server/features/admin/user-routes.ts` is now a 6-line compatibility wrapper, and `client/src/pages/Admin.tsx` is now 616 lines.
- Schema progress note: Extracted the Admin/identity schema branch into `shared/schema-admin.ts`, integrated `shared/schema-gameshow.ts`, `shared/schema-board.ts`, `shared/schema-dm.ts`, `shared/schema-studio.ts`, `shared/schema-wallet.ts`, `shared/schema-analytics.ts`, `shared/schema-recapture.ts`, `shared/schema-liveops.ts`, and `shared/schema-session.ts` through the compatibility barrel, moved marketplace listing/bid tables into `shared/schema-market.ts`, and moved desktop pet event history into `shared/schema-desktop.ts`. `shared/schema.ts` is now a 90-line compatibility barrel.
- Local verification: `npm run check -- --pretty false` and `git diff --check` passed after the Admin tab/user-route/schema-admin integration; `npm run check -- --pretty false` passed again after the gameshow/board/market/DM/Studio schema cuts. Duplicate owner and barrel-import scans, `npm run check -- --pretty false`, and `git diff --check` passed after the wallet/cockpit/analytics/recapture/liveops/session cuts. This pass reran `npm run build` successfully before marking fixed.

### WTF-BB-105 - Marketplace client page bundles listing, auction, trade-board, and wallet action flows

- Category: Marketplace client / modularity
- Status: Fixed
- Owner/Session: Division 06 Marketplace client leader
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - `client/src/pages/Marketplace.tsx` is 1,505 lines and mixes API queries, URL prefill behavior, wallet/on-chain command flows, create listing/auction form state, listing cards, auction cards, trade-board offer cards, activity summaries, and detail-modal wiring in one page file.
  - The page owns stable contracts that future agents must not drift: query keys `["marketplace", "onchain"]`, `["marketplace", "trade-board", boardSearch]`, and `["wallets"]`; route behavior from `initialTab`; and Tezos approve/create/buy/bid/cancel/settle/offer/accept flows.
- Why it matters:
  - Marketplace UI and wallet-flow fixes collide in one large page, making it hard for listing, auction, trade-board, activity, and action-flow agents to work in parallel without query-key or on-chain behavior drift.
- Likely correction direction:
  - Keep `client/src/pages/Marketplace.tsx` as the exported compatibility wrapper while workers move shared types/styles/helpers, data hooks, action hooks, and tab-owned panels into `client/src/features/marketplace/*`.
- Verification idea:
  - `npm run check -- --pretty false`, `git diff --check`, query-key scan for the three preserved keys, and browser smoke for `/marketplace` listings, auctions, trade boards, create prefill, wallet buy/bid/offer/accept/cancel controls, and token detail modal.
- 2026-05-05 claim note: Claimed by Division 06 Marketplace client leader. Scope is behavior-preserving client extraction only; server marketplace data pipeline bounty `WTF-BB-027` remains open and out of scope.
- 2026-05-05 completion note: Extracted Marketplace DTOs/helpers, shared chrome, data hook, wallet action hook, create listing/auction panel, listings tab, auctions tab, trade-board tab, activity tab, offer-accept confirmation, and feature barrel into `client/src/features/marketplace/*`. `client/src/pages/Marketplace.tsx` is now a 345-line compatibility wrapper preserving the named export, route prefill behavior, query keys, API paths, and on-chain action sequencing.
- Local verification: `npm run check -- --pretty false` and `git diff --check` passed after the Marketplace client extraction.

### WTF-BB-107 - Pet care tray exposes market capability while food inventory defaults are not guaranteed

- Category: Desktop pet / in-app market inventory
- Status: Fixed
- Owner/Session: Codex pet care market removal pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-05-06: the WTF in-app market contract is deployed and functional, but the marketplace is not currently configured with a signer.
  - The desktop pet care tray still exposes a market UI/capability even though pet care should not offer a broken or unintended market path.
  - New and existing users need guaranteed food inventory so pet care remains usable without requiring market checkout.
- Why it matters:
  - A visible market affordance can steer users into a signer-blocked flow, while missing food inventory can make the care loop fail even when the pet itself is functional.
- Likely correction direction:
  - Remove market UI capability from the pet care tool tray, keep inventory consumption paths intact, verify market food grants still write to `in_app_inventory_items`, give new pets starter food, and add a one-time migration/backfill for existing users.
- Verification idea:
  - `npm run check -- --pretty false`, focused in-app market policy/sync tests, and a migration/repo scan proving pet food grants use the canonical inventory table while the desktop tray no longer renders market purchase controls.
- Fix:
  - Removed cart, currency, wallet, and checkout controls from the desktop pet care tray and replaced the desktop pet market hook with an inventory-only hook.
  - Added idempotent starter-food grants for newly generated pets through both browser and MCP pet creation paths.
  - Added `drizzle/0049_pet_food_inventory_defaults.sql` to grant every existing user three pet-food inventory items once.
  - Confirmed food purchases still grant care inventory through the canonical `in_app_inventory_items` table: EXP checkout and WTF verified purchase sync both upsert purchased SKU quantities there, while the pet care tool only consumes those inventory rows.
- Local verification:
  - `npm run check -- --pretty false`
  - `node --import tsx/esm --test server/lib/in-app-market-policy.test.ts server/lib/tzkt-ops.test.ts server/lib/pet-ball-account-cap.test.ts`
  - `git diff --check`
  - `npm run build`
  - `rg -n "ShoppingCart|Checkout|Send WTF|Redeem EXP|Pay with WTF|Pay with EXP|CurrencyTabs|MarketPanel|CartPanel|useDesktopPetMarket" client/src/features/desktop client/src/components/layout/Desktop.tsx` returned no matches.
- 2026-05-06 live follow-up:
  - User verified production still showed the old care tray and zero-food behavior after the feature-branch push; this was a deployment miss, not a failure of the local patch.
  - Cleaned remaining desktop-pet user-facing "Hamster" copy in System Appearance, taskbar affordances, sprite aria text, and care-item hover titles so the UI uses generic pet wording.
  - Re-ran `npm run check -- --pretty false`, focused in-app-market/pet inventory tests, `git diff --check`, `npm run build`, the desktop-market-control scan, and a desktop-pet wording scan before promoting to the live branch.
- Production verification:
  - Promoted the pet-care commits to `main` and pushed `f1be758`; GitHub Actions deploy run `25450204335` completed successfully.
  - Live `https://wtfgameshow.app/api/health` returned `commitRef: "f1be758"` after deploy.
  - Deploy logs show `[deploy-migrations] apply 0049_pet_food_inventory_defaults.sql`, confirming the existing-user food grant migration ran in production.
  - Live bundle scans found `Desktop pet`, `Save Pet`, and `Pixel pet`, with no stale desktop pet market checkout strings.

### WTF-BB-108 - Rest tool is gated by shoebox inventory during live pet testing

- Category: Desktop pet / care tool UX
- Status: Fixed
- Owner/Session: Codex pet rest test unblock pass
- Score: C1 + F4 + S0 + P1(4) = 9
- Evidence:
  - User report on 2026-05-06: the pet care Rest tool is greyed out for users with zero shoebox inventory.
  - `DesktopPetCareTray` disabled the pillow/rest tool when `shoeboxQty <= 0`, and `DesktopPet` blocked pillow placement with "No shoebox in inventory."
- Why it matters:
  - Rest is currently a survival-critical test tool. Gating it on an inventory item that users do not receive blocks live pet-care testing and can make pets die for reasons unrelated to the care loop being tested.
- Likely correction direction:
  - Temporarily allow the Rest/pillow tool without a shoebox inventory check while preserving medicine/food inventory checks.
- Verification idea:
  - Typecheck/build and scan the desktop pet care files to ensure `shoeboxQty`, `No shoebox`, and `Box {` no longer gate or label the Rest tool.
- Fix:
  - Removed the shoebox inventory prop from the care tray, changed the Rest button to only require a living pet, relabeled it `Rest`, and removed the placement-time shoebox check.
- Local verification:
  - `npm run check -- --pretty false`
  - `git diff --check`
  - `npm run build`
  - `rg -n "shoeboxQty|No shoebox|Box \\{|disabled=\\{!pet\\.alive \\|\\| shoeboxQty" client/src/features/desktop/DesktopPet.tsx client/src/features/desktop/DesktopPetCareTray.tsx` returned no matches.
- Production verification:
  - Pushed `7aaa18a` to `main`; GitHub Actions deploy run `25452157829` completed successfully.
  - Live `https://wtfgameshow.app/api/health` returned `commitRef: "7aaa18a"` after deploy.
  - Live bundle scan found the `Rest` button copy and found no `No shoebox`, `Box {`, `Box `, or pillow+shoebox gate strings.

### WTF-BB-109 - Desktop items need element-owned interaction rules

- Category: Desktop pet / item interactions
- Status: Fixed
- Owner/Session: Codex desktop item interaction pass
- Score: C4 + F3 + S0 + P2(3) = 10
- Evidence:
  - User request on 2026-05-06 asks for tiny fan, hanging light variants, sticky note trap, mop, and vacuum, with every existing living/physics element getting explicit behavior rules for each created item.
  - Current desktop actors primarily encode behavior in the top-level pet, ant, and ball simulations, so new objects risk becoming scattered one-off branches instead of element-owned interaction contracts.
- Why it matters:
  - Desktop chaos only stays expandable if each element owns how it reacts to environment items. Otherwise pets, ants, balls, drops, and future items will drift into contradictory rules and brittle cross-file edits.
- Likely correction direction:
  - Add a desktop item subdomain plus per-element interaction scripts for pets, ants, toys/balls, and drops. Persist the new items, seed disabled marketplace inventory rows, and add focused tests around sticky traps, fan/light effects, dirty balls, and cleaning tools.
- Verification idea:
  - Focused unit tests for pure interaction helpers, `npm run check -- --pretty false`, `git diff --check`, and `npm run build`.
- Fix:
  - Added a persisted desktop item subdomain for tiny fans, sticky notes, hanging light variants, mops, and vacuums.
  - Added element-owned interaction scripts for ants, pets, balls/toys, and drops so living elements react by behavior rules while mess/cleaning remains physics/drop based.
  - Dirty balls now collect grime from poop/mess/food, smear new messes, and mark sticky notes; mops reduce messes in multiple passes while vacuums erase them.
  - Sticky notes can store typed text, cursor strokes, pet footprints, ball marks, glue/wetness/curl state, and ant/pet trap behavior.
  - Added inactive in-app market catalog rows for the new desktop environment items so they exist without becoming sellable.
- Local verification:
  - `node --import tsx/esm --test client/src/features/desktop/items/itemInteractions.test.ts`
  - `npm run check -- --pretty false`
  - `git diff --check`
  - `npm run build`

### WTF-BB-110 - Desktop artifacts are incorrectly owned by pet care tray

- Category: Desktop OS / in-app items
- Status: Fixed
- Owner/Session: Codex desktop artifact ownership correction
- Score: C4 + F4 + S0 + P1(4) = 12
- Evidence:
  - User correction on 2026-05-06: fans, hanging lights, catapults, and similar purchased objects are desktop artifacts, not pet-care tools.
  - Current local pass placed fan, sticky note, mop, vacuum, and light placement buttons in `DesktopPetCareTray`, incorrectly coupling general desktop-item spawning to a pet-care surface.
- Why it matters:
  - Pet care should only own maintenance tools like food, water, rest/pillow, and balls. General desktop purchases need to spawn automatically as desktop artifacts or icons so they exist even without the pet-care tray and can later include non-pet items like catapults.
- Likely correction direction:
  - Remove non-pet artifacts from the pet-care tray, keep pet-care-only tools there, and move desktop item spawning into a desktop-owned inventory/artifact synchronizer keyed from in-app inventory grants.
- Verification idea:
  - Scan the care tray for general artifact labels/tools, focused interaction tests, `npm run check -- --pretty false`, `git diff --check`, and `npm run build`.
- Fix:
  - Removed fan, sticky note, mop, vacuum, and hanging-light controls from the pet care tray and from the pet-care tool union.
  - Moved desktop artifact state into the desktop shell through `useDesktopArtifacts`, with independent local persistence and automatic spawn from `desktop_fun` inventory quantities.
  - Added generic desktop artifact icon spawning for inactive desktop-fun inventory grants such as spraycan, catapult, and ant farm, and seeded those inactive catalog rows alongside fan/light/note/cleaning items.
  - Added store-stock tracking plus an Admin Panel In-App Market tab for setting item visibility and stock quantity; EXP checkout now atomically reserves stock before granting inventory.
  - Kept pet/ant/ball/drop interaction rules reading the desktop-owned artifact layer so pets can still react to fans and sticky notes without pet care owning those items.
  - Added `desktop_fun` as its own WtfIAM category so desktop artifacts have a marketplace category distinct from `desktop_pet`.
- Local verification:
  - `rg -n "Fan|Note|Mop|Vac|Disco|light-disco|sticky-note|desktop-tiny-fan|desktop-light|desktop-mop|desktop-vacuum" client/src/features/desktop/DesktopPetCareTray.tsx client/src/features/desktop/DesktopPet.tsx client/src/features/desktop/DesktopPetTypes.ts client/src/features/desktop/DesktopPetActors.tsx` returned no matches.
  - `node --import tsx/esm --test client/src/features/desktop/items/itemInteractions.test.ts`
  - `npm run check -- --pretty false`
  - `git diff --check`
  - `npm run build`

### WTF-BB-111 - Tezos creator and collection displays fall back to raw addresses

- Category: Tezos identity / token display
- Status: Fixed
- Owner/Session: Codex Tezos identity resolver pass
- Score: C5 + F4 + S1 + P1(4) = 14
- Evidence:
  - User report on 2026-05-06: token cards, media libraries, WTF TV, and dashboard-style surfaces still showed wallet/contract addresses instead of Objkt/Tezos identities and collection titles.
  - Existing `objkt-identity` code only mapped X handles to Tezos addresses; high-traffic token endpoints pulled `creators[0]` from metadata and returned it directly.
- Why it matters:
  - Raw addresses make the app feel anonymous and break scanning across creator, collection, TV, and media workflows. Identity resolution must happen at the data boundary, not by one-off React formatting.
- Likely correction direction:
  - Add a shared Tezos identity extractor plus a server resolver that batches `address_labels`, linked-wallet Tezos domains, X identity hints, Objkt holder aliases, and contract metadata titles. Wire the resolver into token, gallery, media-library, marketplace, and TV payloads.
- Verification idea:
  - Focused identity extraction/resolver tests, `npm run check -- --pretty false`, `git diff --check`, and `npm run build`.
- Fix:
  - Added `shared/tezos-identity.ts` for address detection, safe short-address fallback, creator extraction, and collection-title extraction.
  - Added `server/lib/tezos-identity.ts` to batch identity resolution through local label tables, linked wallets, X hints, Objkt holder aliases, and contract metadata.
  - Enriched `/api/profile/tokens`, `/api/wallets/:address/tokens`, `/api/gallery/mine`, `/api/media/*`, `/api/tv/me/playable-tokens`, TV playlist writes/refreshes/live overlays, colleKT tokens, PFP candidates, and trade-board token payloads.
  - Updated shared token card, owned-token gallery, media token searches, and TV token picker displays to prefer human creator/collection names and only show shortened addresses as fallback.
- Local verification:
  - `node --import tsx --test shared/tezos-identity.test.ts server/lib/tezos-identity.test.ts`
  - `npm run check -- --pretty false`
  - `git diff --check`

### WTF-BB-112 - WTF Domains E2E harness shape drift crashes native route smoke

- Category: E2E inventory / WTF Domains
- Status: Fixed
- Owner/Session: Codex full-send release verification
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed on `/wtf-subdomains` with `TypeError: m.data.map is not a function`.
  - `tests/playwright/harness.mjs` returned `{ grants: [], config: {}, items: [] }` for every `/api/wtf-subdomains/*` endpoint, while `RegistrarPanel` consumes `/api/wtf-subdomains/my` as an array.
- Why it matters:
  - The inventory E2E suite is supposed to prove every route surface can render against its owned subdomain contracts. A generic catch-all fixture can either crash pages or hide real API drift.
- Likely correction direction:
  - Split WTF Domains harness fixtures by endpoint and keep native panels defensive around optional array fields.
- Verification idea:
  - Focused Playwright run for the WTF Domains route, then rerun the full inventory suite.
- Fix:
  - Added exact harness responses for `/api/wtf-subdomains/my`, `/api/wtf-subdomains/registrar/config`, and `/api/wtf-subdomains/chat/config`.
  - Guarded WTF Domains native panels around malformed/missing `missingEnv`, grants, and `parentDomains` arrays.
- Local verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "WTF Domains"`

### WTF-BB-113 - Live puppet script reuses stale port-3000 server

- Category: E2E live puppets / release verification
- Status: Fixed
- Owner/Session: Codex full-send release verification
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - `npm run test:e2e:live:puppets` failed wallet-login verification for Bert with `Signature verification failed`.
  - The same run later hit auth/API `429 Too Many Requests` because repeated puppet route checks reused a long-running port-3000 dev server without the E2E rate-limit bypass.
  - `http://127.0.0.1:3000/api/health` reported a development server with very high uptime and `commitRef: null`.
- Why it matters:
  - The live puppet suite is the release gate for actor-backed user, wallet, route, and domain workflows. It must verify the current branch, not whichever local dev process is already listening.
- Likely correction direction:
  - Make the script start a Playwright-owned server on an isolated port with local E2E bypass env enabled and server reuse disabled.
- Verification idea:
  - Rerun `npm run test:e2e:live:puppets` and confirm wallet signing plus all route/domain checks pass.
- Fix:
  - Updated `test:e2e:live:puppets` to run Playwright with `WTF_E2E_START_SERVER=1`, `WTF_E2E_REUSE_SERVER=0`, and default `PORT=3307`.
- Local verification:
  - `npm run test:e2e:live:puppets` passed 75/75 with wallet signing, route, and domain workflow checks.

### WTF-BB-114 - Casino workflow schema missing from local puppet DB prep

- Category: E2E live puppets / Casino
- Status: Fixed
- Owner/Session: Codex full-send release verification
- Score: C3 + F3 + S0 + P1(4) = 10
- Evidence:
  - Fresh-server `npm run test:e2e:live:puppets` passed 74 tests but failed `casino access and membership loop`.
  - `/api/casino/status` returned HTTP 500 because relation `casino_memberships` did not exist in the local E2E database.
  - `tests/e2e/puppets/prepare-local-db.ts` applied migrations through `0067_in_app_market_pricing_lattice.sql` but omitted `0068_casino_domain_membership.sql`.
- Why it matters:
  - The live puppet suite is the domain integration gate. Missing schema in DB prep makes a healthy domain look broken and blocks repeatable local verification.
- Likely correction direction:
  - Include the Casino domain migration in the idempotent local E2E DB prep list.
- Verification idea:
  - Rerun `npm run test:e2e:live:puppets` and confirm the Casino workflow passes.
- Fix:
  - Added `drizzle/0068_casino_domain_membership.sql` to `REQUIRED_LOCAL_MIGRATIONS`.
- Local verification:
  - `npm run test:e2e:live:puppets` passed 75/75, including `casino access and membership loop`.

### WTF-BB-115 - Console route smoke receives impossible harness payloads

- Category: E2E inventory / Console
- Status: Fixed
- Owner/Session: Codex full-send release verification
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - Post-merge `npm run test:e2e:inventory` failed on `/console` with `TypeError: It is not iterable`.
  - `tests/playwright/harness.mjs` returned the same generic object for every `/api/console/*` route, while `/api/console/demo-cartridges` and `/api/console/cartridges` are consumed as arrays.
- Why it matters:
  - The inventory route smoke gate should prove the Console page can render against its domain contracts. Generic fallback payloads make the suite brittle and can confuse harness drift with product regressions.
- Likely correction direction:
  - Split Console and Arcade harness fixtures by endpoint before the catch-all.
- Verification idea:
  - Run the focused Console route smoke and then rerun the full inventory suite.
- Fix:
  - Added endpoint-specific fixtures for Console/Arcade catalog, demo cartridges, user cartridges, stats, discovery, leaderboard, play-fee, and play-status responses.
- Local verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "WTF Console"`

### WTF-BB-116 - WTF OS lacks Win95 shortcut and alternate-click desktop affordances

- Category: Desktop OS / interaction polish
- Status: Verified
- Owner/Session: Codex OS ergonomics pass
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - User report on 2026-05-09: WTF OS still feels less like a functional Windows 95-style OS because Start menu items cannot be dragged to the desktop as shortcuts and Shift-click does not behave like right-click for menu affordances.
  - The desktop shell renders first-party icons and desktop artifact actors separately, but there is no shortcut layer or MIME-scoped drop contract between the Start menu and desktop.
- Why it matters:
  - Shortcut creation and alternate-click menus are core desktop OS muscle memory. If implemented globally or with broad drop interception, they can break inventory-backed desktop toys and item physics.
- Likely correction direction:
  - Add a dedicated desktop shortcut storage/rendering layer, Start menu drag payloads, MIME-scoped desktop drops, and element-owned context menus that treat Shift-click as an alternate-click without stealing ordinary artifact interactions.
- Verification idea:
  - Focused helper tests, TypeScript check, inventory coverage, and inventory Playwright smoke for the shell.
- Fix:
  - Added a reusable React95 context menu component and wired right-click/Shift-click menus for desktop icons, desktop shortcuts, desktop artifact items, Start menu entries, taskbar window buttons, and the desktop surface.
  - Added a MIME-scoped Start menu drag payload and local shortcut persistence layer so enabled Start menu items can create movable/openable/deletable desktop shortcuts without writing unknown keys into the native icon layout.
  - Kept shortcut drops opt-in to `application/x-wtf-start-menu-item`, leaving desktop artifacts/toys and route-layer interactions outside the shortcut drop contract.
  - Updated the interaction inventory and desktop domain workflow handles for context menus and shortcut lifecycle events.
- Local verification:
  - `node --import tsx --test client/src/features/desktop/desktop-shortcuts.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory`
  - `git diff --check`
  - Playwright smoke against `http://localhost:3000/` for Start menu Shift-click shortcut creation, shortcut Shift-click context menu, and desktop surface context menu.

### WTF-BB-117 - Console game seed upsert blocks live puppet harness

- Category: E2E live puppets / Console seed data
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - `npm run test:e2e:live:puppets` failed during `tests/e2e/puppets/seed.ts` before Playwright launched.
  - The failing query was an upsert into `console_games` using `on conflict ("slug") do update` for the `adrift` fixture.
  - Local verification for the onboarding release therefore could not complete the actor-backed live puppet pass, even though inventory coverage, inventory route smoke, typecheck, build, deploy health, and production smoke passed.
- Why it matters:
  - The live puppet suite is the durable login/wallet/workflow verification gate. Seed fixture drift should not block unrelated release verification or mask real product regressions.
- Likely correction direction:
  - Inspect `console_games` schema/indexes and the seed fixture set for duplicate or stale uniqueness assumptions, then make the seed upsert idempotent against the current database contract.
- Verification idea:
  - Run `npm run test:e2e:live:puppets` and confirm the seed completes and the full actor-backed suite reaches Playwright assertions.

### WTF-BB-118 - DEX route smoke receives object-shaped array fixtures

- Category: E2E inventory / Swap DEX
- Status: Fixed
- Owner/Session: Codex full-send casino release verification
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed on `/swap` with `TypeError: r.find is not a function`.
  - The inventory harness returned one generic object for every `/api/dex/*` route, while `/api/dex/tokens`, `/api/dex/pools`, `/api/dex/counterparts/:tag`, and `/api/dex/pools/:pairId/metrics` are consumed as array contracts.
- Why it matters:
  - Inventory route smoke should validate the Swap surface against its actual API contracts. Object-shaped mocks make unrelated release verification fail and can hide real empty-state regressions behind harness drift.
- Likely correction direction:
  - Keep DEX harness fixtures endpoint-specific and aligned with `server/routes/dex.ts` response shapes before the generic fallback.
- Verification idea:
  - Run the focused Swap route smoke and then rerun the full inventory suite.
- Fix:
  - Split the DEX harness responses into endpoint-specific array fixtures and a health payload matching the live route shape.
- Local verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Swap/DEX"`

### WTF-BB-119 - Hetzner deploy checkout fails on divergent server branch

- Category: Deploy / Hetzner checkout
- Status: Verified
- Owner/Session: Codex Skywire full-send deploy
- Score: C3 + F3 + S0 + P1(4) = 10
- Evidence:
  - The Skywire `main` push reached GitHub, but Deploy to Hetzner run `26359320339` failed before build or migration.
  - The remote `/opt/platform/repos/wtf-app` checkout reported `Your branch and 'origin/main' have diverged` and `fatal: Not possible to fast-forward, aborting.` during `git merge --ff-only origin/main`.
  - An earlier Task Manager deploy run failed with the same checkout class, so this is a repeatable deploy surface issue rather than a Skywire build failure.
- Why it matters:
  - Full-send production promotion depends on the server checkout reliably matching `origin/main`. A divergent deployment mirror blocks every subsequent release before normal health gates can run.
- Likely correction direction:
  - Treat the server repo as a deployment mirror and reset the checked-out `main` branch to `origin/main` after fetch, matching the deploy extensions' recovery behavior.
- Verification idea:
  - Push the deploy workflow fix to `main`, confirm Deploy to Hetzner reaches `scripts/server-deploy.sh`, then verify public `/api/health` reports the new commit.
- Fix:
  - Updated `.github/workflows/deploy.yml` to fetch, ensure `main` exists, and `git reset --hard origin/main` before running `scripts/server-deploy.sh`.
- Production verification:
  - Deploy to Hetzner run `26359379495` reached `scripts/server-deploy.sh`, passed the deploy health check, and completed successfully.
  - Public `https://wtfgameshow.app/api/health` reported `version.commitRef` `047d267`, DB readiness `ok`, and scheduler registration including `skywire-atproto-sync`.
  - Public Skywire smoke confirmed `https://wtfgameshow.app/skywire` serves the SPA, `https://wtfgameshow.app/.well-known/oauth-client-metadata.json` returns HTTPS OAuth metadata, and `https://wtfgameshow.app/.well-known/atproto-did` returns text/plain 404 when no verified handle claim exists.

### WTF-BB-148 - TTC submit iframe blocked by production CSP frame-src

- Category: Browser security / CSP
- Status: Verified
- Owner/Session: Codex TTC calendar full-send
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - The TTC calendar UI opened `https://thetezos.com/submit-event/` inside an iframe modal, but the live WTF CSP for `/calendar` only allowed self, Beacon, and WalletConnect/Reown frame sources.
  - `curl -fsSI https://thetezos.com/submit-event/` showed TTC did not send `X-Frame-Options` or restrictive `frame-ancestors`, so the blocking policy was our own `frame-src`/`child-src`.
- Why it matters:
  - A cross-origin iframe feature can pass local UI checks while failing in production headers. Calendar submission would appear broken exactly when users tried to hand an event to TTC.
- Likely correction direction:
  - Add the TTC origin to a narrow trusted calendar frame-source list rather than loosening all frame sources.
- Verification idea:
  - Run the CSP policy test and smoke production `/calendar` headers after deploy, confirming `https://thetezos.com` is present in `frame-src`.
- Fix:
  - Added `https://thetezos.com` to `trustedCalendarFrameSources` in `server/app.ts` and updated `server/app-csp-policy.test.ts`.

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
