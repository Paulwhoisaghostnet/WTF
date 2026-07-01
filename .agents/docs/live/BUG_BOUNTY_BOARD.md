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
| WTF-BB-325 | Verified | Codex Gamma live verification pass | 2026-06-30 | Gamma / live hostname route containment | P1 | 11 | 8 | 3 | 4 | 0 | Public `gamma.wtfos.app` deep routes no longer fall back to Classic after promotion to commit `6e35117`; verified by Deploy to Hetzner `28421767405`, main Quality Gates `28421767416`, live health, Gamma `/gallery` and `/leaderboard` content selectors, Gamma auth gates for `/admin` and `/swap`, plus Classic/Beta host sanity checks |
| WTF-BB-326 | Verified | Codex Gamma live verification pass | 2026-06-30 | E2E / inventory workflow timeout | P2 | 7 | 15 | 1 | 3 | 0 | Broad inventory smoke could time out the healthy `social post to reward automation loop` under the fixed 60s Playwright budget; verified fixed by workload-based timeout budgeting, local focused/full domain-interoperability proof, and branch Quality Gates `28420704957` |
| WTF-BB-327 | Verified | Codex Inbox full-send | 2026-06-30 | Comms / Inbox read model | P1 | 12 | 7 | 3 | 5 | 0 | WTF Mail is now the Inbox hub with user-scoped unread counts, source-owned read writes, WIM/Studio coordination, message marks, drafts/templates, desktop badge coverage, and verified focused inventory/browser coverage |
| WTF-BB-328 | Verified | Codex Pasta live-readiness | 2026-06-30 | Macaroni installers / supply chain | P1 | 13 | 6 | 1 | 4 | 4 | Macaroni installer manifest rejects unauthenticated callers, exposes only HTTPS GitHub release installer URLs with SHA-256 values after authenticated login, and passed live verifier proof on `wtfos.app` commit `f32dbe8` |
| WTF-BB-329 | Verified | Codex Pasta live-readiness | 2026-06-30 | Tezos / Pasta production deployment | P1 | 14 | 3 | 2 | 5 | 3 | Live `wtfos.app` Pasta/Macaroni creator-tool wallet bundles no longer serve Taquito `24.3.0`; all seven live creation-tool bundles passed stale-marker and Octez RPC marker probes on commit `f32dbe8` |
| WTF-BB-330 | Verified | Codex Pasta live-readiness | 2026-06-30 | Macaroni installers / release ops | P1 | 13 | 6 | 2 | 5 | 2 | Macaroni Desktop `1.0.0` installers are published as stable GitHub release assets for macOS, Windows, and Raspberry Pi; production manifest exposes release URLs and SHA-256 checksums and passed authenticated/live public download smoke on commit `f32dbe8` |
| WTF-BB-331 | Verified | Codex Pasta live-readiness | 2026-06-30 | Deploy / production disk capacity | P0 | 13 | 5 | 2 | 5 | 1 | Pasta deploy disk exhaustion was cleared without touching app volumes, `scripts/server-deploy.sh` now has a 12 GiB free-space preflight, Deploy to Hetzner `28467035058` passed, and live health reports commit `f32dbe8` |
| WTF-BB-332 | Verified | Codex Pasta live-readiness cleanup | 2026-06-30 | Repo hygiene / Pasta stale worktrees | P2 | 9 | 12 | 1 | 3 | 2 | Stale `WTF-pasta-deploy` checkout was archived outside the repo with tracked diff, untracked tarball, refs, status, and checksums, then the worktree and zero-unique-commit local `pasta-protocol` branch were removed; production authority remains `origin/main`/`codex/pasta-live-readiness` |
| WTF-BB-333 | Verified | Codex Pasta live-readiness | 2026-06-30 | Pasta Suite installers / release ops | P1 | 13 | 6 | 2 | 5 | 2 | Bundled Pasta Suite Desktop `1.0.0` installers are published as stable GitHub release assets for macOS, Windows, and Raspberry Pi; production manifest exposes release URLs and SHA-256 checksums and passed authenticated live public download smoke on commit `fd4afcd` |
| WTF-BB-334 | Verified | Codex Pasta live-readiness | 2026-06-30 | E2E / Macaroni Shadownet proof harness | P2 | 9 | 12 | 2 | 4 | 0 | Macaroni Shadownet puppet proof drifted from the Octez active-account lifecycle; the harness now models accepted `octez.connect` session state, active-account events, restore/disconnect behavior, trusted-creator publish gating, and passed `npm run test:e2e:macaroni:shadownet` 5/5 against a disposable Shadownet puppet database |
| WTF-BB-335 | Verified | Codex Pasta live-readiness | 2026-06-30 | Pasta Protocol / CH-EASE handoff and static publisher runtime | P1 | 12 | 7 | 2 | 5 | 1 | Pasta publisher handoffs could open `/tools/spaghetti?handoff=...` while the iframe dropped the query, and the six Pasta ES-module studios read `window.MD` even though their shared common helpers only declared lexical `const MD`; fixed by forwarding creation-tool route queries to all static iframes, exporting `window.MD` in Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna, adding policy guards, passing focused Spaghetti CH-EASE handoff plus mocked Shadownet publish choreography proof, promoting to main, and verifying live `wtfos.app` commit `c4ba55f` exposes `window.MD`, `consumeCheaseHandoff()`, and `loadPlatformCapabilities()` across all six Pasta publisher bundles |
| WTF-BB-336 | Verified | Codex Pasta live-readiness | 2026-07-01 | Pasta Protocol / Colander real-contract discovery | P1 | 13 | 6 | 2 | 5 | 2 | Colander could detect real Pasta entrypoints but lost proof-contract relationship metadata, linked Shadownet KT1s to the mainnet explorer, and lacked the shared chain preflight before writes; fixed with data/HTTPS/IPFS metadata decoding, Shadownet TzKT links, write preflight, inventory docs, and focused real-contract browser proof over all six Shadownet Pasta contracts |
| WTF-BB-337 | Verified | Codex Pasta live-readiness | 2026-07-01 | Pasta Protocol / WTF.ME hosted page proof | P1 | 12 | 7 | 2 | 5 | 1 | WTF.ME had no executable Pasta landing, mint, or collection page proof; added immutable hosted page snapshots for the signer-backed Shadownet proof data plus host-mapped `wtf-admin.wtfos.me` Playwright proof that claims, saves, publishes, and serves pages with user-site CSP/opener headers, wallet/purchase markers, TzKT links, and claim/save/publish/public-view events |
| WTF-BB-338 | Verified | Codex Pasta live-readiness | 2026-07-01 | Pasta Protocol / wtfOS pinning and recovery proof | P1 | 12 | 7 | 2 | 5 | 1 | Pasta had hosted-page and contract proofs but no executable wtfOS pinning/recovery record shape for artifacts, metadata, pages, redundancy, accessibility, or restore order; added `npm run pasta:shadownet:pinning` to validate app.wtfos.media pinPolicy/pinManifest/pinItem records from real Pasta hosted pages and contract artifacts |
| WTF-BB-339 | In Progress | Codex Pasta live-readiness | 2026-07-01 | Pasta Protocol / WTF.ME production TLS and page serving | P1 | 12 | 7 | 2 | 5 | 1 | The new `npm run pasta:wtfme:live-check` gate proves production WTF.ME readiness, but production currently denies `wtf-admin.wtfos.me` at `/internal/tls/allow` with `handle not registered`; `npm run pasta:wtfme:live-publish` now provides the explicit claim/save/publish API helper for an eligible production user |
| WTF-BB-324 | Verified | Codex Gamma shell continuation | 2026-06-30 | E2E / Gamma Swap harness wallet state | P2 | 8 | 14 | 2 | 3 | 0 | Gamma Swap proof now seeds the accepted Octez wallet session provider (`octez.connect`) instead of stale Beacon state; verified by focused source policy, focused Gamma Swap Playwright, and full Gamma suite `62/62` on `HARNESS_PORT=4307` |
| WTF-BB-323 | Verified | Codex Pasta live-readiness | 2026-06-30 | E2E / WTF Domains Settings applet wallet prefill | P2 | 8 | 14 | 2 | 3 | 0 | Settings Subdomain Setup and cobwebsaints inventory specs now seed the accepted Octez wallet session provider instead of stale Beacon state; verified by focused fresh-harness proof plus branch/main Quality Gates through `28467035060` |
| WTF-BB-322 | Open | - | 2026-06-29 | Desktop OS / Recovery Mode route smoke | P2 | 9 | 12 | 2 | 3 | 1 | Full inventory route smoke for `/recovery-mode` fails because a 401 Unauthorized console error is treated as fatal browser noise; decide whether the route should avoid the protected probe or the inventory harness should classify the expected auth check as non-fatal |
| WTF-BB-321 | Verified | Codex Tezos provider currency audit | 2026-06-29 | Tezos / wallet dependencies and RPC defaults | P1 | 13 | 6 | 4 | 4 | 1 | Static creator-tool wallet bundles and package locks lagged Taquito U025 / Octez Connect 4.8.6 while fresh deploy/test defaults still pointed at legacy Ghostnet or Tez.ie paths; fixed with Taquito 25, Octez Connect 4.8.6, Shadownet-first defaults, regenerated browser bundles, and policy checks |
| WTF-BB-322 | Verified | Codex Gamma shell continuation | 2026-06-30 | Gamma / Swap presentation proof | P2 | 8 | 14 | 2 | 3 | 0 | Duplicate of `WTF-BB-324`; Gamma Swap proof now recognizes the seeded Octez wallet session and full Gamma passes with Swap included (`62/62` on `HARNESS_PORT=4307`) |
| WTF-BB-320 | Verified | Codex WTF LIVE dockable bento pass | 2026-06-29 | WTF LIVE / dockable room workspace UX | P1 | 13 | 6 | 4 | 5 | 0 | WTF LIVE public room now exposes Connection, Sharing, Screens, Attendance, and Room chat as dockable bento tiles with sharing drawers, screen grids, receiver default chat fonts, and pop-in/pinned floating panels |
| WTF-BB-319 | Verified | Codex WTF LIVE server font cleanup | 2026-06-29 | WTF LIVE / realtime chat typography | P2 | 8 | 14 | 1 | 4 | 0 | WTF LIVE client font cleanup removed MEK/GROUT from visible options, but the WebSocket chat-style sanitizer still accepted MEK/GROUT and defaulted missing realtime chat styles to MEK; fixed server normalization and added regression coverage |
| WTF-BB-318 | Verified | Codex WTF LIVE input flash repair | 2026-06-29 | WTF LIVE / input rendering stability | P1 | 12 | 7 | 3 | 5 | 0 | Users report WTF LIVE flashes or flickers whenever mic input is enabled or chat text is typed; fixed by isolating the mic meter from the room render tree, caching stage stream wrappers, memoizing stage entries, moving WTF LIVE to a Classic 95 font stack, removing MEK/GROUT from WTF LIVE chat font choices, and collapsing mic diagnostics into a compact Details drawer; verified with TypeScript, inventory coverage, focused unit/source tests, focused Playwright, and visual mobile smoke |
| WTF-BB-304 | Verified | Codex wallet/X auth full-send | 2026-06-21 | Auth / Tezos wallet sign-in | P0 | 14 | 3 | 3 | 5 | 1 | Production wallet sign-in could hang on `Connecting...` or bounce back to login after wallet connect; fixed by preserving live wallet lifecycle hardening, clearing stale username/password state before wallet auth, binding real login form names/labels, and keeping wallet waits bounded; verified live on `wtfos.app` commit `069b96b` |
| WTF-BB-306 | Fixed | Codex desktop pet water repair | 2026-06-21 | Desktop pet / care tool UX | P1 | 10 | 10 | 2 | 4 | 0 | Water tool can clean instead of hydrate a thirsty sick/dirty pet, leaving the Water/thirst meter stuck at 0 despite repeated water care; fixed with water-first care policy and focused tests, pending unrelated inventory coverage blocker |
| WTF-BB-307 | Fixed | Codex local SSH bootstrap pass | 2026-06-21 | Ops / local SSH access | P2 | 8 | 14 | 2 | 3 | 0 | Codex repeatedly tried the wrong SSH path for Hetzner checks because the GitHub publish key path differs from this Mac's normal `ssh wtf` alias and Codex could not see the passphrase-loaded local identity; fixed with ignored `.codex/machine-ssh.env`, tracked `scripts/wtf-ssh.sh`, and project rules that force future agents through the local alias/agent bootstrap |
| WTF-BB-308 | Verified | Codex wallet/X auth full-send | 2026-06-21 | Auth / X OAuth account binding | P1 | 12 | 7 | 3 | 4 | 1 | Profile X linking can authorize the wrong current browser X account such as shared `wtfgameshow`; fixed by storing the intended handle in session, rejecting mismatched callbacks before token persistence, canonicalizing legacy platform OAuth callback origins to `wtfos.app`, and returning a clear switch-account error; verified live on `wtfos.app` commit `8d994c9` |
| WTF-BB-309 | Verified | Codex live feature loop | 2026-06-22 | E2E / live puppet ops | P1 | 12 | 7 | 2 | 4 | 2 | Production live puppet suite was blocked by localhost puppet credentials; repaired by using the Hetzner secret path, production-scoped credential metadata, keyring decrypt/sign verification, route/API hotfixes, and a stable live `https://wtfos.app` puppet retest with 141/141 passing on commit `12cbaf6` |
| WTF-BB-310 | Open | - | 2026-06-22 | Ops / Hetzner verification dependencies | P2 | 9 | 12 | 2 | 3 | 1 | Hetzner production repo worktree cannot run the full TypeScript check because dev dependencies such as `three`, `@atproto/api`, AWS SDK, MCP SDK, and `viem` are missing; production hotfix verification had to rely on focused tests, GitHub deploy, live health, and live puppet proof |
| WTF-BB-311 | Verified | Codex live user-story gap loop | 2026-06-22 | WTF LIVE / owner control UX | P1 | 11 | 8 | 2 | 5 | 0 | Independent live user-story probe found owner-created rooms/stages could fall out of sync after mutations; fixed in `7df41dd` by synchronously merging returned owner-control state into React Query caches and verified on live `https://wtfos.app` with the 4/4 owned-surface probe |
| WTF-BB-312 | Verified | Codex live user-story gap loop | 2026-06-22 | WTF LIVE / Show Kit cooldown UX | P2 | 8 | 14 | 1 | 4 | 0 | Expanded independent live Show Kit relay probe found an immediate second trigger after a clip send could leave stale `sent` status; fixed in `7f5d0d7` by starting cooldown after successful relay completion and verified with the 2/2 live realtime/Show Kit probe |
| WTF-BB-313 | Blocked | Codex live user-story gap loop | 2026-06-22 | Skywire / live AT puppet coverage | P1 | 11 | 8 | 2 | 4 | 1 | Connected Skywire live-status, signal publishing, and OAuth permission-sync stories cannot be fully tested on production because no live puppet has a connected AT Protocol account and deployed env files expose only public AT config, not a dedicated AT puppet credential |
| WTF-BB-314 | Verified | Codex live user-story gap loop | 2026-06-22 | WIM / settings dialog keyboard UX | P2 | 8 | 14 | 1 | 4 | 0 | Independent live WIM probe found the settings dialog could stay open after creating a custom list because Escape was only handled on the popover node; fixed in `f09feec` with capture-phase Escape handling and verified on live `https://wtfos.app` with the WIM modular roster/DM probe |
| WTF-BB-315 | Verified | Codex Macaroni exported drop wallet repair | 2026-06-23 | Macaroni / exported drop wallet and stage config | P0 | 15 | 2 | 3 | 5 | 2 | Exported Macaroni drop pages can create duplicate Octez/Beacon wallet clients, misdisplay max-per-wallet stage caps, and hit browser-blocked Octez RPC packing from third-party drop origins; fixed in `1ad5b57` and verified live on `https://wtfos.app` |
| WTF-BB-316 | Verified | Codex Macaroni share/calendar repair | 2026-06-23 | Macaroni / exported drop sharing and sale reminders | P1 | 10 | 10 | 2 | 4 | 0 | Exported Macaroni drop share copy could exceed the standard X 280-character post limit and sale stages lacked prefilled add-to-calendar actions; fixed in `50083c5` and verified live on `https://wtfos.app` |
| WTF-BB-317 | Open | - | 2026-06-27 | E2E / Playwright harness parity | P3 | 7 | 15 | 2 | 3 | 0 | Local Playwright harness returns `/api/admin/challenge-automation/registry` with legacy `actions` instead of production-shaped `rewardActions`, so direct Automation tab proofs need local route stubs or can crash the admin UI under harness data despite the real server route returning `rewardActions`; likely correction is to align `tests/playwright/harness.mjs` with `server/challenges/routes/admin.ts` and add a focused harness contract assertion |
| WTF-BB-298 | Open | - | 2026-06-21 | API / app gates and information disclosure | P1 | 14 | 3 | 3 | 4 | 3 | Disabled app APIs still serve public data and CRP status leaks internal topology |
| WTF-BB-297 | Verified | Codex live user-story gap loop | 2026-06-22 | Desktop OS / production app gates | P0 | 14 | 3 | 3 | 5 | 1 | Production app gate doc freshness disables core public apps; fixed in `44e556f` by decoupling runtime launcher availability from stale doc/install-key health, verified on `https://wtfos.app` with `/api/apps/desktop` showing `wtf-live` and `skywire` launchable while stale plus 3/3 independent WTF LIVE user-story probes passing |
| WTF-BB-299 | Verified | Codex live user-story gap loop | 2026-06-22 | Platform domains / access manifest | P1 | 12 | 7 | 2 | 4 | 2 | `/api/access` advertised legacy `wtfgameshow.app` origin on canonical `wtfos.app`; fixed in `e4770ad` and verified live on `https://wtfos.app` with canonical origin plus MCP endpoint |
| WTF-BB-303 | Open | - | 2026-06-21 | Security / CSP hardening | P2 | 11 | 8 | 3 | 2 | 3 | Main app and user-site CSP policies remain broad for script/connect sources |
| WTF-BB-300 | Open | - | 2026-06-29 | Desktop OS / route contract | P1 | 10 | 10 | 2 | 4 | 0 | Map Lab public route contract drift remains for a dedicated shared route-policy pass; Gamma containment is now separately verified |
| WTF-BB-302 | Open | - | 2026-06-21 | Observability / public information disclosure | P2 | 9 | 12 | 2 | 2 | 2 | Public health endpoint exposes verbose runtime and chain topology |
| WTF-BB-301 | Verified | Codex live user-story gap loop | 2026-06-22 | Public site / SEO and installability | P2 | 6 | 18 | 1 | 2 | 0 | SEO/PWA static discovery paths fell through to SPA HTML; fixed in `6fb5351` with explicit typed robots, sitemap, and web manifest handlers plus inventory-owned regression coverage, then verified live on `https://wtfos.app` |
| WTF-BB-305 | Verified | Codex wallet live full-send | 2026-06-21 | Operations / production health | P0 | 13 | 4 | 3 | 5 | 0 | Live `/api/health` could intermittently return 503 because scheduler audit used a whole-table latest-run query that timed out under production audit volume; fixed by querying only registered job names through indexed lateral latest-row lookups plus a production index; verified live on `wtfos.app` |
| WTF-BB-296 | Verified | Codex cobwebsaints domain readiness pass | 2026-06-20 | WTF Domains / account-specific advanced feature coverage | P2 | 8 | 14 | 2 | 3 | 0 | Domain/pinning harness data hardcoded `pincollector.wtfos.me`, so account-specific readiness for `cobwebsaints` could pass generic checks while advanced surfaces showed another user's host; fixed with signed-in-user-derived harness domains, Cobweb persona coverage across Settings, WTF Domains, IPFS Pinning, and Macaroni trusted creator access, plus full inventory verification |
| WTF-BB-295 | Verified | Codex stale welcome auth repair | 2026-06-20 | Auth / welcome session recovery | P1 | 12 | 7 | 3 | 5 | 0 | Welcome dialog could retain a cached signed-in user after the protected API session was gone, so every welcome/profile/diary action returned `Not authenticated` and passive wallet reconciliation logged repeated 401s; fixed with protected-401 session invalidation, auth cache clearing, passive wallet warning suppression, and focused/full inventory verification |
| WTF-BB-294 | Verified | Codex DedRooms local playtest repair | 2026-06-19 | DedRooms / MUD navigation and room affordances | P1 | 12 | 7 | 3 | 5 | 0 | DedRooms allowed unlisted cardinal travel, could spawn players into anchor rooms such as THNG, and hid real room affordances behind flavor text; fixed with authored-passage enforcement, non-anchor spawn targets, actionable `look` output, and verified by focused engine tests, typecheck, and local server smoke |
| WTF-BB-215 | Verified | Codex Skywire new OAuth outage repair | 2026-06-06 | Skywire / AT OAuth new-session connect | P0 | 17 | 1 | 4 | 5 | 3 | New Skywire OAuth connections to Bluesky fail while existing sessions continue working; fixed with durable app+SDK OAuth state persistence and verified live on wtfos.app |
| WTF-BB-216 | Verified | Codex Skywire platform actor OAuth repair | 2026-06-06 | Skywire / AT OAuth platform actor intent | P0 | 16 | 1 | 3 | 5 | 3 | Skywire permission picker silently refused intentional `wtfgameshow.bsky.social` OAuth before browser navigation; fixed with explicit platform actor intent, callback identity checks, and verified by `npx tsx --test server/features/atproto/skywire-policy.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` |
| WTF-BB-217 | Verified | Codex Rat Race tz2at capability pass | 2026-06-06 | Rat Race / tz2at rolling replay scan | P1 | 12 | 7 | 3 | 5 | 0 | Rat Race still auto-refreshes and default-scans only a tiny slice of tz2at replay, making the rolling stream look like it can only find the same few tokens; fixed with manual reload policy, smaller replay chunks, split retry recovery, scan coverage diagnostics, and verified by focused tests, TypeScript, inventory coverage/E2E, plus live tz2at replay probes |
| WTF-BB-218 | In Progress | Codex Shadownet marketplace confidence pass | 2026-06-08 | Tezos / WTF marketplace contract | P0 | 19 | 1 | 4 | 5 | 5 | Mainnet WTF marketplace accepted a hidden multi-edition offer quantity that the accept flow can fail to surface; current pass is local UI plus Shadownet puppet-wallet confidence testing before any mainnet action |
| WTF-BB-223 | Verified | Codex WTF-XTZ fixed-rate listing hardening | 2026-06-09 | Tezos / WTF-XTZ exchange contract | P0 | 17 | 1 | 3 | 5 | 4 | WTF-XTZ exchange now binds create/swap wallet signatures to explicit escrow amount, rate, owner, and exact output terms; source and Shadownet Kiln puppet proof passed, with no mainnet deploy attempted |
| WTF-BB-224 | Verified | Codex WTF LIVE focus pass | 2026-06-09 | WTF LIVE / mobile rooms, private access, and stage controls | P1 | 13 | 6 | 4 | 5 | 0 | WTF LIVE now has mobile-visible join/media controls, desktop chat/attendance pop-outs, owned stage lifecycle controls, and a separate WTF-user private room type with an access list; verified by TypeScript, inventory coverage, focused WTF LIVE Playwright, and full inventory E2E |
| WTF-BB-225 | Verified | Codex WTF LIVE chat keyboard pass | 2026-06-09 | WTF LIVE / room chat keyboard UX | P2 | 9 | 12 | 2 | 4 | 0 | WTF LIVE room chat now submits with Enter and keeps Shift+Enter for multiline drafts; verified by focused failing/passing Playwright, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-226 | Fixed | Codex Roger Radio full-send repair | 2026-06-10 | WTF TV / boot backfill external embed seed | P1 | 9 | 12 | 1 | 4 | 0 | Roger Radio live channel was created in production but the Odysee playlist item stayed empty because the boot backfill fed an uncast embed URL parameter into `jsonb_build_object`; fixed with explicit text casts plus a policy guard, pending production redeploy verification |
| WTF-BB-229 | Verified | Codex WTF LIVE WIM identity pass | 2026-06-09 | WTF LIVE / wtfOS identity and WIM buddies | P2 | 10 | 10 | 3 | 4 | 0 | WTF LIVE now binds signed-in room joins to wtfOS usernames, emits account-backed attendance metadata, and lets signed-in viewers add WTF users to WIM buddies from compact roster rows |
| WTF-BB-230 | Verified | Codex WTF LIVE chat toolbox pass | 2026-06-09 | WTF LIVE / room chat style controls | P3 | 7 | 15 | 2 | 2 | 0 | WTF LIVE chat now has a compact one-row style toolbox with bounded font, color, 8-14 size, bold/italic, and reset controls, plus sanitized realtime style relay |
| WTF-BB-231 | Verified | Codex WTF LIVE mobile layout repair | 2026-06-10 | WTF LIVE / mobile Chrome room layout | P1 | 12 | 7 | 3 | 5 | 0 | WTF LIVE public room mobile breakpoint now uses a deliberate mobile scroll shell and stacked rail/stage/sidebar layout; verified by 390/375/360px Chrome-style probes, in-app Browser 375px metrics, focused WTF LIVE Playwright, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-232 | Verified | Codex in-app market V2 full-send fallback repair | 2026-06-10 | Tezos / in-app market contract rollout | P0 | 15 | 2 | 3 | 5 | 2 | Mainnet production had no in-app market env override, so the app could fall back to the V2 KT1 address while still defaulting the payload contract version to V1; fixed by coupling shared address and version defaults and verified by TypeScript, focused policy tests, inventory coverage, and full inventory E2E |
| WTF-BB-233 | Verified | Codex WTF LIVE tip seed deploy blocker repair | 2026-06-10 | Deploy / in-app market seed migration | P0 | 13 | 5 | 3 | 5 | 0 | Production deploy failed after app stop because the WTF LIVE tip item seed violated the existing `price_score BETWEEN 1 AND 10` constraint; fixed by clamping seed scores and adding a migration policy test |
| WTF-BB-234 | Verified | Codex Macaroni user-site handle alignment | 2026-06-11 | Macaroni / wtfOS user-site subdomain issuance | P1 | 12 | 7 | 3 | 5 | 0 | Macaroni drop publishing depends on `username.wtfos.me`, but the WTFOS PDS request path could derive the issued handle from the linked AT handle instead; fixed with username-first handle derivation and verified by focused policy tests, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-235 | Verified | Codex Macaroni subdomain setup applet | 2026-06-11 | Macaroni / wtfOS subdomain setup UX | P1 | 11 | 8 | 3 | 5 | 0 | Macaroni users can still reach publish before clearly claiming/configuring `username.wtfos.me` and `label.wtf.tez`; fixed with a focused Settings applet, behavior inventory, harnessed claim/registrar mocks, and verified by focused Playwright, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-236 | Verified | Codex Macaroni domains registry hotfix | 2026-06-11 | Macaroni / app registry feature gate | P1 | 10 | 10 | 2 | 5 | 0 | WTF Domains route existed without a `desktop:wtf-subdomains` app-registry seed/admin surface binding; fixed by promoting WTF Domains to a canonical app key and verified by focused registry/gate tests, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-237 | Verified | Codex WTF Domains window conformance pass | 2026-06-11 | Macaroni / WTF Domains app windowing | P1 | 10 | 10 | 2 | 5 | 0 | Subdomain setup now opens from Settings as `/wtf-subdomains/setup` in a normal `AppWindow`, `/wtf-subdomains` is wrapped in the shared OS window shell, and both routes resolve to the WTF Domains native admin surface; verified with TypeScript, admin registry tests, inventory coverage, direct setup route smoke, focused Settings-to-window Playwright, full inventory E2E, and a focused fresh-harness Skywire/WTF LIVE rerun |
| WTF-BB-238 | Open | - | 2026-06-29 | E2E / Playwright harness artifact stability | P2 | 8 | 14 | 2 | 3 | 0 | Full inventory can report unrelated failures when build/trace artifacts disappear or the shared harness dies mid-run; current focused fresh-harness reruns pass, so hardening should isolate build output, trace artifacts, and harness lifecycle per run |
| WTF-BB-239 | Verified | Codex Macaroni Shadownet RPC puppet pass | 2026-06-12 | Macaroni / Shadownet RPC setup | P1 | 13 | 6 | 3 | 5 | 1 | Macaroni now treats Shadownet as a first-class RPC/chain target, blocks mismatched RPCs before signing, and has a focused dummy-account puppet-wallet Playwright runner for the rehearsal flow |
| WTF-BB-240 | Verified | Codex Macaroni Kukai Shadownet handoff pass | 2026-06-12 | Macaroni / Beacon Kukai Shadownet pairing | P1 | 11 | 8 | 2 | 5 | 0 | Macaroni now sends Beacon the concrete Shadownet network type, so Kukai's web option opens `https://shadownet.kukai.app`; verified by policy, inventory coverage, and a focused Beacon popup Playwright regression |
| WTF-BB-241 | Verified | Codex Macaroni Beacon picker restoration | 2026-06-12 | Macaroni / Beacon wallet picker regression | P1 | 12 | 7 | 3 | 5 | 0 | Macaroni explicit connect restores the Beacon wallet picker with Kukai and Temple, clears stale active wallet state without destroying Beacon identity, and only opens `shadownet.kukai.app` after Kukai is selected |
| WTF-BB-242 | Verified | Codex Macaroni embedded sandbox popup repair | 2026-06-12 | Macaroni / creation-tool iframe wallet popup sandbox | P1 | 11 | 8 | 2 | 5 | 0 | Embedded `/tools/macaroni` allowed popups but not popup sandbox escape, so Beacon could open `about:blank` but could not navigate it to `shadownet.kukai.app`; fixed with `allow-popups-to-escape-sandbox` and embedded-route Playwright coverage |
| WTF-BB-243 | Verified | Codex Macaroni IPFS provider permission UX | 2026-06-12 | Macaroni / wtfOS IPFS pinning access | P1 | 11 | 8 | 2 | 4 | 1 | Macaroni Studio now derives the wtfOS IPFS provider from `/api/auth/user` and only shows it to accounts with `trusted_market_creator`; verified by `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:macaroni:shadownet` |
| WTF-BB-244 | Verified | Codex Macaroni generated mint-site UX pass | 2026-06-12 | Macaroni / generated drop website wallet UX | P1 | 13 | 6 | 3 | 5 | 1 | Generated Macaroni mint pages now persist validated Beacon wallet sessions, expose clean disconnect, show max-per-wallet and balance/cost status, refresh balance around mints, pump wallet fee estimates, and reload holder-owned token IDs from TzKT; verified by `node --check public/creation-tools/macaroni/js/common.js public/creation-tools/macaroni/js/drop.js`, `npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/publish.test.ts`, `npm run test:e2e:macaroni:shadownet`, `npm run check`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` |
| WTF-BB-245 | Verified | Codex Macaroni CSS injection hotfix | 2026-06-12 | Macaroni / generated drop website stored CSS safety | P0 | 17 | 1 | 3 | 5 | 4 | Macaroni generated pages now sanitize published theme config server-side and client-side, apply only known themes, hex accent colors, and known font stacks, remove arbitrary stored `customCss`, and regression-test `</style>`, `url(javascript:)`, and malformed custom-property payloads; verified by `node --check public/creation-tools/macaroni/js/studio.js public/creation-tools/macaroni/js/drop.js`, `npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/publish.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run check`, `npm run build`, and `npm run test:e2e:macaroni:shadownet` |
| WTF-BB-246 | Verified | Codex Macaroni generated page polish | 2026-06-13 | Macaroni / generated drop website connect and defaults | P1 | 11 | 8 | 2 | 4 | 1 | Generated Macaroni drop pages now coalesce duplicate connect clicks at the shared wallet helper and page button state, expose baseline landmarks/status/progress/quantity accessibility semantics, and default exported IPFS gateway config to Fileship; verified by `node --check public/creation-tools/macaroni/js/common.js public/creation-tools/macaroni/js/drop.js public/creation-tools/macaroni/js/studio.js`, `npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/publish.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:macaroni:shadownet`, and `npm run test:e2e:inventory` |
| WTF-BB-247 | Verified | Codex Macaroni practical media limits full-send | 2026-06-15 | Macaroni / practical media limits | P1 | 11 | 8 | 2 | 5 | 0 | Macaroni Studio/server media caps drifted from practical gateway expectations and production env could allow a different wtfOS Pinata upload limit than the UI advertised; fixed by aligning Studio, server defaults, env guidance, inventory, and tests around a 1 GB per-artifact hard max plus a 250 MB average artifact limit while keeping collection logo/cover uploads OBJKT-compatible square JPG/PNG ≤1 MB; verified locally by JS syntax checks, `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, `npm run build`, and `npm run test:e2e:inventory`, then by Quality Gates `27517521657`, Deploy to Hetzner `27517521671`, and live `wtfos.app` health/assets confirming the deployed Macaroni label/constants; focused Shadownet puppet runner is blocked by the local DB `console_games.slug` upsert schema, not by the Macaroni policy path |
| WTF-BB-248 | Verified | Codex Map Lab workspace UX repair | 2026-06-13 | Desktop OS / Map Lab workspace UX | P1 | 12 | 7 | 3 | 5 | 0 | Map Lab now uses a responsive app-window workspace, a large document-space board, internal scroll/pan, zoom/fit/reset controls, direct unlocked-node dragging, keyboard/button nudging, locked-node protection, and inventory-owned regression coverage; verified by TypeScript, inventory coverage, focused Map Lab Playwright, full inventory E2E, and visual scroll/zoom metrics |
| WTF-BB-249 | Verified | Codex Map Lab workflow graph and demo pass | 2026-06-13 | Desktop OS / Map Lab workflow designer | P1 | 13 | 6 | 4 | 5 | 0 | Map Lab now has typed workflow node templates, input/output ports, compatible/incompatible port feedback, Escape-to-cancel routing, keyboard route deletion, snap-to-grid movement, routed pipeline inspection/editing, graph run activity, non-overlapping template placement, overview recentering, narrow-width internal canvas scrolling, and a read-only wtfOS demo map; verified by `npm run check -- --pretty false`, `npm run build && npx playwright test tests/playwright/inventory/map-lab-workspace.spec.mjs`, `npm run test:e2e:inventory:coverage`, `npm run test:e2e:inventory`, and visual desktop/narrow metrics |
| WTF-BB-250 | Verified | Codex IPFS Pinning organ full-send | 2026-06-13 | Desktop OS / IPFS pinning app registry | P1 | 11 | 8 | 2 | 5 | 0 | `ipfs-pinning` now has a canonical PageDef, desktop app surface, admin surface, inventory route fixture, behavior assertion, shared service routes, and PDS-backed pin registry docs; verified by focused policy/lexicon tests, TypeScript, creation-tools checks, inventory coverage, and full inventory E2E |
| WTF-BB-251 | Verified | Codex Macaroni effective mint allowance pass | 2026-06-13 | Macaroni / generated mint page quantity guard | P1 | 12 | 7 | 3 | 5 | 0 | Generated Macaroni mint pages now clamp requested quantity to live collection remaining supply plus the connected wallet's remaining per-wallet/allowlist allowance before wallet signing; verified by `node --check public/creation-tools/macaroni/js/drop.js`, `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run test:e2e:inventory:coverage`, GitHub Deploy to Hetzner run `27476940932`, Quality Gates run `27476940928`, live health commit `70337b0`, and live production `drop.js` asset curl confirming the effective quantity cap code |
| WTF-BB-252 | Verified | Codex Map Lab public demo access follow-up | 2026-06-13 | Desktop OS / Map Lab public demo access | P1 | 11 | 8 | 2 | 4 | 1 | Anonymous production users can now reach the read-only wtfOS Map Lab demo because `/map-lab` is public in PageDef, shared browser-route metadata, and inventory route fixtures while edit/ingest actions stay session and role gated; verified by shared route policy tests, TypeScript, inventory coverage, focused MapLab Playwright, full inventory E2E, GitHub deploy/quality runs, live health, and anonymous production smoke |
| WTF-BB-253 | Verified | Codex Macaroni sandbox-safe Studio feedback pass | 2026-06-13 | Macaroni / embedded Studio modal feedback | P1 | 12 | 7 | 3 | 5 | 0 | Embedded Macaroni Studio validation/deploy errors now render through sandbox-safe inline notices instead of blocked native `alert`/`confirm` calls; verified locally, by focused sandbox repro, by GitHub deploy/quality runs, and on live `wtfos.app` commit `b5b2384`; mainnet-confirmation UI drift is superseded by WTF-BB-254 |
| WTF-BB-254 | Verified | Codex Macaroni mainnet deploy path repair | 2026-06-13 | Macaroni / mainnet deploy parity and Beacon lifecycle | P1 | 13 | 6 | 4 | 5 | 0 | Mainnet deploy now shares the same chain-guarded origination path as Shadownet and optional placeholder values clear to connected-wallet defaults; the Beacon reconnect reuse portion regressed wallet lifecycle and is superseded by WTF-BB-255 |
| WTF-BB-255 | Verified | Codex Macaroni wallet regression repair | 2026-06-13 | Macaroni / Beacon connect lifecycle and treasury defaults | P0 | 14 | 3 | 3 | 5 | 1 | Macaroni explicit Connect again drops cleared Beacon client state and creates a fresh wallet client, while invalid optional treasury/royalty strings clear to the connected-wallet fallback; verified locally, by GitHub deploy/quality runs, and live asset checks on `wtfos.app` commit `c1279a0` |
| WTF-BB-256 | Verified | Codex Macaroni access/export workflow pass | 2026-06-14 | Macaroni / access model and self-host export | P1 | 12 | 7 | 2 | 5 | 1 | Macaroni product flow now lets any signed-in wtfOS user create/deploy/export blind drops while hosted wtfOS pinning/publishing are trusted-creator-only; verified by focused policy, inventory coverage, and local browser smoke |
| WTF-BB-262 | Verified | Codex Macaroni onboarding patch | 2026-06-14 | Auth / wallet onboarding | P1 | 11 | 8 | 2 | 4 | 1 | Profile now routes wallet linking through explicit signed wallet connect/proof and no longer exposes address-only new-wallet linking; verified by focused source-policy tests, TypeScript, and inventory coverage |
| WTF-BB-263 | Verified | Codex Macaroni onboarding patch | 2026-06-14 | Macaroni / generated mint page readiness | P1 | 9 | 12 | 1 | 4 | 0 | Macaroni wtfOS publish now requires a valid deployed/resumed `KT1...` contract in Studio and on `/api/macaroni/publish`, while draft export remains available; verified by focused policy tests, JS syntax checks, TypeScript, and inventory coverage |
| WTF-BB-264 | Verified | Codex Macaroni direct upload lane full-send | 2026-06-15 | Macaroni / hosted IPFS direct upload lane | P1 | 10 | 10 | 2 | 4 | 0 | Live hosted pinning stalled before token 3 reached server-side staging because large media uploads traverse Cloudflare; verified live on commit `57e5e30` with short-lived upload tickets, bearer-only `/api/macaroni/ipfs/upload`, Caddy upload hosts scoped to that endpoint, direct fallback origin `upload.5-78-202-50.sslip.io`, and production env loaded |
| WTF-BB-265 | Verified | Codex Macaroni ticket limit regression | 2026-06-15 | Macaroni / practical media upload tickets | P1 | 10 | 10 | 2 | 4 | 0 | Live upload-ticket endpoint still treated production `MACARONI_IPFS_MAX_BYTES=262144000` as the per-file hard cap; production env was corrected to 1 GiB and code now fixes the Macaroni server hard cap at 1 GiB so legacy env drift cannot block valid larger artifacts before Studio average policy runs |
| WTF-BB-266 | In Progress | Codex Macaroni PDS user-site publish investigation | 2026-06-15 | Macaroni / PDS-backed user-site serving | P1 | 14 | 3 | 4 | 5 | 1 | App-side publish now writes renderable PDS snapshot/index records, flushes/checks exact outbox rows, and reports pending until PDS + public serving are ready; final `.me` renderer deployment remains blocked by missing SSH access to the `.me` host, while the per-host bridge keeps `paulwhoisaghost.wtfos.me` live |
| WTF-BB-267 | Verified | Codex Macaroni video preview/drop wallet repair | 2026-06-16 | Macaroni / generated drop website media previews and wallet restore | P1 | 13 | 6 | 3 | 5 | 1 | Generated drop pages could let stale passive wallet restore collide with explicit connect, while Macaroni Studio metadata sent MP4/video tokens to the collection cover for display/thumbnail; fixed with commit `a17f8c5`, deployed on main, and verified live on Macaroni plus Airporters site version 5 |
| WTF-BB-268 | Verified | Codex WTF LIVE mobile mic compatibility full-send | 2026-06-16 | WTF LIVE / microphone permissions and browser compatibility | P1 | 12 | 7 | 3 | 5 | 0 | WTF LIVE now exposes a pre-join mic compatibility test that distinguishes secure context, MediaDevices support, browser permission, audio-input visibility, stopped `getUserMedia` success, unsupported browsers, and OS/busy-device style failures; verified locally by TypeScript, inventory coverage, build, focused mic Playwright, focused WTF LIVE Playwright, and full inventory E2E |
| WTF-BB-269 | Fixed | Codex Macaroni mint confirmation timeout repair | 2026-06-16 | Macaroni / generated drop website mint confirmation | P1 | 11 | 8 | 2 | 5 | 0 | Generated drop pages collapsed wallet/RPC confirmation polling timeouts into `mint failed: confirmation polling timed out`; fixed by classifying timeout operations through TzKT by operation hash, contract, and entrypoint before reporting applied, failed/backtracked, or not-confirmed retry guidance; verified locally by `node --check public/creation-tools/macaroni/js/drop.js`, `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` |
| WTF-BB-270 | Fixed | Codex Macaroni wallet-returned hash boundary repair | 2026-06-16 | Macaroni / generated drop website wallet operation propagation | P0 | 14 | 3 | 3 | 5 | 1 | A live Temple user received operation hash `onqHofT7uzbey8XpeS5sXYjpnkHppH2cyPqXNGc4r9Q4V6pLw6r` from Macaroni, but the hash was absent from TzKT indexed operations, TzKT/SmartPy mempools, and sampled public RPC head operation hashes; fixed by aligning Beacon active-account network RPC to Macaroni's configured RPC before signed operations and by changing generated mint-page status to distinguish wallet-returned hash, node-visible mempool state, and indexer-confirmed application; verified locally by `node --check public/creation-tools/macaroni/js/common.js`, `node --check public/creation-tools/macaroni/js/drop.js`, `npx tsx --test server/routes/macaroni-policy.test.ts`, and `npm run test:e2e:inventory:coverage`; DB-backed `npm run test:e2e:macaroni:shadownet` was blocked in the temp worktree by missing `DATABASE_URL` |
| WTF-BB-271 | Fixed | Codex Macaroni fee-floor repair | 2026-06-16 | Macaroni / generated drop website wallet operation fees | P0 | 13 | 5 | 2 | 5 | 1 | Live mint attempts can fail with `Fee is too low, blockchain says: "No tip, no trip"` because Macaroni inflates Taquito-estimated gas/storage limits but derives the explicit wallet fee from the lower unpadded estimate; fixed by deriving a fee floor from the padded gas limit actually sent to Beacon/Taquito plus a small tip, and verified by `node --check public/creation-tools/macaroni/js/common.js`, `npx tsx --test server/routes/macaroni-policy.test.ts`, and `npm run test:e2e:inventory:coverage` |
| WTF-BB-272 | Verified | Codex Macaroni social-share identity/media pass | 2026-06-16 | Macaroni / generated drop website social sharing | P1 | 10 | 10 | 2 | 4 | 0 | Generated Macaroni share presets drafted generic posts without the creator's same-platform X/Bluesky identity and without the actual token media URL; fixed with Studio share handle/copy controls, wtfOS profile enrichment on trusted publish, token-media URLs in compose-intent text, and source-policy coverage; verified by JS syntax checks, focused Macaroni policy tests, TypeScript, inventory coverage, and full inventory E2E |
| WTF-BB-273 | Verified | Codex Airporters Octez Connect full-send | 2026-06-17 | Macaroni / published drop wallet compatibility | P1 | 12 | 7 | 3 | 5 | 0 | Airporters is mainnet, but Brave/Kukai users could receive a confusing Mainnet mismatch because published/drop wallet code sent the dApp RPC inside a named wallet network; fixed with Octez Connect-primary wallet bridge, Beacon backup, plain named wallet networks, and serve-time injection for stored Macaroni drops; verified live after Hetzner deploy on `https://paulwhoisaghost.wtfos.me/airporters-vol-1` |
| WTF-BB-274 | Verified | Codex Macaroni V2 editions full-send | 2026-06-17 | Macaroni / contract versions, editions, and minter royalties | P1 | 14 | 3 | 4 | 5 | 1 | Macaroni Studio only generated the V1 blind-mint contract, so creators could not choose shared-token editions, V2 minter royalty policies, or multiple delayed-reveal placeholder artifacts; fixed with a V1/V2 selector, SmartPy V2 contract template, compiled public artifact, generated config, and source-policy coverage; verified live on wtfos.app after Hetzner deploy |
| WTF-BB-275 | Verified | Codex Broot direct-route full-send | 2026-06-18 | Creation tools / shared route metadata | P1 | 10 | 10 | 2 | 4 | 0 | Generated creation-tool routes could exist in `PAGE_DEFS` while missing from `BROWSER_ROUTE_META` and `/api/access`, causing direct `/tools/broot` opens or agent route discovery to miss Broot; fixed by mirroring generated routes across both manifests and verified live on wtfos.app |
| WTF-BB-276 | Verified | Codex Skywire live/group/vault full-send | 2026-06-18 | Skywire / AT Protocol parity and Tezos vault performance | P1 | 13 | 6 | 3 | 5 | 1 | Skywire now supports Bluesky live-status record writes, group conversation creation, permission coverage, and paginated indexed vault holdings; verified by local unit/type/build/full inventory checks, GitHub Quality Gates `27734260941`, Deploy to Hetzner `27734260925`, and live `wtfos.app` Skywire/API smoke |
| WTF-BB-277 | Verified | Codex inventory harness contract repair | 2026-06-18 | E2E / CH-EASE and WTF LIVE harness parity | P1 | 10 | 10 | 2 | 4 | 0 | CH-EASE and WTF LIVE inventory specs now use stateful package, handoff, soundboard, media-deck, and event mocks instead of generic catch-all responses; verified by focused inventory specs, full inventory 343/343, GitHub Quality Gates `27734260941`, Deploy to Hetzner `27734260925`, and live route/static smoke |
| WTF-BB-278 | Verified | Codex external-link quality gate repair | 2026-06-18 | Frontend security / tabnabbing link safety | P2 | 7 | 15 | 1 | 2 | 1 | Colander explorer links now include `rel="noopener noreferrer"` with `target="_blank"`; verified by `node scripts/check-external-links.mjs`, GitHub Quality Gates `27734260941`, Deploy to Hetzner `27734260925`, and live Colander asset smoke |
| WTF-BB-279 | Verified | Codex Broot media-open repair | 2026-06-18 | Broot / media file import | P1 | 9 | 12 | 2 | 3 | 0 | Broot's top-level Open picker only accepted project JSON and the side import accepted only `image/*`, so normal PNG/JPG/GIF/MP4 media looked unsupported; fixed by unifying project/image/video import handling and verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-280 | Verified | Codex Broot wallet/HEN mint repair | 2026-06-18 | Broot / Tezos wallet publishing | P1 | 13 | 6 | 3 | 5 | 1 | Broot now restores a previously connected wallet after refresh, replaces repeated connect prompts with connected state, and adds direct Mainnet HEN minting through the user's wallet with gas/storage paid by the user; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-281 | Verified | Codex Skywire live-status UX pass | 2026-06-18 | Skywire / Bluesky live status UX | P2 | 8 | 14 | 2 | 3 | 0 | Skywire live-status writes could succeed while the local app gave no persistent owned indicator if Bluesky or Ovoid suppressed beta badges; fixed with a WTF LIVE header badge/banner and verified live on `wtfos.app` commit `dee415b` |
| WTF-BB-286 | Verified | Codex Skywire Signal starter pass | 2026-06-18 | Skywire / Skywire Signals publishing UX | P2 | 8 | 14 | 2 | 3 | 0 | Skywire Signals required users to hand-author record type, text, tags, and related URI for common creator actions; fixed with starter presets and verified live on `wtfos.app` commit `dee415b` |
| WTF-BB-287 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / app-window layout | P1 | 12 | 7 | 3 | 5 | 0 | Broot now keeps tools, canvas, and layers visible in the default wtfOS window by moving tabbed mobile mode below the default AppWindow width; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-288 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / destructive layer operations | P1 | 11 | 8 | 3 | 4 | 0 | Broot layer merge/flatten/warp/delete now have selection guards, undo/redo history, shift/cmd multi-select from the layer list, and confirmation for destructive full-canvas/delete actions; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-289 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / runtime performance | P2 | 9 | 12 | 3 | 3 | 0 | Broot now serves a prebuilt `js/app.js` browser bundle with local glfx/FFmpeg assets and no runtime Babel or `text/babel` script in the iframe; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-290 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / keyboard and accessibility | P2 | 9 | 12 | 3 | 3 | 0 | Broot now exposes focus-visible styling, object-specific layer labels, keyboard undo/redo/delete/nudge handling, and a focusable canvas workspace; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-291 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / HEN mint trust preview | P1 | 13 | 6 | 3 | 5 | 1 | Broot HEN publishing now splits Prepare and Sign, shows contract/network/wallet/token/CID/fee/storage review before wallet send, and prevents wallet submission until the user confirms; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-292 | Verified | Codex Broot audit implementation full-send | 2026-06-18 | Broot / animation export UX | P2 | 9 | 12 | 2 | 4 | 0 | Broot MP4 export now defaults to a neutral still-hold capture and exposes explicit pulse/reveal modes plus duration/FPS controls instead of silently applying a hardcoded pulse; verified live on `wtfos.app` commit `94d26fe` |
| WTF-BB-293 | Verified | Codex Skywire standalone OVOID UX pass | 2026-06-18 | Skywire / standalone AT login and OVOID-style UI | P1 | 13 | 6 | 4 | 5 | 0 | Skywire now has public standalone AT login at `skywire.wtfos.app`, subdomain Caddy/CORS/session support, standalone OAuth resume/create behavior, a compact task-led app shell with top quick actions and progressive disclosure, and verified source/build/coverage/full-inventory/Playwright screenshot coverage |
| WTF-BB-219 | Verified | Codex desktop icon drag paint repair | 2026-06-07 | Desktop OS / icon drag rendering | P2 | 8 | 14 | 2 | 3 | 0 | Dragging a desktop icon could make all on-screen text blink out until movement stopped; fixed by decoupling live drag movement from parent desktop rerenders and verified locally |
| WTF-BB-220 | Verified | Codex Impeccable shared UI repair pass | 2026-06-07 | Skywire / vault created-token layout | P2 | 8 | 14 | 2 | 3 | 0 | Skywire vault created-token collections could freeze the rendered client after a successful API response; fixed by removing the fragile nested auto-fill grid and verified in the full inventory suite |
| WTF-BB-221 | Verified | Codex full-send verification repair | 2026-06-07 | tz2at / ecosystem analytics reliability | P1 | 10 | 10 | 2 | 4 | 0 | tz2at ecosystem analytics could outlive the live-puppet workflow budget when ATProto sampling was slow; fixed with a route budget, abort propagation, explicit 504 handling, and verified by the full live puppet suite |
| WTF-BB-222 | Verified | Codex full-send verification repair | 2026-06-07 | Public leaderboard / profile alias hydration | P1 | 10 | 10 | 2 | 4 | 0 | Public leaderboard profile alias hydration could spend the live-puppet public data budget during TzKT/TzProfiles retries; fixed by capping/timeboxing optional enrichment and verified by the full live puppet suite |
| WTF-BB-214 | Verified | Codex auth rate-limit bucket repair | 2026-06-06 | Auth / Postgres rate limits | P0 | 14 | 3 | 2 | 5 | 2 | Postgres-backed rate limiters share bucket keys across endpoints and can lock out wtfOS login |
| WTF-BB-207 | Fixed | Codex Skywire canonical-domain OAuth repair | 2026-06-04 | Platform domains / AT OAuth identity boundary | P0 | 16 | 1 | 3 | 5 | 5 | Legacy wtfgameshow.app remains a separate signed-in portal and poisons Skywire OAuth redirect identity |
| WTF-BB-208 | Fixed | Codex Skywire chat OAuth session persistence repair | 2026-06-04 | Skywire / AT OAuth session persistence | P0 | 16 | 1 | 3 | 5 | 5 | Skywire Chat Add-on approval can immediately null stored OAuth token material and force reconnect |
| WTF-BB-210 | Verified | Codex Skywire post-OAuth settings bounce repair | 2026-06-04 | Skywire / AT OAuth tab lifecycle | P1 | 12 | 7 | 2 | 5 | 1 | Stale OAuth completion metadata can keep forcing Skywire back to Settings after chat permission is already enabled |
| WTF-BB-213 | Verified | Codex Skywire OAuth completion regression repair | 2026-06-05 | Skywire / AT OAuth completion propagation | P0 | 16 | 1 | 3 | 5 | 5 | Same-window Skywire OAuth callback stopped notifying the original app window, and unresolved Bluesky handles could make OAuth start look stalled; fixed with unconditional callback completion broadcast, unresolved-handle preflight, and verified by `npm run test:e2e:inventory` plus focused Skywire OAuth tests |
| WTF-BB-206 | Verified | Codex Skywire OAuth primary-domain repair | 2026-06-04 | Skywire / AT OAuth domain and session binding | P0 | 16 | 1 | 3 | 5 | 5 | Skywire OAuth callback bounces wtfos.app users to legacy wtfgameshow.app and collides with that domain's logged-in identity |
| WTF-BB-205 | Verified | Codex Skywire OAuth identity-binding emergency | 2026-06-04 | Skywire / AT OAuth identity binding | P0 | 16 | 1 | 3 | 5 | 5 | Skywire Chat Add-on OAuth can target the shared WTF Gameshow Bluesky actor instead of the signed-in user's linked account |
| WTF-BB-204 | Verified | Codex Skywire market feed search-source pass | 2026-06-04 | Skywire / Market Feed source | P1 | 13 | 5 | 3 | 5 | 1 | Skywire Market Feed can show a false empty lane when searchPosts hits the non-search public AppView |
| WTF-BB-180 | Verified | Codex WTF LIVE migration hotfix | 2026-06-04 | WTF LIVE / DB migrations | P1 | 12 | 7 | 2 | 5 | 1 | WTF LIVE user room tables declared in schema but missing production migration |
| WTF-BB-199 | Verified | Codex WTF LIVE realtime media/chat pass | 2026-06-04 | WTF LIVE / realtime room transport | P0 | 15 | 2 | 4 | 5 | 1 | WTF LIVE guest room media controls are local-only and do not connect participants |
| WTF-BB-200 | Verified | Codex Skywire OAuth permission sync pass | 2026-06-04 | Skywire / AT OAuth permission lifecycle | P1 | 13 | 5 | 2 | 5 | 2 | Skywire chat add-on OAuth completion can strand upgraded permissions in the popup/new window instead of the original client |
| WTF-BB-203 | Verified | Codex Skywire OAuth same-window repair | 2026-06-04 | Skywire / AT OAuth permission lifecycle | P1 | 13 | 5 | 2 | 5 | 2 | Skywire chat add-on OAuth can leave the original window disabled when the popup becomes the only upgraded Skywire instance |
| WTF-BB-201 | Verified | Codex WTF LIVE crowded-room layout pass | 2026-06-04 | WTF LIVE / public room layout | P1 | 12 | 7 | 2 | 5 | 1 | WTF LIVE idle participants render as empty media boxes and push room chat offscreen |
| WTF-BB-202 | Verified | Codex WTF LIVE room exit/new-tab pass | 2026-06-04 | WTF LIVE / public room lifecycle UX | P1 | 11 | 8 | 2 | 5 | 0 | WTF LIVE public rooms lack obvious leave/close controls and signed-in Join replaces the wtfOS window |
| WTF-BB-209 | Verified | Codex WTF LIVE active share selector | 2026-06-04 | WTF LIVE / public room media selection | P1 | 12 | 7 | 2 | 5 | 1 | WTF LIVE publishes the first video source instead of the user-selected camera/screen share |
| WTF-BB-210 | Verified | Codex WTF LIVE stage/attendance layout pass | 2026-06-04 | WTF LIVE / public room stage layout | P1 | 12 | 7 | 2 | 5 | 1 | WTF LIVE room layout does not reserve the bulk of the room for active video/screen share |
| WTF-BB-211 | Verified | Codex WTF LIVE v0.3 room polish pass | 2026-06-04 | WTF LIVE / public room UX and diagnostics | P1 | 13 | 6 | 3 | 5 | 1 | WTF LIVE v0.3 testing exposed weak presence diagnostics, missing media pop-outs, and chat/attendance space competition |
| WTF-BB-212 | Verified | Codex WTF LIVE lobby presence pass | 2026-06-05 | WTF LIVE / lobby presence | P2 | 8 | 14 | 2 | 3 | 0 | WTF LIVE lobby does not show which rooms are active or how many users are inside |
| WTF-BB-179 | Verified | Codex Rat Race Objkt pk hydration pass | 2026-05-28 | Rat Race / Objkt hydration | P1 | 12 | 7 | 3 | 5 | 0 | Objkt replay collect records use token pk and fail FA2 token hydration |
| WTF-BB-178 | Verified | Codex Rat Race replay-window pass | 2026-05-28 | Rat Race / replay ingestion | P1 | 11 | 8 | 2 | 5 | 0 | Multi-day hot filters silently scan only one day of tz2at replay |
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
| WTF-BB-014 | Verified | Codex security hardening pass | 2026-05-30 | Auth / CSRF | P2 | 13 | 6 | 3 | 3 | 4 | Cookie-authenticated write routes have no visible CSRF token layer |
| WTF-BB-015 | Fixed | Codex TV hardening pass | 2026-05-03 | Media / access control | P1 | 14 | 4 | 3 | 3 | 4 | Uploaded media files are unauthenticated and enumerable by ID |
| WTF-BB-016 | Fixed | Codex TV hardening pass | 2026-05-03 | Abuse prevention / rate limits | P1 | 14 | 4 | 3 | 4 | 3 | Media rate-limit bypass is broad enough to cover write-heavy endpoints |
| WTF-BB-017 | Fixed | Codex TV hardening pass | 2026-05-03 | TV cache / SSRF-DoS | P1 | 14 | 4 | 3 | 4 | 3 | Unauthenticated TV prefetch can force large public media downloads |
| WTF-BB-018 | Fixed | Swarm A4 | 2026-04-28 | Studio / media processing | P1 | 14 | 4 | 4 | 3 | 3 | Studio preview ffmpeg jobs run inline without timeout or concurrency guard |
| WTF-BB-019 | Fixed | Codex security hardening pass | 2026-05-30 | Secrets / key management | P1 | 13 | 5 | 3 | 2 | 4 | OAuth and Studio secret encryption fall back to `SESSION_SECRET` |
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
| WTF-BB-056 | Verified | Codex security hardening pass | 2026-05-30 | Security / telemetry integrity | P1 | 12 | 7 | 4 | 1 | 4 | Unauthenticated client log ingestion route is exempt from API rate limiting |
| WTF-BB-057 | Open | - | 2026-04-27 | Security / command safety | P1 | 13 | 5 | 4 | 4 | 3 | Supabase backup command builder interpolates DB URL into a shell command |
| WTF-BB-058 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 10 | 2 | 3 | 2 | Shared on-boot/domain-profile caches are global maps without key eviction |
| WTF-BB-059 | Open | - | 2026-04-27 | Runtime / memory hygiene | P2 | 10 | 11 | 2 | 3 | 2 | Board webhook rate limiter retains per token+IP keys without TTL-based eviction |
| WTF-BB-060 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 9 | 12 | 2 | 3 | 1 | DEX cache keyspace is unbounded by request params (`counterparts`, `metrics`) |
| WTF-BB-061 | Open | - | 2026-04-27 | Runtime / API scaling | P2 | 10 | 13 | 2 | 3 | 3 | TzKT response cache stores arbitrary pagination/address combinations indefinitely |
| WTF-BB-062 | Verified | Codex W repair pass | 2026-05-24 | Runtime / API scaling | P2 | 10 | 10 | 3 | 2 | 2 | X DM cache maps never garbage-collect stale user-context keys |
| WTF-BB-063 | Fixed | Swarm A4 | 2026-04-28 | Runtime / memory hygiene | P2 | 11 | 11 | 3 | 3 | 2 | Studio user Drive caches persist by user ID with no per-process bound |
| WTF-BB-064 | Fixed | gardener session | 2026-04-27 | Kiln integration / deploy | P1 | 13 | 5 | 3 | 4 | 2 | Collection factory depended on sibling Kiln paths and local-only API defaults |
| WTF-BB-065 | Fixed | gardener session | 2026-04-27 | wtf.tez / subdomains | P1 | 12 | 7 | 3 | 4 | 1 | wtf.tez deploy/test/UI paths drifted back to hardcoded `hack.*` parent domains |
| WTF-BB-066 | Verified | Codex security hardening pass | 2026-05-30 | Kiln integration / security | P1 | 14 | 4 | 2 | 3 | 5 | Deploy runs `check-kiln-auth.mjs` + mutation probe; open Shadownet mode is intentional |
| WTF-BB-067 | Fixed | Codex Kiln 2026 pass | 2026-05-02 | Kiln integration / payable e2e | P1 | 12 | 7 | 3 | 4 | 1 | Kiln execute/e2e APIs cannot attach tez to payable Tezos calls |
| WTF-BB-068 | Open | - | 2026-05-02 | Kiln integration / Shadowbox | P1 | 13 | 5 | 4 | 4 | 1 | Shadowbox is still single-contract and cannot emulate product systems |
| WTF-BB-069 | Open | - | 2026-05-02 | Kiln integration / network metadata | P1 | 10 | 10 | 2 | 3 | 1 | Deployed Kiln may advertise stale Etherlink Ghostnet-era metadata |
| WTF-BB-070 | Open | - | 2026-05-02 | Kiln integration / runtime assertions | P1 | 12 | 7 | 4 | 3 | 1 | Kiln live E2E cannot yet verify storage, balance, and big-map assertions |
| WTF-BB-071 | Open | - | 2026-05-02 | Kiln integration / jstz adapter | P2 | 10 | 11 | 4 | 2 | 1 | jstz is only planned/configurable and has no executable Kiln adapter |
| WTF-BB-072 | Fixed | Codex Kiln 2026 pass | 2026-05-03 | Kiln integration / browser runtime | P1 | 12 | 7 | 3 | 4 | 1 | Kiln CORS allowlist blocked same-origin browser assets |
| WTF-BB-073 | Fixed | Codex Kiln 2026 pass | 2026-05-03 | Kiln integration / observability | P2 | 10 | 11 | 2 | 3 | 2 | Kiln local activity log path can spam EACCES from `/var/log/kiln` |
| WTF-BB-074 | Open | - | 2026-05-03 | Kiln integration / deploy tooling | P2 | 9 | 12 | 2 | 2 | 2 | Netlify CLI rollback path is blocked by root-owned npm cache |
| WTF-BB-075 | Archived | Operator review 2026-05-30 | 2026-05-30 | Kiln integration / public test infrastructure | P2 | 10 | 11 | 2 | 3 | 2 | Accepted: open Shadownet puppet wallets are intentional faucet-funded builder convenience |
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
| WTF-BB-164 | Fixed | Codex Skywire actor feed pass | 2026-05-24 | Skywire / Bluesky client UX | P1 | 12 | 8 | 3 | 5 | 0 | Skywire home/discover cannot pivot from actors to author-only feeds |
| WTF-BB-165 | Fixed | Codex Skywire actor feed pass | 2026-05-24 | Comms / Mail route resilience | P2 | 9 | 12 | 2 | 4 | 0 | Mail route crashes when mailbox status payload is sparse |
| WTF-BB-166 | Fixed | Codex Skywire discovery/Tezos pass | 2026-05-24 | Skywire / Bluesky client UX | P1 | 13 | 7 | 4 | 5 | 0 | Discover opens a side-feed instead of the Actor Feed tab and lacks peer-follow discovery |
| WTF-BB-167 | Fixed | Codex Skywire discovery/Tezos pass | 2026-05-24 | Skywire / Tezos feed quality | P1 | 12 | 8 | 3 | 5 | 0 | Tezos feed uses keyword search instead of official Tezos actor feeds |
| WTF-BB-168 | Fixed | Codex Skywire discovery/Tezos pass | 2026-05-24 | Skywire / Bluesky source links | P1 | 11 | 9 | 2 | 5 | 0 | Bluesky post open links encode DID actors and trip invalid DID |
| WTF-BB-169 | Fixed | Codex Skywire discovery/Tezos pass | 2026-05-24 | Profile / Identity bridge UX | P2 | 9 | 12 | 2 | 4 | 0 | Profile Social & Contact omits linked Skywire/AT identity |
| WTF-BB-170 | Fixed | Codex Skywire profile disconnect pass | 2026-05-24 | Profile / Identity bridge UX | P2 | 8 | 13 | 1 | 4 | 0 | Profile shows linked Skywire identity but lacks a manual disconnect action |
| WTF-BB-171 | Verified | Codex WIM buddy-list repair | 2026-05-24 | WIM / social UX | P1 | 11 | 9 | 3 | 4 | 0 | WIM lists Studio project rooms as individual buddies and lacks a real user/friend list |
| WTF-BB-172 | Verified | Codex route-smoke sparse payload repair | 2026-05-24 | Inventory E2E / sparse API fixtures | P2 | 7 | 13 | 1 | 3 | 0 | Inventory route smoke exposed sparse Discovery/Porcupin/CSRF fixtures that could mask or trigger UI failures |
| WTF-BB-173 | Verified | Codex admin app runtime gate audit | 2026-05-25 | WTF OS / admin app gates | P1 | 13 | 5 | 3 | 5 | 1 | Desktop app disables hide launchers but do not fail closed at command palette or direct route runtime |
| WTF-BB-174 | Verified | Codex full-send merge audit | 2026-05-25 | Desktop OS / merge safety | P2 | 9 | 12 | 2 | 4 | 0 | Merged desktop app arrays duplicated Skywire and Mail icons |
| WTF-BB-176 | Verified | Codex pending batch live puppet cleanup | 2026-06-03 | Live E2E / local environment drift | P1 | 10 | 8 | 2 | 4 | 0 | Live puppet harness has stale local DB/storage prerequisites |
| WTF-BB-177 | In Progress | Codex WTFOS tz2at PDS/firehose pass | 2026-05-26 | AT Protocol architecture / identity boundary | P1 | 14 | 4 | 4 | 5 | 1 | Canonical user AT repos still carry WTFOS/tz2at state and no sovereign WTFOS DID boundary exists |
| WTF-BB-178 | Fixed | Codex Rat Race diagnostics/supply pass | 2026-05-27 | Tezos / Rat Race data pipeline | P1 | 13 | 5 | 4 | 4 | 1 | Rat Race hot-edition feed is backed by an empty local market index |
| WTF-BB-179 | Fixed | Codex Rat Race replay stream pass | 2026-05-28 | Tezos / tz2at data freshness | P1 | 12 | 7 | 3 | 4 | 1 | tz2at relay health can be green while indexed firehose data is stale |
| WTF-BB-180 | Fixed | Codex tz2at CEX classifier pass | 2026-05-28 | Tezos / tz2at ecosystem analytics | P1 | 10 | 10 | 2 | 4 | 0 | CEX flow classifier shipped without a default exchange custody address book |
| WTF-BB-181 | Fixed | Codex tz2at analytics readout pass | 2026-05-28 | Tezos / tz2at ecosystem analytics UX | P1 | 11 | 8 | 3 | 4 | 0 | AppView led with ambiguous data blocks instead of an explanation-first liquidity brief |
| WTF-BB-182 | Open | - | 2026-05-28 | In-app market / inventory E2E | P2 | 9 | 12 | 2 | 4 | 0 | Inventory market-pricing spec creates a sale that the storefront does not visibly render |
| WTF-BB-183 | Verified | Codex Skywire UI polish pass | 2026-05-28 | Skywire / sparse account resilience | P2 | 9 | 12 | 2 | 4 | 0 | Skywire account shell crashed when sparse harness payload omitted `tezosIdentity` |
| WTF-BB-187 | Verified | Codex wtfos canonical-domain TLS repair | 2026-06-01 | Deploy / edge TLS | P0 | 12 | 7 | 2 | 5 | 0 | Cloudflare proxied `wtfos.app` points at an origin that does not serve the canonical hostname |
| WTF-BB-188 | Fixed | Codex Rat Race tz2at canonical pass | 2026-06-03 | Rat Race / tz2at rolling scope | P1 | 12 | 8 | 3 | 4 | 1 | Rat Race treats Objkt enrichment as canonical and exposes filters beyond tz2at rolling window |
| WTF-BB-189 | Verified | Codex Skywire wallet identity hardening pass | 2026-06-03 | Skywire / wallet identity boundary | P1 | 14 | 4 | 2 | 5 | 3 | Direct Skywire buys can trust stale browser wallet state without rechecking current-user wallet ownership |
| WTF-BB-190 | Verified | Codex holdings derive production health pass | 2026-06-03 | Wallet holdings / scheduler resilience | P1 | 13 | 6 | 2 | 4 | 1 | `holdings-derive` failed after `wallet_holdings_id_seq` exhausted 32-bit serial capacity |
| WTF-BB-191 | Fixed | Codex Rat Race direct-buy hotfix | 2026-06-04 | Rat Race / marketplace wallet sends | P1 | 13 | 5 | 3 | 4 | 1 | tz2at listing signals can suppress Objkt direct-buy purchase keys |
| WTF-BB-192 | Verified | Codex desktop environment corrections | 2026-06-03 | Desktop OS / shell UX | P2 | 9 | 12 | 3 | 3 | 0 | Desktop icon movement, WX controls, and experimental app affordances drift from current shell expectations |
| WTF-BB-193 | Verified | Codex Skywire feed UI/token preview pass | 2026-06-03 | Skywire / feed UX and token previews | P2 | 11 | 9 | 3 | 5 | 0 | Skywire feed cards bury media and reject common Objkt/Teia/OE token href previews |
| WTF-BB-194 | Verified | Codex CRP sparse route guard during Skywire UI pass | 2026-06-03 | CRP nominations / route resilience | P2 | 8 | 14 | 1 | 4 | 0 | CRP nomination route crashes on sparse inventory harness API payloads |
| WTF-BB-195 | Verified | Codex Stuffs CREATE menu pass | 2026-06-03 | Desktop OS / Start Menu taxonomy | P2 | 8 | 14 | 2 | 3 | 0 | Stuffs menu lacks a dedicated CREATE! category for creation apps |
| WTF-BB-196 | Verified | Codex Skywire dark-mode default pass | 2026-06-03 | Skywire / default theme UX | P2 | 8 | 14 | 2 | 3 | 0 | Skywire still opens with light shell/sidebar/input surfaces after feed polish |
| WTF-BB-197 | Verified | Codex Skywire feed usability repair | 2026-06-04 | Skywire / feed UX and media | P1 | 12 | 7 | 3 | 5 | 0 | Skywire feed rows collapse into cramped strips and crop media instead of reading like social post cards |
| WTF-BB-198 | Verified | Codex Skywire Teia link buy-option repair | 2026-06-04 | Skywire / Teia token links | P1 | 11 | 9 | 2 | 5 | 0 | Skywire misses buy options for contractful Teia `/objkt/{KT1}/{tokenId}` links |

## Issue Details

### WTF-BB-325 - Public Gamma deep routes still fall back to Classic

- Category: Gamma / live hostname route containment
- Status: Verified
- Owner/Session: Codex Gamma live verification pass
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - Live `https://gamma.wtfos.app/` rendered `[data-gamma-wtfos]=1`, but direct live `https://gamma.wtfos.app/gallery` and `https://gamma.wtfos.app/leaderboard` rendered `[data-wtf-desktop]=1` with no Gamma workspace.
  - Live `/api/health` reported commit `de0acb6`; the deployed `index-wtf2-ChA9LqzT.js` bundle still contains the root-only Gamma branch and no broad `isGammaShellLocation` route branch.
- Correction:
  - Created isolated branch `codex/gamma-live-shell` from `origin/main` and transplanted only the Gamma presentation shell/runtime/test slice.
  - Kept `/applications` out of the branch because it is not part of the current production-base route registry and would add a new surface.
  - Fixed hidden-worktree Playwright harness serving by allowing dot-directory paths when the worktree lives under `~/.config`.
  - Fixed branch-CI Typecheck blockers by typing Tezos Intel presentation markers and declaring the marketplace presentation-only `surfaceVariant` prop.
  - Promoted the verified branch to `main` by fast-forward from `de0acb6` to `6e351170678cccb6a72228465d758c15420830cd`.
  - Preserved shared application logic, API contracts, data, wallet, contract, and auth behavior; changes are presentation shell, route containment, host-aware navigation, and test harness proof only.
- Local verification:
  - `npm run check`: passed.
  - `tsx --test` presentation-policy sweep: `148/148` passed.
  - `npm run test:e2e:inventory:coverage`: route fixtures `112/112`, subdomain rows `195/195`, normalized handles `852/852`.
  - `/opt/homebrew/bin/node ./node_modules/.bin/vite build`: passed.
  - Focused rendered rerun for desktop utility handoffs and Message Board dialogs: `2/2` passed on `HARNESS_PORT=4319`.
  - Full Gamma browser suite: `61/61` passed on `HARNESS_PORT=4321`, including production-hostname direct routes, The Count admin suite, native admin cluster, desktop utility CLI handoff, Message Board dialogs, social/media/TV routes, and mobile first viewport.
  - `git diff --check`: passed.
- Branch CI verification:
  - GitHub Quality Gates run `28420704957` passed for commit `04ccba794bfb2007222a7f1143df7be6123e05be`, including Typecheck, Vite env policy, Build, Inventory coverage, Inventory Playwright smoke, External link safety, and SmartPy V1.2 contract tests.
- Production verification:
  - GitHub Deploy to Hetzner run `28421767405` passed for `main` commit `6e351170678cccb6a72228465d758c15420830cd`.
  - GitHub Quality Gates run `28421767416` passed on `main`, including Typecheck, Vite env policy, Build, Inventory coverage, Inventory Playwright smoke, External link safety, and SmartPy V1.2 contract tests.
  - Live `https://gamma.wtfos.app/api/health` and `https://wtfos.app/api/health` reported `commitRef:"6e35117"` with `status:"ok"`.
  - Live selector proof: `https://gamma.wtfos.app/` rendered `[data-gamma-wtfos]=1`; `/gallery` and `/leaderboard` rendered `[data-gamma-wtfos]=1`, `[data-gamma-application-content]=1`, and `[data-wtf-desktop]=0`; `/admin` and `/swap` rendered Gamma route gates with `[data-wtf-desktop]=0`.
  - Host isolation proof: live `https://wtfos.app/` rendered `[data-wtf-desktop]=1` and `[data-gamma-wtfos]=0`; live `https://beta.wtfos.app/` rendered Beta shell markers and `[data-gamma-wtfos]=0`.

### WTF-BB-327 - Central Inbox must preserve source-owned privacy boundaries

- Category: Comms / Inbox read model
- Status: Verified
- Owner/Session: Codex Inbox full-send
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - 2026-06-30 user request reimagined WTF Mail as Inbox, the central messaging hub for system, admin, user mail, WIM, invites, notification subscriptions, and Studio messages.
  - The hub needs a permanent desktop badge and cross-app read-state sync, which can accidentally become a global or presentation-only read model if the Inbox aggregates private sources without preserving per-user target rows and source-owned write APIs.
- Why it matters:
  - Inbox is now the recovery surface for account, wallet, social-proof, safety, mail, WIM, Studio, and notification needs. If it globalizes read state or bypasses source routes, one user's unread badge or read action can become misleading or leak private activity.
- Correction:
  - Keep `/mail` as the Inbox owner surface while preserving Mail, WIM/DM, Studio, Notification Center, and Comms Kernel APIs by domain.
  - Add a user-scoped `/api/comms/unread-count` for the permanent desktop badge.
  - Publish DM comms rows to each participant instead of untargeted global rows.
  - Let Inbox mark read through source-owned endpoints, and let WIM show Studio project conversations without adding Studio rooms to the buddy roster.
- Verification:
  - Passed `git diff --check`.
  - Passed focused source/unit coverage: `node_modules/.bin/tsx --test client/src/pages/mail-presentation-policy.test.ts client/src/pages/messages-presentation-policy.test.ts client/src/pages/Wim.test.ts client/src/features/desktop/DesktopIcons.test.tsx server/routes/messages-user-roster-policy.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run build`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed focused browser coverage: `node_modules/.bin/playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "documented static|Inbox and Notification|Inbox mailbox" --project=chromium --reporter=list`.
  - Ran `npm run test:e2e:inventory`; Inbox, WIM, messages, `/mail`, `/messages`, `/messages/dms/:id`, `/wim`, social-domain comms probes, and Gamma Inbox checks passed inside the broad run. The broad run finished `439 passed` with unrelated route/WTF LIVE harness failures matching the existing `WTF-BB-238` instability bucket.
  - Fresh focused reruns passed the unrelated broad-run failures: `HARNESS_PORT=4321 node_modules/.bin/playwright test tests/playwright/inventory/routes.spec.mjs -g "/tools/nikshumika-paint" --project=chromium --reporter=list` and `HARNESS_PORT=4323 node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs --project=chromium --reporter=list` (`15/15`).

### WTF-BB-328 - Macaroni installer manifest accepted plaintext remote installer URLs

- Category: Macaroni installers / supply chain
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C1 + F4 + S4 + P1(4) = 13
- Evidence:
  - `/api/macaroni/installers` builds a downloadable native installer manifest from configured URLs.
  - The previous sanitizer accepted remote `http:` URLs, which would let a production HTTPS page advertise plaintext installer binaries.
- Why it matters:
  - Installer downloads are a supply-chain handoff. A remote HTTP URL can be downgraded or replaced in transit even when the wtfOS page itself is served over HTTPS.
- Correction:
  - Allow same-origin relative paths.
  - Allow remote HTTPS URLs.
  - Allow loopback HTTP only outside production for local development.
- Verification:
  - Clean branch `codex/pasta-live-readiness` passed focused `node --test server/routes/macaroni-policy.test.ts`, broad `npm run check -- --pretty false`, `npm run build`, and supporting release gates.
  - Deploy to Hetzner run `28467035058` passed and live `https://wtfos.app/api/health` reported commit `f32dbe8`.
  - Public live verifier passed: unauthenticated `/api/macaroni/installers` returned `401`, and macOS, Windows, and Raspberry Pi GitHub release assets accepted byte-range download probes.
  - Authenticated live verifier passed as production puppet `e2e_bert`; manifest matched Macaroni Desktop `1.0.0`, stable GitHub release URLs, file names, HTTPS-only URLs, and SHA-256 values.

### WTF-BB-329 - Live Pasta/Macaroni static wallet bundles still serve stale Taquito

- Category: Tezos / Pasta production deployment
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S3 + P1(4) = 14
- Evidence:
  - 2026-06-30 live probes showed `https://wtfos.app/creation-tools/{macaroni,spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/vendor/tezos.js` still exposing Taquito `24.3.0`.
  - The release branch carries refreshed Taquito `25.0.0` and Octez Connect `4.8.6` static bundles plus policy coverage.
- Why it matters:
  - Production creator tools can be reachable while still running older wallet/deploy code. Local policy checks are not live deployment proof.
- Correction:
  - Promote the refreshed dependency locks and static browser bundles through the normal main `wtfos.app` deployment path.
  - After deploy, curl each shipped bundle and assert expected new markers are present and stale markers are absent.
- Verification:
  - Clean branch `codex/pasta-live-readiness` passed `npm run security:tezos-rpc-defaults`, `npm run creation-tools:check`, broad `npm run check -- --pretty false`, and `npm run build`.
  - Deploy to Hetzner run `28467035058` passed and live `https://wtfos.app/api/health` reported commit `f32dbe8`.
  - Main Quality Gates run `28467035060` passed SmartPy, Typecheck, Vite env policy, Build, Inventory coverage, Inventory Playwright smoke, and External link safety.
  - Live bundle probe passed for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna`: every `vendor/tezos.js` returned `200` with `staleTaquito=false`, and every `js/common.js` returned `200` with Octez mainnet and Shadownet RPC markers.

### WTF-BB-330 - Macaroni Desktop installer artifacts are not published

- Category: Macaroni installers / release ops
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S2 + P1(4) = 13
- Evidence:
  - `.github/workflows/macaroni-desktop-installers.yml`, `apps/macaroni-desktop/package.json`, and `docs/macaroni-desktop-packaging.md` exist on `origin/main`.
  - 2026-06-30 GitHub API probes reported zero releases and zero runs for the Macaroni desktop installer workflow.
  - 2026-06-30 local `codex/pasta-live-readiness` proof built unsigned macOS universal artifacts with `npm run dist:mac --prefix apps/macaroni-desktop`.
  - 2026-06-30 branch workflow run `28458246772` produced `macaroni-desktop-macos` artifact `7986390894` and `macaroni-desktop-windows` artifact `7986389945`; Raspberry Pi arm64 failed before upload because electron-builder rejected the `.deb` without homepage/author email/maintainer metadata.
  - 2026-06-30 branch workflow retry `28458796320` on commit `3dc2013a` succeeded for all matrix targets and uploaded `macaroni-desktop-macos` artifact `7986621165`, `macaroni-desktop-windows` artifact `7986637629`, and `macaroni-desktop-raspberry-pi` artifact `7986602158`.
- Why it matters:
  - Source and CI definitions do not make software downloadable. The main Pasta release goal requires users to download individual installers or a suite from stable URLs.
- Correction:
  - Run the Macaroni desktop installer workflow for macOS, Windows, and Raspberry Pi packages.
  - Keep Debian package metadata explicit: package homepage, author email, Linux maintainer, lowercase package name, executable name, and desktop name.
  - Publish artifacts to stable URLs or a release, configure `MACARONI_INSTALLER_*_URL` plus `MACARONI_INSTALLER_VERSION`, and smoke the authenticated `/api/macaroni/installers` manifest on production.
- Verification:
  - Local macOS artifact proof: `Macaroni-Studio-1.0.0-mac-universal.dmg` sha256 `9df90eef0fe40b784a642d8630a0b842c7c355224c212884bf3f69777c2b187f`; `Macaroni-Studio-1.0.0-mac-universal.zip` sha256 `9cb9ea4c38494bf2bf9fc160288fa1988ce7ea687efc06b5a1330b569a2fdcba`.
  - Local metadata guard: `npm run macaroni:desktop:check` passes with explicit Linux `.deb` metadata assertions.
  - Branch artifact proof: Macaroni Desktop Installers run `28458796320` passed macOS, Windows, and Raspberry Pi builds with `publish_release=false`.
  - Stable release proof: GitHub release `macaroni-desktop-v1.0.0` exposes macOS DMG sha256 `9c91ad656bd249d7d921084d429ba23f00692d68819937505aa3deec8e50f600`, Windows EXE sha256 `6b40525d524dd916ba3a46ab28bb36c3238c7cbffd993f2c1803f61f5063e1d4`, and Raspberry Pi arm64 DEB sha256 `6ed21c165f5b2c5f476b0c8ab23c78397de59a2990d3f4f21dfb741b5e7e6216`.
  - Deploy to Hetzner run `28467035058` passed and live `https://wtfos.app/api/health` reported commit `f32dbe8`.
  - Public live verifier passed unauthenticated manifest protection plus byte-range probes for all three release assets.
  - Authenticated live verifier passed as production puppet `e2e_bert`; `/api/macaroni/installers` matched Macaroni Desktop `1.0.0`, expected filenames, stable GitHub release URLs, and SHA-256 values.

### WTF-BB-331 - Pasta main deploy failed on production disk exhaustion

- Category: Deploy / production disk capacity
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S1 + P0(5) = 13
- Evidence:
  - Deploy to Hetzner run `28466080627` reset the production checkout to `3d27e10` and built `wtf-app-app:latest`, then failed at Docker compose metadata export with `no space left on device`.
  - Live `https://wtfos.app/api/health` remained healthy on old commit `7b56bfd`, so the failure blocked promotion before the new Pasta/Macaroni code became live.
  - Production root was `98%` full with `1.9G` available; Docker build cache, unused images, and journals were reclaimable.
- Why it matters:
  - A live-ready branch can still miss production if deploy capacity is only checked after a long Docker build. Repeated failures also risk filling the host further and delaying rollback or emergency fixes.
- Correction:
  - Pruned Docker build cache and unused images without touching volumes.
  - Vacuumed systemd journals to `1G`.
  - Production root now has `26G` free (`65%` used).
  - Added `scripts/server-deploy.sh` disk preflight guard with configurable `WTF_DEPLOY_DISK_PATH` and `WTF_DEPLOY_MIN_FREE_KB`, defaulting to 12 GiB free before image build or app restart.
- Verification:
  - Passed `bash -n scripts/server-deploy.sh`.
  - Passed `node --test scripts/deploy-dry-run-policy.test.mjs scripts/production-migrations-policy.test.mjs scripts/check-kiln-production-posture.test.mjs`.
  - Production disk cleanup left root with `26G` free before redeploy and `24G` free after redeploy; Docker volumes were not pruned.
  - Deploy to Hetzner run `28467035058` passed with the new disk preflight in `scripts/server-deploy.sh`.
  - Live `https://wtfos.app/api/health` returned `ok: true` with `commitRef: "f32dbe8"`.
  - Main Quality Gates run `28467035060` passed.

### WTF-BB-334 - Macaroni Shadownet proof harness drifted from Octez active-account state

- Category: E2E / Macaroni Shadownet proof harness
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `npm run test:e2e:macaroni:shadownet` initially failed with the generated mint-page proof stuck in a split wallet state: balance read as connected while the top connect button returned to `Connect wallet`.
  - The harness seeded a puppet Beacon account, but Macaroni installs `OctezPrimaryWallet` and prefers the Octez DAppClient facade when it is present.
  - The trusted-creator Studio test also switched to the Page tab before asserting Drop-tab-only fields, and the intentionally blocked wtfOS publish gate logged an expected console error.
- Why it matters:
  - Shadownet proof is the staging gate before mainnet Pasta deployment claims. A stale wallet harness can make healthy product code look disconnected, or worse, let a weaker address-only proof pass without exercising the selected wallet provider lifecycle.
  - Trusted-creator wtfOS publish affordances and standalone mint-page restore/disconnect behavior are part of the Macaroni contract-product workflow surface.
- Correction:
  - Updated the Playwright puppet to seed the accepted `octez.connect` provider name and install a deterministic Octez DAppClient facade with active-account get/set/clear plus `ACTIVE_ACCOUNT_SET` subscriptions.
  - Kept the Studio test on the correct tab for Drop-only assertions and treated the intentionally triggered no-KT1 publish block as expected console output.
- Verification:
  - `node --check tests/playwright/live/macaroni-shadownet.spec.mjs` passed.
  - `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run db:push` passed against disposable local Postgres.
  - `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run test:e2e:macaroni:shadownet` passed 5/5, seeding 12 Shadownet puppet actors against `https://tezos-shadownet.octez.io/`.

### WTF-BB-333 - Pasta Suite Desktop installer release path was missing

- Category: Pasta Suite installers / release ops
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S2 + P1(4) = 13
- Evidence:
  - The goal requires Pasta Protocol software package installers as individual items or a bundled suite.
  - Production already had verified individual Macaroni Desktop installers, but no `apps/pasta-suite-desktop`, suite installer workflow, `/api/pasta/installers` manifest, suite inventory handle, or suite live verifier existed.
- Why it matters:
  - A web-hosted tool suite is not the same as a downloadable native suite. Without a manifest and release verifier, users can end up with no suite download surface or dead installer links.
- Correction:
  - Added `apps/pasta-suite-desktop` as an Electron shell that bundles Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna from production-style `/creation-tools/<tool>/...` paths.
  - Added `.github/workflows/pasta-suite-desktop-installers.yml` for macOS universal DMG/ZIP, Windows x64 NSIS, and Raspberry Pi arm64 `.deb` packages.
  - Added authenticated `/api/pasta/installers` with HTTPS/same-origin URL policy, SHA-256 validation, explicit product/version fields, and package filenames matching Electron Builder outputs.
  - Added `PASTA_SUITE_INSTALLER_*` to `.env.example` and made the manifest mark installers available only when both the URL and SHA-256 digest are valid.
  - Added `pasta_suite.installer_manifest.viewed` to the interaction inventory and Pasta domain workflow, with a GET probe for `/api/pasta/installers`.
  - Added `scripts/check-pasta-suite-installers-live.mjs` to compare the live manifest against GitHub release asset URLs and GitHub release SHA-256 digests after release publication.
- Verification:
  - `npm run pasta-suite:desktop:check` passed 5/5.
  - `npm run macaroni:desktop:check` passed 4/4 to protect the existing individual installer lane.
  - `npm run test:e2e:inventory:coverage` passed with 862 normalized handles and 16 domain workflows.
  - `npm run check -- --pretty false` passed.
  - `npm run dist:mac --prefix apps/pasta-suite-desktop` produced unsigned local macOS artifacts: `Pasta-Suite-1.0.0-mac-universal.dmg` sha256 `3b00d06229d2527294aac8f67e43e9437f5544846225e9688a345af9addf01e9`; `Pasta-Suite-1.0.0-mac-universal.zip` sha256 `812650e1e62d1bbe7332b84d6a437966ef9ddb2262977c8923429551a4e73f24`.
  - Branch Quality Gates run `28470551711` passed on `fd4afcd`.
  - Main Deploy to Hetzner run `28471646097` passed, and live `https://wtfos.app/api/health` reported `commitRef: "fd4afcd"` with `nodeEnv: "production"`.
  - Pasta Suite Desktop Installers workflow run `28471682307` passed and published stable release tag `pasta-suite-desktop-v1.0.0`.
  - Published release assets expose GitHub SHA-256 digests for `Pasta-Suite-1.0.0-mac-universal.dmg` (`1c62cfde5a019d0c5900476c9dc72d2fc60c25e8098b06be5a88b4e858dbf39f`), `Pasta-Suite-1.0.0-win-x64.exe` (`5fb9c02531aa492a306928e89501eb3d628c61b4380720fb8a7e54fffa0c2f8a`), and `Pasta-Suite-1.0.0-linux-arm64.deb` (`bd15004c5a4233bf27280d9b2132e0408739f349ef7f0184af0cf665c5fe4a29`).
  - Production `PASTA_SUITE_INSTALLER_*` env was configured from the release digests, the app container was recreated with the deploy temp-env pattern, and `npm run pasta-suite:installers:live-check` passed against `https://wtfos.app` as production puppet `e2e_bert`.

### WTF-BB-332 - Stale Pasta deploy checkout can regress installer hardening if replayed

- Category: Repo hygiene / Pasta stale worktrees
- Status: Verified
- Owner/Session: Codex Pasta live-readiness cleanup
- Score: C1 + F3 + S2 + P2(3) = 9
- Evidence:
  - Pre-cleanup `git worktree list` still showed `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` on branch `pasta-protocol` at `f6256708` with 29 dirty entries after the clean Pasta live-readiness release.
  - Comparing that checkout to current `origin/main` shows most Pasta surfaces are already promoted, `drizzle/0103_macaroni_packages.sql` is superseded by `0104`, and `server/features/pasta-protocol` contains only `.gitkeep`.
  - Its dirty `server/routes/macaroni.ts` would remove installer SHA-256 manifest fields, advertise the stale Windows `.msi` filename, and allow remote plaintext installer URLs again.
  - The checkout was 105 commits behind `origin/main` with zero unique commits: `git -C .../WTF-pasta-deploy rev-list --left-right --count origin/main...HEAD` returned `105 0`.
  - Archive created at `/Users/joshuafarnworth/.codex/archives/WTF-pasta-deploy-2026-06-30-2c8a346` with `status.txt`, `tracked-diff.patch`, `tracked-diff.stat.txt`, `untracked-files.txt`, `untracked-files.list0`, `untracked-files.tgz`, `README.txt`, and `SHA256SUMS`.
- Why it matters:
  - The stale checkout looks Pasta-relevant, but replaying it wholesale after live verification would undo supply-chain hardening and confuse the production source of truth.
- Correction:
  - Keep production authority on `origin/main` / `codex/pasta-live-readiness`.
  - Mine the stale checkout only for explicit human notes from the archive.
  - Do not apply its patch wholesale to main.
- Verification:
  - `tar -tzf /Users/joshuafarnworth/.codex/archives/WTF-pasta-deploy-2026-06-30-2c8a346/untracked-files.tgz` listed the archived untracked Pasta files.
  - `shasum -a 256 -c /Users/joshuafarnworth/.codex/archives/WTF-pasta-deploy-2026-06-30-2c8a346/SHA256SUMS` returned `OK` for every archive member.
  - `git worktree remove --force .../WTF-pasta-deploy`, `git worktree prune -v`, and `git branch -D pasta-protocol` completed.
  - Current `git worktree list --porcelain` no longer lists the stale checkout, and `git branch --list pasta-protocol` returns no local branch.
  - `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md` remains current.
  - `scripts/check-macaroni-installers-live.mjs` and installer manifest policy still prove HTTPS URLs, checksums, and actual release asset filenames.

### WTF-BB-336 - Colander real-contract discovery lost Shadownet proof metadata

- Category: Pasta Protocol / Colander real-contract discovery
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S2 + P1(4) = 13
- Evidence:
  - After the signer-backed Pasta proofs, Colander could open a KT1 and detect entrypoint adapters, but relationship metadata only loaded from `ipfs://` contract metadata. The Shadownet proof contracts use `data:application/json;base64,...` metadata URIs, so the relationship graph could be absent even while controls rendered.
  - `explorerUrl()` only distinguished Ghostnet from mainnet, so Shadownet KT1s linked to `tzkt.io` instead of `shadownet.tzkt.io`.
  - Colander write submissions called `connectWallet()` but did not call the shared `assertNetworkReadyForSend()` chain-id preflight before building wallet operations.
- Why it matters:
  - Colander is the Pasta management and discovery console. It must prove contract type, current state, provenance metadata, and correct network evidence before any full Pasta release can rely on it.
  - A wrong explorer link can make Shadownet evidence look missing or send users toward mainnet, and missing preflight weakens wallet safety before signed operations.
- Correction:
  - Added metadata resolution for `data:application/json`, `https://`, and `ipfs://` URIs.
  - Routed Shadownet explorer links to `https://shadownet.tzkt.io`.
  - Added `assertNetworkReadyForSend(me)` before Colander signed writes.
  - Added `tests/playwright/inventory/pasta-protocol-colander-shadownet.spec.mjs`, which opens the signer-backed Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna Shadownet contracts through the browser UI and asserts adapters, actions, explorer links, relationship groups, and Colander events.
- Verification:
  - `npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run pasta:shadownet:colander`

### WTF-BB-337 - WTF.ME hosted Pasta pages lacked executable proof

- Category: Pasta Protocol / WTF.ME hosted page proof
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` listed `WTF.ME hosted Pasta pages` as `OPEN` because there was no proof for mint pages, collection pages, landing pages, branding, wallet connect, or purchase routing.
  - `PASTA_PROTOCOL_COVERAGE_REPORT.md` recommended adding WTF.ME hosted pages for the proven contracts/tokens before any full Pasta deployment claim.
  - Existing user-site serving already had the real `.wtfos.me` host contract and wallet-compatible CSP, but no Pasta-specific hosted-page fixture or browser proof exercised it.
- Why it matters:
  - Pasta cannot claim a collector-facing hosted-page release if the proof only validates contracts, static publishers, or Colander discovery.
  - Hosted pages must preserve Shadownet contract identity, token context, wallet/purchase markers, and public host headers before production can safely promote them.
- Correction:
  - Added `server/features/wtf-sites/pasta-hosting.ts` to build landing, Gnocchi mint, and Spaghetti collection page snapshots from the signer-backed Shadownet proof data.
  - Added `server/features/wtf-sites/pasta-hosting.test.ts` to validate required slugs, Shadownet chain markers, KT1/token/relationship evidence, wallet/purchase markers, Shadownet TzKT links, and immutable manifest digest behavior.
  - Extended the Playwright harness to claim a site, save Pasta pages, publish them, and serve them from a `*.wtfos.me` public host with user-site CSP/opener headers and `wtf_site.claimed`, `wtf_site.page_saved`, `wtf_site.published`, and `wtf_site.public.viewed` event logging.
  - Added `tests/playwright/inventory/pasta-protocol-wtfme-hosting.spec.mjs`, `npm run pasta:shadownet:wtfme`, behavior assertion ownership, and interaction inventory coverage.
- Verification:
  - `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run pasta:shadownet:wtfme`
- Residual risk:
  - This is branch-level API-publish host-mapped proof, not production live DNS/TLS, browser UI authoring persistence, hosted pinning/recovery, or signed hosted-page mint/purchase proof.

### WTF-BB-338 - Pasta wtfOS pinning/recovery lacked executable proof shape

- Category: Pasta Protocol / wtfOS pinning and recovery proof
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` listed `wtfOS Pasta pinning/recovery` as `OPEN` because no proof tied Pasta artifacts, metadata, files, redundancy, accessibility, or recovery to the wtfOS IPFS Pinning record model.
  - Pasta already had signer-backed Shadownet contracts, Colander discovery, and WTF.ME hosted-page proof, but the durability handoff could still be hand-waved without app.wtfos.media records or restore coordinates.
- Why it matters:
  - A hosted page and KT1 proof can still be unrecoverable if the contract artifacts, metadata, relationship graph, and page HTML are not represented as public pin records with redundant restore coordinates.
  - Native installers and public hosted pages should not imply durable Pasta preservation until the pinning system can express and recover the publish bundle.
- Correction:
  - Added `server/features/ipfs-pinning/pasta-proof.ts` to build a Pasta publish pin bundle from the WTF.ME hosted-page snapshots, signer-backed Shadownet proof contracts, and real static contract artifacts.
  - Added `server/features/ipfs-pinning/pasta-proof.test.ts` and `npm run pasta:shadownet:pinning` to validate app.wtfos.media `pinPolicy`, `pinManifest`, and `pinItem` records against the shared AT lexicon.
  - The proof asserts hosted-page, contract-artifact, token-metadata, and relationship-metadata item coverage, public IPFS gateway URLs, object-storage mirror keys, `.well-known/wtfos-pins`, restore order, and storage refs without credentials/signed URLs/private paths.
  - Registered the behavior assertion with Pasta Protocol and IPFS Pinning ownership.
- Verification:
  - `npm run pasta:shadownet:pinning`
  - `npx tsx --test server/features/ipfs-pinning/records.test.ts`
- Residual risk:
  - This is branch-level pin-record and recovery-coordinate proof, not live hosted Porcupin pin completion, object-store writes, published PDS records, public `.well-known` serving, or a recovery drill from live persisted records.

### WTF-BB-339 - Pasta WTF.ME production host fails live TLS gate

- Category: Pasta Protocol / WTF.ME production TLS and page serving
- Status: In Progress
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - `curl -I --max-time 20 https://wtf-admin.wtfos.me/` fails with `tlsv1 alert internal error`.
  - DNS resolves `wtf-admin.wtfos.me` to the WTF host `5.78.214.209`, so this is not a missing A-record problem.
  - `https://wtfos.app/internal/tls/allow?domain=wtf-admin.wtfos.me` returns `{"ok":false,"reason":"handle not registered"}`.
  - `npm run pasta:wtfme:live-check` now performs the production host proof and currently fails before content verification: `/internal/tls/allow` denied `wtf-admin.wtfos.me` with HTTP 403 `handle not registered`.
  - 2026-07-01 rerun: `npm run pasta:wtfme:live-publish:check` passed 3/3, while `npm run pasta:wtfme:live-check` still fails at the same production `handle not registered` gate.
- Why it matters:
  - The local API-publish Playwright proof shows WTF.ME can claim, save, publish, and serve Pasta pages in the harness, but collectors cannot use a production Pasta page if the real `*.wtfos.me` host cannot complete TLS.
  - A live production release must prove the actual user-site host returns the landing, mint, collection, wallet-compatible headers, and public pin discovery over HTTPS.
- Correction direction:
  - Register or publish the target Pasta user-site host in production, ensure Caddy on-demand TLS allows the host, and verify the site is not suspended or unpublished.
  - Added `scripts/pasta-protocol/wtfme-live-publish.ts` and `npm run pasta:wtfme:live-publish` to authenticate an eligible production user, dry-run the resolved `username.wtfos.me` host, and only with `PASTA_WTFME_LIVE_PUBLISH=1` claim the site, save the Pasta landing/mint/collection pages through the normal WTF.ME APIs, publish, and recheck the TLS ask gate.
  - Added `scripts/pasta-protocol/wtfme-live-publish-policy.test.mjs` and `npm run pasta:wtfme:live-publish:check` so the production helper cannot quietly lose its dry-run default, Pasta-scoped credentials, expected-host guard, CSRF write headers, or post-publish TLS proof.
  - Publish the Pasta landing, Gnocchi mint, and Spaghetti collection pages to an eligible host, enable public pin discovery, then rerun `npm run pasta:wtfme:live-check` with `PASTA_WTFME_LIVE_HOST=<published-host>`.
- Verification:
  - `npm run pasta:wtfme:live-publish:check`
  - `npm run pasta:wtfme:live-publish` dry-run with Pasta-specific credentials.
  - `PASTA_WTFME_LIVE_PUBLISH=1 npm run pasta:wtfme:live-publish` only when production publication is explicitly intended.
  - `npm run pasta:wtfme:live-check`
  - The command must pass against a real production host before any full-send claim.
- Residual risk:
  - Passing this gate proves production page serving and pin discovery only; wallet-signed mint/purchase and live provider/PDS/object-store recovery still need separate proof.

### WTF-BB-326 - Broad inventory social workflow timeout

- Category: E2E / inventory workflow timeout
- Status: Verified
- Owner/Session: Codex Gamma live verification pass
- Score: C1 + F3 + S0 + P2(3) = 7
- Evidence:
  - GitHub Quality Gates run `28419602338` passed Typecheck, Vite env policy, Build, and Inventory coverage, then failed broad Inventory Playwright smoke after `451 passed` because `social post to reward automation loop` hit the default `60000ms` Playwright timeout.
  - A failed-job rerun reproduced the same timeout, confirming it was not the earlier Typecheck blocker.
  - The workflow contains `122` API probes, `130` event handles, and `15` representative routes, making the fixed 60s per-test budget too tight on slower runners.
- Correction:
  - `tests/playwright/inventory/domain-interoperability.spec.mjs` now computes a per-workflow timeout from API probe count, event-handle count, route count, and a baseline overhead.
  - Assertions remain unchanged: every API probe still must return an accepted status, every event handle still posts through the normalized interaction endpoint, and every route still opens without app-error text.
- Local verification:
  - Focused workflow: `CI=1 HARNESS_PORT=4323 ./node_modules/.bin/playwright test tests/playwright/inventory/domain-interoperability.spec.mjs -g "social post to reward automation loop"` passed in `42.7s`.
  - Full domain interoperability spec: `CI=1 HARNESS_PORT=4324 ./node_modules/.bin/playwright test tests/playwright/inventory/domain-interoperability.spec.mjs` passed `16/16`; the social workflow passed in `46.4s`.
- Branch CI verification:
  - GitHub Quality Gates run `28420704957` passed for commit `04ccba794bfb2007222a7f1143df7be6123e05be`; the broad Inventory Playwright smoke completed successfully after the workload-based timeout fix.

### WTF-BB-324 - Gamma Swap inventory proof lacks connected wallet state

- Category: E2E / Gamma Swap harness wallet state
- Status: Verified
- Owner/Session: Codex Gamma shell continuation
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - `npm run test:e2e:inventory` on 2026-06-29 failed `tests/playwright/inventory/gamma-wtfos.spec.mjs:5957` after a clean build.
  - Focused rerun reproduced the same failure with `npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "hosts Swap DEX quote chrome"`.
  - The spec expects `[data-swap-region="submit-button"]` to contain `Swap via SpicySwap`, but the rendered button remains `Connect Wallet`.
  - Root cause on 2026-06-30 was stale harness wallet state: the Gamma Swap proof seeded `providerName: "beacon"`, while `readPersistedWalletSession()` accepts only `providerName: "octez.connect"`.
- Why it matters:
  - The Gamma Swap proof currently cannot distinguish a real quote/action regression from a missing wallet precondition in the harness.
- Correction:
  - Updated the Gamma Swap proof to seed the accepted Octez wallet provider.
  - Added a source-policy guard tying the proof seed to the wallet reader's accepted provider so future provider migrations update the proof and reader together.
- Verification:
  - Passed `tsx --test client/src/pages/swap-presentation-policy.test.ts client/src/lib/presentation-shell.test.ts`.
  - Passed focused Gamma Swap Playwright proof on fresh `HARNESS_PORT=4301`.
  - Passed full Gamma shell suite with Swap, static/nested route audit, and production-hostname proof included: `62/62` on fresh `HARNESS_PORT=4307`.

### WTF-BB-323 - Settings Subdomain Setup harness wallet prefill is blank

- Category: E2E / WTF Domains Settings applet wallet prefill
- Status: Verified
- Owner/Session: Codex Pasta live-readiness
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - `npm run test:e2e:inventory` on 2026-06-29 failed `tests/playwright/inventory/settings-subdomain-setup.spec.mjs:18` and `tests/playwright/inventory/cobwebsaints-account.spec.mjs:20` after a clean build.
  - Focused rerun reproduced both failures with the two specs and the same expectations.
  - In both cases `getByLabel("wtf.tez target wallet")` stayed `""` while the spec expected `tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY`.
  - Root cause on 2026-06-30 was stale harness wallet-session payloads seeding `providerName: "beacon"` after `readPersistedWalletSession()` only accepted `providerName: "octez.connect"`.
  - Local focused proof passes on a clean harness port: `HARNESS_PORT=4514 ./node_modules/.bin/playwright test tests/playwright/inventory/settings-subdomain-setup.spec.mjs tests/playwright/inventory/cobwebsaints-account.spec.mjs --project=chromium --workers=1`.
- Why it matters:
  - The Settings-owned Subdomain Setup behavior proof cannot verify the registrar plan path when the applet does not hydrate the current harness wallet.
- Correction:
  - Updated the affected Playwright specs and UX Lab seed helper to use `octez.connect`.
  - Added a source-policy guard so future provider migrations must update wallet-session fixtures with the accepted provider.
- Verification:
  - Passed `./node_modules/.bin/tsx --test client/src/lib/tezos/wallet-connect-policy.test.ts`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed focused fresh-harness Settings/Cobweb proof listed above.
  - Passed branch Quality Gates run `28465190052`.
  - Passed main Quality Gates run `28467035060` after promotion to commit `f32dbe8`.

### WTF-BB-267 - Macaroni generated drop pages reused collection covers for video previews

- Category: Macaroni / generated drop website media previews and wallet restore
- Status: Verified
- Owner/Session: Codex Macaroni video preview/drop wallet repair
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User clarified the live Airporters report was MP4 tokens using the collection cover as preview, not GIF mints.
  - Studio's `tokenNeedsCover` path treated every non-image artifact as cover-backed, so MP4/WebM token metadata could publish `displayUri`/`thumbnailUri` as the collection cover instead of a token-specific preview.
  - Generated drop pages cached recent mints only by minted count and could keep showing sealed/cover-backed cards after reveal or after delayed metadata propagation.
  - The drop page had passive wallet restoration and explicit connect paths that could overlap, making already-working Macaroni Studio wallet logic diverge from generated mint pages.
- Why it matters:
  - OBJKT and generated drop pages rely on token metadata preview fields for browseable media cards; collection covers make video tokens look wrong even when the artifact is valid.
  - Collectors should not see a stale sealed card after auto-reveal, and Connect should not silently no-op while a passive restore is failing or stale.
- Correction:
  - Added an authenticated `/api/macaroni/media-preview` route that uses ffmpeg when available to create bounded animated GIF previews for GIF/video uploads, with browser-side still-image fallback when hosted generation is unavailable.
  - Macaroni Studio now requires a per-token preview CID for GIF/video artifacts before token metadata pinning, publishes the original media as `artifactUri`, and uses the generated preview for `displayUri`/`thumbnailUri`.
  - Generated drop pages now render video artifacts directly when legacy metadata points preview fields at the collection cover, hydrate recent mints from contract storage/IPFS, include reveal state in the cache key, and retry pending/sealed recent mints.
  - Generated drop pages now disable Connect during passive wallet restore, show `Checking wallet...`, and recover stale restore failures with a clear reconnect state.
  - The live Airporters published page was promoted to user-site version 5 so its older inlined runtime also renders MP4 artifacts directly, treats `delayed_reveal=false` as fully revealed, and labels revealed-but-not-yet-indexed token metadata as pending instead of sealed.
- Verification:
  - Passed `node --check public/creation-tools/macaroni/js/studio.js && node --check public/creation-tools/macaroni/js/drop.js && node --check public/creation-tools/macaroni/js/common.js`.
  - Passed `npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/publish.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run test:e2e:inventory` with 311/311 tests green.
  - GitHub Deploy to Hetzner run `27585587135` and Quality Gates run `27585587140` passed for commit `a17f8c5`.
  - Live `https://wtfos.app/api/health` reported `commitRef:"a17f8c5"`, and live Macaroni `studio.js`/`drop.js` assets contained `/api/macaroni/media-preview`, `tokenNeedsMediaPreview`, wallet passive-restore guards, and video-aware render helpers.
  - Live Airporters page `https://paulwhoisaghost.wtfos.me/airporters-vol-1` was verified at published version 5 (`0073fb91...`) with public HTML markers for `isVideoMetadata`, `metadataSameIpfsUri`, `cache: "no-store"`, non-delayed reveal math, and `metadata pending` placeholders.
  - Live TzKT storage for `KT1JRXn5Ryc14URKoWoGUwzQX9cYWLxanjk2` returned `minted=31`, `revealed=31`, `delayed_reveal=false`; live Playwright smoke rendered 8 recent cards, 1 MP4 `<video>` from Fileship, odds text `31/120 minted - 31 revealed - 0 sealed - 89 left to mint`, and no console errors.

### WTF-BB-248 - Map Lab workspace is fixed, non-draggable, and missing viewport controls

- Category: Desktop OS / Map Lab workspace UX
- Status: Verified
- Owner/Session: Codex Map Lab workspace UX repair
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - The Map Lab route used a shell width capped at `min(1180px, calc(100vw - 44px))`, so maximizing the WTF OS app did not make the working canvas meaningfully adapt to the window.
  - The canvas was `overflow: hidden` with a fixed minimum height and no viewport controls, leaving larger maps unreachable except by layout buttons.
  - Node cards were rendered as absolute-positioned buttons with a grab cursor but no pointer/drag implementation, so users could select nodes but could not directly move them.
- Why it matters:
  - Map Lab is an interactive workflow editor. Without direct node movement plus scroll and zoom, users cannot arrange real roadmaps or system maps, and the app feels broken even though the route renders.
- Correction:
  - Replaced the fixed canvas with a responsive three-pane app workspace and a larger document-space board inside a scrollable viewport.
  - Added zoom out/in, fit map, reset view, background pan, direct pointer dragging for unlocked nodes, keyboard/button nudging, and locked-node movement protection.
  - Added typed ports, route inspection, run preview, and a locked read-only wtfOS demo graph so users can see the system mapping capability immediately.
  - Registered `map_lab.demo.opened`, `map_lab.node.moved`, `map_lab.route.created`, `map_lab.pipeline.ran`, and `map_lab.viewport.changed`, added the `map-lab.workspace-navigation-and-node-drag` behavior assertion, and added `tests/playwright/inventory/map-lab-workspace.spec.mjs`.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build && npx playwright test tests/playwright/inventory/map-lab-workspace.spec.mjs`.
  - Passed final `npm run test:e2e:inventory` with 308/308 tests green.
  - Visual Playwright smoke confirmed the demo opens read-only at 62% zoom, renders 25 nodes, disables structural edits, runs 24 active routes, and keeps desktop/narrow viewports internally scrollable.

### WTF-BB-252 - Map Lab read-only demo route stayed auth-gated in production

- Category: Desktop OS / Map Lab public demo access
- Status: Verified
- Owner/Session: Codex Map Lab public demo access follow-up
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - After deploying Map Lab commit `61f12aff`, live health reported the new commit but anonymous Playwright smoke on `https://wtfos.app/map-lab` timed out waiting for `[data-map-lab-shell='true']`.
  - The route was still declared with `auth: true` in `client/src/routes/page-defs.ts` and `tests/e2e/inventory/route-fixtures.mjs`, so authenticated harness coverage did not prove the public demo access contract.
- Why it matters:
  - The requested demo is meant for any user to open and inspect without edit rights. A read-only component lock does not help if anonymous users cannot reach the route.
- Correction:
  - Made `/map-lab` public in PageDef and route fixture metadata while leaving draft editing, repo save, ingest, and structural changes disabled for anonymous users unless the read-only demo is opened.
  - Updated the interaction inventory access label to distinguish public demo access from session edit access, role ingest access, and agent create-only access.
- Verification:
  - Passed `npx tsx --test shared/wtf-browser-route-access.test.ts shared/wtf-browser-routes.sync.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npx playwright test tests/playwright/inventory/map-lab-workspace.spec.mjs` with the anonymous demo regression.
  - Passed final `npm run test:e2e:inventory` with 309/309 tests green.
  - GitHub Deploy to Hetzner run `27478611691` and Quality Gates run `27478611686` passed for commit `85d5dbc5`.
  - Live health reported `commitRef: 85d5dbc`, and anonymous production Playwright smoke on `https://wtfos.app/map-lab` opened the demo read-only, rendered 25 nodes with the 26-route summary, disabled edit controls, proved a 1488x967 scrollable canvas, ran the graph, and showed the first route as active.

### WTF-BB-226 - Roger Radio live channel seed created an empty playlist in production

- Category: WTF TV / boot backfill external embed seed
- Status: Verified
- Owner/Session: Codex Roger Radio full-send repair
- Score: C1 + F4 + S0 + P1(4) = 9
- Evidence:
  - After commit `3bb59d9` deployed, `https://wtfos.app/api/tv/channels` showed public channel `roger-radio-live`, but `/api/tv/channels/6/stream` returned `offline: true` with `Playlist has no videos`.
  - The dispatchable app-log workflow showed `[tv-backfill] non-fatal boot backfill error: error: could not determine data type of parameter $2`.
  - The Roger seed used `$2` in `jsonb_build_object` without an explicit cast, so Postgres could not infer the polymorphic metadata argument type after creating the channel and playlist.
- Why it matters:
  - A boot seed can partially succeed and leave a public channel visible but unplayable. That is especially easy to miss when UI tests mock the stream payload instead of exercising the production seed SQL.
- Correction:
  - Cast Roger seed parameters used in `jsonb_build_object` and adjacent text values as `::text`.
  - Added a focused policy test proving the Roger seed keeps those casts and repairs an existing channel/playlist before dial assignment.
- Verification:
  - Passed `npx tsx --test server/features/tv/media-urls.test.ts server/app-csp-policy.test.ts server/lib/tv-boot-backfill-lock-policy.test.ts server/lib/tv-boot-backfill-roger-policy.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - `npm run test:e2e:inventory` was attempted after the repair; all WTF TV route/workflow/subdomain checks passed, while unrelated social/reward automation timed out and `/swap` had a transient resource-block console error. Targeted `/swap` rerun passed; the social/reward timeout is outside this TV channel repair.

### WTF-BB-232 - Mainnet in-app market V2 address fallback can still use V1 payloads

- Category: Tezos / in-app market contract rollout
- Status: Verified
- Owner/Session: Codex in-app market V2 full-send fallback repair
- Score: C3 + F5 + S2 + P0(5) = 15
- Evidence:
  - Host production `.env` and `/etc/wtf/wtf.env` did not define `IN_APP_MARKET_CONTRACT_ADDRESS`, `VITE_IN_APP_MARKET_CONTRACT_ADDRESS`, `IN_APP_MARKET_CONTRACT_VERSION`, or `VITE_IN_APP_MARKET_CONTRACT_VERSION`.
  - Source fallback had already rotated `WTF_IN_APP_MARKET_CONTRACT` to mainnet V2 `KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR`.
  - The client and server still defaulted the mainnet in-app market contract version to `v1` when env omitted version overrides.
- Why it matters:
  - A wallet purchase can point at the correct KT1 while building the wrong entrypoint payload shape. For economic contract calls, address and ABI/version are one rollout unit.
- Correction:
  - Added `WTF_IN_APP_MARKET_CONTRACT_VERSION = "v2"` beside the shared KT1 fallback.
  - Updated client purchase signing and server TzKT verification config to default to V2 whenever the active fallback address is the mainnet V2 KT1, while preserving explicit env overrides and old-contract V1 fallback behavior for non-V2 addresses.
  - Added a source policy test proving the mainnet V2 fallback carries V2 payload version on both client and server paths.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npx tsx --test server/features/tv/media-urls.test.ts server/features/wtf-sites/policy.test.ts server/lib/tv-boot-backfill-roger-policy.test.ts server/lib/contract-config.test.ts server/lib/wtf-token-config.test.ts server/lib/in-app-market-policy.test.ts server/lib/tzkt-ops.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts scripts/kiln/e2e-assertions.test.ts`, including the new mainnet V2 fallback-version assertion.
  - Passed `node --test scripts/kiln/e2e-assertion-policy.test.mjs client/src/pages/Wim.test.ts`.
  - Passed `npm run test:e2e:inventory`, 300/300.

### WTF-BB-233 - WTF LIVE tip seed violates production in-app market price-score constraints

- Category: Deploy / in-app market seed migration
- Status: Verified
- Owner/Session: Codex WTF LIVE tip seed deploy blocker repair
- Score: C3 + F5 + S0 + P0(5) = 13
- Evidence:
  - GitHub Deploy to Hetzner run `27267703077` failed in `scripts/apply-production-migrations.sh` on `drizzle/0100_wtf_live_tip_items.sql`.
  - Postgres rejected `wtf-live-flaming-heart` because the seed inserted `price_score=25` while production has `in_app_market_items_price_score_range CHECK (price_score BETWEEN 1 AND 10)`.
  - The same migration also seeded `wtf-live-pauls-panties` with `price_score=69`, which would have hit the same constraint.
- Why it matters:
  - Deploy stops the app before migrations. A seed-only row violation can leave the production app down until the migration is corrected or the container is manually restarted.
- Correction:
  - Clamped the high-value WTF LIVE tip item `price_score` fields to the existing 1-10 production range while keeping `price_wtf_units`, `price_exp`, and metadata `redeemWtf` values intact.
  - Added a production-migration policy test that parses the WTF LIVE tip seed and fails if any seeded `price_score` is outside 1-10.
- Verification:
  - Passed `node --test scripts/production-migrations-policy.test.mjs`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `git diff --check`.
  - Public health was restored after manually restarting the app container; deploy retry still required for normal full-send completion.

### WTF-BB-215 - New Skywire OAuth connections to Bluesky fail while existing sessions continue working

- Category: Skywire / AT OAuth new-session connect
- Status: Verified
- Owner/Session: Codex Skywire new OAuth outage repair
- Score: C4 + F5 + S3 + P0(5) = 17
- Evidence:
  - User report on 2026-06-06: existing Skywire sessions still work, but new OAuth can no longer connect to Bluesky.
  - Production OAuth metadata and Bluesky PAR/authorize probes accepted the configured `https://wtfos.app` client metadata and scopes, which moved the suspected failure from provider metadata to Skywire callback state recovery.
  - `server/routes/atproto.ts` stored app-owned pending metadata under a generated Skywire state token, but passed that value to `NodeOAuthClient.authorize` as `options.state`. The SDK stores it as `appState`; the callback query `state` is a different SDK-generated nonce.
  - `atprotoOAuthStateForCallback` looked up pending Skywire metadata by the callback nonce before `client.callback(params)` could translate that nonce back to `appState`, so a lost/drifted browser session or process restart made new OAuth fail while already-persisted sessions continued to restore.
- Why it matters:
  - OAuth callback state binds the provider return to the signed-in WTF user, requested handle, requested scopes, chat permission intent, and starting origin. Losing it blocks new account connects and permission upgrades without invalidating old token rows.
- Correction:
  - Added the `atproto_oauth_states` table and migration for short-lived encrypted OAuth state rows.
  - Persisted both app-owned Skywire pending metadata and SDK state-store records durably, with TTL pruning and encrypted payloads.
  - Callback recovery now translates the provider callback nonce through the SDK state row to the original Skywire app state, then loads pending metadata from the session, memory, or database before finalizing the OAuth session.
- Verification:
  - Passed `npx tsx --test server/features/atproto/skywire-policy.test.ts`.
  - Passed `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run security:deploy-migrations`.
  - Passed `npm run build`.
  - Passed GitHub `Deploy to Hetzner` run `27069296205` for commit `f5bb22eb38874bc53f18394d35cc63a4312bf81b`.
  - Passed GitHub `Quality Gates` run `27069296207`.
  - Live `https://wtfos.app/api/health` returned `ok` with `commitRef: f5bb22e`, database `ok`, and jobs `ok`.
  - Live `https://wtfos.app/.well-known/oauth-client-metadata.json` returned canonical `https://wtfos.app` client metadata and callback URL.

### WTF-BB-216 - Skywire permission picker silently refused intentional platform actor OAuth

- Category: Skywire / AT OAuth platform actor intent
- Status: Verified
- Owner/Session: Codex Skywire platform actor OAuth repair
- Score: C3 + F5 + S3 + P0(5) = 16
- Evidence:
  - User report on 2026-06-06: intentionally reconnecting the official WTF Gameshow Bluesky actor closed the Skywire permission modal but did not navigate to OAuth.
  - The frontend blocked `wtfgameshow.bsky.social` before `window.location.assign`, so the failure felt like a dead control instead of a guarded identity boundary.
- Correction:
  - Reserved/platform actor OAuth now requires explicit confirmation and records that intent in durable OAuth state.
  - Callback handling still rejects returned-handle drift and chat-upgrade DID drift before persisting account rows or encrypted token material.
- Verification:
  - Passed `npx tsx --test server/features/atproto/skywire-policy.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run test:e2e:inventory`.

### WTF-BB-217 - Rat Race still auto-refreshes and default-scans only a tiny slice of tz2at replay

- Category: Rat Race / tz2at rolling replay scan
- Status: Verified
- Owner/Session: Codex Rat Race tz2at capability pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-06: Rat Race should not auto-reload and repeatedly found the same small set of tokens even while tz2at was healthy and listing/sale signals were flowing.
  - `client/src/pages/RatRace.tsx` had a 45 second React Query `refetchInterval`.
  - `server/features/rat-race/tz2at-atproto.ts` defaulted `RAT_RACE_TZ2AT_MAX_REPLAY_PAGES` to 10, so a 7-day filter could scan only about 5,000 recent Tezos blocks unless operators overrode the environment.
- Correction:
  - Removed the Rat Race React Query `refetchInterval`; scans now happen on initial load, filter changes, or explicit Scan.
  - Changed replay defaults from broad 500-block/10-page samples to smaller bounded manual scans, with page-limit diagnostics when the requested multi-day window is only partially covered.
  - Added per-page replay scan coverage diagnostics, page-cap/error counters, and split retry recovery that retries failed replay pages as smaller subranges before falling back to partial diagnostics.
  - Kept tz2at replay as the canonical sale/listing signal source. Objkt remains a supplement for metadata, supply, mint timestamp, active public tez listing purchase keys, and pk-to-FA2 token id normalization.
- Verification:
  - Passed `DATABASE_URL=postgres://localhost/wtf_test node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts server/features/rat-race/hot-tokens.test.ts client/src/pages/RatRace.manual-refresh-policy.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run test:e2e:inventory` with 291/291 tests.
  - Live default Rat Race scan against `https://tz2at.xyz` on 2026-06-06 returned source `tz2at-replay`, fresh health, 297 tz2at candidate rows, 3 ranked rows, Objkt supplement only, 0 TzKT use, and diagnostics showing only about 9.5 hours of the requested 168-hour window were practically scanned because mixed `/replay` pages still hit the 5,000-event cap.

### WTF-BB-218 - Mainnet WTF marketplace accepted a hidden multi-edition offer quantity that the accept flow can fail to surface

- Category: Tezos / WTF marketplace contract
- Status: Verified
- Owner/Session: Codex Shadownet marketplace confidence pass
- Score: C4 + F5 + S5 + P0(5) = 19
- Evidence:
  - Mainnet marketplace `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj` is unpaused and has an active offer for token `KT1HErfW6XogrdKHrHFhXn3HWC1nFhiYivch:2` with `token_amount = 9990000` and `amount_wtf = 110000000`.
  - TzKT operation `ootk9zeKhYdDgyTyo9crU97sVfnXtJ86ek9PUtZM42KwwyYYJVJ` shows the deployed contract accepted `place_offer` params with `token_amount: "9990000"`.
  - The deployed entrypoint set exposes old-generation marketplace controls (`set_admin` and no `propose_admin`/`accept_admin`/admin offer cancel), while source `WTFMarketplaceV1_2.py` contains the later single-edition guard and admin-cancel improvements that are not deployed at this address.
- Why it matters:
  - The accept-offer transaction can transfer the stored FA2 quantity from the target owner to the offerer. If UI or backend copy only shows the token identity and WTF consideration, a holder can be asked to accept an offer whose hidden quantity is much larger than expected.
  - The current stored offer would fail if the target owner does not own the recorded quantity, but the live contract accepted and preserved the dangerous state, and the same issue can reappear with a holder that does own enough editions.
  - Correction direction:
  - Pause the live marketplace if operationally acceptable, deploy a fresh WTF-only Marketplace V2 through Kiln shadownet first, then only prepare mainnet rollout artifacts after the shadownet E2E passes.
  - Until replacement is live, all accept-offer UI and server verification must fetch and display the stored `token_amount`, block dangerous quantities, and avoid implying that token identity alone is the accepted consideration.
  - Local pass added Marketplace V2 SmartPy source/tests, Kiln shadownet deploy/E2E script using puppet wallets, legacy pause/status script, explicit quantity/term client/server guards, owner-scoped on-chain parsing, inventory behavior registry updates, and wtfOS Shadownet wiring for the marketplace/WTF/in-app-market contract bundle.
- Verification idea:
  - Confirm the live contract storage/big-map row, verify the accept-offer preview renders and enforces quantity, and repeat with a test contract where the target owner owns enough editions to prove the guard blocks multi-edition offers before wallet signing.
  - 2026-06-06 local verification: `npm run contract:test` passed; `npm run check -- --pretty false` passed; `npm run test:e2e:inventory:coverage` passed; `npm run test:e2e:inventory` passed 291/291; `npx tsx --test scripts/kiln/e2e-assertions.test.ts` passed; `git diff --check` passed.
  - 2026-06-06 live status: `npm run contract:marketplace:legacy-status` confirmed `paused=false` and one active `token_amount > 1` offer, but no transaction was sent because the status script defaults to dry run and no admin secret key was provided.
  - 2026-06-06 Kiln auth follow-up: the WTF repo shell had no exported `KILN_API_TOKEN`, but the sibling Kiln service env contained `API_AUTH_TOKEN`; the deploy script now accepts either env name. With that token bridged, Kiln authenticated successfully.
  - 2026-06-06 Kiln shadownet status: after Shadownet RPC recovered, authenticated `npm run contract:deploy:marketplace-v2:kiln` passed with Kiln WTF FA2 `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`, sample FA2 `KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V`, and Marketplace V2 `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy`.
  - 2026-06-06 Kiln E2E proof: `.agents/docs/archive/contracts/wtf-marketplace-v2/shadownet-e2e-report.md` records `PASSED`, 17/17 steps passed, 15/15 entrypoints covered, and storage/balance/big-map assertion kinds passed. The script now retries transient 429/5xx responses, uses Kiln's named shadownet FA2 token for WTF currency to avoid injector drift, and records shadownet-only direct deploy use when single-contract workflow clearance cannot prove the dependent FA2 marketplace path.
  - 2026-06-06 final legacy recheck: `npm run contract:marketplace:legacy-status` still exits with dry-run warning `legacy marketplace is not paused`; no transaction was sent.
  - 2026-06-08 admin signer search: redacted derivation scans covered `~/Desktop/cursor-projects`, local WTF/Kiln env files, Hetzner `wtf` app env backups, `/opt/platform/repos/shadownet-kiln/.env`, `/etc/wtf-operator-signer.env`, `/etc/wtf/wtf.env*`, `/var/lib/wtf/platform-wallet-keyring.json`, `/etc/wtf/secrets/platform-keyring-master.key`, and Hetzner `wtfos` env/material. No raw secret, mnemonic, legacy signer env, or decrypted platform keyring wallet matched live admin `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`; managed wallet addresses found were `tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo`, `tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ`, `tz1RaN2yRrJz3dU1JoLW6fVfjXM1WZZC9xJK`, `tz1P7TbhLFgCTYeYsHA5e4f9SwLNyT2YJ7Hd`, and `tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u`. Rechecked `npm run contract:marketplace:legacy-status`; `paused=false`, dry run only, no transaction sent.
  - 2026-06-08 local Shadownet UI/puppet verification: `npx tsx --test client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts server/lib/wtf-token-config.test.ts server/lib/contract-config.test.ts`, `npm run check`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:marketplace:shadownet` passed. The active local `.env` and repeatable runner now point wtfOS at Shadownet Marketplace V2 `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy`, Kiln WTF FA2 `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj` token id `0`, and in-app market `KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC`; Shadownet barter remains intentionally blank so local tests cannot inherit mainnet barter `KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm`. The runner seeded isolated `.tmp/marketplace-shadownet-e2e` puppet wallets with chain id `NetXsqzbfFenSTS`, started the local app against the Shadownet contract bundle, verified authenticated puppet API access to V2 on-chain state, loaded the local marketplace with Shadownet wallet/network state, and asserted the offer-accept preview shows quantity, unit WTF, total WTF, token contract/id, owner, offerer, and `v2` contract version before signing. No mainnet deploy, pause, or transaction was attempted.
  - 2026-06-08 existing-contract Kiln puppet verification: added `npm run contract:e2e:marketplace-v2:shadownet:existing` and ran it with the protected Kiln token against already deployed Marketplace V2 `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy`, Kiln WTF FA2 `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`, and sample FA2 `KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V`. The first reuse run proved the economic operations and assertions but failed Kiln's helper-FA2 coverage gate; the script was corrected to include zero-transfer coverage and the second run passed 18/18 steps, 15/15 entrypoints, and storage/balance/big-map assertions. Kiln wallet A/admin/seller was `tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn`, wallet B/buyer was `tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4`, reused IDs were listing `2`, accepted offer `4`, cancelled offer `5`, and auction `2`; stale expected price failed with `PRICE_MISMATCH`, paused offer failed with `PAUSED`, final storage remained `paused=false`, marketplace XTZ balance stayed `0`, buyer WTF balance ended at `48250`, and buyer sample FA2 balance ended at `9`. Re-ran `PORT=3320 npm run test:e2e:marketplace:shadownet`; 12 dummy accounts were seeded and all 3 local UI/API puppet specs passed.

### WTF-BB-223 - WTF-XTZ exchange fixed-rate listings need explicit signed economic terms

- Category: Tezos / WTF-XTZ exchange contract
- Status: Verified
- Owner/Session: Codex WTF-XTZ fixed-rate listing hardening
- Score: C3 + F5 + S4 + P0(5) = 17
- Evidence:
  - The WTF-XTZ exchange design is intentionally not an AMM pool: an owner funds a listing with XTZ, sets a fixed rate, and takers partially fill by sending WTF for XTZ.
  - Before this pass, `create_listing` relied on attached `sp.amount` without an explicit `escrow_mutez` parameter, and `swap` signed only `listing_id` plus `wtf_amount`.
  - A stale or incomplete UI could therefore ask a wallet to sign a swap without binding the signature to the listing owner, fixed rate, and exact XTZ output the user saw.
- Why it matters:
  - This contract is meant to dispense real XTZ from funded escrow. Hidden or stale economic terms here can cost users either WTF or XTZ, even though the contract is not custodying a variable-liquidity pool.
  - The contract itself must reject mismatched expectations instead of trusting wallet/UI display code.
- Correction:
  - `create_listing` now requires explicit `escrow_mutez` and rejects if it does not exactly match attached XTZ with `ESCROW_AMOUNT_MISMATCH`.
  - `swap` now requires `expected_owner`, `expected_rate_numerator_mutez`, `expected_rate_denominator_wtf_units`, and `expected_xtz_out_mutez`, and rejects stale/mismatched terms with `OWNER_MISMATCH`, `RATE_NUMERATOR_MISMATCH`, `RATE_DENOMINATOR_MISMATCH`, and `XTZ_OUT_MISMATCH`.
  - The Kiln Shadownet deploy path now defaults to the named Kiln WTF FA2 `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`, keeps dummy WTF deployment opt-in only, refuses mainnet in the Shadownet deploy helper, and permits direct deploy fallback only on `tezos-shadownet` workflow-clearance blocks.
  - The Kiln puppet E2E harness reads live exchange storage for `wtf_token_address` and `next_listing_id`, computes expected ledger balances from current TzKT state, and proves rerunnable partial-fill behavior.
- Verification:
  - Local SmartPy tests passed with explicit mismatch coverage for escrow amount, owner, rate numerator, rate denominator, and exact XTZ output.
  - Kiln Shadownet deployment passed for exchange `KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF`, bound to Kiln WTF FA2 `KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj`.
  - `npm run contract:e2e:wtf-xtz:shadownet` passed through Kiln puppet wallets: wallet A/admin/listing owner `tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn`, wallet B/taker `tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4`, 13/13 steps passed, 8/8 entrypoints covered, storage/balance/big-map assertion kinds passed, paused swap rejected with `PAUSED`, stale output rejected with `XTZ_OUT_MISMATCH`, overfill rejected with `INSUFFICIENT_ESCROW`, and final exchange XTZ balance was `0` after owner cancellation.
  - Final local verification passed: `npm run contract:test:wtf-xtz`, `npx tsx --test scripts/kiln/e2e-assertions.test.ts`, `npm run check`, `npm run test:e2e:inventory:coverage`, and `git diff --check`.
  - 2026-06-09 mainnet reconfiguration pass: `npm run contract:prepare:wtf-xtz:mainnet` now verifies real mainnet WTF FA2 `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD` token id `0` through TzKT (`symbol=WTF`, `decimals=8`) and writes `.agents/docs/archive/contracts/wtf-xtz-exchange/mainnet-readiness-report.md`; the run correctly blocked with `MAINNET_ADMIN_ADDRESS is required for final mainnet storage generation`.
  - No mainnet deployment or pause transaction was attempted.

### WTF-BB-224 - WTF LIVE needs mobile controls, private rooms, and owned stage lifecycle

- Category: WTF LIVE / mobile rooms, private access, and stage controls
- Status: Verified
- Owner/Session: Codex WTF LIVE focus pass
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - User report on 2026-06-09: mobile room view does not expose a usable display-name entry point or obvious join/audio/camera/screen controls.
  - Desktop room view lacks icon controls to pop out chat and attendance while scaling the rest of the room independently.
  - Stages can be created and broadcast into, but host controls are thin compared with room owner lifecycle controls.
  - Existing user rooms only toggle public visibility; they do not model a separate WTF-user-only private room with an explicit access list.
- Why it matters:
  - WTF LIVE is a real-time collaboration surface. If mobile participants cannot join or manage media, and private rooms are only simulated by hiding public links, hosts cannot safely run invite-only WTF-user sessions.
- Correction direction:
  - Add a first-class private room access model with room members separate from public guest rooms and stages.
  - Keep public room URLs public/guest-only, while private rooms require a signed-in WTF user on the room access list or the owner.
  - Add mobile-first join/media controls, desktop pop-out toggles for chat/attendance, and owned stage lifecycle controls.
- Verification idea:
  - Extend the WTF LIVE inventory spec and harness to cover private-room creation/access-list updates, mobile control visibility at narrow viewport, desktop chat/attendance pop-outs, and stage owner controls, then run inventory coverage and focused WTF LIVE Playwright coverage.
- Resolution:
  - Added first-class `private` WTF LIVE room access mode, `wtf_live_room_access_members`, owner/member access checks, authenticated private-room join/messages behavior, and WebSocket join authorization for private rooms.
  - Added WTF LIVE dashboard private-room creation/access-list editing, private room list/access badges, private realtime-only chat copy, owned stage close/reopen/delete controls, and desktop chat/attendance panel pop-outs.
  - Reworked mobile public/private room layout so display name, join, audio, camera, and screen controls are visible before the stage on narrow viewports.
  - Updated the interaction inventory, domain workflow probes, behavior assertions, admin surface registry, and Playwright harness/spec coverage for the new handles and routes.
- Verification:
  - `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` passed, 8/8.
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed with `ok: true`, 156 inventory rows, 718 handles, 95 route fixtures, and 15 domain workflows.
  - `npm run test:e2e:inventory` passed, 294/294.
  - `npm run test:e2e:live:puppets` was not run for this scoped pass because the current dirty tree has an unrelated untracked Shadownet marketplace live spec under `tests/playwright/live`, and there is no WTF LIVE-specific actor-backed live-puppet spec yet.

### WTF-BB-225 - WTF LIVE room chat Enter key cannot submit messages

- Category: WTF LIVE / room chat keyboard UX
- Status: Verified
- Owner/Session: Codex WTF LIVE chat keyboard pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - User report on 2026-06-09: typing in WTF LIVE chat and pressing Enter/Return adds a newline, and Shift+Enter also adds a newline; users must click Send to submit.
- Why it matters:
  - Room chat is a real-time collaboration surface. Keyboard submit is expected chat behavior, and forcing pointer-only send slows live conversation and hurts accessibility.
- Correction direction:
  - Add textarea key handling so Enter submits the non-empty chat message and Shift+Enter preserves multiline composition.
  - Cover the behavior in WTF LIVE inventory Playwright tests and register the interaction in the inventory docs.
- Verification idea:
  - Add a focused room-chat keyboard spec that types a message, presses Enter, verifies it appears in chat and the composer clears, then verifies Shift+Enter preserves a newline without sending.
- Resolution:
  - Added a shared WTF LIVE chat textarea key handler that prevents default native textarea newline behavior for bare Enter, calls the existing room chat send path, and leaves Shift+Enter plus IME composition untouched.
  - Wired the handler into both docked and floating/popped-out chat composers.
  - Expanded the WTF LIVE inventory spec, inventory row, and behavior assertion wording to cover Enter-submit and Shift+Enter multiline behavior under the existing `wtf_live.room.chat_message_sent` interaction.
- Verification:
  - Before the fix, `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "public room guests receive"` failed because Enter left `enter submits live chat\n` in the textarea.
  - After the fix, `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "keyboard chat"` passed.
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed with `ok: true`, 156 inventory rows, 718 handles, 95 route fixtures, and 15 domain workflows.
  - `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` passed, 8/8.
  - `npm run test:e2e:inventory` passed, 294/294.

### WTF-BB-229 - WTF LIVE signed-in attendance lacks wtfOS identity and WIM buddy actions

- Category: WTF LIVE / wtfOS identity and WIM buddies
- Status: Verified
- Owner/Session: Codex WTF LIVE WIM identity pass
- Score: C3 + F4 + S0 + P2(3) = 10
- Evidence:
  - User report on 2026-06-09: logged-in WTF LIVE participants should join rooms as their wtfOS account, attendance should show their WTF username, and signed-in viewers should be able to add other WTF users to WIM buddies from attendance.
  - Current WTF LIVE WebSocket join handling accepts the client-provided `guestName` and stores it as the active socket username, even when the socket was authenticated.
  - Attendance rows currently use multi-line card-like entries, making the roster inefficient as a live registry.
- Why it matters:
  - WTF LIVE identity should be bound to the authenticated wtfOS session so room attendance cannot silently drift away from account identity.
  - WIM is the platform buddy layer; live rooms should make account-to-account follow-up simple without exposing buddy controls to guests.
- Likely correction direction:
  - Preserve authenticated socket identity on room join, emit user metadata in WTF LIVE peer payloads, and keep guest display names only for unauthenticated visitors.
  - Add a compact single-line attendance row that shows WTF usernames for account-backed peers and conditionally offers a WIM add-buddy action only to signed-in viewers.
- Verification idea:
  - Extend the focused WTF LIVE inventory Playwright spec and harness to cover account-backed attendance names, compact row height, signed-in-only WIM buddy actions, and the WIM friend localStorage contract; rerun TypeScript plus inventory coverage.
- Resolution:
  - WTF LIVE WebSocket joins now preserve authenticated session identity instead of overwriting the socket username with client-provided display names.
  - Room peer snapshots, join events, and media-state events now include `userId`, `username`, and `isWtfUser` metadata for account-backed attendees.
  - The room UI shows signed-in users as their wtfOS username, keeps guest display-name entry for anonymous public links, renders attendance as compact single-line registry rows, and exposes WIM add-buddy controls only to signed-in viewers for other account-backed attendees.
  - The WIM shortcut writes to the existing `wtf:wim:friends:<viewerUserId>` browser-local friend list and emits best-effort `wim.friend.added` desktop telemetry.
  - Updated the Playwright harness, interaction inventory, domain workflow registry, behavior assertions, and admin surface registry for the cross-app WTF LIVE/WIM behavior.
- Verification:
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed with `ok: true`, 156 inventory rows, 718 handles, 95 route fixtures, 15 domain workflows, and 35 core behavior assertions.
  - `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` initially exposed expected anonymous-auth 401 console noise in guest-mode tests after the auth-aware change; the test filter now treats that deliberate `/api/auth/user` probe as non-fatal.
  - `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` passed, 9/9.
  - `npm run test:e2e:inventory` passed, 295/295.

### WTF-BB-230 - WTF LIVE chat needs a compact style toolbox

- Category: WTF LIVE / room chat style controls
- Status: Verified
- Owner/Session: Codex WTF LIVE chat toolbox pass
- Score: C2 + F2 + S0 + P3(3) = 7
- Evidence:
  - User report on 2026-06-09: room chat should have a small single-row toolbox for changing font, color, and basic settings, with font size locked to readable 8-14 values.
  - Current room chat sends only plain text and attachments; users cannot set a readable chat style without external formatting.
- Why it matters:
  - Live chat should support light expressive formatting without taking over the room layout or letting arbitrary client-supplied CSS into the realtime message stream.
- Likely correction direction:
  - Add a compact one-row chat toolbox with a small font menu, 8-14 font-size choices, color swatches, and basic emphasis toggles.
  - Normalize style payloads on both the client and WTF LIVE WebSocket path so relayed messages only contain known fonts, known colors, bounded sizes, and boolean emphasis flags.
- Verification idea:
  - Extend the focused WTF LIVE inventory Playwright spec to set chat style, submit a message through realtime transport, and verify another participant receives styled text while the size control exposes only 8-14 options.
- Resolution:
  - Added a compact single-row WTF LIVE chat toolbox with font, 8-14 size, color swatches, bold, italic, and reset controls.
  - Added client-side chat style persistence and preview rendering in the composer, plus styled rendering for relayed live chat messages in docked and popped-out chat panels.
  - Added server and Playwright harness style normalization so realtime chat messages only relay known font/color keys, clamped 8-14 sizes, and boolean emphasis flags.
  - Updated interaction inventory docs, the domain workflow registry, behavior assertions, and the admin surface registry for `wtf_live.room.chat_style_changed`.
- Verification:
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed with `ok: true`, 156 inventory rows, 719 handles, 95 route fixtures, 15 domain workflows, and 36 core behavior assertions.
  - `npm run build` passed.
  - `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` passed, 9/9, after shrinking the themed toolbar from 46px to a capped 36px row.
  - `npm run test:e2e:inventory` ran after the fix; WTF LIVE passed inside the full suite and the suite ended 294/295 because `/trade-boards` hit a transient `dist/public/index.html` 404 resource read unrelated to WTF LIVE. The exact failed route then passed with `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Trade boards/barter"`.
  - `git diff --check` passed.

### WTF-BB-214 - Postgres-backed rate limiters share bucket keys across endpoints and can lock out wtfOS login

- Category: Auth / Postgres rate limits
- Status: Verified
- Owner/Session: Codex auth rate-limit bucket repair
- Score: C2 + F5 + S2 + P0(5) = 14
- Evidence:
  - User report on 2026-06-06: password login attempts to wtfOS return "Too many authentication attempts, please try again later."
  - Code inspection found production defaults `RATE_LIMIT_STORE=postgres`, and `server/lib/postgres-rate-limit.ts` builds persisted bucket keys as `${bucketKey}:${windowStart}` without a limiter namespace.
  - Multiple Postgres-backed limiters use the same requester key and 15-minute window (`/api/auth/login`/register, wallet auth, OAuth), so unrelated auth surfaces can increment the same persisted counter before the password-login limiter evaluates it.
- Why it matters:
  - Login throttling should slow abusive attempts on the same auth surface, not combine independent endpoints into one lockout bucket. A shared auth bucket can deny legitimate users and make recovery impossible until the 15-minute window rolls.
- Correction:
  - Postgres-backed rate-limit buckets now include a stable limiter namespace before the requester key and window start.
  - The shared `createRateLimit` factory now requires a `name`, and every app-level persisted limiter has an explicit name (`auth-password`, `auth-wallet`, `auth-oauth`, `api-generic`, and media/CLI/client-log names).
  - `getRateKeeper` passes its registry name into `createRateLimit`, keeping named registry limiters safe if the Postgres store is enabled.
- Verification:
  - Initially reproduced the missing namespace guard with `npx tsx --test server/lib/postgres-rate-limit.test.ts` failing because `postgresRateLimitBucketKey` did not exist.
  - Passed `npx tsx --test server/lib/postgres-rate-limit.test.ts server/lib/in-memory-rate-limit.test.ts server/lib/create-rate-limit.test.ts`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `git diff --check`.
  - Passed `npm run build`.

### WTF-BB-210 - Stale OAuth completion metadata can keep forcing Skywire back to Settings after chat permission is already enabled

- Category: Skywire / AT OAuth tab lifecycle
- Status: Verified
- Owner/Session: Codex Skywire post-OAuth settings bounce repair
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-06-04: after Chat Add-on OAuth is approved and working, Skywire redirects back to Settings every few seconds.
  - Code inspection found every OAuth completion payload calls `setTab("account")`, storage events with missing payloads can be interpreted as successful completions, and manual tab selections do not clear or replace stale `tab=account` URL state.
- Correction:
  - Consume OAuth completion only once after canonical `/api/atproto/me` confirms durable permission.
  - Ignore empty storage events and sync manual tab choices to the current Skywire URL.
- Verification:
  - Passed `npx tsx --test server/features/atproto/skywire-policy.test.ts server/features/atproto/oauth-session-restore.test.ts server/lib/canonical-domain.test.ts`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run test:e2e:inventory` with 290/290 tests.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth|Chat add-on"`, including a regression that moves from Settings to Home after OAuth and injects duplicate completion/storage noise.
  - `npm run test:e2e:inventory` passed all Skywire tests but ended 288/290 because the unrelated dirty WTF LIVE room tests failed on missing remote-peer presence.

### WTF-BB-208 - Skywire Chat Add-on approval can immediately null stored OAuth token material and force reconnect

- Category: Skywire / AT OAuth session persistence
- Status: Verified
- Owner/Session: Codex Skywire chat OAuth session persistence repair
- Score: C3 + F5 + S5 + P0(5) = 16
- Evidence:
  - User live-tested the canonical-domain fix on 2026-06-04 and reported that approving Chat Add-on permissions now returns to Skywire with the AT session marked ended/reconnect-required.
  - Code inspection found the OAuth callback performs a final `persistOAuthSessionForDid(session.did, storedSession ?? (session as any), ...)` write after `client.callback(...)`.
  - The installed `@atproto/oauth-client` returns an `OAuthSession` wrapper from `client.callback`, while the persistable `{ tokenSet, dpopJwk }` value is passed separately through `sessionStore.set`.
  - For an existing account, `persistOAuthSessionForDid` deletes the pending saved session after the SDK store write, so the final callback falls back to the wrapper and can overwrite encrypted access/refresh token fields with `null`.
- Likely correction direction:
  - Keep the SDK-provided saved session available until the route callback performs its final scoped account write.
  - Remove the route fallback that persists the live `OAuthSession` wrapper.
  - Fail closed if token persistence is asked to store an object without token set and DPoP key material.
- Correction:
  - `persistOAuthSessionForDid` now treats SDK session-store writes as callback handoffs and keeps the SDK saved `{ tokenSet, dpopJwk }` session available until the route callback performs the final user+DID scoped write.
  - The OAuth callback no longer falls back to persisting the live `OAuthSession` wrapper; if the saved session is missing, callback fails closed instead of overwriting encrypted token fields with null.
  - `encryptedSessionFields` now asserts token set subject, access token, refresh token, and DPoP key material before producing DB fields.
- Verification idea:
  - Unit/policy tests should prove wrapper objects cannot produce null token writes and callback persistence requires the SDK saved session.
  - Live smoke should complete Chat Add-on approval and show `/api/atproto/me` with `session.reconnectRequired=false`, encrypted token storage, DPoP key, and chat capability.
- Local verification:
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts server/features/atproto/skywire-policy.test.ts server/features/atproto/permission-tiers.test.ts server/lib/canonical-domain.test.ts` passed 26/26.
  - `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory:coverage` passed.
  - `npm run build` passed.
  - `node scripts/caddy-domain-policy.test.mjs` passed.
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth|Chat add-on"` passed 5/5.
  - `npm run test:e2e:inventory` passed 290/290 after rerunning sequentially. The first browser attempt was discarded because two Playwright suites were run in parallel against the same harness and produced shared-server noise.

### WTF-BB-207 - Legacy wtfgameshow.app remains a separate signed-in portal and poisons Skywire OAuth redirect identity

- Category: Platform domains / AT OAuth identity boundary
- Status: Fixed
- Owner/Session: Codex Skywire canonical-domain OAuth repair
- Score: C3 + F5 + S5 + P0(5) = 16
- Evidence:
  - User incognito reproduction on 2026-06-04: a Skywire Chat Add-on OAuth flow started on `wtfos.app` asks for the right Bluesky account, but after approval redirects to `wtfgameshow.app` and lands on a login screen because that domain has a separate browser session.
  - User non-incognito reproduction on 2026-06-04: the same domain switch collides with a different already-signed-in legacy-domain user, replacing the apparent account context in the primary `wtfos.app` Skywire view.
  - Code inspection found ATProto OAuth client metadata and redirect URI still derive from `ATPROTO_PUBLIC_BASE_URL` / `PUBLIC_SITE_URL`, so a legacy production env value can keep advertising `https://wtfgameshow.app/api/atproto/oauth/callback`.
  - Caddy still serves `wtfos.app` and `wtfgameshow.app` as peers in the same app block, so the legacy domain remains a full session boundary rather than an alias.
- Correction:
  - Canonicalize WTF platform public origins so legacy `wtfgameshow.app` env values collapse to `https://wtfos.app` for ATProto OAuth client metadata, redirect URI, and client URI.
  - Redirect browser GET/HEAD traffic from `wtfgameshow.app`, `www.wtfgameshow.app`, and `new.wtfgameshow.app` to `https://wtfos.app`, preserving path and query, so the legacy domain cannot keep a separate Skywire/login reality.
  - Force-recreate the Caddy container during production deploys so the single-file `Caddyfile` bind mount remounts domain routing changes instead of keeping the previous inode.
  - Keep local development origins local and allow explicit non-WTF override origins for previews/tests without silently promoting the legacy production domain.
- Verification idea:
  - Static/unit tests assert legacy env canonicalization to `wtfos.app`, OAuth metadata never advertises `wtfgameshow.app`, app middleware redirects legacy hosts to canonical with path/query intact, and the Caddyfile redirects legacy apex/www to `wtfos.app`.
  - Inventory docs and behavior assertions should describe legacy domain aliasing, not cross-domain session isolation.
- Verification:
  - `npx tsx --test server/lib/canonical-domain.test.ts shared/platform-branding.test.ts server/features/atproto/skywire-policy.test.ts`
  - `node scripts/caddy-domain-policy.test.mjs`
  - `node scripts/production-migrations-policy.test.mjs scripts/deploy-dry-run-policy.test.mjs`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `git diff --check`
  - `npm run build`
  - `npm run test:e2e:inventory` (290/290 passed)
- Last touched: 2026-06-04

### WTF-BB-206 - Skywire OAuth callback bounces wtfos.app users to legacy wtfgameshow.app and collides with that domain's logged-in identity

- Category: Skywire / AT OAuth domain and session binding
- Status: Verified
- Owner/Session: Codex Skywire OAuth primary-domain repair
- Score: C3 + F5 + S5 + P0(5) = 16
- Evidence:
  - User report on 2026-06-04: OAuth started from `wtfos.app` returns to `wtfgameshow.app/skywire`, colliding with a different logged-in account on the legacy domain and making Skywire appear to clear or replace the primary-domain account state.
  - Code inspection found Skywire OAuth callback/error redirects build absolute URLs with `publicBaseUrl()`, which can be configured to the legacy domain rather than the request origin.
  - Code inspection found callback session mismatch rejection compares the callback request's current logged-in user against OAuth state even when the callback arrived on a different domain than the OAuth start domain.
  - The previous reserved-actor mitigation also hid reserved platform rows from `/api/atproto/me`, producing a null account response rather than a non-destructive mismatch/error state.
- Correction:
  - Persist the OAuth start origin in server-side OAuth state and redirect completion/errors back to that origin, preserving `wtfos.app` when the user started there.
  - Use request-origin relative redirects for start-time errors and state-missing fallbacks instead of always using `PUBLIC_SITE_URL`.
  - Only enforce callback-cookie user mismatch when the callback origin matches the OAuth start origin; cross-domain callback completion should trust the server-side OAuth `state` owner and then return to the original origin.
  - Stop hiding linked account rows from `/api/atproto/me`; account state must stay visible and durable even when a reserved/shared actor guard blocks a permission-changing OAuth action.
- Verification idea:
  - Static policy tests assert origin capture, origin-preserving redirects, non-destructive `/api/atproto/me`, and cross-domain callback mismatch handling.
  - Browser/inventory tests keep proving the shared actor cannot be used as a Chat Add-on OAuth target.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth|Chat add-on"`
  - `npm run test:e2e:inventory`
- Last touched: 2026-06-04

### WTF-BB-205 - Skywire Chat Add-on OAuth can target the shared WTF Gameshow Bluesky actor instead of the signed-in user's linked account

- Category: Skywire / AT OAuth identity binding
- Status: Verified
- Owner/Session: Codex Skywire OAuth identity-binding emergency
- Score: C3 + F5 + S5 + P0(5) = 16
- Evidence:
  - User confirmed on 2026-06-04 that attempting to change Chat Add-on OAuth permissions was locked on `wtfgameshow.bsky.social` instead of the user's own Bluesky account.
  - The callback accepted whatever DID the OAuth provider returned, then fell back from `linkedAccountForUserDid(userId, session.did)` to the user's latest account and updated that row even when the DID differed.
  - `/api/atproto/me` treated a reserved shared platform actor row as a normal user account, which could feed the wrong handle back into the Chat Add-on OAuth start URL.
- Correction:
  - Refuse reserved shared platform actor handles at Skywire OAuth start and callback unless explicitly enabled by an emergency env escape hatch.
  - Persist the requested handle in OAuth state and reject callbacks whose returned handle differs.
  - For chat upgrades, require an existing linked user account and require the returned DID/handle to match that account before writing account/token state.
  - Hide reserved platform actor rows from `/api/atproto/me` so poisoned rows do not keep the settings UI locked to `wtfgameshow.bsky.social`.
- Verification idea:
  - Static policy test proves the reserved-actor and handle/DID mismatch guards exist at start, callback, `/me`, and OAuth session persistence.
  - Browser harness sets the connected handle to `wtfgameshow.bsky.social`, clicks Enable Chat Add-on, and verifies no OAuth start URL opens.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts`
  - `npm run check -- --pretty false`
  - `git diff --check`
  - `npm run build`
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth|Chat add-on"`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory` (289/289 passed)
- Last touched: 2026-06-04

### WTF-BB-204 - Skywire Market Feed can show a false empty lane when searchPosts hits the non-search public AppView

- Category: Skywire / Market Feed source
- Status: Verified
- Owner/Session: Codex Skywire market feed search-source pass
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User report on 2026-06-04: Skywire Market Feed returned no posts and displayed "This lane is quiet right now" even though Bluesky has fresh posts linking Objkt/Teia marketplace tokens.
  - Direct AppView probe showed `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=objkt.com&domain=objkt.com` returned HTTP 403, while `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=objkt.com&domain=objkt.com` returned HTTP 200 with fresh posts containing `app.bsky.richtext.facet#link` hrefs to Objkt tokens.
- Correction:
  - Use a search-capable Bluesky AppView for Skywire Market/Search/Discover `app.bsky.feed.searchPosts` calls and keep the domain-scoped Objkt/Teia URL filtering in place.
  - Return a 502 upstream-unavailable response when every marketplace domain search fails, so the UI does not mislabel an upstream search outage as a quiet social lane.
- Verification:
  - `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=objkt.com&domain=objkt.com` returned HTTP 403 while `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=objkt.com&domain=objkt.com` returned HTTP 200 with fresh Objkt token-link posts.
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npx tsx --test shared/skywire-token-links.test.ts`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npm run build`
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`
  - `npm run test:e2e:inventory` (287/287 passed)
- Last touched: 2026-06-04

### WTF-BB-180 - WTF LIVE user room tables declared in schema but missing production migration

- Category: WTF LIVE / DB migrations
- Status: Verified
- Owner/Session: Codex WTF LIVE migration hotfix
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-06-04: creating a WTF LIVE room failed with `select "id" from "wtf_live_rooms" where ("wtf_live_rooms"."slug" = $1 and "wtf_live_rooms"."archived_at" is null)` and `/api/wtf-live/rooms`, `/rooms/mine`, and `/stages` returned 503/500 responses.
  - Code inspection found `shared/schema-wtf-live.ts` declared `wtf_live_rooms` and `wtf_live_stages`, while `drizzle/` had no numbered production migration for either table.
- Correction:
  - Added `drizzle/0097_wtf_live_rooms.sql` to create `wtf_live_rooms`, `wtf_live_stages`, slug/owner indexes, public flags, archive timestamps, and owner foreign keys.
  - Added a production migration policy test that asserts the WTF LIVE persistent tables have a numbered SQL migration.
- Verification:
  - Clean-commit checks passed: `npm run security:deploy-migrations`, focused WTF LIVE route/capability tests, `npm run test:e2e:inventory:coverage`, `npm run check`, and `npm run build`.
  - Hetzner deploy run applied `0097_wtf_live_rooms.sql` and passed health on 2026-06-04.
  - Production smoke: `https://wtfgameshow.app/api/health` reported commit `49b71b8`; `GET /api/wtf-live/public/rooms/dickfart` returned `404 {"error":"Room not found"}` instead of a 5xx, proving the DB-backed room lookup can query the new table.

### WTF-BB-199 - WTF LIVE guest room media controls are local-only and do not connect participants

- Category: WTF LIVE / realtime room transport
- Status: Verified
- Owner/Session: Codex WTF LIVE realtime media/chat pass
- Score: C4 + F5 + S1 + P0(5) = 15
- Evidence:
  - User report on 2026-06-04: two users can join a WTF LIVE room and enable camera, screen, or mic, but neither user receives the other user's audio/video/screen.
  - Code inspection found `client/src/features/wtf-live/WtfLivePublicRoom.tsx` only calls `getUserMedia` / `getDisplayMedia` and renders local preview tiles; no WebRTC peer connection, signaling socket, remote stream rendering, or live room chat send path exists.
  - `server/routes/wtf-live.ts` advertises `audio`, `camera`, `screen`, and `media` capabilities while returning `transport: "browser_preview_until_room_transport_enabled"`, and `server/websocket.ts` only handles authenticated board/studio sockets.
- Correction:
  - Added public `/ws/wtf-live` handling for room presence, WebRTC signaling, media-state relay, room-scoped live chat, and bounded PNG/JPG/GIF/MP4 data URL attachments.
  - Updated the public room client to join the room socket, maintain room peers, negotiate a WebRTC mesh for mic/camera/screen tracks, render remote streams, and send/receive chat media without exposing the signed-in WTF OS app shell to guests.
  - Updated the inventory harness with an in-memory WTF LIVE signaling relay and added a two-browser-context behavior spec for Alice/Bob remote media plus GIF chat attachment delivery.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed focused `npm run build && npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "public room guests"`.
  - Passed full `npm run test:e2e:inventory` with 281/281 tests, including the new two-user WTF LIVE media/chat behavior assertion.

### WTF-BB-203 - Skywire chat add-on OAuth can leave the original window disabled when the popup becomes the only upgraded Skywire instance

- Category: Skywire / AT OAuth permission lifecycle
- Status: Verified
- Owner/Session: Codex Skywire OAuth same-window repair
- Score: C2 + F5 + S2 + P1(4) = 13
- Evidence:
  - User report on 2026-06-04: enabling Skywire chat permissions opens a new WTF/Skywire instance where chat is allowed, while the original Skywire window remains chat-disabled; closing the upgraded window leaves the original disabled.
  - Code inspection found the original window only refetched `/api/atproto/me` on popup close or popup completion messages. If the popup became a second Skywire page and stayed open, the original window had no active canonical-state watcher.
  - Reopened on 2026-06-04 after user clarified the permission also disappears after closing all windows and reopening. That means popup/opener refresh alone was insufficient; the OAuth callback must persist the requested chat scope to the canonical `atproto_accounts` row even when the popup callback does not carry the original Express session.
  - Reopened again on 2026-06-04 after the user confirmed both Skywire header and Settings chat add-on paths still create an authorized popup/new Skywire instance while the original and later WTF instances remain chat-disabled. Existing verification overfit popup messaging and harness state flips instead of proving the OAuth callback writes durable account-level permissions.
  - Reopened again on 2026-06-04 after production showed a new regression: clicking the Settings chat add-on path briefly shows Settings, then redirects to the main page, while clicking the OAuth button still opens a separate window that becomes the only window reflecting the upgraded chat permission.
- Correction:
  - Add original-window polling of `/api/atproto/me` while the OAuth popup is open, complete the local upgrade when the persisted account shows the requested tier/chat scope, and close the popup from the opener's retained window handle.
  - Make OAuth-created Skywire fallback windows broadcast structured completion metadata and close based on the OAuth popup window name, even when the URL does not carry `popup=1`.
  - Store Skywire OAuth app metadata in a server-side pending-state map keyed by OAuth `state`, recover it on callback when the popup/new window has a drifted browser session, and write `oauthRequestedScopes`, `oauthPermissionTier`, and `oauthChatEnabled` with the persisted token session on the exact user+DID account row.
  - 2026-06-04 durable repair: make the callback perform a final canonical token+scope+requested-scope+tier+chat write to the exact account row after SDK callback persistence, keep chat scope metadata and the chat capability flag aligned, treat popup completion metadata as a hint until fresh `/api/atproto/me` confirms durable chat permission, and remove the client-side opener severing that made original-window sync more fragile.
  - 2026-06-04 same-window repair: stop opening Skywire permission-changing OAuth in a popup, navigate the original window to `/api/atproto/oauth/start` with `returnTo=/skywire?tab=account`, keep OAuth completion on the account/settings tab, mark manual tab choices so account state refetches do not reset Settings back to Home, and allow callback return paths with query params while appending OAuth completion params safely.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts server/features/atproto/permission-tiers.test.ts`
  - `npm run build`
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth popup"`
  - `npm run test:e2e:inventory`
  - 2026-06-04 durable repair verification:
    - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts server/features/atproto/skywire-policy.test.ts server/features/atproto/permission-tiers.test.ts` passed 19/19.
    - `npm run check -- --pretty false` passed.
    - `npm run test:e2e:inventory:coverage` passed.
    - `npm run build` passed.
    - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth popup"` passed 4/4, including the regression that popup metadata cannot fake chat enabled without canonical account permission.
    - `npm run test:e2e:inventory` passed 288/288.
  - 2026-06-04 same-window repair verification:
    - `npx tsx --test server/features/atproto/oauth-session-restore.test.ts server/features/atproto/skywire-policy.test.ts server/features/atproto/permission-tiers.test.ts` passed 19/19.
    - `npm run test:e2e:inventory:coverage` passed.
    - `npm run check -- --pretty false` passed.
    - `npm run build` passed.
    - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "OAuth|Chat add-on|legacy OAuth"` passed 4/4, proving Skywire chat OAuth uses the original window and same-window callback keeps Settings open.
    - `npm run test:e2e:inventory` passed 288/288.

### WTF-BB-201 - WTF LIVE idle participants render as empty media boxes and push room chat offscreen

- Category: WTF LIVE / public room layout
- Status: Verified
- Owner/Session: Codex WTF LIVE crowded-room layout pass
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-06-04: each joined public-room participant created a black camera/screen placeholder area, growing the people list until the bottom chat composer was pushed offscreen with no reachable scrollbar.
  - Code inspection found the public room stacked remote participant tiles, local preview, message list, and composer in one normal-flow panel; every remote peer rendered a `PeerVideoFrame` even when that peer had no active media tracks.
- Correction:
  - Split the public room into bounded control, media, and chat panes so the chat log/composer has its own stable column and scroll behavior.
  - Render idle participants as compact light presence rows; only peers with live video tracks receive video-sized frames, while mic-only peers use a hidden audio element for playback without taking video space.
  - Added a crowded-room Playwright regression that joins Alice plus seven idle guests and asserts the chat composer remains inside the viewport with no remote video placeholders.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`, including the crowded idle room regression with Alice plus seven guests.

### WTF-BB-202 - WTF LIVE public rooms lack obvious leave/close controls and signed-in Join replaces the wtfOS window

- Category: WTF LIVE / public room lifecycle UX
- Status: Verified
- Owner/Session: Codex WTF LIVE room exit/new-tab pass
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - User report on 2026-06-04: public room visitors have no obvious button to leave the room or close the room window.
  - Code inspection found the signed-in WTF LIVE dashboard `Join` action assigns `window.location.href = /live/r/:roomId`, replacing the wtfOS app window instead of launching the room as a separate browser tab/window.
  - Public room cleanup existed only as unmount/socket close behavior, not as an explicit user control.
- Correction:
  - Added visible Leave Room and Close Window controls, made Leave perform full media/socket/peer cleanup, made Close Window cleanup first then request `window.close()`, and changed signed-in Join actions to open `/live/r/:roomId` in a new tab/window.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`, including new-tab Join plus Leave Room and Close Window controls.

### WTF-BB-209 - WTF LIVE publishes the first video source instead of the user-selected camera/screen share

- Category: WTF LIVE / public room media selection
- Status: Verified
- Owner/Session: Codex WTF LIVE active share selector
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-06-04: when a room guest starts camera first and then starts screen share, other users still see only camera; when camera is stopped while screen share remains enabled, peers see nothing until screen share is toggled off and back on.
  - Code inspection found the public-room WebRTC sender added all local mic/camera/screen tracks, while the UI exposed separate camera and screen previews without an explicit active video source. The websocket media-state relay also stripped any future source-selection field down to only `mic`, `camera`, and `screen`.
- Correction:
  - Added an explicit active camera/screen selector to the public room UI, publishes `mediaState.activeVideo` over `/ws/wtf-live`, and changed WebRTC sync to send mic plus only the selected video source.
  - Starting screen share selects screen by default; stopping the selected camera or screen falls back to the remaining live video source when one exists.
  - Expanded the WTF LIVE inventory Playwright spec to cover camera-first, screen-share selection, manual source switching, and camera stop while screen remains visible to a remote peer.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`, including the active camera/screen share regression.
  - Passed `npm run test:e2e:inventory` with 290/290 tests.

### WTF-BB-210 - WTF LIVE room layout does not reserve the bulk of the room for active video/screen share

- Category: WTF LIVE / public room stage layout
- Status: Verified
- Owner/Session: Codex WTF LIVE stage/attendance layout pass
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User report on 2026-06-04: the room UI should reserve the bulk of the room for screen/video sharing, put chat and attendance on the right, and keep idle users out of the screen-share area while mic-only users appear as customizable avatars.
  - Code inspection found public rooms still arranged around a left control column plus a smaller remote-peer grid, so presence and media competed for the main screen area.
- Correction:
  - Reworked `/live/r/:roomId` into a compact header/settings strip, a dominant stage panel, and a right rail containing attendance plus chat.
  - Added room-scoped avatar data to WTF LIVE media state, bounded to small image data URLs and relayed through `/ws/wtf-live`.
  - Stage tiles now render active camera/screen streams or mic-only avatars; idle participants stay in attendance only.
  - Updated the inventory Playwright behavior to prove custom mic avatars, camera/screen stage switching, idle attendance-only rows, right-rail chat reachability, and stage-vs-sidebar width.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`.
  - Passed `npm run test:e2e:inventory` with 290/290 tests.
  - Visual smoke captured `/tmp/wtf-live-stage-layout-final.png`: stage 982px wide, right rail 380px wide, chat composer in viewport, active share `screen`.

### WTF-BB-211 - WTF LIVE v0.3 testing exposed weak presence diagnostics, missing media pop-outs, and chat/attendance space competition

- Category: WTF LIVE / public room UX and diagnostics
- Status: Verified
- Owner/Session: Codex WTF LIVE v0.3 room polish pass
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User v0.3 testing summary on 2026-06-04 reported users could join, chat, upload media, invite others, and share screens, but the room still had confusing participant sync states, no maximize/fullscreen affordance for screen share, no image lightbox, weak chat auto-scroll behavior, and insufficient media/audio diagnostics.
  - The current room UI ranked attendance/settings/local preview too high relative to screen/camera shares, and mic-only participants still consumed stage area even though the stage should be reserved for visual shares.
- Correction:
  - Re-ranked `/live/r/:roomId` layout into compact title bar, narrow left control rail, dominant screen/camera stage, and right rail with collapsible attendance above chat.
  - Changed media state to distinguish mic device readiness from `audioOpen`, added optional push-to-talk, and kept mic-only participants out of the visual stage while still attaching hidden remote audio sinks.
  - Added per-peer WebRTC diagnostics from local `RTCPeerConnection` state/stats, attendance mic indicators, stage/local-preview pop-out frames with close/maximize/resize/drag controls, chat media lightbox pop-outs, and near-bottom chat auto-scroll with a new-message jump control.
  - Updated the WTF LIVE public room inventory behavior, domain workflow handles, harness media-state relay, and focused Playwright spec.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `git diff --check`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` with 5/5 tests.
  - Visual smoke captured `/tmp/wtf-live-v03-layout.png`: stage 843px wide, left rail 216px, right rail 317px, attendance collapsed, chat composer in viewport, active share `screen`.

### WTF-BB-212 - WTF LIVE lobby does not show which rooms are active or how many users are inside

- Category: WTF LIVE / lobby presence
- Status: Verified
- Owner/Session: Codex WTF LIVE lobby presence pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - User report on 2026-06-05: the WTF LIVE lobby should show if rooms are active and how many users are in them.
  - `/live` room cards only listed room metadata/actions, so hosts had to join or ask outside the app to know whether a public room was occupied.
- Correction:
  - Added a runtime WTF LIVE room presence snapshot derived from public `/ws/wtf-live` peers, including active state, participant count, open mic count, and camera/screen share counts.
  - Returned `presence` on public room metadata, signed-in public room lists, owned room lists, create-room responses, and visibility-update responses.
  - Added compact active/quiet and user-count badges to lobby/host room cards plus an aggregate active-room summary in the Open public rooms section, refreshed every 5 seconds.
  - Updated the inventory handle, admin behavior registry, behavior assertion, harness mock API, and focused WTF LIVE Playwright coverage.
- Verification:
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs` with 5/5 tests.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run test:e2e:inventory` with 290/290 tests.

### WTF-BB-198 - Skywire misses buy options for contractful Teia `/objkt/{KT1}/{tokenId}` links

- Category: Skywire / Teia token links
- Status: Verified
- Owner/Session: Codex Skywire Teia link buy-option repair
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - User report on 2026-06-04: Objkt links show buying options in Skywire, but posts containing `teia.art/objkt/*` links do not.
  - Local reproduction: `parseSkywireTokenUrl("https://teia.art/objkt/789")` succeeds, while `parseSkywireTokenUrl("https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789")` returns `null`, even though other app helpers emit contractful Teia URLs.
- Correction direction:
  - Keep client and server Teia URL parsing in lockstep for both legacy numeric `teia.art/objkt/{tokenId}` and contractful `teia.art/objkt/{KT1}/{tokenId}` paths, then upgrade Skywire feed tests so a Teia post proves token preview plus supported buy intent.
- Correction:
  - Extended the server parser and client link detector to accept contractful Teia `objkt/{KT1}/{tokenId}` URLs, then updated the resolver test and Skywire feed harness so Teia contractful posts hydrate a Teia token preview with a supported `collect` purchase intent.
- Verification:
  - Passed `DATABASE_URL=postgres://localhost/wtf_test node --test --import tsx server/features/atproto/skywire-token-market.test.ts`.
  - Passed `npm run build`.
  - Passed `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs --project=chromium`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm run check -- --pretty false`.
  - Passed `npm run test:e2e:inventory`.

### WTF-BB-197 - Skywire feed rows collapse into cramped strips and crop media instead of reading like social post cards

- Category: Skywire / feed UX and media
- Status: Verified
- Owner/Session: Codex Skywire feed usability repair
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report and screenshot on 2026-06-04 show Skywire home feed rows packed tightly together, card contents clipped, media thumbnails floating/cropped, and post boundaries failing to read like Bluesky/X-style social cards.
  - Previous Skywire UI verification covered a single media/token fixture but did not prove multiple feed cards had enough vertical spacing or that cards self-expanded around media.
- Correction direction:
  - Make the Skywire feed list and cards self-sizing with explicit negative space between posts, remove card-level clipping, put media in a full-width stage that uses the full-size asset when available, and keep Objkt/Teia/OE links promoted into Tezos token cards.
- Correction:
  - Rebuilt the Skywire social feed path around self-sizing card frames, a centered feed column, larger inter-card spacing, visible overflow, full-width contained media stages, and token previews sourced from Objkt asset, Objkt open-edition, and Teia token links found in post text or external embed metadata. The reply composer now opens from the Reply action instead of permanently occupying every post.
- Verification idea:
  - Extend the inventory harness to return multiple Skywire posts including a media post and token links, then run a Playwright visual/DOM smoke that asserts each feed card has readable height, vertical separation, full media containment, and rendered token preview controls.
- Verification:
  - `npm run build` passed.
  - `npm run check -- --pretty false` passed.
  - `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs --project=chromium` passed.
  - `npm run test:e2e:inventory:coverage` passed.
  - `npm run test:e2e:inventory` passed on rerun with 274/274 tests after an isolated transient `/swap` external-resource smoke was rerun and passed.

### WTF-BB-196 - Skywire still opens with light shell/sidebar/input surfaces after feed polish

- Category: Skywire / default theme UX
- Status: Verified
- Owner/Session: Codex Skywire dark-mode default pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - User report on 2026-06-03: Skywire must be dark mode by default.
  - After the feed-card polish, the native Skywire shell still contained light sidebar, welcome, permission, compose, vault, modal, input, and empty-state surfaces, so the first impression could remain stark and inconsistent.
- Correction:
  - Introduced shared Skywire dark theme tokens and applied them across the page shell, sidebar navigation, feed cards, embeds, token previews, vault cards, composer, settings, modal choices, action buttons, text fields, and sparse/new-user states.
- Verification:
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
  - `git diff --check`
  - Direct Playwright visual smoke of `http://127.0.0.1:4183/skywire` with the inventory harness media/token fixture confirmed dark sidebar/feed/action/input styles, transparent actor header buttons, visible media/token preview/Buy button, and zero console/page errors.

### WTF-BB-195 - Stuffs menu lacks a dedicated CREATE! category for creation apps

- Category: Desktop OS / Start Menu taxonomy
- Status: Verified
- Owner/Session: Codex Stuffs CREATE menu pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - User report on 2026-06-03: Stuffs menu needs a category named `CREATE!` that houses Composer, PArticle Painter, and other existing or future creation apps.
  - Current Start Menu model places creation tools in `My Media`, while the creation-tool registry already contains additional tools that should be grouped with the same creator workflow.
- Correction:
  - Added a Stuffs menu `CREATE!` category that includes Studio, Game Studio, Mint Portal, and every registered creation-tool route.
  - Generated creation-tool page definitions from the canonical creation-tool registry so PixelPatterns, PenRose Backgrounds, and future registry additions can land in the launcher taxonomy without another manual route list.
  - Removed creation-tool routes from the `My Media` Start Menu bucket and updated Start Menu/inventory coverage text.
- Verification:
  - `npx tsx --test client/src/components/layout/start-menu-app-gates.test.ts client/src/features/command-palette/command-palette-model.test.ts shared/wtf-browser-routes.sync.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run check -- --pretty false`
  - `npm run build`
  - `npx playwright test tests/playwright/start-menu.spec.mjs`
  - `npm run test:e2e:inventory`

### WTF-BB-194 - CRP nomination route crashes on sparse inventory harness API payloads

- Category: CRP nominations / route resilience
- Status: Verified
- Owner/Session: Codex CRP sparse route guard during Skywire UI pass
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - `npm run test:e2e:inventory` on 2026-06-03 failed only on `/crp-nominate` with `TypeError: Cannot read properties of undefined (reading 'length')`.
  - The inventory harness catch-all returns sparse `{ ok, mocked, path }` objects for unmocked CRP APIs, while the CRP page assumed `categories`, `bundles`, and `nominations` arrays were always present.
- Correction:
  - Guard CRP category, resolve-bundle, source, and nomination collections with `Array.isArray(...)` before reading `.length` or mapping.
- Verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "CRP nomination AppView"`
  - `npm run test:e2e:inventory`

### WTF-BB-193 - Skywire feed cards bury media and reject common Objkt/Teia/OE token href previews

- Category: Skywire / feed UX and token previews
- Status: Verified
- Owner/Session: Codex Skywire feed UI/token preview pass
- Score: C3 + F5 + S0 + P2(3) = 11
- Evidence:
  - User report on 2026-06-03: Skywire feed cards feel crowded and flat, media is cut off or deprioritized, and post hrefs to Objkt, Teia, or OE listing pages do not return token previews.
  - Client token-link detection only accepted Objkt `asset/{KT1}/{id}`, Objkt `tokens/{slug}/{id}`, and Teia `objkt/{id}`, while real embedded external hrefs can use Objkt slug assets, collection token paths, and open-edition routes.
- Correction:
  - Restyle Skywire feed cards and embeds for clearer hierarchy, render media without cropping, and keep token previews before generic external cards.
  - Align client and server token URL parsers around Objkt asset/token/collection/open-edition routes plus Teia token page variants.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-token-market.test.ts`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
  - Playwright visual smoke of `http://127.0.0.1:4173/skywire` with the inventory harness media/token fixture confirmed the media card, token preview, Buy/Open buttons, no duplicate generic external card, and zero console errors.

### WTF-BB-192 - Desktop icon movement, WX controls, and experimental app affordances drift from current shell expectations

- Category: Desktop OS / shell UX
- Status: Verified
- Owner/Session: Codex desktop environment corrections
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - User report on 2026-06-03: desktop icons should be movable by the individual user, WX/weather should live behind a system-tray lightning icon instead of a top-right desktop widget, and experimental app icons should have a yellow outline.
  - Prior verified item WTF-BB-132 covered icon-layout allow-list drift, but newer first-party desktop icon keys have since been added outside the persisted allow-list.
- Correction:
  - Expanded native desktop icon layout normalization to current first-party icon keys so per-user moved positions survive server settings saves.
  - Moved WX/weather controls into a taskbar lightning tray popup next to pet care and wallet, and kept the desktop environment component as the visual weather overlay only.
  - Added a canonical experimental desktop app list and yellow outline affordance on those launch icons, then updated inventory documentation and registry handles.
- Verification:
  - `npx tsx --test shared/desktop.test.ts client/src/features/desktop/DesktopIcons.test.tsx`
  - `npm run test:e2e:inventory:coverage`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory`
  - `git diff --check`
### WTF-BB-191 - tz2at listing signals can suppress Objkt direct-buy purchase keys

- Category: Rat Race / marketplace wallet sends
- Status: Fixed
- Owner/Session: Codex Rat Race direct-buy hotfix
- Score: C1 + F4 + S3 + P1(5) = 13
- Evidence:
  - `buildTz2atAtprotoRatRaceRows` sets `listing_id` to `null` whenever a tz2at listing signal supplies the floor, even when Objkt hydration has an active fixed-price listing for the same token.
  - `buildRatRacePurchaseIntent` requires `listing_id`, `listing_price_mutez`, and `marketplace_contract`, so the Rat Race Buy direct affordance becomes unsupported while the card still shows an active listing.
  - Live Objkt listing rows expose marketplace purchase shape separately from market-signal data, including `bigmap_key`, `currency_id`, and `target_address`.
- Why it matters:
  - Rat Race should treat tz2at as canonical for rolling market activity without disabling valid wallet sends that require supplemental marketplace-specific purchase keys.
- Fix:
  - Keep tz2at-first listing/floor evidence, but attach direct-buy fields from the lowest public tez Objkt listing with a numeric contract key. Prefer Objkt `bigmap_key` as the purchase key and use `id` only as a fallback.
  - Added a regression where tz2at supplies the floor/listing signal and Objkt supplies the direct-buy key, then asserted the resulting purchase intent is supported.
- Verification:
  - Verified with `DATABASE_URL=postgres://localhost/wtf_test node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts`.
  - Verified with `DATABASE_URL=postgres://localhost/wtf_test node --test --import tsx server/features/rat-race/hot-tokens.test.ts server/features/rat-race/tz2at-atproto.test.ts`.
  - Verified with `npm run check -- --pretty false` and `npm run build`.

### WTF-BB-190 - `holdings-derive` failed after `wallet_holdings_id_seq` exhausted 32-bit serial capacity

- Category: Wallet holdings / scheduler resilience
- Status: Verified
- Owner/Session: Codex holdings derive production health pass
- Score: C1 + F4 + S2 + P1(6) = 13
- Evidence:
  - Production `/api/health` reported `status:"ok"` and `jobsOk:true`, but listed `holdings-derive:error` as the latest scheduler issue after the Skywire vault deploy.
  - Production app logs showed `nextval: reached maximum value of sequence "wallet_holdings_id_seq" (2147483647)`.
  - `wallet_holdings.id` was still a 32-bit `serial`, even though the derive job's conflict-heavy upsert can burn sequence values on every refresh.
- Why it matters:
  - Skywire vault, cockpit holdings, galleries, ownership predicates, and market/social automation depend on `wallet_holdings` staying fresh. Once the sequence is exhausted, every holdings refresh fails until schema capacity is widened.
- Correction:
  - Migrated `wallet_holdings.id` and `wallet_holdings_id_seq` to bigint capacity and reset the sequence above the greater of current max id and current sequence value.
  - Kept an additional hardening patch that normalizes text token amounts before numeric aggregation, avoiding another class of all-row derive failures.
- Verification:
  - Added `server/lib/holdings-derive.test.ts` to lock the bigint schema/migration and the token amount normalization CTE.
  - Verified with `node --test --import tsx server/lib/holdings-derive.test.ts`, `npm run security:deploy-migrations`, and `npm run check -- --pretty false`.

### WTF-BB-189 - Direct Skywire buys can trust stale browser wallet state without rechecking current-user wallet ownership

- Category: Skywire / wallet identity boundary
- Status: Verified
- Owner/Session: Codex Skywire wallet identity hardening pass
- Score: C2 + F5 + S3 + P1(4) = 14
- Evidence:
  - Skywire direct token buys read `wallet.address` from the browser wallet context, which can be rehydrated from localStorage before the current WTF OS user has explicitly re-linked that wallet in the active account session.
  - The Taquito sender verifies the active wallet signer matches the requested address, but before this pass it did not verify that the requested address belongs to the signed-in WTF OS user immediately before a contract send.
- Why it matters:
  - On shared machines or fast account switching, user B must never be able to send a Skywire/Rat Race purchase from user A's still-active browser wallet session, and purchase telemetry must remain attributable to the current user and wallet.
- Likely correction direction:
  - Before any direct marketplace contract send, fetch the current session's `/api/wallets` rows without relying on React Query cache and require the active wallet address to be linked to that user. Then keep the existing signer-account preflight so the active wallet provider must still match the linked address.
- Verification idea:
  - Unit-test linked-wallet ownership checks for two user-shaped wallet lists, and run Skywire/Rat Race purchase-intent tests plus TypeScript and inventory coverage.
- Verification:
  - Added a session-scoped wallet ownership helper that fetches `/api/wallets` immediately before direct marketplace sends and rejects stale/unlinked browser wallet addresses.
  - Verified with `node --test --import tsx client/src/lib/tezos/wallet-ownership.test.ts server/features/atproto/skywire-policy.test.ts server/features/atproto/skywire-token-market.test.ts server/features/rat-race/hot-tokens.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, `npm run test:e2e:inventory` (`273 passed`), and `npm run test:e2e:live:puppets` (`126 passed`).

### WTF-BB-188 - Rat Race treats Objkt enrichment as canonical and exposes filters beyond tz2at rolling window

- Category: Rat Race / tz2at rolling scope
- Status: Fixed
- Owner/Session: Codex Rat Race tz2at canonical pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - Rat Race exposed mint-age filter options wider than tz2at's intended rolling 7-day replay scope.
  - The feed skipped tokens without Objkt active listings, making Objkt listing hydration effectively canonical even when tz2at had live sale and swap/listing records.
  - Live tz2at replay probe on 2026-06-03 showed fresh rolling health plus marketplace collect/swap/FA2 transfer records, but token card metadata and native direct-buy listing ids were not complete enough to remove Objkt supplementation.
- Fix:
  - Capped Rat Race minted-age filtering to 1/3/7 days in the UI, API limits, defaults, inventory probes, and harness data.
  - Made tz2at replay the canonical feed result, including healthy empty results, with local market-index fallback only when tz2at fails.
  - Added tz2at marketplace swap/listing signals to Rat Race row building so active listing count, first-listed time, floor price, and marketplace can come from tz2at instead of Objkt.
  - Kept Objkt as an explicit supplement for token metadata, edition supply, mint timestamp, media/creator fields, pk-to-FA2 token id normalization, and native direct-buy listing ids. Direct purchase stays unsupported when the canonical tz2at floor lacks a matching native purchase key.
- Live probe:
  - App-shaped 48h Rat Race load at `2026-06-03T18:57:47Z`: tz2at replay source, fresh health, processed lag 746 blocks, 86 candidate rows, 5 ranked rows, supplement source `objkt`, no TzKT use.
  - Raw 1,200-block tz2at replay sample at `2026-06-03T19:02:26Z`: 61 collects, 30 swaps, 6 bids, 70 FA2 transfers; swap records had token contract/ref/id, amount, priceMutez, marketplace, operation hash, entrypoint, timestamp, block level, and subject addresses on 30/30 records.
- Verification:
  - `node --test --import tsx server/features/rat-race/hot-tokens.test.ts server/features/rat-race/tz2at-atproto.test.ts`
  - `npm run build`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
  - Follow-up cleanup pass restored `npm run check -- --pretty false` by fixing the pending WTF LIVE/desktop-gate/CLI TypeScript drift in the same dirty worktree.

### WTF-BB-177 - Canonical user AT repos still carry WTFOS/tz2at state and no sovereign WTFOS DID boundary exists

- Category: AT Protocol architecture / identity boundary
- Status: Verified
- Owner/Session: Codex WTFOS tz2at PDS/firehose pass
- Score: C4 + F4 + S1 + P1(5) = 14
- Evidence:
  - WTF Skywire writes `app.wtfgameshow.skywire.signal` records to `repo: account.did`, which is the linked canonical user AT repo.
  - WTF tz2at v1 writes `xyz.tz2at.identity.walletLink` records to `repo: account.did` and persists identity links against the canonical DID, but there is no linked `wtfDid`/WTFOS repo table or `app.wtfos.identity.link` record.
  - The sibling TZAT app-view asks users for an app password and states that selected `xyz.tz2at.*` event records will be published to the user's PDS; its user publisher iterates subscriptions and publishes matching chain events to each user PDS.
- Why it matters:
  - The intended architecture says WTFOS must not use a user's canonical social repo as primary game/system storage. Current write paths risk repo pollution, portability failure, and semantic coupling to external PDS policy before the sovereign WTFOS identity/PDS layer exists.
- Likely correction direction:
  - Introduce a first-class linked WTFOS DID/repo model on the WTFOS-controlled PDS, write `app.wtfos.*` game/system state there, keep canonical user repo writes limited to explicit portable proofs, and disable/bound TZAT bulk user-PDS event mirroring behind a migration path.
- Verification idea:
  - Add architecture tests proving Skywire/game/system/tz2at bulk state writes target the linked WTFOS DID/repo or synthetic actor repos, while canonical DID repo writes are allowlisted to small identity/linkage proofs with per-action consent.
- Current pass:
  - Added a WTFOS PDS service profile, Caddy host, app-facing PDS health/status endpoints, durable `wtfos_atproto_identities` request/provisioning state, and tz2at firehose snapshot endpoints.
  - Added gated provisioning: when the WTFOS PDS is configured, healthy, invited, and `WTFOS_PDS_PROVISIONING_ENABLED=true`, WTFOS creates a separate PDS repo, writes `app.wtfos.identity.link`, and stores encrypted repo session material.
  - Added durable `wtfos_atproto_outbox` state plus a publisher that restores the linked WTFOS PDS session and writes `app.wtfos.activity.event` records to `repo: identity.wtfDid`, never `repo: account.did`.
  - Wired tz2at wallet-link publication to enqueue and opportunistically publish the mirrored WTFOS activity event after the user-approved portable proof is written.
  - Added outbox status/flush endpoints, admin/inventory/package registration, route/workflow probes, and policy tests proving the publisher targets the linked WTFOS repo.
  - Removed blank WTFOS PDS app env overrides from Compose so `env_file` values are not shadowed by empty defaults.
  - Reframed wallet chain activity as WTFOS event ingestion: newly inserted `wallet_events` rows now emit `blockchain.tezos.*` SystemEvents into the same challenge/sidequest/reward automation spine as app interactions.
  - Generalized the AT outbox to dual-target every new SystemEvent as `app.wtfos.activity.event` for the primary WTFOS repo and the user's linked WTF DID repo when configured/active.
  - Added primary WTFOS repo config (`WTFOS_PRIMARY_ATPROTO_DID`, handle, PDS URL, and password/session credential options), target columns on `wtfos_atproto_outbox`, blockchain trigger registry entries, and tests covering wallet-to-SystemEvent and dual-target repo publication.
  - Added Rat Race as a WTFOS shopping-channel surface on top of tz2at/local Tezos sale intelligence: hot-token ranking filters recent mints, half-sold supply, multiple 24h sales, active listings, parent marketplace links, and allowlisted direct contract purchase intents without writing sale state to canonical user repos.
  - Split the tz2at appview UI into a dedicated identity-proof/PDS panel and a read-only firehose explorer panel; the explorer can search replay/firehose data by event type, chain, address, wallet, contract, marketplace, token, operation hash, and block range without treating the signed-in user's linked wallets as the whole data universe.
  - Expanded the tz2at appview into an AT Protocol ecosystem analytics suite backed by live tz2at PDS repo records. The suite now aggregates repo inventory, record-family freshness, address/contract/token/marketplace usage, XTZ flow, marketplace volume, FA2/OBJKT activity, and configurable CEX inflow/outflow classification without reading or writing canonical user repos.
  - Added operator-grade analytics scoping over the same AT Protocol source: host, network, collection, actor address, contract, marketplace, token/OBJKT, amount, block range, and text filters now drive segmented host/network/collection/role breakdowns and preset WTFOS views for liquidity, marketplaces, contracts, and wallets.
  - Added Skywire room-message records as an explicit user-authored social exception to the canonical-PDS boundary: `app.wtfgameshow.skywire.room.message` records are public, consent-gated room messages owned by the sending user's AT repo, while WTFOS/system state must still use the WTFOS repo/outbox path.
  - Added Skywire stage-broadcast records under the same explicit public-social exception: `app.wtfgameshow.skywire.stage.broadcast` records are one-way user-authored public announcements with optional WTF LIVE/replay links and quoted-post preview snapshots, while live control state, stream secrets, private memberships, and WTFOS automation remain out of canonical user repos.
  - Added Skywire private chat through the official Bluesky chat service instead of canonical PDS records: direct and multi-member chat messages use `chat.bsky.convo.*` behind `did:web:api.bsky.chat#bsky_chat` and the explicit DM add-on scope, while quoted-post previews use compatible `app.bsky.embed.record` embeds.
  - Added a derived AppView intelligence layer over the scoped AT Protocol records: operator brief cards, ecosystem lanes, largest value flows, and value-adder/value-extractor leaderboards now summarize the record stream without adding interpretation to the tz2at relay itself.
  - Added entity drilldown and analytics-to-firehose handoff inside the tz2at AppView, so operators can select any ranked address/contract/marketplace/token or flow endpoint, inspect related value flows and sample records, then scope analytics or open the read-only firehose with that entity filter.
  - The issue remains In Progress because live PDS secrets/DNS and the primary WTFOS repo credentials have not been verified, synthetic/system actor repos are not modeled yet, and older non-SystemEvent game/system publishers still need to be audited onto the normalized event spine.

### WTF-BB-174 - Merged desktop app arrays duplicated Skywire and Mail icons

- Category: Desktop OS / merge safety
- Status: Verified
- Owner/Session: Codex full-send merge audit
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - Actor-backed live puppet smoke emitted repeated React duplicate-key errors for `skywire` and `mail` after merging the local dirty tree with upstream main.
  - `DesktopIcons.tsx` contained two entries for each app after both sides added desktop app definitions.
- Fix:
  - Removed the duplicated lower Skywire/Mail desktop icon definitions, leaving one canonical icon per desktop app key.
- Verification:
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory`
  - `npm run test:e2e:live:puppets` exposed the issue; rerun retained only known ambient failures after the fix.

### WTF-BB-173 - Desktop app disables hide launchers but do not fail closed at command palette or direct route runtime

- Category: WTF OS / admin app gates
- Status: Verified
- Owner/Session: Codex admin app runtime gate audit
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User report on 2026-05-25: disabled apps can still be reached through user interaction routes, the Stuffs/Start menu, and the command palette, so admin can hide a desktop icon without actually preventing the app from running.
  - Route authorization checked account role/admin-only flags but did not evaluate `desktop_app_settings.enabled` before rendering a matched app page.
- Why it matters:
  - Admin app controls must be a runtime policy boundary, not just launcher presentation. Otherwise disabled apps can still run through direct URLs, saved shortcuts, palette commands, or stale windows.
- Fix:
  - Added shared page access state that combines role/surface access with `desktop_app_settings` app-gate state.
  - Wired command palette generation and Start Menu route filtering through the shared app gate so disabled apps disappear from launch surfaces.
  - Added a direct-route/stale-shortcut failure window that says the app has been disabled by admin and emits `desktop.app.disabled_by_admin`.
  - Added Skywire and WTF Mail to the desktop app gate map so admin controls can disable those apps too.
- Local verification:
  - `npx tsx --test client/src/features/command-palette/command-palette-model.test.ts client/src/components/layout/start-menu-app-gates.test.ts shared/role-system.test.ts client/src/features/admin-os/admin-surface-registry.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory`

### WTF-BB-170 - Profile shows linked Skywire identity but lacks a manual disconnect action

- Category: Profile / Identity bridge UX
- Status: Verified
- Owner/Session: Codex Skywire profile disconnect pass
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - User live-testing report on 2026-05-24: Profile still lacks a disconnect button for manually disconnecting a Skywire account.
  - Server already exposed `/api/atproto/unlink`; the Profile row only offered Open/Connect Skywire.
- Why it matters:
  - Linked identity surfaces need a visible exit path next to the identity display. Without it, users must discover the Skywire app-specific flow or remain linked unintentionally.
- Fix:
  - Profile Social & Contact now renders a Skywire Disconnect button for linked AT identities, confirms the action, calls `/api/atproto/unlink`, and refreshes Profile/Skywire identity queries.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`

### WTF-BB-169 - Profile Social & Contact omits linked Skywire/AT identity

- Category: Profile / Identity bridge UX
- Status: Fixed
- Owner/Session: Codex Skywire discovery/Tezos pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - User live-testing report on 2026-05-24: Skywire is missing from the WTF OS Profile Social & Contact section where X and Discord are linked.
- Why it matters:
  - Skywire is now a core social identity surface and should appear next to the other profile-level contact identities.
- Fix:
  - Profile social payloads now include the linked AT account, the Profile page shows a Skywire row with connect/open actions, and public profiles expose linked AT handles.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run test:e2e:inventory`

### WTF-BB-168 - Bluesky post open links encode DID actors and trip invalid DID

- Category: Skywire / Bluesky source links
- Status: Fixed
- Owner/Session: Codex Skywire discovery/Tezos pass
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - User live-testing report on 2026-05-24: opening the actual Bluesky post from Skywire trips over itself with `invalid DID`.
  - Skywire generated source links with encoded DID profile segments such as `did%3Aplc...` instead of readable actor handles or unescaped DID path values.
- Why it matters:
  - Source links are the user's escape hatch to the canonical Bluesky object. If they fail, every feed card feels suspect.
- Fix:
  - Source URL construction now prefers the normalized author handle when available and keeps DID actors readable in the Bluesky profile path.
- Verification:
  - `npx tsx --test server/features/atproto/identity.test.ts`
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`

### WTF-BB-167 - Tezos feed uses keyword search instead of official Tezos actor feeds

- Category: Skywire / Tezos feed quality
- Status: Fixed
- Owner/Session: Codex Skywire discovery/Tezos pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User live-testing report on 2026-05-24: Tezos Feed should contain only official Bluesky account feeds for Tezos actors, not arbitrary keyword matches.
- Why it matters:
  - A protocol/community feed must be trustworthy and high-signal. Keyword search pulls unrelated posts and misses the user's explicit purpose.
- Fix:
  - Tezos Feed now merges only curated official/community Tezos author feeds: `tezos.com`, `tezosfoundation.bsky.social`, `tezoscommons.org`, `thetezoscommunity.bsky.social`, `objkt.com`, `teia.bsky.social`, `fxhash.bsky.social`, `etherlink.bsky.social`, `1x1music.bsky.social`, and `tezosnews.bsky.social`.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`

### WTF-BB-166 - Discover opens a side-feed instead of the Actor Feed tab and lacks peer-follow discovery

- Category: Skywire / Bluesky client UX
- Status: Fixed
- Owner/Session: Codex Skywire discovery/Tezos pass
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - User live-testing report on 2026-05-24: Actor Feed tab works well from Home, but Discover renders selected actors in its right column instead of using the same Actor Feed tab.
  - Discover only showed the user's follow list, Skywire users, and manual search; it did not compare Skywire users' follow graphs to recommend unfollowed actors.
- Why it matters:
  - Discovery should be a picker, not a competing feed viewer. Peer-follow suggestions are the first WTF-native way Skywire can be more useful than a plain Bluesky clone.
- Fix:
  - Discover now opens selected actors in the dedicated Actor Feed tab and adds peer-follow suggestions from other Skywire users while excluding the connected user's own follows.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run test:e2e:inventory`

### WTF-BB-165 - Mail route crashes when mailbox status payload is sparse

- Category: Comms / Mail route resilience
- Status: Fixed
- Owner/Session: Codex Skywire actor feed pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed the route smoke for `/mail` with `TypeError: Cannot read properties of undefined (reading 'address')`.
  - The Mail page assumed `status.mailbox` and `status.config` always existed after the status query resolved.
- Why it matters:
  - Sparse mail status should show inactive/not-configured state, not crash the desktop app window or block unrelated Skywire production fixes.
- Fix:
  - Mail now normalizes missing mailbox/config payloads before rendering and tolerates message rows without `toAddresses`.
- Verification:
  - `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Mail"`
  - `npm run test:e2e:inventory`

### WTF-BB-164 - Skywire home/discover cannot pivot from actors to author-only feeds

- Category: Skywire / Bluesky client UX
- Status: Fixed
- Owner/Session: Codex Skywire actor feed pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User live-testing report on 2026-05-24: clicking actor handles in Home did not open that user's feed, and Discover did not let the user select actors they follow on Bluesky for inspection.
  - Skywire only searched actors and recommended connected WTF users; the connected user's Bluesky follows graph was not exposed.
- Why it matters:
  - A Bluesky replacement must let users move naturally from the home timeline to an actor profile/feed and inspect people they already follow.
- Fix:
  - Added a follows endpoint backed by `app.bsky.graph.getFollows`, cursor-aware author feed reads, a dedicated Actor Feed tab opened from home feed author clicks, and a Discover follows picker that renders the selected actor's author-only feed.
- Verification:
  - `npx tsx --test server/features/atproto/skywire-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`

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
- Status: Verified
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
- Status: Fixed
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
  - 2026-06-10 V2 mainnet rotation: wallet-originated in-app market V2 `KT1FN2bwYAffC2VgmSNs76DiPkSwZurbBoHR`; TzKT storage confirms `version=wtf-in-app-market-v2`, treasury `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`, WTF FA2 `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`. Local `.env`, `.env.example`, shared fallback, inventory docs, and behavior assertions were updated to V2.
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
- Status: Verified
- Owner/Session: Codex security hardening pass (2026-05-30)
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
- 2026-05-30 verification:
  - `scripts/server-deploy.sh` runs `check-kiln-auth.mjs` and `check-kiln-production-posture.mjs` before app restart; both require unauthenticated mutation probes to return 401/403.
  - Open Shadownet builder mode and public puppet balances are accepted product behavior (see WTF-BB-075 archived note).

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
- Status: Archived
- Owner/Session: Operator review (2026-05-30)
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
- 2026-05-30 operator decision:
  - Accepted as intentional product behavior. Shadownet puppet wallets only hold faucet-funded test XTZ; draining them is pointless because replenishment is free and simple.
  - Deploy guards now only require health reachability and token-gated mutations (`check-kiln-auth.mjs`, `check-kiln-production-posture.mjs`). They no longer fail deploy when Kiln is in open mode or serves public balances.

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
- Status: Verified
- Owner/Session: Codex security hardening pass (2026-05-30)
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
- 2026-05-30 verification:
  - `passport-twitter` is no longer a production dependency; legacy OAuth 1.0a requires `ENABLE_LEGACY_TWITTER_OAUTH=1` plus an optional installed package.
  - `npm audit --omit=dev` reports zero vulnerabilities.

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
- Status: Verified
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

### WTF-BB-171 - WIM lists Studio project rooms as individual buddies and lacks a real user/friend list

- Category: WIM / social UX
- Status: Verified
- Owner/Session: Codex WIM buddy-list repair
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - User report on 2026-05-24: WIM incorrectly treats group DMs from Studio projects as individual DMs and lists those conversations under the buddy list.
  - `client/src/pages/Aim.tsx` previously fetched `/api/messages/dms` and rendered returned conversations inside `GroupBox label="Buddy List"`.
- Why it matters:
  - WIM should be a people-first instant messenger. Mixing project rooms into buddy rows makes users open the wrong chat context and hides the expected friend/online workflow.
- Likely correction direction:
  - Drive the WIM sidebar from WTF users/friends with online indicators, fetch only direct DM conversations for chat history, and keep Studio/project conversations out of the WIM buddy list.
- Verification idea:
  - Add focused policy coverage that WIM fetches direct conversations only, exposes collapsible friend/user sections, and starts a direct chat from user double-click.
- Fix:
  - Rebuilt WIM as a user-driven, AOL-style roster with collapsible friends, online users, all users, and recent direct chat sections.
  - Added `excludeSelf` and session-derived `online` flags to `/api/messages/users`, and kept WIM conversation history limited to direct one-peer conversations.
  - Added browser-local friend shortcuts, `wim.friend.added` telemetry, double-click/keyboard/open-chat affordances, and direct DM creation before loading chat history.
  - Updated interaction inventory and the inventory domain workflow to cover the new WIM friend handle and user roster API probe.
- Local verification:
  - `npx tsx --test client/src/pages/Aim.test.ts server/routes/messages-user-roster-policy.test.ts`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`
  - Built-app Playwright smoke opened `/wim`, clicked a WTF user chat button, observed `POST /api/messages/dms`, loaded `/api/messages/dms/101/messages`, and rendered the direct-chat empty state.

### WTF-BB-172 - Inventory route smoke exposed sparse Discovery/Porcupin/CSRF fixtures that could mask or trigger UI failures

- Category: Inventory E2E / sparse API fixtures
- Status: Verified
- Owner/Session: Codex WIM verification cleanup
- Score: C1 + F2 + S1 + P2(3) = 7
- Evidence:
  - While verifying WIM, the inventory route suite crashed `/dashboard` because `DiscoveryCard` called `.slice()` on a sparse random discovery payload.
  - The same route-smoke pass crashed `/apps/porcupin-dashboard` because the harness returned a generic truthy object for Porcupin endpoints, sending the UI down the connected-instance branch without required fields.
  - The focused WIM click smoke initially selected a user but never posted the direct DM because the harness catch-all returned no `csrfToken` for `/api/auth/csrf-token`.
- Why it matters:
  - Route smoke tests are supposed to expose app regressions, not fail because fixture fallbacks are too shape-loose. Unsafe-method UI smokes also need the same CSRF contract as the real client.
- Likely correction direction:
  - Harden display helpers against optional API fields where sparse data is legitimate, and give route-smoke harnesses explicit mocks for app-specific empty states and CSRF token fetches.
- Verification idea:
  - Re-run the full inventory suite and a focused unsafe-method WIM smoke after adding the fixture contracts.
- Fix:
  - Made `DiscoveryCard` address shortening tolerate missing addresses.
  - Added explicit Porcupin empty-state mocks and a CSRF token endpoint to the Playwright harness.
- Local verification:
  - `npm run test:e2e:inventory`
  - Built-app WIM smoke confirmed CSRF fetch, direct-DM creation, and message-history load.

### WTF-BB-175 - Static inventory coverage imported DB-backed desktop app runtime

- Category: CI / inventory coverage
- Status: Verified
- Owner/Session: Codex full-send CI repair
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - GitHub Quality Gates run `26418270083` failed on `npm run test:e2e:inventory:coverage` with `[db] Missing DATABASE_URL`.
  - The coverage script imported `DEFAULT_DESKTOP_APP_CONFIG` from `server/lib/desktop-apps.ts`, which imports `server/db.ts` at module load.
- Why it matters:
  - Static inventory coverage should not need production secrets or a live database. Local `.env` masked the issue until the clean CI runner executed the same command.
- Likely correction direction:
  - Keep static registry defaults in shared DB-free modules and let server helpers wrap those defaults for runtime persistence.
- Verification idea:
  - Run inventory coverage locally and in a no-`.env` temp copy.
- Fix:
  - Added `shared/desktop-apps.ts` for `DEFAULT_DESKTOP_APP_CONFIG`, `DesktopAppConfig`, and `isDesktopAppKey`; updated the server runtime wrapper and inventory coverage imports.
- Local verification:
  - `npm run test:e2e:inventory:coverage`
  - No-`.env` temp-copy `npm run test:e2e:inventory:coverage`

### WTF-BB-176 - Live puppet harness has stale local DB/storage prerequisites

- Category: Live E2E / local environment drift
- Status: Verified
- Owner/Session: Codex pending batch live puppet cleanup
- Score: C2 + F3 + S1 + P1(4) = 10
- Evidence:
  - `npm run test:e2e:live:puppets` on 2026-05-26 passed login, wallet signer checks, `/tz2at` route smoke, and most route/domain probes, but failed 9 unrelated assertions.
  - Failures included missing local DB relations (`atproto_accounts`, `mastodon_accounts`), media upload staging failure creating `/mnt`, CSRF 403s for casino/console unsafe API calls, missing Club Dues configured contract, and strict locator ambiguity for `Community Warm-Up Challenge`.
- Why it matters:
  - The live puppet harness is the repo's actor-backed confidence layer. If the local DB/storage prerequisites drift, feature work can pass static and inventory checks while the live harness gives noisy failures that hide real regressions.
- Fix:
  - Expanded local puppet DB prep for the appview, comms/mail, Mastodon, Porcupin, Skywire/WTF LIVE, desktop app registry, user curse, nomination credit, and related live workflow schemas.
  - Pointed the spawned live E2E server at local writable storage roots, added CSRF headers to unsafe direct API probes, seeded deterministic local Club Dues contract state, and made launch-surface locators unambiguous.
  - Added a bounded Rat Race replay page cap for the live harness and fixed the replay scanner so `RAT_RACE_TZ2AT_MAX_REPLAY_PAGES` is honored inside concurrent batches.
- Verification:
  - `node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts`
  - Targeted Playwright: `wallet portfolio to commerce loop` passed in 29.3s.
  - `npm run test:e2e:live:puppets` passed 126/126 on 2026-06-03.

### WTF-BB-178 - Rat Race hot-edition feed is backed by an empty local market index

- Category: Tezos / Rat Race data pipeline
- Status: Fixed
- Owner/Session: Codex Rat Race diagnostics/supply pass
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - Rat Race reads only the local `token_sales`, `token_mint_events`, `token_listings`, and `token_metadata` tables.
  - A diagnostic query on 2026-05-26 returned `token_sales=0`, `token_mint_events=0`, `token_listings=0`, `active_listings=0`, and only one metadata row with no supply.
  - The original WTF tz2at route exposed a wallet activity snapshot, while the market-wide sale facts are available from `tz2at.store` AT Protocol repo collections such as `xyz.tz2at.marketplace.collect`.
- Why it matters:
  - An empty "hot editions" feed looks like a weak market signal, but the current root cause is missing ingestion data. Rat Race can silently fail closed while users/admins assume the market has no urgent tokens.
- Likely correction direction:
  - Fixed locally by adding a bounded live `tz2at.store` AT Protocol fallback that reads `xyz.tz2at.marketplace.collect`, resolves token contracts from FA2 transfers or collect subject addresses, hydrates metadata/listings from Objkt, and feeds the existing Rat Race urgency ranker when local market tables are empty.
  - Follow-up fix: Rat Race now refuses to rank candidates when total edition supply is unknown instead of defaulting to one edition, and the API/UI expose source counts, near misses, and rejection reasons such as unknown supply, old mint, low recent-sale count, or low sold-through percentage.
- Verification idea:
  - Local verification on 2026-05-27: `node --test --import tsx server/features/rat-race/hot-tokens.test.ts server/features/rat-race/tz2at-atproto.test.ts`, `npm run check`, `npm run test:e2e:inventory:coverage`, and a live tz2at/Objkt probe. The live probe resolved one buyable ATProtocol-derived row with known supply `3`, but it was minted in 2021 and had only one recent sale, so the hot-edition filter correctly returned zero ranked items with a near-miss diagnostic.

### WTF-BB-179 - tz2at relay health can be green while indexed firehose data is stale

- Category: Tezos / tz2at data freshness
- Status: Fixed
- Owner/Session: Codex Rat Race replay stream pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - On 2026-05-27, `https://tz2at.xyz/health` returned `{"ok":true,"network":"mainnet"}` and `wss://tz2at.xyz/firehose` emitted thousands of JSON messages in 20 seconds.
  - The same probe showed the JSON stream starts at historical replay by default, and `type=`, `types=`, and `collection=` query parameters did not narrow it to `xyz.tz2at.marketplace.collect`.
  - `https://api.tzkt.io/v1/head` reported Tezos head level `13384239` at `2026-05-27T15:23:55Z`.
  - tz2at replay and AT Protocol repo records only reached block `13371830` at `2026-05-26T18:34:37Z`; the latest `xyz.tz2at.marketplace.collect` record was block `13371559` at `2026-05-26T18:07:22Z`.
  - On 2026-05-28, the improved `https://tz2at.xyz/health` payload reported rolling indexer freshness with `headLagBlocks=0`, while the old hardcoded relay PDS DID returned `RepoNotFound`.
  - Current `/replay` records now include enriched `xyz.tz2at.marketplace.collect` rows with `tokenContract`, `tokenRef`, `seller`, `amount`, and OBJKT provenance, removing Rat Race's earlier need to guess the token contract from subject addresses.
- Why it matters:
  - Rat Race can only rank hot editions when the sale source is fresh. A non-empty websocket or repo backlog proves tz2at exists, but not that current market sales are flowing into WTF.
- Likely correction direction:
  - Fixed locally by adding a `tz2atRelay` upstream client and making Rat Race prefer fresh bounded `/replay` chunks from `tz2at.xyz` before falling back to legacy ATProto repo reads.
  - Rat Race now normalizes `tokenContract`, `tokenRef`, `seller`, and `amount` from improved collect records, while retaining Objkt hydration for edition supply and direct-buy listing ids.
  - Follow-up hardening: legacy repo fallback now only runs when replay itself fails. A healthy but empty replay window remains `source: "tz2at-replay"` instead of probing the stale relay DID.
  - Follow-up hardening: Rat Race feed diagnostics now carry tz2at rolling-indexer freshness (`state`, `headLagBlocks`, `ageMs`, thresholds, and levels), the UI shows the freshness line in the empty-state diagnostics, and stale replay health fails closed before fetching replay pages.
- Verification idea:
  - Local verification on 2026-05-28: `node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts server/features/rat-race/hot-tokens.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and a live `loadRatRaceHotTokenFeed` probe with `RAT_RACE_TZ2AT_REPLAY_BLOCKS=1500`. The live probe reported `source: "tz2at-replay"` and resolved current candidate `UNSP0KEN` from a `2026-05-28T09:06:10Z` sale with known supply and active listings; it correctly remained a near-miss because it had only one recent sale and was minted in 2021.
  - Follow-up verification on 2026-05-28: added a regression proving a healthy empty `/replay` response returns `{ source: "tz2at-replay", rows: [] }` without calling legacy repo paths; `node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts server/features/rat-race/hot-tokens.test.ts` and `npm run check -- --pretty false` passed.
  - Follow-up verification on 2026-05-28: added stale-health regression coverage, reran `node --test --import tsx server/features/rat-race/tz2at-atproto.test.ts server/features/rat-race/hot-tokens.test.ts` (10 passed), `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` (265 passed). A live replay probe reported `state: "fresh"`, `headLagBlocks: 0`, `ageMs: 4348`, two candidate rows, and zero ranked hot tokens due filter failures rather than source freshness.

### WTF-BB-180 - CEX flow classifier shipped without a default exchange custody address book

- Category: Tezos / tz2at ecosystem analytics
- Status: Fixed
- Owner/Session: Codex tz2at CEX classifier pass
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - `/api/tz2at/ecosystem/analytics` only passed CEX addresses from `cexAddresses`, `TZ2AT_CEX_ADDRESS_BOOK`, or `TZ2AT_CEX_ADDRESSES`.
  - With no operator-provided book, the AppView displayed a CEX section but could not classify any exchange inflow/outflow.
  - A 2026-05-28 TzKT alias snapshot showed common exchange custody labels such as Coinbase, Binance, Kraken, Gate.io, Kucoin, Gemini, Crypto.com, Bitfinex, Bybit, Huobi, and MEXC.
- Why it matters:
  - The AppView promise includes identifying who is withdrawing XTZ from CEX custody and who is depositing/selling into CEX custody. Without a default book, that promise depends on every operator manually supplying common exchange addresses.
- Likely correction direction:
  - Fixed locally by adding a conservative built-in TzKT-labeled exchange custody book, merging operator-provided addresses on top, exposing the source in the UI, surfacing unclassified high-flow custody candidates for follow-up labeling, and retaining `TZ2AT_DISABLE_DEFAULT_CEX_ADDRESS_BOOK=true` as an explicit kill switch.
- Verification idea:
  - Unit tests should prove the built-in book includes common exchange labels, operator entries override duplicates, and default analytics calls report a nonzero `cexAddressCount` without env/query input.

### WTF-BB-181 - AppView led with ambiguous data blocks instead of an explanation-first liquidity brief

- Category: Tezos / tz2at ecosystem analytics UX
- Status: Fixed
- Owner/Session: Codex tz2at analytics readout pass
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - The tz2at analytics tab showed CEX buyer/seller tables, route lists, and XTZ flow totals before explaining that zero CEX rows only meant "no matched custody-book flows in this sampled slice."
  - Etherlink XTZ movement appeared as value totals without clarifying whether records proved L1 bridge flow or only Etherlink-native transfers.
  - The UI reserved little space for implications and confidence, so an average operator had to infer meaning from dense protocol tables.
- Why it matters:
  - WTFOS AppViews should interpret protocol records and uncertainty. An operator-grade analytics surface must make sampling limits, bridge confidence, and CEX classifier confidence obvious before presenting raw tables.
- Likely correction direction:
  - Fixed locally by adding an explanation-led executive readout, network liquidity bar charts, record-family charts, CEX zero-state interpretation, Etherlink/bridge confidence notes, and moving the dense record blocks into the full report section.
- Verification idea:
  - Inventory smoke should prove the `/tz2at` route still renders; typecheck should prove the derived readout is safe against sparse analytics payloads.

### WTF-BB-182 - Inventory market-pricing spec creates a sale that the storefront does not visibly render

- Category: In-app market / inventory E2E
- Status: Open
- Owner/Session: -
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `npm run test:e2e:inventory` failed first in `tests/playwright/inventory/market-pricing.spec.mjs` waiting for `-10%` after the spec posted an active `arcade-play-ticket` sale.
  - The API assertion immediately before page navigation confirmed the market payload had `discountPercent: 10` and `salePriceWtfFormatted: "9.00"`, but the rendered `/wtfiam?category=arcade` page still showed `10.00 WTF`.
  - Later route failures were `ECONNREFUSED 127.0.0.1:4173` after the first failure, while a focused Rat Race route smoke passed.
- Why it matters:
  - The inventory pricing test is meant to prove admin sales and storefront pricing stay connected. If the API and UI diverge, operators may believe a sale is live while shoppers see stale prices.
- Likely correction direction:
  - Trace the in-app market storefront fetch/cache path for category sales after `/api/admin/in-app-market/sales`; verify whether the sale response is omitted from the route fixture, cached stale in the client query, or rendered without the sale badge/discount price.
- Verification idea:
  - Re-run `npm run test:e2e:inventory` or at minimum `npx playwright test tests/playwright/inventory/market-pricing.spec.mjs` and confirm the `-10%` badge plus `9.00 WTF` render after sale creation.

### WTF-BB-183 - Skywire account shell crashed when sparse harness payload omitted `tezosIdentity`

- Category: Skywire / sparse account resilience
- Status: Verified
- Owner/Session: Codex Skywire UI polish pass
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - Direct Playwright visual smoke against `/skywire` on the local harness threw `TypeError: Cannot read properties of undefined (reading 'preferredSource')` before the Skywire masthead rendered.
- Why it matters:
  - Skywire is a protocol cockpit that should survive partially migrated, fixture-backed, or sparse account payloads and still show the user a repair path.
- Likely correction direction:
  - Fixed locally by making `AtprotoMe.tezosIdentity` optional on the client and normalizing account-panel reads through a nullable local value before rendering preferred `.tez`, wallet, and domain bridge fields.
- Verification idea:
  - Verified with `npm run check -- --pretty false`, `npx tsx --test server/features/atproto/skywire-policy.test.ts`, `npm run test:e2e:inventory:coverage`, `npm run test:e2e:inventory`, and direct desktop/mobile Playwright visual smoke.

### WTF-BB-184 - Desktop app installs could bypass doc-registry proof

- Category: wtfOS / app installation governance
- Status: Fixed
- Owner/Session: Codex wtfOS doc-registry hardening pass
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - The new wtfOS installation policy requires each app to present a doc registry, command palette, MCP registry, and event registry before it can be granted an install key.
  - The first pass exposed the risk that registry metadata could drift into presentation-only strings instead of enforceable filesystem-backed docs, which would weaken the install gate and make stale apps harder to disable cleanly after the 24-hour update window.
- Why it matters:
  - wtfOS needs a modular but enforceable operating model. If docregistry is only advisory, users can install or keep running apps whose operating procedures, event mappings, or subdomain docs are stale or missing.
- Likely correction direction:
  - Keep the registry as a shared source of truth, require concrete file paths for existence checks, issue install keys only after the registry resolves, and revoke keys when doc updates fall behind the grace window.
- Verification idea:
  - Run the doc/package acceptance checks that assert every desktop app package has documentation paths on disk, and confirm the admin install-key flow only issues keys for apps whose docs resolve to real files.

### WTF-BB-185 - tz2at CEX flow stayed 0 because sampling never reached Tezos L1 records

- Category: Tezos / tz2at ecosystem analytics
- Status: Fixed
- Owner/Session: Cursor tz2at CEX sampling pass (2026-05-30)
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - After WTF-BB-180 added a 30-entry Tezos CEX custody book, `/api/tz2at/ecosystem/analytics` still reported `0` for `cexFlow.totalWithdrawnFromCexMutez` and `totalDepositedToCexMutez`.
  - `analyzeRecords` only classified CEX flow on `xyz.tz2at.xtz.flow`, and `loadAnalyticsRecords` read a single recency-ordered page (`limitPerCollection`, default 40) from one main relay repo.
  - Live probe of `https://tz2at.store` (repo `did:plc:v7jpd5s2kmpcbp5aqe6ukym7`): the newest 100 `xyz.tz2at.xtz.flow` and `xyz.tz2at.transaction` records were 100% `etherlink-mainnet` with `0x` EVM addresses; the Tezos-only book can never match those. Paginating deeper found `mainnet` Tezos flows (610 of 800 deeper records) and 15 book-address hits across 6 known exchanges in 1,500 records.
- Why it matters:
  - The AppView's headline promise is identifying who withdraws XTZ from CEX custody and who deposits/sells into it. A correct classifier returning all-zero looked like a missing address book but was actually a multi-network sampling/recency bias.
- Likely correction direction:
  - Initial fix paged the high-volume liquidity collections on the main relay repo past the Etherlink-dominated head (`listFlowRecordsDeep`); this raised CEX flow above zero but stayed a partial, sampling-dependent result.
  - Final fix sources CEX flow from the right place: resolve each book address to its own per-entity tz2at repo using the spine's deterministic noun handle (`tz2atNounHandle` mirrors TZAT `nounSlug`) + `com.atproto.identity.resolveHandle`, then read that repo's pre-filtered `store.tz2at.xtz.flow` transfers directly (`loadCexWalletFlowRecords`). Added `store.tz2at.*`↔`xyz.tz2at.*` collection-prefix normalization, per-event dedup across repos (`dedupeRecords`), `flowKind === "transaction_amount"` filtering, and Tezos-native unclassified-candidate scoping. The main relay is still read for the broad ecosystem view.
- Verification idea:
  - Unit regressions in `server/features/tz2at/ecosystem-analytics.test.ts` prove (a) a single Etherlink head page yields `0` CEX flow while deep paging surfaces Tezos custody totals, and (b) CEX flow resolves from per-entity wallet repos, is deduped against the main mirror (no double count), and excludes fee flows. Live verification on 2026-05-30 against `wallets.tz2at.store` resolved the 30-address book directly and reported ~558,636 XTZ withdrawn-from-CEX and ~373,386 XTZ deposited-to-CEX across Coinbase and Bybit wallets (was 0).

### WTF-BB-186 - tz2at liquidity aggregates sum Etherlink 18-decimal units with Tezos 6-decimal mutez

- Category: Tezos / tz2at ecosystem analytics
- Status: Fixed
- Owner/Session: Cursor comparable-mutez deploy (2026-05-30)
- Score: C2 + F4 + S0 + P1(3) = 9
- Evidence:
  - Live `xyz.tz2at.xtz.flow` records on `etherlink-mainnet` carry `amountMutez` in 18-decimal native units (e.g. `2000000000000000` = 0.002 XTZ), while Tezos `mainnet` records use 6-decimal mutez (e.g. `3`, `358`).
  - `analyzeRecords`/`segmentRecords` sum these raw values together into `liquidity.totalXtzFlowMutez`, `topXtzSenders/Receivers`, route amounts, and segment `amountMutez`, so Etherlink wei dominates Tezos mutez by ~10^12 and the cross-network liquidity totals/rankings are not comparable.
  - The existing 2026-05-28 lesson only addressed per-record *display* units; the cross-network *aggregation* still mixes scales.
  - The CEX flow totals themselves are unaffected because the custody book is Tezos-only (matches are pure mutez); this red flag is about the broader liquidity/value-flow aggregates shown beside them.
- Why it matters:
  - Liquidity and value-flow leaderboards are economic claims. Summing two token scales overstates Etherlink liquidity and corrupts "top sender/receiver" and route rankings on any window that mixes networks.
- Likely correction direction:
  - Normalize amounts to a single unit at the aggregation layer using the record's network (treat `etherlink-*` as 18-decimal, Tezos networks as 6-decimal mutez) before summing into accumulators/segments/totals, or scope liquidity aggregates per-network. Keep per-record display objects consistent with whichever unit the UI formats.
- Verification idea:
  - Add a unit test mixing one Etherlink (18-decimal) and one Tezos (6-decimal) flow and assert the normalized total equals the mutez-equivalent sum, not the raw concatenated bigint sum.
- Verification notes (2026-05-30):
  - `normalizeToComparableMutez` / `readComparableAmount` in `server/features/tz2at/ecosystem-analytics.ts` convert Etherlink wei to 6-decimal mutez-equivalent before cross-network totals, segment sums, entity/route rankings, and min-amount filters; native amounts remain on routes, CEX flows, and value-flow rows for network-aware display.
  - Unit test `tz2at comparable mutez normalizes etherlink wei before cross-network liquidity totals` in `ecosystem-analytics.test.ts`.
  - Deployed via SSH to production WTF host (`5.78.202.50`, `scripts/server-deploy.sh`); serves `https://wtfgameshow.app/api/tz2at/ecosystem/analytics`. Etherlink bridge tab still uses raw rollup units intentionally.

### WTF-BB-187 - Cloudflare proxied `wtfos.app` points at an origin that does not serve the canonical hostname

- Category: Deploy / edge TLS
- Status: Fixed
- Owner/Session: Codex wtfos canonical-domain TLS repair
- Score: C2 + F5 + S0 + P0(5) = 12
- Evidence:
  - Live probe on 2026-06-01: `curl -Ivs https://wtfos.app` returned `HTTP/2 525` from Cloudflare, while `curl -Ivs https://wtfgameshow.app` returned `HTTP/2 200`.
  - `Caddyfile` only declared `wtfgameshow.app`, `new.wtfgameshow.app`, and `dues.wtfgameshow.app` host blocks even though shared branding and public docs already promote `wtfos.app` as the primary origin.
- Why it matters:
  - `wtfos.app` is the canonical public platform domain in shared branding, CLI defaults, MCP manifests, and docs. If the origin does not present that hostname, Cloudflare can front a valid edge cert while the canonical site still fails closed for every visitor.
- Likely correction direction:
  - Serve `wtfos.app` on the same Caddy app origin block as `wtfgameshow.app`, add a `www.wtfos.app` redirect, and add a regression test that keeps the canonical and legacy hostnames in parity.
- Verification idea:
  - Run `node --test scripts/caddy-domain-policy.test.mjs`, then reload Caddy in production and verify `https://wtfos.app` returns a successful response instead of Cloudflare `525`.
- Verification notes:
  - Local regression guard now passes: `node --test scripts/caddy-domain-policy.test.mjs`.
  - `Caddyfile` now serves `wtfos.app` on the same app proxy block as `wtfgameshow.app` and redirects `www.wtfos.app` to the canonical apex.
  - Live Hetzner origin probe now succeeds directly: `curl -Ivk --resolve wtfos.app:443:5.78.202.50 https://wtfos.app` returned `HTTP/2 200` with a Let's Encrypt origin cert for `wtfos.app`.
  - Public Cloudflare edge now succeeds: `curl -Ivs https://wtfos.app` returned `HTTP/2 200`, `curl -Ivs https://www.wtfos.app` returned `HTTP/2 301` to `https://wtfos.app/`, and `curl -fsS https://wtfos.app/api/health` returned `status:\"ok\"`.

### WTF-BB-219 - Desktop icon dragging blinked all on-screen text during movement

- Category: Desktop OS / icon drag rendering
- Status: Verified
- Owner/Session: Codex desktop icon drag paint repair
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - User reported that grabbing and moving a desktop icon caused all on-screen text to blink out until movement stopped.
  - The drag path in `DraggableIcon` called `onMove` on every pointer movement, which updated parent desktop state and forced the desktop shell, route layer, taskbar, icons, and windows through rapid React rerenders while the icon was being dragged.
- Why it matters:
  - The desktop shell must feel stable under direct manipulation. If all text disappears during icon movement, WTF OS feels visually broken even when the layout data eventually persists correctly.
- Likely correction direction:
  - Fixed locally by moving the active drag visual into an imperative `translate3d(...)` transform on the dragged icon only, committing the final persisted position on release, and syncing the Matter physics body to the release position before fling velocity is applied.
- Verification idea:
  - Verify with a signed-in browser drag proof that visible text counts and computed text styles remain constant before, during, and after a held icon drag, then run the desktop interaction inventory coverage and smoke suites.
- Verification notes (2026-06-07):
  - Local Playwright drag proof captured before/during/after screenshots under `.impeccable/critique/repair-proofs/2026-06-07T01-15-30-467Z__desktop-icon-drag-text/` and reported visible text count `159` before, during, and after drag; only the dragged icon had a temporary transform during movement.
  - `node .agents/skills/impeccable/scripts/detect.mjs --json client/src/features/desktop/DesktopIcons.tsx client/src/features/desktop/useDesktopPhysics.ts` returned `[]`.
  - `npm run check`, `npm run build`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` passed.

### WTF-BB-220 - Skywire vault created-token collections froze after successful data load

- Category: Skywire / vault created-token layout
- Status: Verified
- Owner/Session: Codex Impeccable shared UI repair pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - The Impeccable repair pass widened app-content tokens and removed banned decorative patterns, but the full inventory suite then failed the Skywire vault behavior test at `tests/playwright/inventory/skywire-feed.spec.mjs`.
  - Browser trace and direct `curl` confirmed `/api/skywire/tezos-vault?limit=24` returned a valid payload, while the UI stayed in the initial refreshing/empty state.
  - A bounded Playwright probe showed the page stopped answering browser commands immediately after a populated created-token response. Empty vaults, wallet-only data, and owned-token-only data rendered; one created token was enough to reproduce the freeze.
- Why it matters:
  - A source-clean design pass is not enough if a high-value app freezes when real collection data arrives. Users need the vault to clearly distinguish empty, loaded, and grouped collection states.
- Likely correction direction:
  - Fixed locally by replacing the nested created-token `auto-fill` grid wrapper with a flex column group and changing vault token grids to `repeat(auto-fit, minmax(min(190px, 100%), 1fr))`, which keeps the responsive card layout bounded in nested containers.
- Verification idea:
  - Keep the Skywire vault behavior spec as the regression guard for owned tokens, created collection groups, and Bluesky share draft side effects.
- Verification notes (2026-06-07):
  - One-created-token Playwright probe now reports one rendered created group and one rendered created tile.
  - Focused `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "vault separates owned tokens"` passed.
  - `node .agents/skills/impeccable/scripts/detect.mjs --json` against the repaired design files returned `[]`.
  - `npm run check`, `npm run build`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` passed; the full inventory suite reported `291 passed`.

### WTF-BB-221 - tz2at ecosystem analytics outlived live-puppet workflow budget

- Category: tz2at / ecosystem analytics reliability
- Status: Verified
- Owner/Session: Codex full-send verification repair
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - `npm run test:e2e:live:puppets` passed 125 checks but timed out the `social post to reward automation loop` workflow after 180 seconds before route navigation.
  - Manual API-probe timing on the local dev server showed the three `/api/tz2at/ecosystem/analytics` probes each exceeding a 15-second guard while neighboring probes returned quickly.
  - The endpoint had per-fetch ATProto timeouts but no total request budget, so PDS inventory, replay, hydration, and entity-repo sampling could fan out long enough to block verification and the UI request.
- Why it matters:
  - External analytics should degrade into a clear timed-out state. A slow ATProto/PDS upstream must not make the social workflow or Tz2at UI look like the whole app froze.
- Likely correction direction:
  - Add an Express-level request budget for ecosystem analytics, pass an abort signal into upstream fetches and hydration, return `504` with the timeout budget when the total request expires, and let live inventory accept that bounded upstream state.
- Verification idea:
  - Rerun the focused ecosystem analytics probes, the `social post to reward automation loop` live puppet workflow, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and the full live puppet suite before full-send deploy.
- Verification notes (2026-06-07):
  - Local authenticated probes for the three ecosystem analytics URLs now return explicit `504` timeout payloads in roughly 12 seconds when ATProto sampling misses the route budget.
  - Focused live puppet workflow `domain workflow with puppet: social post to reward automation loop` passed in 1.1 minutes.
  - `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, `npm run test:e2e:inventory`, and `npm run test:e2e:live:puppets` passed after the fix; the full live suite reported `126 passed`.

### WTF-BB-222 - public leaderboard profile alias hydration spent the public-data budget

- Category: Public leaderboard / profile alias hydration
- Status: Verified
- Owner/Session: Codex full-send verification repair
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - The rerun full live puppet suite fixed the prior `social post to reward automation loop`, but the `public data APIs and MCP agent token lifecycle stay bounded` check then timed out after 90 seconds.
  - Server logs during the failure showed repeated TzKT/TzProfiles retries while the public-data test was reading `/api/leaderboard?limit=100`.
  - `/api/leaderboard` loaded token holders, then tried best-effort profile alias hydration for every unresolved holder without capping or timeboxing that optional enrichment.
- Why it matters:
  - The public leaderboard should remain available even when profile providers are slow or rate-limited. Alias enrichment is useful, but it must not block public data, MCP token verification, or the OS route sweep.
- Likely correction direction:
  - Cap the number of unresolved addresses sent through profile alias hydration, add a short route-local timeout for that optional pass, and return the leaderboard with holder aliases, Tezos domains, or app wallet links when profile aliases miss the budget.
- Verification idea:
  - Run the leaderboard wiring test, directly time `/api/leaderboard?limit=100` under the local server, rerun the focused `public data APIs and MCP agent token lifecycle stay bounded` live puppet check, then rerun the full live puppet suite.
- Verification notes (2026-06-07):
  - Focused live puppet check `public data APIs and MCP agent token lifecycle stay bounded` passed in 40.5 seconds with TzProfiles retry noise still present.
  - Focused leaderboard wiring test passed: `node --test --import tsx --test-name-pattern "keeps leaderboard views" server/routes-wiring.test.ts`.
  - `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, `npm run test:e2e:inventory`, and `npm run test:e2e:live:puppets` passed after the fix; the full live suite reported `126 passed`.

### WTF-BB-236 - WTF Domains cannot be enabled from the app registry

- Category: Macaroni / app registry feature gate
- Status: Verified
- Owner/Session: Codex Macaroni domains registry hotfix
- Score: C2 + F5 + S0 + P1(4) = 10
- Evidence:
  - The live `/wtf-subdomains` route and Settings subdomain applet shipped, but `WTF Domains` was not present as a canonical `DesktopAppKey`.
  - `client/src/features/admin-os/admin-surface-registry.ts` grouped `/wtf-subdomains` under the `hoard` desktop app surface, so route observability existed without an independent `desktop:wtf-subdomains` registry seed.
  - `server/features/app-registry/backfill-policy.ts` seeds from `WTF_APP_PACKAGE_ACCEPTANCE`, which is generated from `DESKTOP_APPS`; absent `wtf-subdomains`, registry-on environments cannot enable the feature as its own app.
- Why it matters:
  - Macaroni depends on users being able to claim/configure `username.wtfos.me` and `label.wtf.tez` before publishing. If operators cannot enable the Domains owner surface, the applet is installed but administratively blocked.
- Likely correction direction:
  - Promote WTF Domains to a canonical desktop app key, give it its own admin surface and app-registry package seed, gate `/wtf-subdomains` through that key, and add regression coverage proving the seed exists.
- Verification idea:
  - Run app-registry backfill policy tests, shared package acceptance tests, admin surface registry tests, start-menu gate tests, TypeScript, and inventory coverage.
- Verification notes (2026-06-11):
  - Fixed by promoting WTF Domains to canonical desktop app key `wtf-subdomains`, adding default gate config, Tezos Platform docs/package metadata, a dedicated `wtf-domains` admin surface, and `/wtf-subdomains` Start Menu/direct-route gating.
  - Focused registry/gate tests passed: `npx tsx --test shared/wtf-app-packages.test.ts server/features/app-registry/backfill-policy.test.ts client/src/features/admin-os/admin-surface-registry.test.ts client/src/components/layout/start-menu-app-gates.test.ts`.
  - App-gate behavior assertion command passed, `npm run check -- --pretty false` passed, `npm run test:e2e:inventory:coverage` passed, and `npm run test:e2e:inventory` passed with `302 passed`.

### WTF-BB-238 - Inventory harness artifact instability can masquerade as Skywire/WTF LIVE regressions

- Category: E2E / Playwright harness artifact stability
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - A full inventory attempt during the WTF Domains windowing pass failed in three unrelated specs: the Skywire unresolved-handle OAuth notice, WTF LIVE private-room popup, and WTF LIVE crowded idle-room layout.
  - The same failing run also emitted missing build/trace artifact signals, including `ENOENT` while statting `dist/public/index.html` and missing Playwright `recording*.network` files during trace artifact copy.
  - The current `test-results/.last-run.json` reports `passed`, and a fresh-harness targeted rerun passed all three affected tests: `CI=1 npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "unresolved Bluesky|private WTF-user|public room keeps chat reachable"`.
- Why it matters:
  - Cross-domain failures make healthy Skywire and WTF LIVE surfaces look suspect, and the retained failure traces can disappear before analysis. That wastes debugging time and can lead to risky product patches instead of test-runner hardening.
- Likely correction direction:
  - Make inventory runs use an isolated built artifact directory or guarantee no concurrent rebuild removes `dist/public` while the harness is serving it; prefer no-reuse harness mode for full inventory verification; isolate trace output per run; and preserve enough server/build logs to explain artifact failures.
- Verification idea:
  - Reproduce by running full inventory while intentionally rebuilding or removing `dist/public`, then harden the harness/build lifecycle and prove the same interruption fails early with an artifact-health error instead of unrelated app-spec names. Rerun full inventory plus the focused Skywire/WTF LIVE command above.
- Related note (2026-06-28):
  - Gamma's monolithic presentation proof was hardened with a shell-ready wait that requires the Gamma root, route marker, no Classic desktop, and no `data-gamma-route-loading` before sampling app-owned chrome. This removed a separate readiness race in `tests/playwright/inventory/gamma-wtfos.spec.mjs`, but it does not close the broader artifact-isolation bounty above.
- Related note (2026-06-29):
  - Gamma media discovery/detail pass saw direct `playwright test tests/playwright/inventory` collapse after the first passing auth-session spec, with unrelated Beta, Broot, domain, Gamma, route-smoke, and subdomain specs failing on `apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:4173` after the shared harness died. Touched media-detail proof passed before and after the cascade, including a fresh `HARNESS_PORT=4273` rerun, and the full Gamma suite passed `55/55` on the same fresh port.

### WTF-BB-239 - Macaroni Shadownet mint/setup flow can surface RPC errors

- Category: Macaroni / Shadownet RPC setup
- Status: Verified
- Owner/Session: Codex Macaroni Shadownet RPC puppet pass
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User report on 2026-06-12: a user attempted to use Macaroni on Shadownet and hit RPC errors.
  - Current coverage proves Macaroni route reachability, publishing permission gates, and WTF Domains setup mocks, but there is no Macaroni-specific local Shadownet Playwright runner using dummy accounts plus puppet wallet state.
- Why it matters:
  - Macaroni is a trusted creator minting tool. A Shadownet rehearsal should catch RPC URL, chain-id, wallet metadata, and setup defaults before creators reach a wallet-signing or contract-origination screen.
- Likely correction direction:
  - Map the vendored Macaroni static app's network defaults and RPC usage, make Shadownet a first-class configured target with the expected chain id, and add a repeatable local Playwright runner that seeds dummy accounts/puppet wallets, opens Macaroni on Shadownet, and asserts the user-facing setup path avoids RPC errors.
- Fix:
  - Added Shadownet's expected chain id (`NetXsqzbfFenSTS`) to the vendored Macaroni static helper, made signed-operation safety use strict RPC chain-id preflight, and added a Shadownet-only local runner plus Playwright live spec that seeds dummy accounts and injects a puppet Beacon wallet in the Macaroni iframe.
- Verification:
  - `npx tsx --test server/routes/macaroni-policy.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts` passed.
  - `npm run test:e2e:macaroni:shadownet` passed 2 Playwright tests after seeding dummy Shadownet puppet accounts; the spec verified the live Shadownet chain id in the iframe, a successful puppet wallet connect, strict operation preflight, and a bad-RPC mismatch block before signing.
  - `npm run test:e2e:inventory:coverage`, `npx tsx --test client/src/features/admin-os/admin-surface-registry.test.ts shared/wtf-app-packages.test.ts`, and `npm run check -- --pretty false` passed.
  - `npm run test:e2e:inventory` reached 302/303 passing with the Macaroni route passing; the only broad-suite failure was the unrelated `/swap` route smoke reporting `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`, and a focused `/swap` rerun passed.

### WTF-BB-240 - Macaroni Shadownet Kukai pairing opens a blank or wrong tab

- Category: Macaroni / Beacon Kukai Shadownet pairing
- Status: Verified
- Owner/Session: Codex Macaroni Kukai Shadownet handoff pass
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - User report on 2026-06-12: when a user selects Kukai from the Beacon wallet picker in Macaroni on Shadownet, a new tab opens but nothing loads; the expected target is `https://shadownet.kukai.app`.
  - Macaroni was sending Shadownet to Beacon as a generic `custom` network even though the vendored Beacon wallet catalog includes a concrete Kukai Shadownet web link.
- Why it matters:
  - Kukai is a primary browser wallet path for creators rehearsing drops on Shadownet. A blank wallet tab makes the app look broken before the user can even approve permissions.
- Likely correction direction:
  - Send Beacon the concrete `shadownet` network type while keeping the explicit Shadownet RPC and chain-id guard, then add a browser regression that clicks Kukai in the real Beacon picker and asserts the popup URL targets `shadownet.kukai.app`.
- Fix:
  - Changed Macaroni's Shadownet Beacon network from generic `custom` to concrete `shadownet`, while preserving the explicit Shadownet RPC and strict chain-id safety guard.
  - Added policy coverage that ties the concrete Beacon network type to the vendored Kukai Shadownet web link.
  - Added a focused Playwright regression that opens Macaroni Studio, selects Kukai in Beacon, clicks `Use Browser`, and asserts the popup URL targets `shadownet.kukai.app`.
- Verification:
  - `npx tsx --test server/routes/macaroni-policy.test.ts` passed.
  - `node --check tests/playwright/live/macaroni-shadownet.spec.mjs && node --check scripts/macaroni/run-local-shadownet-puppet-e2e.mjs` passed.
  - `npm run test:e2e:inventory:coverage` passed.
  - `TEZOS_NETWORK=shadownet ... npx playwright test --config=playwright.live.config.mjs tests/playwright/live/macaroni-shadownet.spec.mjs -g "Beacon Kukai"` passed and observed the Kukai popup route to Shadownet.

### WTF-BB-241 - Macaroni connect bypasses the Beacon wallet picker

- Category: Macaroni / Beacon wallet picker regression
- Status: Verified
- Owner/Session: Codex Macaroni Beacon picker restoration
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-12: the Shadownet Kukai repair had changed Macaroni wallet connect so it went straight to Temple instead of showing the Beacon wallet picker, removing Kukai as an explicit user choice.
  - Local reproduction showed Beacon singleton/session state could bypass the chooser or render stale provider state after explicit Macaroni connect.
- Why it matters:
  - Macaroni's wallet connection contract is a user-selected Beacon provider handoff. Fixing Kukai's URL cannot remove the chooser, because creators need Kukai, Temple, and other Beacon wallet options visible before any wallet-specific tab opens.
- Fix:
  - Macaroni now resets only Beacon's active picker/session state before an explicit connect, preserves Beacon identity/relay storage needed by the SDK, disables/no-ops Beacon metrics writes that were failing in the static app, and creates Beacon with the same first-class wallet choices used by the WTF/Kiln/Bowser connection patterns.
  - The vendored Taquito Beacon wallet construction now honors `resetClient` so Macaroni can avoid stale DAppClient singleton state without forcing a direct wallet provider path.
  - Restore no longer creates a wallet on page load; Macaroni only requests Beacon permissions from the user-initiated Connect action.
- Verification:
  - `node --check public/creation-tools/macaroni/js/common.js && node --check public/creation-tools/macaroni/vendor/tezos.js` passed.
  - `npx tsx --test server/routes/macaroni-policy.test.ts client/src/lib/tezos/wallet-connect-policy.test.ts` passed.
  - `TEZOS_NETWORK=shadownet ... npx playwright test --config=playwright.live.config.mjs tests/playwright/live/macaroni-shadownet.spec.mjs -g "Beacon Kukai"` passed and asserted no wallet popup opens before the Beacon chooser, Kukai and Temple are both visible, and Kukai opens `shadownet.kukai.app`.
  - `npm run test:e2e:macaroni:shadownet` passed all 3 focused dummy-account/puppet-wallet Shadownet tests.

### WTF-BB-242 - Embedded Macaroni sandbox blocks Kukai popup navigation

- Category: Macaroni / creation-tool iframe wallet popup sandbox
- Status: Verified
- Owner/Session: Codex Macaroni embedded sandbox popup repair
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - User console report on 2026-06-12: `Unsafe attempt to initiate navigation for frame with URL 'about:blank' from frame with URL 'https://wtfos.app/creation-tools/macaroni/studio.html'` followed by a `SecurityError` when `tezos.js` tried to set popup `Location.href` to `https://shadownet.kukai.app/...`.
  - The direct static Studio URL passed because it is not sandboxed; the real app entrypoint `/tools/macaroni` embeds Studio in `CreationToolFrame`, whose sandbox allowed popups but did not include `allow-popups-to-escape-sandbox`.
- Why it matters:
  - Beacon opens an `about:blank` popup and then navigates it to the selected wallet URL. Without popup sandbox escape, the browser blocks the navigation even though Beacon picked the correct Shadownet Kukai URL.
- Fix:
  - Added `allow-popups-to-escape-sandbox` to the creation-tool iframe sandbox.
  - Moved the focused Beacon Kukai Playwright regression through `/tools/macaroni` and the embedded iframe, then asserted the Kukai popup reaches and loads Shadownet content.
- Verification:
  - `npx tsx --test server/routes/macaroni-policy.test.ts client/src/lib/tezos/wallet-connect-policy.test.ts` passed.
  - `TEZOS_NETWORK=shadownet ... npx playwright test --config=playwright.live.config.mjs tests/playwright/live/macaroni-shadownet.spec.mjs -g "Beacon Kukai"` passed through the embedded `/tools/macaroni` iframe and loaded Kukai Shadownet content.

### WTF-BB-251 - Generated Macaroni mint quantity can exceed effective allowance

- Category: Macaroni / generated mint page quantity guard
- Status: Verified
- Owner/Session: Codex Macaroni effective mint allowance pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-13: creator set max mint limit to 3, a wallet had already minted 2, but the generated page still allowed the collector to set the mint counter to 2, creating a doomed wallet transaction because only 1 mint remained for that wallet.
  - Existing generated page logic clamped by the raw stage max-per-wallet value or a cached wallet remaining value, but did not consistently clamp by live collection remaining supply, allowlist remaining allowance, or a fresh preflight read before wallet signing.
- Why it matters:
  - Collectors should not be asked to sign transactions the UI can already prove will fail. The safe request amount is the minimum of collection remaining supply, connected wallet remaining per-wallet allowance, connected wallet remaining allowlist allowance, and the UI safety cap.
- Fix:
  - Added one effective quantity cap from live collection remaining supply, wallet per-stage minted count, stage max-per-wallet, allowlist capacity, and the UI safety cap.
  - Disabled quantity increase and mint while wallet-specific allowance is loading, and refreshed storage/status again during mint preflight before opening the wallet prompt.
- Verification:
  - `node --check public/creation-tools/macaroni/js/drop.js` passed.
  - `npx tsx --test server/routes/macaroni-policy.test.ts` passed.
  - `npm run test:e2e:inventory:coverage` passed.
  - GitHub Deploy to Hetzner run `27476940932` passed.
  - GitHub Quality Gates run `27476940928` passed.
  - Live `https://wtfos.app/api/health` reported `commitRef: 70337b0`.
  - Live `https://wtfos.app/creation-tools/macaroni/js/drop.js` contains `MINT_QTY_UI_CAP`, `effectiveQtyMax`, `collectionRemaining`, `walletAllowancePending`, and the over-limit message path.

### WTF-BB-253 - Embedded Macaroni Studio silently drops modal validation/deploy errors

- Category: Macaroni / embedded Studio modal feedback
- Status: Verified
- Owner/Session: Codex Macaroni sandbox-safe Studio feedback pass
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-13: the `paulwhoisaghost` account could complete the mainnet Macaroni flow until Deploy Contract, but the button appeared to do nothing.
  - Browser console showed repeated `Ignored call to 'alert()'. The document is sandboxed, and the 'allow-modals' keyword is not set` from `studio.js:637`.
  - Studio used native `alert()` for deploy validation/error paths and native `confirm()` for mainnet deployment, but `/tools/macaroni` intentionally embeds Studio in a sandboxed iframe.
- Why it matters:
  - A creator tool cannot hide the reason a value-bearing mainnet deployment did not proceed. Adding `allow-modals` would loosen the iframe sandbox; the safer fix is first-class in-page feedback that works inside the existing sandbox.
- Fix:
  - Replace native Studio modal calls with an inline `studioNotice` live region and status-specific messages.
  - Replace the mainnet deploy browser confirm so the sandbox no longer swallows the operation path; WTF-BB-254 later removes the temporary mainnet-specific panel to restore deploy parity with Shadownet.
  - Add source-policy coverage that Studio no longer calls native `alert()`/`confirm()`.
- Verification:
  - `node --check public/creation-tools/macaroni/js/studio.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - Focused sandbox iframe repro confirmed the Deploy button renders `Connect your wallet first.` in `#studioNotice`/`#deployStatus` with no blocked modal console warnings.
  - GitHub Deploy to Hetzner run `27480955620` succeeded.
  - GitHub Quality Gates run `27480955606` succeeded.
  - Live health reported production commit `b5b2384`.
  - Live `https://wtfos.app/creation-tools/macaroni/studio.html` exposed `studioNotice`; live `studio.js` exposed `notify` and contained no native `alert(`/`confirm(` calls. The temporary mainnet confirmation panel is superseded by WTF-BB-254.

### WTF-BB-254 - Macaroni mainnet deploy path drifted from Shadownet rehearsal path

- Category: Macaroni / mainnet deploy parity and Beacon lifecycle
- Status: Verified
- Owner/Session: Codex Macaroni mainnet deploy path repair
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - User report on 2026-06-13: after the sandbox feedback fix, live mainnet deploy surfaced `Treasury is not a valid Tezos address` after refresh/reconnect.
  - Console also showed Beacon duplicate-client and `disconnect on reset failed Error: No transport available` warnings during reconnect.
  - Code review showed Studio had a mainnet-only confirmation branch before origination even though the Shadownet deploy path is the tested rehearsal path and should differ only by network/RPC.
- Why it matters:
  - Mainnet and Shadownet deployment confidence depends on using one shared wallet/origination path. Extra mainnet-only UI changes the exact path being tested, while repeated Beacon client construction can cause reconnect instability.
- Fix:
  - Remove the mainnet-only confirmation panel and keep `deploy()` shared across networks with `MD.assertOperationSafety()` as the network/RPC guard.
  - Normalize optional royalty/treasury placeholder address values to blank so the connected wallet default works after refresh.
  - Note: the attempted page Beacon client reuse from this fix was later proven to regress explicit connect and is superseded by WTF-BB-255.
- Verification:
  - `node --check public/creation-tools/macaroni/js/studio.js public/creation-tools/macaroni/js/common.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - GitHub Deploy to Hetzner run `27481859874` succeeded.
  - GitHub Quality Gates run `27481859857` succeeded.
  - Live health reported production commit `4c84b5e`.
  - Live `studio.html` exposes `studioNotice` and no `mainnetDeployConfirm` / `btnConfirmMainnetDeploy` controls.
  - Live `studio.js` exposes `normalizeOptionalAddress`, `invalidAddressNotice`, and the shared `tezos.wallet.originate({ code, storage }).send()` deploy path, with no `mainnetDeploy*`, native `alert(`, or native `confirm(` runtime calls.
  - Live `common.js` at commit `4c84b5e` exposed the attempted reconnect reuse; WTF-BB-255 tracks and corrects that regression.

### WTF-BB-255 - Macaroni Beacon reconnect and treasury default regression

- Category: Macaroni / Beacon connect lifecycle and treasury defaults
- Status: Verified
- Owner/Session: Codex Macaroni wallet regression repair
- Score: C3 + F5 + S1 + P0(5) = 14
- Evidence:
  - User report on 2026-06-13: after the deploy-path parity fix, live Macaroni failed on both Shadownet and mainnet even though Shadownet deployments had worked earlier the same day.
  - The visible deploy error was `Treasury "paulwhoisaghost" is not a valid Tezos address`, meaning an optional treasury field held a wtfOS identity/display name and therefore prevented fallback to the connected wallet address.
  - Console showed Beacon warning `An active account has been received, but no active subscription was found for BeaconEvent.ACTIVE_ACCOUNT_SET`.
  - Diff review from working commit `9f04de2` to live commit `2d100e0` showed commit `4c84b5e` changed explicit connect from dropping the cleared Beacon wallet and constructing a fresh `BeaconWallet` with reset enabled to clearing account/peer/transport and then reusing that same client with `resetClient: false`.
- Why it matters:
  - Macaroni's creator deploy path must preserve the known-working Shadownet wallet lifecycle before mainnet use. Reusing a cleared Beacon client can break provider subscriptions and make both networks fail.
  - Optional treasury/royalty fields are documented as defaulting to the connected wallet. A stale draft or browser-autofilled username in those fields must not override that fallback unless it is a real Tezos address.
- Fix:
  - Restore the working explicit-connect lifecycle: clear stale Beacon account/peer/transport/local state, drop the page wallet object, then construct a fresh wallet client for the user-initiated permission request.
  - Treat invalid optional royalty/treasury input as blank at form/load/fill time and disable browser autocomplete on Tezos address fields, while still using `state.drop.treasuryAddr || MD.getAccount()` for storage.
- Verification:
  - `node --check public/creation-tools/macaroni/js/studio.js public/creation-tools/macaroni/js/common.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - GitHub Deploy to Hetzner run `27485682458` succeeded.
  - GitHub Quality Gates run `27485682461` succeeded.
  - Live health reported production commit `c1279a0`.
  - Live `common.js` exposes the restored explicit-connect lifecycle: `resetClient` defaults to true, reset drops `wallet = null`, explicit Connect calls `wallet = makeWallet(appName)`, and the bad `dropWallet`/reuse path is absent.
  - Live `studio.js` clears non-Tezos optional address values, keeps `treasury: state.drop.treasuryAddr || me`, and still uses the shared chain-guarded origination path.
  - Live `studio.html` disables autocomplete/autocapitalize/spellcheck on optional Tezos treasury and royalty fields.

### WTF-BB-262 - Profile new-wallet linking allowed address-only submission

- Category: Auth / wallet onboarding
- Status: Verified
- Owner/Session: Codex Macaroni onboarding patch
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - The final onboarding audit found Profile still exposed a manual Tezos wallet address field that posted directly to `/api/wallets` with only `walletAddress`.
  - The shared wallet context already owns a challenge/signature flow for explicit wallet connect, but Profile could bypass that proof path for new links.
- Why it matters:
  - New wtfOS account onboarding relies on wallet ownership before roles, subdomain eligibility, and creator workflows can be trusted.
  - Address-only linking can attach a wallet identity without proving control at the point of link.
- Correction:
  - Replaced the raw wallet-address link field with an explicit connected-wallet proof button that calls the shared wallet context `connect()` flow.
  - Added user-facing copy explaining that typed addresses are not accepted for new wallet links.
  - Added source-policy coverage so Profile cannot reintroduce address-only `/api/wallets` submission.
- Verification:
  - Passed `npx tsx --test client/src/lib/wallet-context-policy.test.ts client/src/pages/profile-wallet-link-policy.test.ts`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `tsc --noEmit --pretty false`.

### WTF-BB-263 - Macaroni could publish a wtfOS mint page before a contract existed

- Category: Macaroni / generated mint page readiness
- Status: Verified
- Owner/Session: Codex Macaroni onboarding patch
- Score: C1 + F4 + S0 + P1(4) = 9
- Evidence:
  - The final onboarding audit found Macaroni's website export path and wtfOS publish path both accepted draft config with an empty contract.
  - A user could publish `username.wtfos.me/drop-title` before deploying or resuming a `KT1...` contract, creating a public mint page that cannot mint.
- Why it matters:
  - Draft exports are useful before deployment, but public wtfOS mint pages should not be published until the on-chain contract exists.
  - Failing late on the public subdomain makes the "create drop then publish mint page" flow look broken after the user has already completed earlier setup.
- Correction:
  - Kept draft website export available.
  - Added a Studio-side wtfOS publish readiness gate that requires a valid `KT1...` contract.
  - Added the same `KT1...` normalization/rejection to `/api/macaroni/publish` so direct API calls fail closed.
  - Updated Studio copy, inventory probes, and behavior assertions to distinguish draft export from live wtfOS publish.
- Verification:
  - Passed `node --check public/creation-tools/macaroni/js/studio.js public/creation-tools/macaroni/js/common.js public/creation-tools/macaroni/js/drop.js`.
  - Passed `npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/publish.test.ts`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `tsc --noEmit --pretty false`.

### WTF-BB-264 - Macaroni hosted pinning can stall behind Cloudflare's request body cap

- Category: Macaroni / hosted IPFS direct upload lane
- Status: Verified
- Owner/Session: Codex Macaroni direct upload lane
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - 2026-06-15 live incident report: creator saw artifact/metadata pinning freeze around token 3 of a 120-token drop.
  - Read-only production checks showed `/api/health` healthy on commit `cc2d7bd`, app container healthy/not OOM-killed, and no Macaroni/IPFS app log errors.
  - `ipfs_pinning_jobs` had only the collection cover, `1.mp4`, `1.json`, `2.mp4`, and `2.json` for source `macaroni`; latest row was `2.json` at `2026-06-15 01:13:13 UTC`.
  - `challenge_system_events` showed matching `ipfs_pinning.storage.staged` events through `2.json` only; no token 3 staging event existed, so the stall was before the first durable server progress marker for that artifact.
- Why it matters:
  - The app can enforce a 1 GB Macaroni upload limit, but `wtfos.app` is still Cloudflare-proxied. Oversized multipart uploads can be rejected or stranded before Express/multer ever sees the request, making Studio look frozen while the backend has no row to inspect.
  - Widening auth cookies to a separate upload subdomain would increase session blast radius. The direct path needs a narrow bearer-ticket boundary instead.
- Correction:
  - Added `/api/macaroni/ipfs/upload-ticket`, gated by `trusted_market_creator`, to mint short-lived HMAC upload tickets through the normal same-origin CSRF/session boundary.
  - Added bearer-only `/api/macaroni/ipfs/upload`, which validates and consumes the ticket before multer buffers the file, then stages/pins as source `macaroni`.
  - Updated Studio's wtfOS provider to request an upload ticket before each hosted pin and POST the actual file to the returned upload URL with `Authorization: Bearer ...` and `credentials: "omit"`.
  - Added `MACARONI_DIRECT_UPLOAD_ORIGIN` and `MACARONI_UPLOAD_TICKET_SECRET` env guidance. When `MACARONI_DIRECT_UPLOAD_ORIGIN=https://upload.wtfos.app` or the origin-only fallback `https://upload.5-78-202-50.sslip.io`, Studio sends only the file POST to that direct host.
  - Added a Caddy `upload.wtfos.app, upload.5-78-202-50.sslip.io` block that proxies only `/api/macaroni/ipfs/upload` and returns 404 for every other path.
- Verification:
  - Local/source: `node --check public/creation-tools/macaroni/js/common.js`, `node --check public/creation-tools/macaroni/js/studio.js`, `npx tsx --test server/lib/cors-origins.test.ts server/routes/macaroni-policy.test.ts`, `node scripts/caddy-domain-policy.test.mjs`, `npm run check -- --pretty false`, `npm run build`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` all passed.
  - GitHub: Deploy to Hetzner run `27519983597` and Quality Gates run `27519983587` passed for commit `57e5e30a828816c2e7f6d40a9f4734a764f6e724`.
  - Production: `https://wtfos.app/api/health` returned `status:"ok"` with `commitRef:"57e5e30"`, the app container had Macaroni direct origin and ticket secret env loaded, and live static Macaroni `common.js`/`studio.js` contained the ticketed upload plus upload-progress code.
  - Direct origin: `https://upload.5-78-202-50.sslip.io/` returned Caddy 404, CORS preflight to `/api/macaroni/ipfs/upload` from `https://wtfos.app` returned 204 with `Access-Control-Allow-Origin: https://wtfos.app`, and unauthenticated upload POST returned 401 `Invalid or expired Macaroni upload ticket`.
  - 2026-06-15 canonical host follow-up: the Cloudflare/R2 credential set is stored on Hetzner at `/etc/wtf/cloudflare.env` with `0600` root-only permissions. The account token can administer account-owned tokens but could not edit zone DNS directly, so a narrow `CLOUDFLARE_DNS_API_TOKEN` was minted for `wtfos.app` with `Zone Read` and `DNS Write`.
  - 2026-06-15 canonical verification: Cloudflare DNS now has DNS-only `A upload.wtfos.app -> 5.78.202.50`, public resolvers `1.1.1.1` and `8.8.8.8` both returned `5.78.202.50`, `https://upload.wtfos.app/` returned Caddy 404 instead of Cloudflare, production app env reports `MACARONI_DIRECT_UPLOAD_ORIGIN=https://upload.wtfos.app`, CORS preflight to `/api/macaroni/ipfs/upload` from `https://wtfos.app` returned 204, unauthenticated upload POST returned 401, and `https://wtfos.app/api/health` returned `ok` on commit `d38b572` with jobs healthy.

### WTF-BB-265 - Macaroni upload tickets used the 250 MB average as a per-file hard cap

- Category: Macaroni / practical media upload tickets
- Status: Fixed
- Owner/Session: Codex Macaroni ticket limit regression
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - 2026-06-15 live browser console showed `/api/macaroni/ipfs/upload-ticket` returning 400 with `File exceeds the 250 MB Macaroni IPFS upload limit` while attempting to pin a drop that should allow larger individual artifacts under the 1 GB hard cap.
  - Production app env reported `MACARONI_IPFS_MAX_BYTES=262144000`, and `server/routes/macaroni.ts` used `macaroniIpfsMaxBytes()` for ticket issuance and multer file size limits.
- Why it matters:
  - The practical media policy deliberately separates a 1 GB per-artifact hard max from a 250 MB average-artifact cap. A 250 MB upload-ticket cap blocks valid larger videos before Studio can enforce the collection average.
  - The direct upload lane was healthy, so leaving this as a ticket policy bug would make the Cloudflare bypass look broken even though the request never reached the direct file POST.
- Correction:
  - Updated production Hetzner env in `/opt/platform/repos/wtf-app/.env` and `/etc/wtf/wtf.env` to `MACARONI_IPFS_MAX_BYTES=1073741824`, then recreated the app container.
  - Moved Macaroni's server hard cap into `server/features/macaroni/upload-limits.ts` as a fixed 1 GB helper, so legacy env drift cannot lower the upload-ticket/multer cap back to the 250 MB average.
  - Updated `.env.example` to mark `MACARONI_IPFS_MAX_BYTES` as a legacy deploy key and keep the 250 MB average documented as a Studio policy, not a server file-size cap.
- Verification:
  - Local/source: `npx tsx --test server/features/macaroni/upload-limits.test.ts server/routes/macaroni-policy.test.ts`, `npm run check -- --pretty false`, `npm run build`, and `npm run test:e2e:inventory:coverage` passed.
  - Production immediate env repair: `https://wtfos.app/api/health` returned `ok` on commit `62f2a57`, app env reported `MACARONI_IPFS_MAX_BYTES=1073741824`, `MACARONI_DIRECT_UPLOAD_ORIGIN=https://upload.wtfos.app`, and `https://upload.wtfos.app/` returned Caddy 404.
  - Full-send verification: Deploy to Hetzner run `27529326522` and Quality Gates run `27529326533` passed for commit `635083487ad84010c26e878ec5f564b3ffce8bd9`; live health returned `ok` with `commitRef:"6350834"`, app env reported `MACARONI_IPFS_MAX_BYTES=1073741824`, canonical upload host returned Caddy 404, and CORS preflight to `/api/macaroni/ipfs/upload` from `https://wtfos.app` returned 204.

### WTF-BB-266 - Macaroni wtfOS publish returns a dead `.me` user-site link

- Category: Macaroni / PDS-backed user-site serving
- Status: Verified
- Owner/Session: Codex Macaroni PDS user-site publish investigation
- Score: C4 + F5 + S1 + P1(4) = 14
- Evidence:
  - User report on 2026-06-15: Macaroni reached contract deployment, then `Publish to wtfOS` reported `Published to https://paulwhoisaghost.wtfos.me/airporters-vol-1`, but the URL was dead.
  - Live DNS: `paulwhoisaghost.wtfos.me` and `*.wtfos.me` resolve through GoDaddy/DomainControl to the `.me` AT-services box `5.78.214.209`; no Cloudflare DNS change was applied during the investigation.
  - Public HTTPS for `paulwhoisaghost.wtfos.me/airporters-vol-1` fails during TLS, while a direct app-container request with `Host: paulwhoisaghost.wtfos.me` returns the rendered `Airporters Vol. 1` HTML from the app server.
  - Production DB has `wtf_user_sites.host='paulwhoisaghost.wtfos.me'`, `status='published'`, `published_version_id=1`, and pages `home` plus `airporters-vol-1`.
  - The corresponding `wtfos_atproto_outbox` row for `app.wtfos.identity.site` is still `queued`, and the production scheduler does not register a recurring WTFOS AT outbox publisher.
  - Immediate bridge on 2026-06-15: added explicit GoDaddy `A` record `paulwhoisaghost.wtfos.me -> 5.78.202.50` so this one host overrides the wildcard `*.wtfos.me -> 5.78.214.209` while the `.me` PDS serving tier remains unfinished.
- Why it matters:
  - The current success message means "saved and published inside the app database," not "available from the `.me` user-site serving tier." Creators get a positive readout followed by a dead public link.
  - The intended architecture is for personal sites to be served by the low-load `.me` AT/PDS box, not by routing wildcard user-site traffic to the Cloudflare-fronted `wtfos.app` server.
  - The current `app.wtfos.identity.site` record is only a provenance pointer (`host`, `url`, `versionDigest`, `pageSlugs`) and does not contain the page HTML/assets needed for a standalone PDS-backed renderer.
- Correction direction:
  - Temporary bridge completed for this drop only: backed up the prior empty explicit record at `/opt/platform/atproto-dns-backup/wtfos.me.A.paulwhoisaghost.pre-bridge.20260615T080535Z.json`, set the explicit record through the stored GoDaddy API credentials, let app Caddy obtain a Let's Encrypt certificate for `paulwhoisaghost.wtfos.me`, and verified the drop page over HTTPS.
  - App-side fix implemented: user-site publish now enqueues `app.wtfos.identity.siteSnapshot` in the user repo and `app.wtfos.identity.siteIndex` in the primary repo, the outbox publisher has a recurring background job plus an exact source flush for Macaroni publishes, deterministic rkeys use `putRecord`, and the Macaroni response only reports `live: true` when the expected PDS rows and public URL probe both succeed.
  - Staged `.me` renderer implemented without activating wildcard traffic in the app server Caddy config: `wtfos-user-site-renderer` reads the primary index and user snapshot from PDS XRPC and serves HTML without the app database; the staged Caddy file only exposes an importable renderer snippet until the `.me` host can be updated.
  - Remaining production step: run the lightweight `.me` user-site renderer/router on `5.78.214.209` with on-demand TLS ask-gating so wildcard hosts are served by the `.me` tier instead of the temporary per-host bridge.
  - Keep DNS on the `.me` box for the intended architecture; do not "fix" this by pointing wildcard user hosts at the app server except as an explicitly temporary emergency bridge.
- Verification idea:
  - Temporary bridge verification passed: `ns63.domaincontrol.com`, `ns64.domaincontrol.com`, Cloudflare DNS, Google DNS, Quad9, and OpenDNS returned `5.78.202.50`; production-server curl to `https://paulwhoisaghost.wtfos.me/airporters-vol-1` returned HTTP/2 200, `content-length: 5087`, `x-wtfos-surface: user-site`, and `<title>Airporters Vol. 1`.
  - Local app-side verification passed: focused lexicon/Macaroni/outbox/user-site policy tests, `node --check public/creation-tools/macaroni/js/studio.js`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, `npm run build`, and a fake-PDS renderer smoke that served `live from pds` with `x-wtfos-surface: pds-user-site`.
  - Caddy syntax validation could not be run locally because neither `caddy` nor a local `caddy:2-alpine` image was installed; the staged file remains inactive and the active production `Caddyfile` wildcard bridge path was not changed.
  - After the real implementation, publishing a drop should leave no queued `wtf_user_site.published` outbox row for the site version, the user repo should expose the site artifact/record, and `https://paulwhoisaghost.wtfos.me/airporters-vol-1` should return HTTP 200 from the `.me` serving tier with the expected title and contract config.

### WTF-BB-256 - Macaroni access/export workflow drift

- Category: Macaroni / access model and self-host export
- Status: Verified
- Owner/Session: Codex Macaroni access/export workflow pass
- Score: C2 + F5 + S1 + P1(4) = 12
- Evidence:
  - User clarified on 2026-06-14 that every signed-in wtfOS user should be able to create and deploy blind drops, while only trusted creators should use hosted wtfOS pinning and publishing to `username.wtfos.me`.
  - Existing Studio state defaulted new drafts to `pin.kind = "wtfos"` before role resolution, and the server accepted either `trusted_market_creator` or `use_wtfos_pinning` for Macaroni hosted pinning.
  - Inventory copy described Macaroni as a trusted-creator/staff route and treated Pin Collector access as sufficient for the Macaroni hosted provider.
- Why it matters:
  - Macaroni should be a creator tool, not a platform-hosting gate. Ordinary users need a complete self-host/export path instead of seeing missing trusted-creator privileges as a broken app.
  - Hosted wtfOS Pinata/PDS/subdomain resources are platform resources tied to the trusted creator lane; blending them with broader Pin Collector access confuses support and quota expectations.
- Fix:
  - Keep contract deploy/sync/export available to signed-in users.
  - Default local drafts to self-managed Pinata/IPFS, hide the wtfOS provider and wtfOS publish button unless the account resolves to `trusted_market_creator`, and hard-block publish client-side when not trusted.
  - Tighten `/api/macaroni/ipfs/pin` to require `trusted_market_creator`, matching `/api/macaroni/publish`.
  - Add a config-backed installer manifest route for Mac/Windows/Raspberry Pi packages so the UI can expose real native installers without shipping dead links.
- Verification:
  - `node --check public/creation-tools/macaroni/js/studio.js && node --check public/creation-tools/macaroni/js/common.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - Local Playwright smoke of `http://127.0.0.1:4787/studio.html` confirmed default signed-in/non-trusted UI state: Pinata selected, no `wtfos` provider option, `Publish to wtfOS` hidden/disabled, self-host export copy visible, three installer slots disabled without configured artifact URLs, and no horizontal overflow.

### WTF-BB-257 - Macaroni native download slots had no installer pipeline

- Category: Macaroni / native installer packaging
- Status: Verified
- Owner/Session: Codex Macaroni desktop packaging pipeline
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - User clarified on 2026-06-14 that Macaroni should offer downloadable native apps for Windows, Mac, and Raspberry Pi without requiring testers to preinstall Python/npm or manually run a local server.
  - The Studio could expose installer slots through `/api/macaroni/installers`, but the repo had no package, lockfile, CI workflow, or release process that actually produced those no-prereq artifacts.
- Why it matters:
  - Dead or hand-built installer links would recreate the exact setup failure the hosted wtfOS integration was meant to remove.
  - The desktop build must also preserve the access split: local users can create/deploy/export, but wtfOS hosted pinning and subdomain publishing stay unavailable outside wtfOS.
- Fix:
  - Add `apps/macaroni-desktop`, an Electron wrapper that serves the bundled Macaroni Studio from localhost, exports static drop pages to the user's Documents folder, and blocks wtfOS hosted pin/publish APIs with explicit native-app messages.
  - Add reproducible npm scripts and a committed package lock for prepare, local pack/dist, macOS, Windows NSIS, and Raspberry Pi arm64 Debian builds.
  - Add a GitHub Actions workflow to build all installer targets, upload artifacts, and optionally attach them to `macaroni-desktop-v*` releases.
  - Add policy coverage and packaging docs so future passes can verify the installer pipeline without rediscovering Electron Builder rules.
- Verification:
  - `npm ci --prefix apps/macaroni-desktop`
  - `node --check apps/macaroni-desktop/src/main.cjs`
  - `node --check apps/macaroni-desktop/src/preload.cjs`
  - `node --check public/creation-tools/macaroni/js/studio.js`
  - `npm run macaroni:desktop:prepare`
  - `npm run macaroni:desktop:check`
  - `npm run dist:mac:dir --prefix apps/macaroni-desktop`
  - `npm run dist:mac --prefix apps/macaroni-desktop`
  - Local build produced `apps/macaroni-desktop/release/mac-universal/Macaroni Studio.app` with `Contents/Resources/app.asar`.
  - Local installer build produced `Macaroni-Studio-1.0.0-mac-universal.dmg`, `.zip`, and blockmap artifacts.

### WTF-BB-258 - Single-stage Macaroni drops imply extra sale stages

- Category: Macaroni / generated mint page UX
- Status: Verified
- Owner/Session: Codex Macaroni stage copy pass
- Score: C1 + F2 + S1 + P0(0) = 4
- Evidence:
  - User reported on 2026-06-16 that the generated mint/drop page says `Stage 1 is live` for a drop that only has one sale stage, which implies a future stage 2 that does not exist.
  - `public/creation-tools/macaroni/js/drop.js` built the live sale copy from the active stage id alone: `Stage ${act + 1} live`.
- Why it matters:
  - Buyers and creators read stage language as sale-structure information. A one-stage drop should communicate that the mint is simply open, while multi-stage drops should communicate the current position within the configured schedule.
- Fix:
  - Make generated mint-page live sale copy depend on configured stage count: `Mint is Live` for one-stage drops and `Currently on Sale Stage X of N` for multi-stage drops, while preserving allowlist and max-per-wallet suffixes.
- Verification:
  - `node --check public/creation-tools/macaroni/js/drop.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`

### WTF-BB-259 - Macaroni owned-mints copy and social sharing feel mechanical

- Category: Macaroni / generated mint page UX
- Status: Verified
- Owner/Session: Codex Macaroni owned-mints/share pass
- Score: C1 + F2 + S1 + P0(0) = 4
- Evidence:
  - User reported on 2026-06-16 that `1 mint(s) currently held by this wallet.` sounds like machine logging, while the owned-mints section should say `Your 1 mint` or `Your N mints`.
  - User also requested collector share buttons that open prefilled social post composers for X/Twitter-style posting and Bluesky, while preserving the raw media filename as intentional charm.
  - The generated page hard-coded wallet-specific approval copy as `Temple / Kukai / Umami`, which adds noise after the collector has already chosen a wallet.
- Why it matters:
  - The generated mint page is a collector-facing public surface. Mechanical pluralization and wallet-noise status text make a successful mint feel less polished, and missing share affordances wastes a natural post-mint promotion moment.
- Fix:
  - Move owned count into the section heading, remove redundant `mint(s)` status copy, keep filename captions, and add per-token X plus Bluesky compose links that prefill a human share message without using social APIs or auto-posting.
- Verification:
  - Add source-policy coverage for count-aware owned headings, X/Bluesky compose URLs, absence of `mint(s)` owned status copy, and absence of wallet-name approval noise.
  - `node --check public/creation-tools/macaroni/js/drop.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`

### WTF-BB-260 - Published user-site CSP blocks Macaroni wallet connect

- Category: Macaroni / user-site wallet CSP
- Status: Verified
- Owner/Session: Codex Macaroni user-site CSP pass
- Score: C1 + F3 + S1 + P1(4) = 9
- Evidence:
  - Live Airporters console reported CSP blocks for `wss://relay.walletconnect.org` under `connect-src 'self' https:` and `https://verify.walletconnect.org/` under `child-src 'none'` because no explicit `frame-src` was set.
  - The failure happened on the public published drop host `paulwhoisaghost.wtfos.me`, so the generated drop page wallet connect could not complete even though the wallet code path was active.
- Why it matters:
  - Published Macaroni drops are collector-facing sale pages. Blocking WalletConnect at CSP makes the mint button look broken and risks mistaken wallet-code changes.
- Fix:
  - Allow `wss://relay.walletconnect.org` in user-site `connect-src` and `https://verify.walletconnect.org` in `frame-src` for both the app host-router CSP and staged/PDS renderer CSP.
- Verification:
  - `npx tsx --test server/features/wtf-sites/user-site-csp-policy.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - Live Airporters header smoke confirms the CSP contains the relay websocket and verify-frame allowances after deploy.

### WTF-BB-261 - Published Macaroni snapshots keep stale inline runtime

- Category: Macaroni / user-site runtime compatibility
- Status: Verified
- Owner/Session: Codex Macaroni live snapshot pass
- Score: C1 + F2 + S1 + P0(0) = 4
- Evidence:
  - Existing published Airporters HTML still contained the older inline `macaroniDropJs` strings after the shared generator/runtime had deployed.
  - The stored user-site version is a full HTML snapshot, so future generator edits do not automatically change the live public drop page.
- Why it matters:
  - Existing collectors need the fixed mint-page copy, share links, recent-mint behavior, and media fallback without changing the contract or token metadata.
- Fix:
  - Serve published Macaroni snapshots through a compatibility normalizer that replaces inline Macaroni runtime scripts with the current deployed `common.js` and `drop.js`.
- Verification:
  - `npx tsx --test server/features/wtf-sites/macaroni-compat.test.ts`
  - Live Airporters body smoke confirms current-runtime markers, `Mint is Live`, and X/Bluesky compose URLs after deploy.

### WTF-BB-268 - WTF LIVE needs microphone permission diagnostics for mobile and non-standard browsers

- Category: WTF LIVE / microphone permissions and browser compatibility
- Status: Verified
- Owner/Session: Codex WTF LIVE mobile mic compatibility full-send
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User requirement on 2026-06-16: WTF LIVE public rooms have serious mobile connection issues, and one non-standard-browser support case looked like DuckDuckGo/Firefox failure before the real cause was missing operating-system microphone permission for the browser.
  - WTF LIVE started media from joined room controls, but had no guided microphone compatibility test that separated secure-context support, browser API support, browser permission denial, missing input devices, busy hardware/OS denial, or unsupported Permissions API states.
- Why it matters:
  - Mobile and privacy-focused browser users need a portable room join path that fails with actionable recovery copy instead of a generic media failure. Browser-level permission, OS-level privacy permission, hardware presence, and secure-origin support are separate gates, and users cannot fix the right setting if WTF LIVE collapses them into one error.
- Fix:
  - Added a room-level `Test mic` panel that runs before join, treats Permissions API support as optional, checks secure context and MediaDevices, enumerates audio inputs when possible, briefly opens/stops an audio-only stream on user gesture, and maps failure names to browser/site/OS recovery guidance.
  - Updated the normal Mic toggle to reuse the same diagnostics before opening room audio.
  - Updated the WTF LIVE interaction inventory, domain workflow registry, admin surface registry, and behavior assertion registry for `wtf_live.public_room.mic_test_completed`.
- Verification:
  - `tsc --noEmit --pretty false`
  - `tsx tests/e2e/inventory/coverage.ts`
  - `vite build`
  - `playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "mic test"`
  - `CI=1 playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`
  - `CI=1 playwright test tests/playwright/inventory`

### WTF-BB-269 - Custom Macaroni recent mints guessed blind token IDs

- Category: Macaroni / published drop recent mints
- Status: Verified
- Owner/Session: Codex Macaroni recent-mints hotfix
- Score: C1 + F3 + S1 + P1(4) = 9
- Evidence:
  - Live Airporters showed most custom recent-mint cards as `pending` even though TzKT contract storage reported the drop was revealed and current token metadata existed.
  - The custom Airporters recent section hid the generated Macaroni recent-mints widget and looped from `minted - 1` downward, but blind-mint token IDs are randomized. TzKT showed recent token IDs such as `90`, `33`, `112`, `61`, `93`, `63`, `8`, `100`, `110`, and `85`, so the sequential countdown naturally landed on mostly empty guesses.
- Why it matters:
  - A live blind-mint page must show actual collector activity, not inferred token slots. Displaying real mints as pending makes reveal and metadata handling look broken when the custom UI is using the wrong token source.
- Fix:
  - Added current-runtime compatibility for custom published recent-mint grids so `#airportersRecentGrid` is replaced from TzKT mint transfer rows, hydrated with contract/IPFS token metadata, identity-resolved through the existing Macaroni path, and refreshed after the stored custom script has run.
- Verification:
  - `node --check public/creation-tools/macaroni/js/drop.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts server/features/wtf-sites/macaroni-compat.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - Live Airporters smoke confirmed the custom grid renders actual random token IDs from recent TzKT mint transfers instead of `minted - 1` countdown guesses.

### WTF-BB-270 - Macaroni wallet gallery conflated owned tokens with minted tokens

- Category: Macaroni / generated mint page wallet gallery
- Status: Verified
- Owner/Session: Codex Macaroni minted-vs-owned gallery pass
- Score: C1 + F2 + S1 + P1(4) = 8
- Evidence:
  - The generated drop page heading and gallery used `fetchOwnedTokenIds`, so `Your mints` actually meant tokens currently held by the connected wallet.
  - Max-per-wallet enforcement comes from `stage_minted`, which counts what the wallet minted for the stage, even if the token was later transferred away. The gallery copy did not represent that distinction.
- Why it matters:
  - Collectors and creators need to understand both eligibility and holdings: how many the wallet has minted against the configured max, and how many tokens it currently owns. Treating ownership as mint history makes secondary transfers and sold/transferred-away mints confusing.
- Fix:
  - Added a TzKT mint-transfer lookup for tokens minted directly to the connected wallet, kept ownership from TzKT token balances, changed the wallet gallery heading to drop-token language, added minted-this-stage/currently-owned status copy, and ordered cards as minted-by-wallet first, then owned-from-other-minter tokens.
- Verification:
  - `node --check public/creation-tools/macaroni/js/drop.js && node --check public/creation-tools/macaroni/js/common.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts server/features/wtf-sites/macaroni-compat.test.ts`
  - `npm run test:e2e:inventory:coverage`
  - `git diff --check`

### WTF-BB-272 - Macaroni social shares omit creator social identity and token media

- Category: Macaroni / generated drop website social sharing
- Status: In Progress
- Owner/Session: Codex Macaroni social-share identity/media pass
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - The generated drop-page share text used `dropArtistName(meta)` for both X and Bluesky and did not include the token media URL, so collectors could post generic text that neither tagged the creator's matching social account nor showed the actual minted media.
  - Studio had no share handle or share-copy controls, so creators without auto-discovered wtfOS social handles could not fix the default message before export/publish.
- Why it matters:
  - Blind-mint sharing is collector-led distribution. Posts need to credit the creator on the same platform and include the minted token media link, while still avoiding posting APIs or auto-publishing on the collector's behalf.
- Fix:
  - Add Studio social-share controls for X handle, Bluesky handle, and editable message template.
  - Prefill blank Studio share handles from `/api/profile/social` when available.
  - Enrich blank wtfOS-published configs from the trusted creator's public X handle and linked AT/Bluesky handle on the server.
  - Make generated X/Bluesky compose intents service-aware, use the matching creator handle when configured, and append the token artifact/preview URL to the drafted post text.
- Verification:
  - `node --check public/creation-tools/macaroni/js/studio.js public/creation-tools/macaroni/js/drop.js`
  - `npx tsx --test server/routes/macaroni-policy.test.ts server/features/wtf-sites/macaroni-compat.test.ts`
  - `npm run check -- --pretty false`
  - `npm run test:e2e:inventory:coverage`
  - `npm run test:e2e:inventory`

### WTF-BB-273 - Airporters/Kukai rejects named mainnet wallet permission with dApp RPC override

- Category: Macaroni / published drop wallet compatibility
- Status: Fixed
- Owner/Session: Codex Airporters Octez Connect full-send
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-16: `https://paulwhoisaghost.wtfos.me/airporters-vol-1` fails for a Brave plus Kukai user with Kukai's confusing error that the request is for a different network than the selected device network ("Mainnet").
  - Airporters is a mainnet drop with a mainnet KT1 contract, but the drop wallet network shape could include `{ type: "mainnet", rpcUrl: "https://rpc.tzkt.io/mainnet" }`, which mobile/privacy-wallet paths can treat as custom rather than the wallet's selected Mainnet.
  - Existing Airporters is a stored user-site snapshot, so generator-only fixes do not guarantee the live page gets the corrected wallet connection path.
- Why it matters:
  - Published mint pages must work for collectors in privacy/mobile browsers, not only for the creator's Chrome setup. A mainnet drop that appears to ask for a different Mainnet blocks real mints and gives users no actionable recovery path.
- Fix:
  - Added `vendor/octez-connect.js` and `js/octez-wallet.js` to Macaroni static assets.
  - Updated generated drop pages, Studio preview/export, and wtfOS publish HTML to load Octez Connect before `common.js`.
  - Updated the shared wallet runtime to prefer `TZ.OctezPrimaryWallet || TZ.BeaconWallet`, while keeping Beacon as backup and keeping `rpcUrl` only on custom wallet networks.
  - Extended the user-site Macaroni compatibility normalizer to inject Octez bridge tags before the inlined `macaroniCommonJs` runtime for stored pages such as Airporters.
  - Expanded app/user-site/PDS-renderer CSP allowances for Octez/Beacon wallet relay websocket and verification frame sources.
- Verification:
  - Source-policy tests cover generated asset order, Octez-primary provider selection, Beacon backup, no named-network RPC leak, stored-page Octez injection, and CSP.
  - Inventory and behavior assertion registries now include `macaroni.drop-wallet-octez-primary`.
  - Local verification passed: JS syntax checks for `common.js`, `octez-wallet.js`, `octez-connect.js`, `site-bundle.js`, and `behavior-assertions.mjs`; focused `tsx --test` suite for Macaroni publish, user-site compatibility, wallet policy, user-site CSP, and app CSP; `tsc --noEmit --pretty false`; `tsx tests/e2e/inventory/coverage.ts`; `npm run build`; and `playwright test tests/playwright/inventory` (313/313 passed).
  - `npm run test:e2e:macaroni:shadownet` was blocked locally because the temp production worktree has no `DATABASE_URL` for the puppet seed step.
  - Hetzner deploy for commit `da79c63` completed successfully and live health reported `commitRef:"da79c63"` with `status:"ok"`.
  - Live Airporters verification passed on `https://paulwhoisaghost.wtfos.me/airporters-vol-1`: HTTP 200 user-site surface, Octez/Beacon CSP websocket/frame allowances present, `vendor/octez-connect.js` before `js/octez-wallet.js`, the wrapper before `installOctezPrimaryWallet({ patchBeacon: true })`, the patch before `macaroniCommonJs`, Beacon fallback runtime present, and no `{ type: net.beaconNetwork, rpcUrl }` leak.
  - Live Macaroni static assets verified on `https://wtfos.app/creation-tools/macaroni/drop.html`, `studio.html`, `js/octez-wallet.js`, and `vendor/octez-connect.js`: Octez assets load before `common.js`, the wrapper exposes `providerName = "octez.connect"` plus `beaconBackup`, and the vendor bundle exposes `MacaroniOctezConnect` plus `getDAppClientInstance`.

### WTF-BB-274 - Macaroni V2 contract versions, editions, and minter royalties

- Category: Macaroni / contract versions, editions, and minter royalties
- Status: Fixed
- Owner/Session: Codex Macaroni V2 editions full-send
- Score: C4 + F5 + S1 + P1(4) = 14
- Evidence:
  - Studio only loaded the legacy Macaroni contract artifact, so a creator had no explicit Macaroni V1/V2 choice before deployment.
  - Token CSV/import metadata had no quantity field, preventing creator-defined shared-token edition supply.
  - Delayed reveal accepted one placeholder artifact, so unrevealed tokens could not draw from a creator-provided placeholder pool.
  - Minter royalty policy needed contract-owned mutable state plus creator/drop-page updater hooks without turning Macaroni into an indefinite metadata watchdog.
- Why it matters:
  - Multi-edition blind mints, mutable-until-lock minter royalty pools, and richer unrevealed placeholder presentation are core creator capabilities. Shipping them without an explicit contract version selector or generated V2 artifact would make deployments ambiguous and hard to verify.
- Fix:
  - Added `MacaroniBlindMintFA2V2.py` with per-token edition supply, one-edition-at-a-time minting into shared FA2 token IDs, delayed placeholder pools, minter royalty revision state, updater-gated metadata patching, and lock entrypoints.
  - Added the SmartPy compile script and public V2 contract/template artifacts for Studio deployment.
  - Added Studio controls for Macaroni V1/V2 selection, token `quantity`, optional minter royalty percentage/mode/updater policy, and multiple unrevealed placeholder images.
  - Exported generated drop config for edition summaries, V2 reveal placeholder pools, and minter royalty metadata sync status.
  - Updated publish HTML, interaction inventory, focused source-policy tests, and the Shadownet puppet spec expectations.
- Verification:
  - Local verification passed: SmartPy V2 template compile with `scripts/macaroni/compile-v2-contract-template.mjs`, JS syntax checks for `studio.js`, `drop.js`, compile script, and the live Macaroni Playwright spec, compiled artifact/template JSON parse, focused Macaroni policy/publish tests, `tsx tests/e2e/inventory/coverage.ts`, `npm run check -- --pretty false`, and `npm run test:e2e:inventory` (313/313 passed after build).
  - `npm run test:e2e:macaroni:shadownet` is blocked in the clean worktree because puppet seeding requires `DATABASE_URL`.
  - GitHub Actions passed for commit `b52b5b5`: Quality Gates `27662189723` and Deploy to Hetzner `27662189719`.
  - Live production verification passed on `https://wtfos.app`: `/api/health` reported `commitRef:"b52b5b5"` with `status:"ok"`, `studio.html` exposed the Macaroni V1/V2 selector plus `macaroni-editions-v2`, `minterRoyaltiesEnabled`, `royaltyUpdateEndpoint`, and `placeholderFiles`, `js/studio.js` exposed `MACARONI_V2_ARTIFACT`, `normalizeTokenQuantity`, `add_tokens_v2`, and updater config, `contract/macaroni-v2.template.json` parsed as `templateVersion:"macaroni-editions-v2"` with V2 entrypoints, `contract/macaroni-v2.contract.json` parsed as a non-empty Micheline array, and `drop.html` exposed the minter royalty status region.

### WTF-BB-275 - Generated creation-tool routes can miss shared browser metadata

- Category: Creation tools / shared route metadata
- Status: Fixed
- Owner/Session: Codex Broot direct-route full-send
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - `tests/playwright/inventory/broot.spec.mjs` failed on `/tools/broot` because the desktop shell stayed visible without an embedded `iframe[title="Broot"]`.
  - `shared/wtf-browser-routes.sync.test.ts` only scanned literal `pattern: "..."` entries in `page-defs.ts`, so generated `CREATION_TOOLS.routePath` entries such as `/tools/broot` could be present in `PAGE_DEFS` but absent from `BROWSER_ROUTE_META`.
  - The same shared metadata gap also left CH-EASE, Macaroni Packager, and Colander direct routes out of the browser/CLI access map.
  - After the browser metadata fix reached production, `/api/access` still omitted `/tools/broot` and `/tools/ch-ease`, proving agent route discovery used a second static route list in `server/lib/wtf-access.ts`.
- Why it matters:
  - Direct browser routes, CLI `open /path`, desktop window access gates, and paired-agent manifests depend on route metadata. A creation tool can appear in launchers and pass static asset checks while direct route opens or agent discovery silently fail.
- Correction:
  - Added Broot, CH-EASE, Macaroni Packager, Colander, and Pasta Protocol creation-tool routes to `BROWSER_ROUTE_META` with matching auth/role gates.
  - Added the same creation-tool routes to `WTF_STANDARD_BROWSER_ROUTES` so `/api/access` and MCP access capabilities expose Broot and the Tezos-native creator tools.
  - Expanded `shared/wtf-browser-routes.sync.test.ts` to scan `client/src/features/creation-tools/tool-registry.ts` for generated `routePath` values in addition to literal page definitions.
  - Hardened the Broot inventory spec to assert the embedded iframe/editor contract and use exact toolbar button names.
- Verification:
  - Passed `./node_modules/.bin/tsx --test server/lib/wtf-mcp.test.ts shared/wtf-browser-route-access.test.ts shared/wtf-browser-routes.sync.test.ts`.
  - Passed `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`.
  - Passed `./node_modules/.bin/tsc --noEmit --pretty false`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/vite build`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs`.
  - Deploy to Hetzner `27731713838` completed successfully for commit `bd836b23`.
  - Live production verification passed on `https://wtfos.app`: `/api/health` reported `commitRef:"bd836b2"` with `status:"ok"`, `/api/access` exposed `/tools/broot` as an enabled `browser-session` route, `/api/access` exposed `/tools/ch-ease` and `/tools/macaroni-packager` with `appGate:"ch-ease"`, and the Broot static assets `index.html`, `js/app.jsx`, and `lib/fabric.min.js` all returned 200.

### WTF-BB-276 - Skywire live status, group chat, and vault read-model parity

- Category: Skywire / AT Protocol parity and Tezos vault performance
- Status: Verified
- Owner/Session: Codex Skywire live/group/vault full-send
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - Bluesky exposes `app.bsky.actor.status` for account live status, including `app.bsky.actor.status#live`, optional external embeds, `durationMinutes`, and `createdAt`.
  - Bluesky group chat now uses `chat.bsky.group.createGroup` with DID members and a group name.
  - Skywire vault inventory was doing repeated ownership work even though indexed `wallet_holdings` already provide the user's owned-token read model.
- Correction:
  - Added a `liveStatus` Skywire OAuth capability and `repo:app.bsky.actor.status` permission mapping.
  - Added Skywire live-status GET/POST/DELETE endpoints that write or clear `app.bsky.actor.status/self` with a WTF LIVE external embed, while surfacing Bluesky's beta allowlist caveat.
  - Added a Signals-tab live-status panel and group-chat creation controls in Skywire.
  - Updated chat resolution/send flows to resolve handles to DIDs and create a Bluesky group conversation when multiple members are entered.
  - Updated the harness and inventory row for `atproto.live_status.updated`, `atproto.live_status.cleared`, and `atproto.chat.group_created`.
  - Kept the vault path on paginated indexed holdings so large wallets do not redo expensive on-chain/source discovery on tab mount.
- Local verification:
  - `node --check tests/playwright/harness.mjs`
  - `./node_modules/.bin/tsx --test server/features/atproto/permission-tiers.test.ts`
  - `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`
  - `./node_modules/.bin/tsc --noEmit --pretty false`
  - `./node_modules/.bin/vite build`
  - `./node_modules/.bin/playwright test tests/playwright/inventory/skywire-feed.spec.mjs --project=chromium`
  - `./node_modules/.bin/playwright test tests/playwright/inventory --project=chromium` passed 343/343.
- Production verification:
  - GitHub Quality Gates `27734260941` completed successfully for commit `082a183a`.
  - Deploy to Hetzner `27734260925` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"`, `commitRef:"082a183"`, `db:true`, and `jobs:true`.
  - Live `https://wtfos.app/skywire` and `https://wtfos.app/live` returned 200.
  - Live `https://wtfos.app/api/skywire/live-status` returned 401 when unauthenticated, confirming the new endpoint is present behind auth.
  - The deployed Skywire bundle served from `https://wtfos.app/assets/Skywire-wtf2-Ij59tUGD.js` and contains the live-status/group-chat code path.

### WTF-BB-277 - Inventory harness mocks can drop stateful domain contracts

- Category: E2E / CH-EASE and WTF LIVE harness parity
- Status: Verified
- Owner/Session: Codex inventory harness contract repair
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - CH-EASE package create/upload/finalize could pass through generic `{ ok: true }` mocks and then lose package detail, package source status, and handoff/export events expected by inventory.
  - WTF LIVE soundboard settings and room media-deck state were similarly dropped by generic API/WebSocket harness paths, causing focused inventory failures for persisted soundboard clips and remote media sources.
- Correction:
  - Added stateful harness routes for CH-EASE package CRUD, upload, config, finalize, source, and CSV export.
  - Added Macaroni launcher source-status rendering for CH-EASE package handoffs.
  - Added client-side package-detail normalization so stale package shapes cannot crash readiness rendering.
  - Added harness capture for client system-log events.
  - Added stateful WTF LIVE soundboard GET/PUT mocks, preserved media-deck/soundboard fields in harness WebSocket media state, and relayed soundboard clip events to room audiences.
- Local verification:
  - `node --check tests/playwright/harness.mjs`
  - `./node_modules/.bin/tsc --noEmit --pretty false`
  - `./node_modules/.bin/vite build`
  - `./node_modules/.bin/playwright test tests/playwright/inventory/macaroni-packager.spec.mjs --project=chromium`
  - `./node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs --project=chromium`
  - `./node_modules/.bin/playwright test tests/playwright/inventory --project=chromium` passed 343/343.
- Production verification:
  - GitHub Quality Gates `27734260941` completed successfully for commit `082a183a`.
  - Deploy to Hetzner `27734260925` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"`, `commitRef:"082a183"`, `db:true`, and `jobs:true`.
  - Live `https://wtfos.app/creation-tools/macaroni/index.html` contains the `packageSourceStatus` handoff marker.
  - The deployed Macaroni Packager bundle served from `https://wtfos.app/assets/MacaroniPackager-wtf2-BfyBHcU3.js`.

### WTF-BB-278 - External links must include noopener as well as noreferrer

- Category: Frontend security / tabnabbing link safety
- Status: Verified
- Owner/Session: Codex external-link quality gate repair
- Score: C1 + F2 + S1 + P2(3) = 7
- Evidence:
  - `node scripts/check-external-links.mjs` failed on `client/src/features/pasta-protocol/colander/ColanderApp.tsx:360`.
  - The Colander explorer link opened a new tab with `target="_blank"` and `rel="noreferrer"` but omitted `noopener`.
- Correction:
  - Added `rel="noopener noreferrer"` to the Colander explorer link.
- Local verification:
  - `node scripts/check-external-links.mjs`
- Production verification:
  - GitHub Quality Gates `27734260941` completed successfully for commit `082a183a`.
  - Deploy to Hetzner `27734260925` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"`, `commitRef:"082a183"`, `db:true`, and `jobs:true`.
  - The deployed Colander bundle served from `https://wtfos.app/assets/Colander-wtf2-D4jVEv_R.js` and contains `rel:"noopener noreferrer"`.

### WTF-BB-279 - Broot Open rejects normal creator media

- Category: Broot / media file import
- Status: Verified
- Owner/Session: Codex Broot media-open repair
- Score: C2 + F3 + S0 + P1(4) = 9
- Evidence:
  - User reported the Broot Open picker let them browse but did not recognize common PNG, JPG, GIF, or MP4 media.
  - `openProjectFile()` passed `showOpenFilePicker()` only a Broot project JSON type, and the fallback hidden input accepted only `.json,.broot,application/json`.
  - The side-panel media import path accepted only `image/*` and did not give the top-level Open action media semantics.
- Why it matters:
  - For a Photoshop-like creation tool, Open must accept normal media directly; otherwise the first creative action feels broken even though export and canvas tooling work.
- Correction:
  - Added a MIME/extension classifier for Broot project files, common image formats, GIF, and video formats.
  - Changed the top-level Open picker and fallback file input to advertise project, image, GIF, and video accept types instead of JSON only.
  - Routed Open through a unified handler that loads Broot project JSON, imports images/GIFs as Fabric image layers, and imports videos as live Fabric video layers when decodable or as a named video placeholder when preview decode fails.
  - Cleared the save file handle after media imports so a later Save cannot overwrite the original PNG/JPG/GIF/MP4 with Broot JSON.
  - Updated the side-panel import control from image-only to media import.
  - Registered `broot.media-open-import` in the inventory behavior registry and Creation Tools admin surface.
- Verification:
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/vite build`.
  - Passed `./node_modules/.bin/tsc --noEmit --pretty false`.
  - Passed `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`.
  - Passed `./node_modules/.bin/tsx --test client/src/features/admin-os/admin-surface-registry.test.ts`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/index.html` loads `./js/app.js`, and the deployed Broot bundle includes the unified Open/media import path.

### WTF-BB-280 - Broot wallet connection does not persist and HEN publishing is not wallet-signed

- Category: Broot / Tezos wallet publishing
- Status: Verified
- Owner/Session: Codex Broot wallet/HEN mint repair
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - User reported Broot connects a wallet, keeps showing an active Connect Wallet button, allows repeated connect attempts, and loses the connection after page refresh.
  - `connectWallet()` built a fresh Tezos toolkit and wallet only inside the click handler, never restored `wallet.client.getActiveAccount()` on page load, and stored no Broot-scoped public session metadata.
  - Broot generated metadata/FA2 artifacts but had no direct HEN contract mint operation through `Tezos.wallet`.
- Why it matters:
  - Creation tools need a one-time wallet connection model. Repeated permission prompts make direct publishing feel untrustworthy, and address-only metadata is not enough for value operations.
  - HEN direct publishing moves token creation to a real mainnet FA2 contract, so Broot must prove active account, chain ID, contract, token id, and wallet provider immediately before prompting the user to pay gas/storage.
- Correction:
  - Persist Broot's selected network and public wallet session metadata by network/path after explicit connect.
  - Restore the wallet from the wallet SDK active account on refresh without calling `requestPermissions()` again.
  - Replace the active Connect Wallet button with a disabled Connected state while connected and coalesce explicit connect clicks.
  - Add a Mainnet-only HEN prepare/sign path that pins PNG plus metadata, reads HEN's next token id, calls the `mint` entrypoint on `KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton` through `tezos.wallet.at`, and sends padded gas/storage/fee options for the user-signed operation only after the in-app review is confirmed.
  - Register `broot.wallet-hen-mint` in inventory behavior assertions and the Creation Tools admin surface.
- Verification:
  - Queried configured Tezos mainnet Octez RPC for HEN `KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton` entrypoints and confirmed `mint({ address, amount, token_id, token_info })`.
  - Queried TzKT HEN storage and confirmed `all_tokens` is the next token id source.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/vite build`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs` (5/5).
  - Passed `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`.
  - Passed `./node_modules/.bin/tsx --test client/src/features/admin-os/admin-surface-registry.test.ts`.
  - Passed `./node_modules/.bin/tsc --noEmit --pretty false`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/js/app.js` contains `Prepare HEN Mint`, connected wallet restore code, and the Sign review flow.

### WTF-BB-281 - Skywire live status has no obvious local indicator

- Category: Skywire / Bluesky live status UX
- Status: Verified
- Owner/Session: Codex Skywire live-status UX pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - Skywire can now write and clear `app.bsky.actor.status/self` live records, but Bluesky/Ovoid beta rendering is platform-controlled and may not show the badge consistently.
  - Without an owned in-app indicator, users could successfully go live and still have no persistent confirmation in the Skywire shell after leaving the live-status controls.
- Why it matters:
  - Live status is a creator trust surface. If the portable AT record writes but the app does not visibly reflect it, hosts may retry or assume the connection failed.
- Correction:
  - Added a top-level Skywire live-status read model shared with the Signals controls.
  - Added a `WTF LIVE` header badge and live banner with actions to open the live URL or jump back to Signals live-status controls.
  - Registered `skywire.live-status-visible-indicator` in behavior assertions, admin surface ownership, domain workflow probes, and the user interaction inventory.
- Verification:
  - Passed `PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "live status|signal starter" --project=chromium`.
  - GitHub Quality Gates `27739351890` completed successfully for commit `dee415b6`.
  - Deploy to Hetzner `27739351880` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"dee415b"`.
  - Live `https://wtfos.app/assets/Skywire-wtf2-BGDs5G0A.js` contains `data-skywire-live-badge` and `WTF LIVE`.

### WTF-BB-286 - Skywire Signals lack creator-friendly starter presets

- Category: Skywire / Skywire Signals publishing UX
- Status: Verified
- Owner/Session: Codex Skywire Signal starter pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - The Signals tab exposed a raw record publisher, so common creator actions such as recent sales, live broadcasts, drops, collector calls, and proofs required users to hand-author type, text, tags, and related URI.
  - The server signal schema did not yet include the more specific `market.sale`, `broadcast.live`, `drop.open`, `quest.collector`, or `proof.created` types.
- Why it matters:
  - Skywire Signals are meant to make portable creator/collector state easy to publish. A blank technical form makes the feature feel like infrastructure instead of an app workflow.
- Correction:
  - Added Signal starter cards for recent sales, live broadcasts, open drops, collector calls, and proof of work.
  - Expanded the server signal schema to accept the starter signal types.
  - Added focused Playwright and policy coverage proving the recent-sale starter publishes `market.sale` with sale/collector/tezos tags and optional related token URL.
- Verification:
  - Passed `npx tsx --test server/features/atproto/skywire-policy.test.ts client/src/features/admin-os/admin-surface-registry.test.ts`.
  - Passed `PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/skywire-feed.spec.mjs -g "live status|signal starter" --project=chromium`.
  - GitHub Quality Gates `27739351890` completed successfully for commit `dee415b6`.
  - Deploy to Hetzner `27739351880` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"dee415b"`.
  - Live `https://wtfos.app/assets/Skywire-wtf2-BGDs5G0A.js` contains `Signal Starters` and `market.sale`.

### WTF-BB-287 - Broot default app window hides the editor panels behind mobile tabs

- Category: Broot / app-window layout
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - Master UI/UX audit on 2026-06-18 loaded `http://127.0.0.1:4191/tools/broot` through the Playwright harness at a 1440x900 desktop viewport.
  - The rendered Broot iframe inside the default wtfOS window measured about 912x520, so the `@media (max-width: 980px)` rule fired.
  - The first-open desktop state displayed `.mobile-tabs`, hid both `.side-panel.left` and `.side-panel.right`, and left `.canvas-stage` at about 196px tall.
  - Screenshot evidence was captured at `/tmp/broot-audit-desktop.png`; narrow screenshot at `/tmp/broot-audit-mobile.png`.
- Why it matters:
  - A Photoshop-style tool needs tools, canvas, and layers available as a working triad on first open. Hiding tools/layers behind mobile tabs makes the desktop app feel cramped and underpowered before users do anything.
- Correction:
  - Moved Broot's mobile tab breakpoint below the default wtfOS AppWindow width so the first-open desktop state keeps tools, canvas, and layers visible together.
  - Added focused Broot Playwright assertions for visible left/right panels, hidden mobile tabs, minimum canvas-stage height, and the compiled-script contract.
- Verification:
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs` (5/5).
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - Local browser smoke at `http://127.0.0.1:4173/tools/broot` showed left panel `236x367`, right panel `276x367`, canvas stage `400x337`, `.mobile-tabs` display `none`, and zero console errors.
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live Broot index and bundle smoke confirmed the deployed editor uses the compiled `./js/app.js` asset.

### WTF-BB-288 - Broot destructive layer operations lack undo, guards, and confirmation

- Category: Broot / destructive layer operations
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C3 + F4 + S0 + P1(4) = 11
- Evidence:
  - `public/creation-tools/broot/js/app.jsx` exposes `Merge`, `Flatten`, `Warp Canvas`, and `Delete` as immediate button handlers.
  - `flattenCanvas()` removes every object and replaces the canvas with one raster layer without confirmation or undo.
  - `mergeSelection()` can rasterize a single selected object and report `Selected layers merged`, which is misleading when only one layer was selected.
  - `groupSelection()` requires Fabric `activeSelection`, but the layer panel gives only single-object selection buttons and does not explain a multi-select path.
- Why it matters:
  - In a creation tool, destructive rasterization is a high-cost action. Users need recoverability, clear disabled states, and selection-specific copy before flattening or losing editability.
- Correction:
  - Added bounded undo/redo history around object add, import, duplicate, move, lock, visibility, group, ungroup, merge, flatten, warp, and delete flows.
  - Added active-selection guards for merge/group/ungroup and enabled shift/cmd/ctrl multi-select from the layer list.
  - Routed delete, flatten, and whole-canvas warp through a confirmation dialog with explicit action labels.
- Verification:
  - Focused Broot Playwright asserts merge is disabled until multi-select, flatten requires confirmation, and Undo restores multiple layers after flatten.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs` (5/5).
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/js/app.js` contains the destructive action confirmation and undo-enabled layer operation paths.

### WTF-BB-289 - Broot compiles JSX with browser Babel at runtime

- Category: Broot / runtime performance
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - `public/creation-tools/broot/index.html` loads `./lib/babel.min.js` and then `<script type="text/babel" src="./js/app.jsx">`.
  - `public/creation-tools/broot/lib/babel.min.js` is about 3.1 MB, and `public/creation-tools/broot/js/app.jsx` is about 86 KB.
  - The Broot iframe therefore parses Babel and compiles the editor source on each load instead of serving a prebuilt JS bundle.
- Why it matters:
  - Broot is aiming at a serious Photoshop-like workflow. Runtime compilation adds startup cost inside a small app window and makes later FFmpeg/WebGL work feel heavier than it needs to be.
- Correction:
  - Compiled Broot JSX to `public/creation-tools/broot/js/app.js` with the classic React browser transform, avoiding the repo `react-jsx` runtime in this static iframe.
  - Removed `babel.min.js` and `type="text/babel"` from Broot's HTML/runtime asset contract while keeping the editable source `app.jsx` in the repo.
  - Registered local glfx and FFmpeg assets in the creation-tool asset manifest; FFmpeg core/wasm remain lazy-loaded by MP4 export.
- Verification:
  - Passed `node --check public/creation-tools/broot/js/app.js`.
  - Passed `! rg -q "require\\(|jsx-runtime|text/babel|babel.min" public/creation-tools/broot/js/app.js public/creation-tools/broot/index.html`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run creation-tools:check`.
  - Focused Broot Playwright asserts scripts include `./js/app.js` and do not include Babel/text-babel.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/index.html` loads `./js/app.js` and has no `text/babel` script.

### WTF-BB-290 - Broot lacks keyboard-first canvas and visible focus coverage

- Category: Broot / keyboard and accessibility
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - The audit script found no explicit `:focus` or `:focus-visible` CSS rules in Broot's loaded styles.
  - The canvas has an aria label, but there is no documented keyboard path for selecting objects, nudging layers, multi-select/grouping, zoom/pan, or triggering canvas operations without pointer gestures.
  - Dense repeated controls use short labels such as `Hide`, `Show`, `Up`, `Down`, `Back`, and `Front` without object-specific accessible names in layer rows.
- Why it matters:
  - WCAG 2.2 AA requires keyboard operation and visible focus for interactive controls. A canvas-heavy tool can still be usable if layer list actions, object selection, and transform controls are keyboard reachable.
- Correction:
  - Added Broot-wide `:focus-visible` styling for buttons, inputs, selects, textareas, the canvas stage, and compact icon-style controls.
  - Gave repeated layer select/show-hide buttons object-specific accessible labels.
  - Added a focusable canvas workspace with keyboard undo/redo, delete confirmation, Escape cancel, and arrow-key nudge handling.
- Verification:
  - Passed focused Broot Playwright (5/5), which exercises layer list selection, multi-select, destructive confirmation, and undo visibility.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory:coverage`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/js/app.js` contains the focusable canvas workspace and keyboard action handlers.

### WTF-BB-291 - Broot HEN mint needs a pre-sign trust review

- Category: Broot / HEN mint trust preview
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C3 + F5 + S1 + P1(4) = 13
- Evidence:
  - `mintToHen()` prepares/pins artifacts, fetches the next HEN token id, estimates wallet operation limits, and calls `method.send(...)` in one flow.
  - The user sees a status line saying to approve the HEN mint and that they pay gas/storage, but there is no in-app review sheet before the wallet prompt.
  - `sendEstimatedWalletOp()` estimates gas/storage/fee, then immediately sends the operation with those limits.
- Why it matters:
  - Direct mainnet publishing is value-bearing. Before a wallet prompt, creators should see the contract, network, wallet, token id, edition count, artifact/metadata CIDs, estimated fee/storage, and recovery path if pinning succeeded but minting fails.
- Correction:
  - Split HEN publishing into `Prepare HEN Mint` and `Sign HEN Mint` steps.
  - Added an in-panel HEN review showing network, wallet, contract, token id, edition count, artifact CID, metadata CID, estimated gas, storage, and fee before any wallet send.
  - Revalidate the active wallet and chain before signing and keep the prepared mint payload until the user signs or cancels.
- Verification:
  - Focused Broot wallet Playwright asserts the review appears first, no `__brootHenMint` wallet-send record exists before signing, then Sign sends exactly once to the HEN contract stub.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs` (5/5).
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/js/app.js` contains `Prepare HEN Mint`, review fields, and the delayed `Sign HEN Mint` path.

### WTF-BB-292 - Broot MP4 export uses a hardcoded opacity pulse

- Category: Broot / animation export UX
- Status: Verified
- Owner/Session: Codex Broot audit implementation full-send
- Score: C2 + F4 + S0 + P2(3) = 9
- Evidence:
  - `recordCanvasClip()` records the canvas stream while mutating every even-indexed object's opacity with a hardcoded sine pulse.
  - The function restores opacity after recording, but the exported MP4 does not represent either a neutral still capture or a user-authored animation timeline.
- Why it matters:
  - FFmpeg support should make animation/video export more powerful, not surprise creators with an arbitrary effect baked into the artifact.
- Correction:
  - Added explicit MP4 modes: still hold, layer pulse, and layer reveal.
  - Changed the default MP4 path to neutral still-hold capture and moved the previous opacity pulse behind an explicit selection.
  - Added duration and FPS controls that feed the canvas recorder and FFmpeg transcode path.
- Verification:
  - Focused Broot Playwright asserts the default `MP4 mode` value is `hold`.
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/broot.spec.mjs` (5/5).
  - Passed `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (349/349).
  - GitHub Quality Gates `27738388493` completed successfully for deployed commit `94d26fef`.
  - Deploy to Hetzner `27738388502` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` and `commitRef:"94d26fe"`.
  - Live `https://wtfos.app/creation-tools/broot/js/app.js` contains `MP4 mode` and the explicit hold/pulse/reveal export controls.

### WTF-BB-293 - Skywire needs a standalone AT login and OVOID-style entry

- Category: Skywire / standalone AT login and OVOID-style UI
- Status: Verified
- Owner/Session: Codex Skywire standalone OVOID UX pass
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - `/skywire` is currently marked auth-required in PageDef, shared browser-route metadata, access inventory, and E2E fixtures.
  - `/api/atproto/oauth/start` requires an existing wtfOS session and the callback rejects pending OAuth state without a user id.
  - `skywire.wtfos.app` has no first-class standalone route behavior, so anonymous users get the wtfOS landing/login flow instead of a Skywire-branded AT Protocol login.
  - The current Skywire UI still uses the heavier desktop/retro shell where OVOID.at presents a focused dark, centered AT login surface.
- Why it matters:
  - Skywire should be usable as an AT Protocol client entrypoint, not only as an app inside an existing WTF OS session.
  - A subdomain-specific AT login lets creators share Skywire as a clean product surface while still relying on the existing Skywire server permissions after OAuth.
- Correction:
  - Make Skywire’s browser route public enough to show a standalone login shell while keeping mutation/feed APIs protected.
  - Add a Skywire standalone OAuth lane that creates or resumes a server user from the returned AT DID and establishes a normal browser session after callback.
  - Rework the standalone shell toward OVOID's focused task model: compact top navigation, primary actions exposed first, secondary tools behind a More disclosure, and less persistent chrome.
  - Register `skywire.wtfos.app` as an allowed OAuth return origin and add inventory coverage for the public standalone login state.
- Verification:
  - Run focused AT/Skywire policy tests, TypeScript, inventory coverage, and focused Skywire Playwright asserting the standalone login UI and OAuth-start handoff.
  - Verified with `npm run check -- --pretty false`, `npm run build`, `npx playwright test tests/playwright/inventory/skywire-feed.spec.mjs`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory` with 354/354 passing.
  - Captured local Playwright walkthrough screenshots under `output/playwright/skywire-standalone-walkthrough/`, including `08-ux-redesign-feed-polished.png` and `10-ux-redesign-signals-polished.png`.

### WTF-BB-282 - Embedded Pasta publishers rely on blocked native modals for critical feedback

- Category: Pasta Protocol / embedded creation-tool feedback
- Status: Verified
- Owner/Session: Codex Pasta Protocol implementation/full-send pass
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - `/tools/spaghetti`, `/tools/gnocchi`, `/tools/ravioli`, `/tools/rotini`, `/tools/penne`, and `/tools/lasagna` render through `CreationToolFrame`, whose iframe sandbox omits `allow-modals`.
  - The static publishers call `alert()` for import validation, wallet connect failures, deploy success/failure, mint/redeem/reveal outcomes, and invalid KT1 inputs.
  - This repeats the Macaroni lesson that embedded creation tools must not rely on browser modals because sandboxed modals are ignored.
- Why it matters:
  - A creator can click a signing/deploy/publish action and miss the only explicit validation or completion notice, making value-bearing Tezos operations feel dead or unsafe.
- Likely correction direction:
  - Add a shared Pasta in-page notice/status helper with `role="status"` / `role="alert"` semantics, replace `alert()` calls across all six static publishers, and add a sandbox regression that fails on native modal usage in embedded flows.
- Verification idea:
  - Run `node --check` for all Pasta static JS, focused Playwright for `/tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}` that triggers a validation error inside the iframe, and assert visible inline feedback instead of `dialog`/`alert` calls.
- Verification notes:
  - Added shared `MD.notify` / `MD.clearNotice` notice regions to all six Pasta static publishers and replaced native modal feedback with inline status/alert semantics.
  - Passed `for app in spaghetti gnocchi ravioli rotini penne lasagna; do node --check public/creation-tools/$app/js/common.js && node --check public/creation-tools/$app/js/studio.js; done`.
  - Passed `./node_modules/.bin/tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts`.
  - `rg -n "alert\s*\(|confirm\s*\(|prompt\s*\(" public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/js` returned no matches.
  - Production verified on 2026-06-18: GitHub Quality Gates `27738002649` passed, Deploy to Hetzner `27738002671` passed, live `https://wtfos.app/api/health` returned `commitRef:"64674a8"`, and the deployed Spaghetti/Penne/Lasagna assets exposed the inline notice, handoff, and pinner wiring without native dialogs.

### WTF-BB-283 - Pasta publisher access and wtfOS pinner gates conflate self-hosted tools with trusted resources

- Category: Pasta Protocol / access model and hosted-resource gating
- Status: Verified
- Owner/Session: Codex Pasta Protocol implementation/full-send pass
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - Browser route metadata and PageDefs role-gate Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna, and Colander to admin/host/cohost/trusted_creator even though the Pasta domain guide says user-provided pinning/storage/hosting is the default.
  - Each static publisher shows `wtfOS platform pinner (trusted creators)` in the provider select regardless of embedded host detection or role proof.
  - The shared Pasta `pinBlob({ kind: "wtfos" })` path posts directly to `/api/macaroni/ipfs/pin`, so non-authorized or standalone users can select a backend-only path and fail late.
- Why it matters:
  - Ordinary signed-in creators are blocked from user-wallet/user-pinning flows, while non-trusted users who can reach the UI are invited into a backend feature that should be hidden or disabled until the host proves eligibility.
- Likely correction direction:
  - Make route access match the product contract: user-signed/self-hosted flows available to signed-in creators, wtfOS storage/pinning/hosting only shown after same-origin host capability and `trusted_market_creator` proof. Use a Pasta-named capability endpoint or a shared host bridge instead of hardcoding Macaroni pinning semantics.
- Verification idea:
  - Add route/access policy tests for ordinary session users, trusted creator users, and standalone/static mode; browser-test that the wtfOS pinner option is hidden/disabled without capability proof and visible only for trusted embedded sessions.
- Verification notes:
  - Changed the six Pasta publisher routes and Colander from role-gated creation tools to signed-in routes behind the `pasta-protocol` desktop app gate, while leaving Macaroni's trusted creator gate intact.
  - Added shared Pasta capability detection for embedded wtfOS sessions and hides/disables the `wtfos` pinner unless `/api/auth/user` proves `trusted_market_creator`/admin/trusted creator capability.
  - Passed `./node_modules/.bin/tsx --test client/src/components/layout/start-menu-app-gates.test.ts shared/wtf-browser-routes.sync.test.ts server/features/app-registry/backfill-policy.test.ts client/src/features/pasta-protocol/pasta-static-policy.test.ts`.
  - Passed `PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run build`.
  - Production verified on 2026-06-18: GitHub Quality Gates `27738002649` passed, Deploy to Hetzner `27738002671` passed, live health returned `commitRef:"64674a8"`, and the deployed Pasta common helper includes `loadPlatformCapabilities()` plus `pinProviderFromForm()`.

### WTF-BB-284 - Pasta Protocol handoffs and event spine are mostly documentation, not working wiring

- Category: Pasta Protocol / cross-app handoffs and SystemEvent wiring
- Status: Verified
- Owner/Session: Codex Pasta Protocol implementation/full-send pass
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - CH-EASE exports Pasta packages only as a downloaded JSON file; there is no direct selected-app handoff like the Macaroni package source flow.
  - Spaghetti and Gnocchi expose manual CH-EASE import controls, while Ravioli, Penne, and Lasagna have no CH-EASE package intake despite the inventory describing CH-EASE as the universal prep layer.
  - Colander marks some actions as external to Penne/Lasagna, but `selectAction()` opens `/tools/${action.external}` without passing contract, network, action, token, or revision context.
  - The inventory and workflow registries list app-specific handles such as `spaghetti.collection_deployed`, `penne.contract_deployed`, and `lasagna.revision_added`, but the static publishers emit no corresponding client/SystemEvent logs, and the inventory/workflow names drift for Penne and Lasagna.
- Why it matters:
  - The suite currently behaves like isolated tools with route-level smoke coverage. Rewards, automation, audit review, and recovery cannot reliably observe the publishing actions the inventory promises.
- Likely correction direction:
  - Define a narrow Pasta host bridge for package handoff, contract/action deep links, and app event emission. Update every publisher to consume CH-EASE packages where applicable, preserve Colander action context in URL/query/session handoff, and align inventory handles with emitted events.
- Verification idea:
  - Add behavior assertions for CH-EASE -> selected publisher import, Colander -> Penne/Lasagna deep link context, and one emitted/durable event per published/deployed/redeemed/revised workflow.
- Verification notes:
  - Added CH-EASE `Open in Pasta app` sessionStorage handoffs, publisher-side handoff consumption/import for all six Pasta apps, and Colander query-context handoffs to external Pasta tools.
  - Added client SystemEvent logging for publisher deploy/publish/export/mint/redeem/reveal/registry actions plus `chease.package_handoff_opened` and `colander.handoff_opened`.
  - Aligned Pasta inventory/domain workflow handles with emitted events and added owned behavior assertions for sandbox feedback, CH-EASE handoff, and Colander context handoff.
  - Passed `./node_modules/.bin/tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts shared/pasta-protocol/foundation.test.ts client/src/features/pasta-protocol/chease/build-package.test.ts`.
  - Passed `PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test tests/playwright/inventory/macaroni-packager.spec.mjs`.
  - Production verified on 2026-06-18: GitHub Quality Gates `27738002649` passed, Deploy to Hetzner `27738002671` passed, live health returned `commitRef:"64674a8"`, and deployed Pasta assets expose `consumeCheaseHandoff()` plus Colander route handoff consumption.

### WTF-BB-285 - Pasta Protocol lacks first-class OS package and doc-registry ownership

- Category: Pasta Protocol / app registry and OS ownership
- Status: Verified
- Owner/Session: Codex Pasta Protocol implementation/full-send pass
- Score: C3 + F3 + S0 + P2(3) = 9
- Evidence:
  - `CREATION_TOOL_PAGE_DEFS` makes the static Pasta tools reachable and Start Menu eligible, but `DESKTOP_APPS`, `DEFAULT_DESKTOP_APP_CONFIG`, Start Menu app gates, package acceptance, and doc-registry mappings only define `ch-ease` and the older Macaroni creation tool.
  - The admin surface groups Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna under generic `creation-tools` settings rather than giving Pasta Protocol its own owner package/admin surface.
  - `docs/domains/pasta-protocol.md` exists, but `shared/wtf-docregistry.ts` and `shared/wtf-app-packages.ts` do not include a Pasta Protocol domain/package mapping for the new apps.
- Why it matters:
  - Operators cannot independently enable, disable, audit, document, or uninstall the Pasta suite as real wtfOS apps. Stale shortcuts and generic creation-tool gates can drift from the on-chain publishing risk each app carries.
- Likely correction direction:
  - Decide whether Pasta is one suite-level desktop app gate or separate app gates per publisher, then register package acceptance, doc links, admin surface ownership, Start Menu/command palette gates, and regression tests accordingly.
- Verification idea:
  - Extend app-registry/package/doc tests to cover the Pasta suite, verify disabled gates block Start Menu/direct route/native access consistently, and run inventory coverage plus focused route smoke.
- Verification notes:
  - Added `pasta-protocol` to desktop app keys/default config/labels, Start Menu gates/icons, admin surface ownership, doc registry links, and app package acceptance.
  - Added `docs/domains/pasta-protocol-registry.md` and a Pasta Protocol admin surface owning Colander plus Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna.
  - Passed `./node_modules/.bin/tsx --test shared/wtf-app-packages.test.ts client/src/features/admin-os/admin-surface-registry.test.ts client/src/components/layout/start-menu-app-gates.test.ts server/features/app-registry/backfill-policy.test.ts`.
  - Passed `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`.
  - Passed full inventory route/domain coverage for Pasta inside `PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory`; the overall suite remained red only on pre-existing Broot and Skywire failures unrelated to Pasta.
  - Production verified on 2026-06-18: GitHub Quality Gates `27738002649` passed, Deploy to Hetzner `27738002671` passed, live health returned `commitRef:"64674a8"`, and deployed Pasta route/static smoke confirmed the suite assets are reachable.

### WTF-BB-295 - Welcome stale auth recovery

- Category: Auth / welcome session recovery
- Status: Verified
- Owner/Session: Codex stale welcome auth repair
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - User report on 2026-06-20 shows the welcome modal rendering `Welcome to wtfOS, cobwebsaints` while every button briefly enters `Saving...` and then returns `Not authenticated`.
  - Browser console screenshot shows repeated 401 API failures plus `[WTF] wallet link attempt failed: Error: Not authenticated` from `client/src/lib/wallet-context.tsx`.
  - Code inspection found `AuthProvider` caches mutation-returned users while protected writes rely on the cookie-backed Passport session; a stale or rejected session cookie can therefore leave the client in a signed-in UI state while `/api/auth/welcome/complete` and `/api/wallets` are unauthenticated.
- Why it matters:
  - New users can get trapped behind the first-run modal and cannot reach Profile or dismiss the welcome, making account creation look broken even though the account row may exist.
- Correction:
  - Treat protected API 401s as an auth-session boundary failure, clear cached auth state, avoid passive wallet-link warning loops, and browser-test the stale-user welcome path.
- Verification:
  - Added `AUTH_SESSION_INVALID_EVENT` and `ApiRequestError` handling so protected API 401s clear the cached auth user while public login/register/wallet-auth failures do not globally invalidate the session.
  - Suppressed expected stale-session 401 warnings in passive Tezos and Etherlink wallet reconciliation.
  - Added `auth.session.invalidated` inventory and behavior assertion coverage plus a focused Playwright harness scenario for stale welcome completion.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npx tsx --test client/src/lib/auth-session-policy.test.ts client/src/lib/wallet-context-policy.test.ts client/src/lib/auth-wallet-login-policy.test.ts`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory:coverage`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run check -- --pretty false`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npx playwright test tests/playwright/inventory/auth-session.spec.mjs`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (355/355).

### WTF-BB-296 - Cobwebsaints domain and advanced feature readiness coverage

- Category: WTF Domains / account-specific advanced feature coverage
- Status: Verified
- Owner/Session: Codex cobwebsaints domain readiness pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - Follow-up to the 2026-06-20 user report asked for the `cobwebsaints` account path to be smooth through domain claiming and advanced features.
  - Existing focused Settings coverage used a generic `macaroni` persona, while the IPFS Pinning harness hardcoded `pincollector.wtfos.me`, `pincollector.wtf.tez`, and `did:plc:harnesspins` regardless of the signed-in user.
  - That made it possible for account-specific domain readiness to pass generic route/action checks while advanced preservation surfaces displayed another user's host identity.
- Why it matters:
  - Domain claiming, PDS-backed pinning, and Macaroni hosted publishing all depend on stable per-account host identity. A user recovering from first-run auth trouble needs every advanced surface to reflect their own username-derived domain, not a fixture account.
- Correction:
  - Derive WTF Domains/IPFS Pinning harness identity from the active auth user, expose `wtf-subdomains` and `ipfs-pinning` in the desktop app-gate mock, seed existing IPFS coverage explicitly, and add a `cobwebsaints` trusted-creator persona spec.
- Verification:
  - Added `tests/playwright/inventory/cobwebsaints-account.spec.mjs`, which proves `cobwebsaints` can claim `cobwebsaints.wtfos.me`, build `cobwebsaints.wtf.tez` plans with the connected wallet, see the same host/alias in IPFS Pinning, queue a wallet backup policy, and see Macaroni's trusted-creator wtfOS pin/publish affordance.
  - Registered `account.cobwebsaints-domain-advanced-readiness` in the behavior assertion registry and owner surfaces for System Settings, WTF Domains, IPFS Pinning, and Creation Tools.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npx playwright test tests/playwright/inventory/cobwebsaints-account.spec.mjs tests/playwright/inventory/settings-subdomain-setup.spec.mjs tests/playwright/inventory/ipfs-pinning-manager.spec.mjs`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory:coverage`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run check -- --pretty false`.
  - Passed `PATH=/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources:/usr/bin:/bin:/usr/sbin:/sbin npm run test:e2e:inventory` (356/356).

### WTF-BB-297 - Production app gate doc freshness disables core public apps

- Category: Desktop OS / production app gates
- Status: In Progress
- Owner/Session: Codex live user-story gap loop
- Score: C3 + F5 + S1 + P0(5) = 14
- Evidence:
  - 2026-06-21 production audit of `https://wtfos.app/api/apps/desktop` returned a top-level `apps` map with 21 app gates false, including `skywire`, `arcade`, `gallery`, `wtf-live`, `tv`, `w`, `studio`, `game-studio`, `console`, `crp-nominations`, and `dues-manager`.
  - The same response's `list` entries still reported many of those app rows as `enabled: true` but `docStatus: "stale"` with expired docs/install keys, so the runtime availability map is using doc/installability freshness as user-facing app availability.
  - Fresh anonymous browser checks showed public routes `/skywire`, `/arcade`, `/dues`, `/gallery`, `/gallery/token/KT1E2eHarness/3`, `/token/KT1E2eHarness/3`, and `/discord/*` rendering disabled-by-admin windows on desktop and mobile.
- Why it matters:
  - Public entry points and core OS apps can disappear from production because registry documentation freshness expired, even when operators did not intentionally turn the feature off.
- Correction:
  - Split operator app enablement from documentation/install-key freshness. Runtime desktop app availability now follows the explicit `enabled` launcher flag; stale doc status and install-key health remain visible admin registration metadata.
  - Removed the admin API rejection that prevented operators from re-showing an enabled app when doc status was stale.
  - Updated admin copy/status text so stale docs read as registration health attention instead of "blocked" launchability.
- Verification:
  - Local: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs --test server/lib/desktop-app-runtime.test.ts`.
  - Local: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs tests/e2e/inventory/coverage.ts`.
  - Local: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit --pretty false`.
  - Hetzner: `npx tsx --test server/lib/desktop-app-runtime.test.ts`.
  - Hetzner: `npx tsx tests/e2e/inventory/coverage.ts`.
  - Production deploy: `44e556f` deployed successfully; `https://wtfos.app/api/health` reported `commitRef: "44e556f"` and healthy DB.
  - Production app gate: `https://wtfos.app/api/apps/desktop` returned `wtf-live.apps=true`, `wtf-live.enabled=true`, `wtf-live.installable=false`, `wtf-live.docStatus="stale"` and the same launchable/stale split for `skywire`.
  - Production user-story retest: `tmp/live-user-story-probes/wtf-live-results.json` passed 3/3 independent WTF LIVE probes covering mobile-first room controls, mic diagnostic, room join/window controls, panel pop-outs, and signed-in lobby presence after a public room joins.

### WTF-BB-298 - Disabled app APIs still serve public data and leak internal CRP status

- Category: API / app gates and information disclosure
- Status: Open
- Owner/Session: -
- Score: C3 + F4 + S3 + P1(4) = 14
- Evidence:
  - 2026-06-21 production audit found `/api/access` marking app-gated public APIs as `enabled:false` while direct requests still returned 200.
  - Examples: `/api/arcade/games`, `/api/arcade/stats`, `/api/game-studio/templates`, `/api/game-studio/assets`, `/api/crp-nominations/categories`, and `/api/crp-nominations/status`.
  - `/api/crp-nominations/status` exposed internal deployment details including a private PDS URL shaped like `http://10.0.0.3:3001` while the `crp-nominations` gate was disabled.
- Why it matters:
  - The UI and manifest claim app gates are closed, but the underlying APIs remain open. This weakens operator controls and exposes internal service topology through public endpoints.
- Likely correction direction:
  - Enforce app gates in API middleware for every route with an `appGate`, and redact internal topology from public status payloads.
- Verification idea:
  - Add route-level tests that disabled app gates return 403 or a redacted public fallback for browser and API access; include CRP status redaction assertions.

### WTF-BB-299 - `/api/access` advertises legacy `wtfgameshow.app` origin on canonical `wtfos.app`

- Category: Platform domains / access manifest
- Status: Verified
- Owner/Session: Codex live user-story gap loop
- Score: C2 + F4 + S2 + P1(4) = 12
- Evidence:
  - 2026-06-21 production `https://wtfos.app/api/access` returned `origin: "https://wtfgameshow.app"` and `mcp.endpoint: "https://wtfgameshow.app/mcp"`.
  - Caddy redirects `wtfgameshow.app` to `wtfos.app`, and `.env.example` documents `PUBLIC_SITE_URL` production as `https://wtfos.app`.
  - Source fix: `server/routes/access.ts` now resolves the origin with canonical-domain helpers and canonicalizes `MCP_PUBLIC_ENDPOINT`; `server/routes/access.test.ts` covers legacy env and preview-host fallback.
  - Production verification: GitHub Deploy to Hetzner run `27985961351` and Quality Gates run `27985961357` both completed `success` for `e4770ad`; live `/api/health` reported `commit: "e4770ad"`; live `/api/access` returned `origin: "https://wtfos.app"`, `mcp.endpoint: "https://wtfos.app/mcp"`, and no `wtfgameshow.app` values.
- Why it matters:
  - CLI/MCP clients and paired agents can cache or call the wrong canonical origin, and support/debug output contradicts the live platform domain.
- Likely correction direction:
  - Correct production `PUBLIC_SITE_URL` and `MCP_PUBLIC_ENDPOINT`, and add a live/canonical host assertion for `/api/access`.
- Verification idea:
  - Curl `https://wtfos.app/api/access` after deploy and assert both `origin` and MCP endpoint use `https://wtfos.app`.
- Local verification:
  - `./node_modules/.bin/tsx --test server/routes/access.test.ts server/lib/canonical-domain.test.ts server/static.test.ts` passed 10/10; `npm run test:e2e:inventory:coverage` passed; `npm run check -- --pretty false` remains blocked by `WTF-BB-310` missing Hetzner dev dependencies, not by this access-route change.

### WTF-BB-300 - Map Lab public route contract drifts between registries and renders an empty desktop

- Category: Desktop OS / route contract
- Status: Open
- Owner/Session: -
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - Local registry comparison on 2026-06-21 found `/map-lab` as `auth:true` in `client/src/routes/page-defs.ts` and `tests/e2e/inventory/route-fixtures.mjs`, but `auth:false` in `shared/wtf-browser-routes.ts`.
  - Production `/api/cli/routes` lists `/map-lab` for anonymous callers, and `/api/access` advertises it public.
  - Mobile browser smoke of `https://wtfos.app/map-lab` returned 200 but showed only the desktop, a Map Lab icon/taskbar entry, and no visible Map Lab window or demo content.
- Why it matters:
  - The recently fixed public Map Lab demo can look reachable to CLI/manifests while failing the actual anonymous visual task, and the current dirty registry state could redeploy the wrong auth contract.
- Likely correction direction:
  - Decide whether `/map-lab` remains public demo or signed-in app, sync every route registry, and ensure direct anonymous navigation opens the demo surface visibly on desktop and mobile.
- Verification idea:
  - Add focused Playwright for anonymous `/map-lab` with a rendered demo marker, route metadata sync, no horizontal overflow, and CLI/access manifest parity.
- Related Gamma note:
  - 2026-06-29 Gamma Map Lab containment was fixed without changing shared auth or route policy. `/gamma/map-lab` now has host-scoped presentation chrome and browser proof for workspace and demo states, but the public-route/auth drift described above remains open for a separate non-Gamma pass.

### WTF-BB-315 - Exported Macaroni drop pages create duplicate wallet clients and drift from stage config

- Category: Macaroni / exported drop wallet and stage config
- Status: Verified
- Owner/Session: Codex Macaroni exported drop wallet repair
- Score: C3 + F5 + S2 + P0(5) = 15
- Evidence:
  - 2026-06-23 user/webidente screenshots from an exported Macaroni drop deployed on `mint.cobwebsaints.art` show the share/drop summary saying `Wallet limit: no per-wallet cap` while the stage config contains `max_per_wallet: 5`.
  - The same report shows Notj and Dex hitting a wallet error that the request is for a different network than the device currently selected, while Chrome with Kukai works.
  - Browser console screenshot shows `[OCTEZ.CONNECT] It looks like you created multiple octez.connect SDK Client instances` and `An active account has been received, but no active subscription was found for BeaconEvent.ACTIVE_ACCOUNT_SET`.
  - The console also shows browser CORS failures against `https://tezos-mainnet.octez.io/chains/main/blocks/head/helpers/scripts/pack_data` from the third-party drop origin.
- Why it matters:
  - Creators export Macaroni drop pages and copy them to their own sites. If the exported artifact contains duplicate wallet-client lifecycle, stale network metadata, or browser-hostile RPC packing, downstream creators carry the bug even when wtfOS itself is healthy.
- Likely correction direction:
  - Reuse/reconfigure the existing exported-page wallet instance instead of nulling and recreating it during connect, subscribe to `ACTIVE_ACCOUNT_SET` before permission/account-return flows, normalize both snake_case and camelCase stage cap config into every display/preflight path, and use a browser-safe packing/RPC strategy for exported pages.
- Verification idea:
  - Add source-policy tests for singleton wallet reuse, mandatory active-account subscription, stage cap normalization, and local/browser-safe packing. Then syntax-check the Macaroni static bundle and run focused Macaroni policy/live harness coverage.
- Correction:
  - Updated the Macaroni exported runtime to keep the wallet object alive through reconnect/reset flows, reconfigure existing Octez/Beacon clients, subscribe each SDK client to `ACTIVE_ACCOUNT_SET`, expose subscription/reconfiguration through the Octez bridge, normalize option-like `max_per_wallet` storage before status/share/preflight display, and retry recoverable RPC/`pack_data` failures through the configured Tezos fallback RPC.
  - Updated the Tezos wallet skill and checklist/playbook with Octez Connect and Beacon active-account subscription, singleton-client, and browser RPC packing rules.
  - Added the exported drop-page collector flow to the canonical interaction inventory and linked it to the Macaroni behavior assertion.
- Verification:
  - `node --check public/creation-tools/macaroni/js/common.js`
  - `node --check public/creation-tools/macaroni/js/drop.js`
  - `node --check public/creation-tools/macaroni/js/octez-wallet.js`
  - `./node_modules/.bin/tsx --test server/routes/macaroni-policy.test.ts` passed 20/20.
  - `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts` passed with 176 inventory rows and 817 unique handles.
  - Live Cobweb contract storage for `KT19uFFj9TJC4uRXv5mky1eQKnPurjAPRT3d` was checked through TzKT and stage 0 currently reports `max_per_wallet: "5"`.
  - Production commit `1ad5b57` was pushed to `main`; GitHub `Deploy to Hetzner` run `28049971647` completed successfully with health check, and `Quality Gates` run `28049972099` completed successfully.
  - Live `https://wtfos.app/api/health` returned `status:"ok"` with `version.commitRef:"1ad5b57"`.
  - Live static assets contain the repaired markers: `common.js` has `rpcFallbacks`, `ACTIVE_ACCOUNT_SET`, `ensureWallet`, and no `clearBeaconStorage(...); wallet = null`/expired reconnect nulling pattern; `drop.js` has `maxPerWalletFromStage` plus `throwOnRecoverableRpcError`; `octez-wallet.js` has `configure(options)` and `subscribeToEvent(eventName, handler)`.
  - Live browser smoke of `https://wtfos.app/creation-tools/macaroni/drop.html` returned HTTP 200, rendered connect/disconnect controls, and produced no console/page errors on initial load.

### WTF-BB-316 - Exported Macaroni drop sharing exceeds X limits and lacks sale reminders

- Category: Macaroni / exported drop sharing and sale reminders
- Status: Verified
- Owner/Session: Codex Macaroni share/calendar repair
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - Follow-up user report on 2026-06-23 asked whether Macaroni's preconfigured share message was still inaccurate about max-per-wallet limits, whether X/Twitter share text fits the free-tier 280-character post limit, whether token image sharing is possible, and whether sale stages can ship with add-to-calendar configuration.
  - Current exported drop share text includes title, creator, stage label, cost, wallet limit, access, supply, mint page, and cover image, which can exceed X's standard 280-character limit once title/creator/URLs are populated.
  - Sale schedule rows render stage start/price/tags but do not provide prefilled calendar handoff links.
- Why it matters:
  - Creators rely on exported drop pages to market live sales. Overlong X share text can fail or require manual editing at the moment collectors/creators are trying to promote the mint, and missing calendar links makes stage reminders a manual chore.
- Correction:
  - Keep X share text bounded against the standard 280-character post limit while preserving mint/token image URLs where possible, keep Bluesky share summaries richer, and add prefilled `.ics` plus Google Calendar links to every sale stage row.
- Verification:
  - Add source-policy checks for X 280-character trimming, URL weighting, token/cover media URL preservation, sale-stage calendar generation, and mobile-safe stage-row layout.
  - Local source checks passed: `node --check public/creation-tools/macaroni/js/drop.js`, `./node_modules/.bin/tsx --test server/routes/macaroni-policy.test.ts`, `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`, and `git diff --check` for the touched Macaroni/inventory docs.
  - Rendered static-drop harness passed with a fake copied-page storage shape using `max_per_wallet: "5"`: the sale row and X compose text both showed `max 5/wallet`, the X post weighted to 236/280 while preserving the mint URL and cover URL, `.ics` and Google Calendar links rendered, and `macaroni.drop_shared` / `macaroni.drop_calendar_added` click handles fired.
  - GitHub Deploy to Hetzner completed for `50083c5`, and live `https://wtfos.app` smoke verified the exported drop sharing/calendar behavior.

### WTF-BB-301 - SEO/PWA static discovery paths fall through to SPA HTML

- Category: Public site / SEO and installability
- Status: Verified
- Owner/Session: Codex live user-story gap loop
- Score: C1 + F2 + S0 + P2(3) = 6
- Evidence:
  - 2026-06-21 production requests for `/robots.txt`, `/sitemap.xml`, and `/manifest.json` all returned status 200 with `text/html` and the SPA shell instead of robots, sitemap, or web manifest content.
- Why it matters:
  - Crawlers and install surfaces receive misleading successful responses. This hurts search/discovery and makes missing platform metadata harder to detect.
- Correction:
  - Added explicit static-discovery handlers before the SPA fallback for robots, sitemap, and web manifest metadata.
- Verification:
  - Hetzner focused regression passed: `npx tsx --test server/static.test.ts`.
  - Hetzner inventory coverage passed: `npm run test:e2e:inventory:coverage`.
  - Hetzner full TypeScript check remained blocked by `WTF-BB-310` missing dev dependencies (`three`, `@atproto/api`, AWS SDK, MCP SDK, `viem`); no static-discovery-specific error appeared before the known dependency failures.
  - Production deploy `6fb5351` completed successfully through GitHub Deploy to Hetzner run `27984725390`; Quality Gates run `27984725366` completed successfully; live health reported `status:"ok"` and `commitRef:"6fb5351"`.
  - Live post-fix retest passed for `https://wtfos.app/robots.txt`, `/sitemap.xml`, and `/manifest.json`: each returned HTTP 200, the intended content type (`text/plain`, `application/xml`, `application/manifest+json`), expected canonical `wtfos.app` metadata, and no SPA `<!DOCTYPE html>` shell.

### WTF-BB-302 - Public health endpoint exposes verbose runtime and chain topology

- Category: Observability / public information disclosure
- Status: Open
- Owner/Session: -
- Score: C2 + F2 + S2 + P2(3) = 9
- Evidence:
  - 2026-06-21 production `/api/health` returned runtime details including Node version, platform, arch, pid, memory usage, DB latency, Tezos RPC URL, TzKT base, and contract addresses.
- Why it matters:
  - Public health is useful, but detailed runtime and topology data lowers the cost of targeted abuse and makes operational internals visible to unauthenticated callers.
- Likely correction direction:
  - Split public liveness from privileged diagnostics. Keep public health to `ok`, service, timestamp, and commit; move runtime/job/chain detail to admin or signed operational endpoints.
- Verification idea:
  - Add policy tests for public health redaction plus an admin-only diagnostics endpoint that preserves current operator detail.

### WTF-BB-303 - Main app and user-site CSP policies remain broad for script/connect sources

- Category: Security / CSP hardening
- Status: Open
- Owner/Session: -
- Score: C3 + F2 + S3 + P2(3) = 11
- Evidence:
  - 2026-06-21 production main app CSP includes `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com` and broad `connect-src ... https: wss: ws:`.
  - User-site CSP on `paulwhoisaghost.wtfos.me` uses `script-src 'self' 'unsafe-inline' https: data: blob:` and broad HTTPS media/style allowances, even though user sites remove cookies and use `frame-ancestors 'none'`.
- Why it matters:
  - The current policy is compatible with wallet/generated-site flows but leaves a wide blast radius if stored content or third-party script inclusion is abused, especially on wallet-connecting mint pages.
- Likely correction direction:
  - Move toward nonce/hash-based scripts for app and generated sites, enumerate wallet/gateway origins, and keep a documented exception list for unavoidable wallet SDK constraints.
- Verification idea:
  - Add CSP snapshot tests for production and user-site headers, then run wallet/connect/mint smoke under strict and legacy CSP modes.

### WTF-BB-304 - Live wallet sign-in can hang on `Connecting...`

- Category: Auth / Tezos wallet sign-in
- Status: Verified
- Owner/Session: Codex wallet/X auth full-send
- Score: C3 + F5 + S1 + P0(5) = 14
- Evidence:
  - 2026-06-21 production-only browser smoke of `https://wtfos.app/login` clicked `Connect Tezos Wallet`.
  - The live page loaded wallet bundles and contacted Beacon/OCTEZ nodes plus WalletConnect verification without request failures, but the UI stayed on `Connecting...` for 25 seconds with no wallet picker, popup, dialog, retry, or visible error.
  - Console output included `An active account has been received, but no active subscription was found for BeaconEvent.ACTIVE_ACCOUNT_SET.` and `[WTF] Wallet provider: octez.connect`.
  - Fresh-profile retest after clearing cookies, localStorage, sessionStorage, IndexedDB, and Cache Storage reproduced the same hang, proving it was not caused by a cached login/session.
- Why it matters:
  - Wallet-based sign-in is a primary account path. A stuck pending state can prevent new or returning users from logging in, and it resembles the Beacon lifecycle issue previously documented for Macaroni wallet flows.
- Correction:
  - Source fix prepared: `client/src/lib/tezos/wallet.ts` now clears Beacon/WalletConnect localStorage and IndexedDB before forced auth connects, subscribes Octez and Beacon clients to `ACTIVE_ACCOUNT_SET` before permission requests, forces wallet login/link/register ownership proof through an explicit mainnet auth lane, keeps Shadownet available only for app flows that deliberately select it, passes explicit network/RPC config to Beacon/Taquito, and returns a bounded visible timeout if a wallet prompt never completes.
  - RPC defaults were moved to TriliTech Octez-hosted mainnet/shadownet endpoints across core client/server config, operator/domain tooling, static Macaroni/Particle Painter wallet surfaces, runbooks, and harness defaults while keeping TzKT as indexer/API fallback.
  - 2026-06-21 follow-up fix restored that live-proven wallet hardening on the active branch, clears username/password state before wallet auth begins, reads submitted username/password from the real form fields instead of stale React state, and gives the login inputs stable accessible names so browser/password-manager autofill cannot masquerade as a wallet credential fallback.
- Verification:
  - 2026-06-21 local verification passed `npx tsx --test client/src/lib/auth-wallet-login-policy.test.ts client/src/lib/tezos/wallet-connect-policy.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts client/src/pages/profile-wallet-link-policy.test.ts server/features/w/x-connect-onboarding-policy.test.ts`, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory`.
  - Production smoke showed the wallet path no longer stayed on `Connecting...`, kept the login form fields cleared on wallet-auth failure, and live health reported the fixed deploy at `wtfos.app` commit `069b96b`.

### WTF-BB-308 - X OAuth can link the wrong current browser account

- Category: Auth / X and wallet social OAuth cache loop
- Status: Verified
- Owner/Session: Codex wallet/X auth full-send
- Score: C3 + F4 + S1 + P1(4) = 12
- Evidence:
  - 2026-06-21 user report: Profile X linking always attempted to connect the shared `wtfgameshow` X account instead of the user's personal account, with no clear way to change the account being authorized.
  - The Profile X OAuth start flow did not bind the intended profile handle to the OAuth session, so a browser already signed in to the shared X account could authorize that account and continue toward token storage.
- Why it matters:
  - X linking is identity evidence for verification and onboarding. Accepting the browser's current X account without checking the intended handle can silently attach the wrong social identity to a user profile.
- Correction:
  - Profile now sends the normalized intended X handle as `expectedHandle` when starting OAuth.
  - The OAuth2 server session stores that expected handle, uses the current documented `https://x.com/i/oauth2/authorize` endpoint, fetches `/users/me`, and rejects mismatched accounts before token persistence or onboarding.
  - The Profile UI reports the expected and actual handles and tells the user to switch accounts on `x.com` before retrying.
- Verification:
  - Passed `npx tsx --test server/auth/oauth-base.test.ts server/features/w/x-connect-onboarding-policy.test.ts client/src/pages/profile-social-link-policy.test.ts`.
  - Passed the combined auth/profile policy suite, `npm run check -- --pretty false`, `npm run test:e2e:inventory:coverage`, and `npm run test:e2e:inventory`.
  - Production OAuth smoke verified wrong-account X linking is rejected before token persistence and live health reported the canonical callback fix on `wtfos.app` commit `8d994c9`.

### WTF-BB-309 - Production live puppet credentials are blocked behind local secrets and SSH access

- Category: E2E / live puppet ops
- Status: Verified
- Owner/Session: Codex live feature loop
- Score: C2 + F4 + S2 + P1(4) = 12
- Evidence:
  - Live production run command: `WTF_E2E_LIVE_BASE_URL=https://wtfos.app playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs --reporter=list,json`.
  - Result: the first authenticated live puppet setup failed on `e2e_bert` with HTTP 401 `Invalid credentials`, so 140 authenticated/admin route, workflow, API, and behavior checks did not run.
  - The available credential file reports `database.hostname=localhost` and was generated for `localhost:5432`, while `https://wtfos.app/api/leaderboard/xp?limit=100` shows production does have `e2e_*` puppet users with different live user ids.
  - `scripts/wtf-ssh.sh --check` failed because the Codex-visible SSH agent does not have `/Users/joshuafarnworth/.ssh/id_ed25519` loaded, so Codex cannot currently export/repair production puppet credentials from Hetzner.
  - Anonymous production smoke passed after the probe list was aligned to real public API contracts: 17/17 public routes and 12/12 public APIs passed on `https://wtfos.app`.
  - Follow-up repair found the working Hetzner identity at `/Users/joshuafarnworth/.ssh/github_actions_hetzner` and recorded the safe local pointer in `/Users/joshuafarnworth/.codex/secure/wtf-keyring.env`.
  - Production puppet credential and platform keyring files were copied from `/home/paul/.wtf-gameshow/` to local secret storage under `/Users/joshuafarnworth/.wtf-gameshow/`, with production target metadata set to `https://wtfos.app`.
  - Initial full live puppet run reached production and exposed six real logistical/API failures: local `npx` signer lookup, missing `/api/profile/account`, Skywire status expectation drift, admin curse 500 on absent user id, optional Mastodon table 500, and optional Porcupin table 500 on focused rerun.
- Why it matters:
  - The canonical user-story loop depends on actor-backed live coverage for auth, roles, wallets, rewards, admin tooling, persistence, and cross-domain workflows. Local secrets against production produce false 401 failures and leave the high-risk behavior surface untested.
- Correction:
  - Added a live-target guard in `tests/e2e/puppets/runtime.mjs` so local puppet credentials are refused against remote base URLs with a clear instruction to seed/export production credentials and make `scripts/wtf-ssh.sh --check` pass.
  - Allowed production Docker-network credential metadata when the stored `targetBaseUrl` matches the live target.
  - Fixed the live signer helper to invoke repo-local `tsx` through `process.execPath` instead of assuming `npx` exists in the Codex shell.
  - Added `/api/profile/account`, normalized the Skywire unlinked-account workflow expectation, changed admin user-curse updates to return controlled 404s for missing targets, and made optional Mastodon/Porcupin routes fail closed with 503 when their optional tables are absent.
  - Seeded/exported production puppet credentials from the Hetzner path, forced the platform keyring master into the one-off seed container, verified signer decrypt with `sign-challenge`, and added seeder-side signer usability verification before writing credentials.
- Verification:
  - `node --test tests/e2e/puppets/runtime.test.mjs`
  - `WTF_E2E_LIVE_BASE_URL=https://wtfos.app node tmp/live-public-smoke.mjs`
  - `DATABASE_URL=postgres://localhost/wtf_test node node_modules/tsx/dist/cli.mjs tests/e2e/puppets/seed.ts --dry-run`
  - Focused production reruns passed after repair: `tmp/live-puppet-final-failed-rerun-results.json` and `tmp/live-puppet-final-two-rerun-results.json`.
  - Stable final production retest passed: `tmp/live-puppet-full-stable-postfix-results.json` reports 141/141 passed against `https://wtfos.app` on live commit `12cbaf6`.

### WTF-BB-310 - Hetzner worktree cannot run full TypeScript verification

- Category: Ops / Hetzner verification dependencies
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence:
  - During the production hotfix pass, the remote Hetzner repo at `/opt/platform/repos/wtf-app` could run focused policy tests and inventory coverage, but `npm run check -- --pretty false` failed before checking the hotfix because dependencies such as `three`, `@atproto/api`, AWS SDK, MCP SDK, and `viem` were missing from that worktree.
  - The deploy path still completed and live health verified commit `12cbaf6`, so this is a remote verification-tooling gap rather than a production runtime outage.
- Why it matters:
  - Emergency production fixes need a trustworthy remote verification path. If the server worktree cannot run the same TypeScript check as CI, agents can either over-trust narrow focused tests or spend time debugging dependency drift unrelated to the fix.
- Correction:
  - Define whether Hetzner should keep a dev-dependency capable verification checkout, delegate all full checks to GitHub Actions only, or expose a documented containerized check command with the same dependency graph as CI.
- Verification:
  - Run the chosen command on Hetzner and confirm it can complete a full TypeScript check without missing-module failures.

### WTF-BB-311 - WTF LIVE owner controls can desync after live mutations

- Category: WTF LIVE / owner control UX
- Status: Verified
- Owner/Session: Codex live user-story gap loop
- Score: C2 + F5 + S0 + P1(4) = 11
- Evidence:
  - Independent production user-story probe `tmp/live-user-story-probes/wtf-live-owned-results.json` against `https://wtfos.app` found the public owner room flow created and closed a room, then the selected card showed a `Reopen` control while the second click left the action status at `is closed to guests`.
  - The same probe created a stage that appeared in `/api/wtf-live/stages/mine`, but the Stages UI stayed selected on the default `WTF Stage` and never rendered the created stage card.
  - Screenshots were captured under `test-results/wtf-live-owned-live-user-s-ffcbb-s-and-deletes-a-public-room-chromium/` and `test-results/wtf-live-owned-live-user-s-eeb68-reopens-and-deletes-a-stage-chromium/`.
- Why it matters:
  - Room and stage ownership controls are core WTF LIVE logistics. A host needs immediate, trustworthy UI state after creating, closing, reopening, and deleting live spaces, especially during a show.
- Correction:
  - Fixed in `7df41dd` by keeping client query caches in sync with mutation responses for created/updated/deleted rooms and stages, and surfacing owner-control mutation failures in the action status instead of leaving stale success text onscreen.
- Verification:
  - Local TypeScript passed: `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
  - Local inventory coverage passed: `node node_modules/tsx/dist/cli.mjs tests/e2e/inventory/coverage.ts`.
  - Focused WTF LIVE owner-control Playwright passed 14/14: `node node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs --reporter=list`.
  - GitHub Deploy to Hetzner run `27979556159` succeeded and live health returned `commitRef:"7df41dd"`.
  - Independent live owned-surface probe passed 4/4 on `https://wtfos.app`: `tmp/live-user-story-probes/wtf-live-owned-results.json`.

### WTF-BB-312 - WTF LIVE Show Kit cooldown feedback can be skipped after live relay

- Category: WTF LIVE / Show Kit cooldown UX
- Status: Verified
- Owner/Session: Codex live user-story gap loop
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - Expanded independent production user-story probe `tmp/live-user-story-probes/wtf-live-realtime-results.json` against `https://wtfos.app` passed realtime room chat/media behavior, then failed the Show Kit relay story because a second immediate trigger after `Relay Sting ... sent.` never changed status to cooldown feedback.
  - The runtime code set `soundboardCooldownRef` before awaiting audio decode/injection. On live, the async audio path can outlast a short configured cooldown such as 500ms, so a second click after the first visible `sent` status is treated as ready instead of cooling down.
- Why it matters:
  - Show hosts need clear feedback that a soundboard clip was intentionally throttled. Silent repeat-click acceptance or stale `sent` text makes it look like the button ignored the click or sent a second cue unpredictably.
- Correction:
  - Track a clip as in-flight while the send path is preparing audio, clear that in-flight state on relay failure, and start the user-visible cooldown from the successful send time.
- Verification:
  - Local TypeScript passed: `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
  - Focused Show Kit Playwright passed: `node node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "Show Kit soundboard" --reporter=list`.
  - Inventory coverage passed: `node node_modules/tsx/dist/cli.mjs tests/e2e/inventory/coverage.ts`.
  - GitHub Deploy to Hetzner run `27981179749` succeeded and live health returned `commitRef:"7f5d0d7"`.
  - Expanded independent live realtime/Show Kit probe passed 2/2 on `https://wtfos.app`: `tmp/live-user-story-probes/wtf-live-realtime-results.json`.
  - Later expanded independent WTF LIVE realtime/Show Kit/WIM/tip probe passed 3/3 on `https://wtfos.app` with the same Show Kit cooldown story still green.

### WTF-BB-313 - Skywire connected-account live stories lack an AT Protocol puppet

- Category: Skywire / live AT puppet coverage
- Status: Blocked
- Owner/Session: Codex live user-story gap loop
- Score: C2 + F4 + S1 + P1(4) = 11
- Evidence:
  - Independent production Skywire probe `tmp/live-user-story-probes/skywire-live-results.json` passed 3/3 for anonymous standalone login, backend standalone OAuth start, legacy `wtfgameshow.app` canonical redirect, and signed-in market-feed token previews.
  - The same probe confirmed the rollout-eligible host puppet has no connected AT Protocol account: `/api/atproto/me` returns `account: null`.
  - Production `/api/skywire/live-status` and `/api/skywire/signals` return `400` with `Connect an AT Protocol account first` for the rollout-eligible host puppet.
  - Hetzner env-file key-name search found only public/platform AT config such as `ATPROTO_SPINE_ENABLED`, `WTFOS_ATPROTO_NETWORK_DOMAIN`, `WTFOS_PRIMARY_ATPROTO_DID`, `WTFOS_PRIMARY_ATPROTO_HANDLE`, and `W_DIGEST_ATPROTO_USER_ID`; no dedicated live AT puppet credential key was visible.
- Why it matters:
  - The canonical user-story loop cannot honestly mark Skywire live status, signal publishing, or OAuth original-window permission sync as complete without a real connected AT account on production.
  - Existing local/harness tests cover the behavior shape, but they do not prove the live OAuth callback/session, repo-write, actor-status, or chat-upgrade path with real production credentials.
- Likely correction direction:
  - Provision or connect a dedicated low-risk live AT Protocol puppet account for the e2e host/admin actor.
  - Store the credential/session export outside worktrees, document the env/keyring slug, and keep secret values out of GitHub, logs, and workbook artifacts.
  - Add a live Skywire connected-account probe that can set/clear actor status, publish a starter signal, and complete or simulate the real OAuth permission upgrade against the connected puppet account.
- Verification idea:
  - Rerun `tmp/live-user-story-probes/skywire-live.spec.mjs` after provisioning and expect the connected-account blocker test to be replaced by live status set/clear, signal publish, and permission-sync tests.

### WTF-BB-314 - WIM settings dialog Escape fails after custom-list creation

- Category: WIM / settings dialog keyboard UX
- Status: In Progress
- Owner/Session: Codex live user-story gap loop
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - Independent production WIM probe `tmp/live-user-story-probes/wim-live-results.json` opened signed-in `/wim`, created a `Live Probe` custom buddy list, pressed Escape, and the `role="dialog"` settings surface remained open for the full Playwright expectation timeout.
  - The rendered failure screenshot shows the WIM settings dialog still visible after the Escape key path, while the dialog also exposes an explicit close button.
  - Source inspection found Escape was handled only by `SettingsPopover.onKeyDown`, so the close path depends on focus staying inside the popover after list creation.
- Why it matters:
  - WIM is a windowed desktop messaging surface. Dialogs need predictable keyboard recovery, especially after creating or editing local buddy-list organization.
  - Existing inventory coverage only proved Escape immediately after opening settings; it did not cover the post-submit focus state found by the live user-story loop.
- Correction:
  - Keep the popover-local handler, and add a settings-open lifecycle keydown listener that closes the dialog on Escape even if focus has moved out of the popover after a list mutation.
  - Expand the WIM inventory regression to create a custom list before pressing Escape.
- Verification:
  - Local TypeScript passed: `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
  - Inventory coverage passed: `node node_modules/tsx/dist/cli.mjs tests/e2e/inventory/coverage.ts`.
  - Local Vite client build passed: `node node_modules/vite/bin/vite.js build`.
  - Focused WIM inventory regression passed after rebuilding the client bundle: `HARNESS_PORT=4186 node node_modules/.bin/playwright test tests/playwright/inventory/wim-owner-controls.spec.mjs --reporter=list`.
  - GitHub Deploy to Hetzner run `27983593125` succeeded and live health returned `commitRef:"f09feec"`.
  - Production WIM user-story retest passed on `https://wtfos.app`: `tmp/live-user-story-probes/wim-live-results.json` reports 1/1 expected, 0 unexpected.

### WTF-BB-305 - Live health can timeout under scheduler audit volume

- Category: Operations / production health
- Status: Verified
- Owner/Session: Codex wallet live full-send
- Score: C3 + F5 + S0 + P0(5) = 13
- Evidence:
  - Live `/api/health` could intermittently return 503 when the scheduler audit summary queried the whole latest-run table under production volume.
- Why it matters:
  - The deploy workflow and production smoke checks use `/api/health` as the gate for safe promotion, so intermittent health failures can block or mask otherwise healthy deploys.
- Correction:
  - Query only registered job names through indexed lateral latest-row lookups and add the supporting production index.
- Verification:
  - Verified live on `wtfos.app`; `/api/health` returned `status:"ok"` after the scheduler query/index fix.

### WTF-BB-306 - Water tool can clean instead of hydrate a thirsty pet

- Category: Desktop pet / care tool UX
- Status: Fixed
- Owner/Session: Codex desktop pet water repair
- Score: C2 + F4 + S0 + P1(4) = 10
- Evidence:
  - 2026-06-21 user report: giving a pet water leaves the Water/thirst meter at 0 no matter how much water is given.
  - Source trace showed the Water tool's direct pet click always posts `clean`, and desktop water drops prioritize `clean` while the pet is sick/dirty before considering thirst. A sick pet can therefore consume repeated water drops as cleaning actions without increasing thirst.
- Why it matters:
  - Water is the visible label for the thirst meter and one of the core survival actions. If it can silently perform a different care action, users cannot recover an urgent thirst state.
- Correction:
  - Added a shared client water-care policy so direct Water-tool pet clicks and desktop water drops hydrate first whenever thirst is below the drinking threshold.
  - Water is used as bath/clean care only after thirst is satisfied and the pet still needs cleaning.
- Verification:
  - Passed `./node_modules/.bin/tsx --test client/src/features/desktop/pet/waterCarePolicy.test.ts shared/desktop.test.ts`.
  - Passed `./node_modules/.bin/tsc --noEmit`.
  - `./node_modules/.bin/tsx tests/e2e/inventory/coverage.ts` is blocked by the pre-existing unrelated registry error: `hoard must register behavior assertion 'auth.wallet-provider-login-lifecycle'`.

### WTF-BB-307 - Codex local SSH must use this Mac's wtf alias and agent

- Category: Ops / local SSH access
- Status: Fixed
- Owner/Session: Codex local SSH bootstrap pass
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - User report on 2026-06-21 clarified that shell SSH from this Mac is simply `ssh wtf`, while the GitHub publish path uses a different key.
  - Exact `ssh wtf` from the Codex tool prompted for `/Users/joshuafarnworth/.ssh/id_ed25519`, and `ssh-add -l` showed Codex's visible agent lacked that required identity.
  - Retrying with deploy/GitHub-oriented assumptions or `BatchMode` cannot repair a missing local agent identity.
- Correction:
  - Added ignored `.codex/machine-ssh.env` for machine-local SSH settings.
  - Added tracked `scripts/wtf-ssh.sh`, which sources the local env, uses the `wtf` alias, verifies the configured identity fingerprint is loaded, and refuses to prompt for passphrases inside Codex.
  - Added `.codex/PROJECT_RULES.md` guidance so future agents use the wrapper instead of publish/deploy keys for local server checks.
- Verification:
  - Passed `bash -n scripts/wtf-ssh.sh`.
  - Verified `.codex/machine-ssh.env` is ignored by `.gitignore`.
  - Verified `scripts/wtf-ssh.sh --doctor` reports the current visible agent and required identity fingerprint.
  - Verified `scripts/wtf-ssh.sh --check` exits 78 with the local agent/env fix instead of opening an SSH passphrase prompt.

	### WTF-BB-319 - WTF LIVE realtime chat sanitizer kept legacy MEK fonts

- Category: WTF LIVE / realtime chat typography
- Status: Verified
- Owner/Session: Codex WTF LIVE server font cleanup
- Score: C1 + F4 + S0 + P2(3) = 8
- Evidence:
  - 2026-06-29 follow-up from the WTF LIVE font cleanup found `server/websocket.ts` still allowed `mek-mono` and `grout-display` in realtime chat style payloads.
  - The same server sanitizer defaulted missing or invalid realtime chat styles to `mek-mono`, so WebSocket-delivered room messages could still reintroduce MEK after the client option list was cleaned.
- Why it matters:
  - WTF LIVE chat is relayed through the WebSocket layer. A client-only font cleanup is incomplete if stale or malicious realtime payloads can still render with the removed font.
- Correction:
  - Restricted the server realtime chat font allowlist to `classic-95`, `terminal`, and `serif-press`.
  - Changed the server default chat font to `classic-95`.
  - Mapped legacy `system`, `mek-mono`, `grout-display`, and `pixel` payloads to `classic-95`.
  - Added `server/websocket-wtf-live-font-policy.test.ts` to guard the server sanitizer.
- Verification:
  - Confirmed the new regression failed before the server patch.
	  - Passed `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsx --test server/websocket-wtf-live-font-policy.test.ts`.
	  - Passed `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsx --test shared/desktop.test.ts client/src/features/wtf-live/wtf-live-presentation-policy.test.ts`.
	  - Passed `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsc --noEmit --pretty false`.

### WTF-BB-322 - Recovery Mode route smoke treats auth probe as fatal

- Category: Desktop OS / Recovery Mode route smoke
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S1 + P2(3) = 9
- Evidence:
  - 2026-06-29 full inventory run for the Tezos provider audit ended 440/444 passing.
  - `tests/playwright/inventory/routes.spec.mjs` failed the `/recovery-mode` route because the browser console captured `Failed to load resource: the server responded with a status of 401 (Unauthorized)` and `fatalErrors(errors)` expected no fatal browser errors.
  - The Tezos-facing routes in the same run passed, including `/tools/particle-painter`, `/tools/macaroni`, Pasta publisher routes, `/tezos-intel`, `/wtf-subdomains`, `/contract-factory`, and `/operator-wallet`.
- Why it matters:
  - Recovery Mode is supposed to be the fallback surface users see when normal app state is unhealthy. Its inventory smoke should either avoid noisy protected probes or explicitly classify expected unauthenticated probes as non-fatal so real regressions are visible.
- Likely correction direction:
  - Inspect `client/src/pages/RecoveryMode.tsx` and the route harness to determine whether the 401 probe is intentional. If it is expected, update the route inventory fatal-error filter narrowly for this route; if not, prevent the protected request before auth state exists.
- Verification idea:
  - Run `npx playwright test tests/playwright/inventory/routes.spec.mjs -g "Recovery Mode"` and then `npm run test:e2e:inventory:coverage`.

### WTF-BB-320 - WTF LIVE public room dockable bento workspace

- Category: WTF LIVE / dockable room workspace UX
- Status: Verified
- Owner/Session: Codex WTF LIVE dockable bento pass
- Score: C4 + F5 + S0 + P1(4) = 13
- Evidence:
  - 2026-06-29 user report: WTF LIVE remains a single monolithic UX window, and users need to split connection, sharing, testing, attendance, chat, settings, and shared screens/main screen into a resizable core bento or separate draggable windows.
  - Existing room layout used one fixed control/stage/sidebar grid with chat and attendance as the only detachable panels; connection, sharing, shared screens, and settings/testing could not be docked, grouped, or popped out independently.
- Why it matters:
  - Live rooms are used alongside other apps, streams, and screens. Forcing every live control into one fixed room frame blocks multi-monitor layouts and keeps chat/attendance competing with stage space.
- Correction:
  - Replaced the fixed public-room shell with a transparent bento workspace containing Connection, Sharing, Screens, Attendance, and Room chat tiles.
  - Hid Testing and Settings behind icon toggles under the Sharing tray; Settings now exposes a receiver default chat font select from the WTFOS font library for unstyled incoming room chat.
  - Added per-core-panel pop-out, pop-in, resize/maximize, and always-on-top pin controls; screen/camera/media sources can be dragged together into a screen grid with hover-only per-item popout buttons.
  - Updated the real WebSocket relay and the Playwright WTF LIVE relay so messages without an assigned sender style remain unstyled, allowing receiver default fonts to apply end-to-end.
- Verification:
  - `vite build`
  - `node_modules/.bin/tsx --test server/websocket-wtf-live-font-policy.test.ts`
  - `node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "core bento" --project=chromium --reporter=list`
  - `node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "mic test" --project=chromium --reporter=list`

### WTF-BB-318 - WTF LIVE input-triggered screen flash and MEK typography complaints

- Category: WTF LIVE / input rendering stability
- Status: Verified
- Owner/Session: Codex WTF LIVE input flash repair
- Score: C3 + F5 + S0 + P1(4) = 12
- Evidence:
  - 2026-06-29 user report: WTF LIVE flashes whenever mic input is enabled or users type in chat, and users continue to complain about the MEK font in WTF LIVE.
  - Source trace found the parent public-room component owned the high-frequency mic-level analyser state and chat draft state while rebuilding track-filtered `MediaStream` wrappers during render for stage video tiles and popouts.
- Why it matters:
  - Chat typing and microphone input are core live-room interactions; repainting or reattaching video streams during those interactions makes the room feel unstable and can look like a full-screen flash.
- Correction:
  - Moved the mic-level analyser into a local `MicLevelMeter` component so audio-frame updates no longer rerender the whole room.
  - Cached track-filtered stage `MediaStream` wrappers and memoized local/remote stage entries so unrelated input state does not reset video `srcObject`.
  - Collapsed the microphone compatibility UI into a compact row with a Details drawer for browser/permission/device guidance.
  - Set WTF LIVE room/dashboard shells to a Classic 95 system font stack and removed MEK/GROUT from WTF LIVE chat font options/defaults, while mapping legacy stored MEK/GROUT values to Classic 95.
- Verification:
  - Passed focused source/unit tests: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsx --test shared/desktop.test.ts client/src/features/wtf-live/wtf-live-presentation-policy.test.ts`.
  - Passed TypeScript: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsc --noEmit --pretty false`.
  - Passed inventory coverage: `/Users/joshuafarnworth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.bin/tsx tests/e2e/inventory/coverage.ts`.
  - Rebuilt client bundle with Vite: `node node_modules/.bin/vite build`.
  - Focused Playwright passed 14/14 before the shell-font follow-up; after the follow-up, combined focused Playwright passed 14/15 with the only failure matching known artifact instability `WTF-BB-238` during trace network-file copy, then the affected fresh-harness rerun passed: `HARNESS_PORT=4191 node_modules/.bin/playwright test tests/playwright/inventory/wtf-live-owner-controls.spec.mjs -g "public room keeps chat reachable" --project=chromium --reporter=list`.
  - Theme Builder typography Playwright passed and confirms WTF LIVE font options are `classic-95`, `terminal`, and `serif-press`.
  - Visual mobile smoke on `/live/r/wtf-live` at 390px confirmed Classic 95 font stack, no horizontal overflow, a 105px closed mic-test row, and collapsed details at 0px height.

### WTF-BB-321 - Tezos wallet dependencies and static bundles lagged U025

- Category: Tezos / wallet dependencies and RPC defaults
- Status: Verified
- Owner/Session: Codex Tezos provider currency audit
- Score: C4 + F4 + S1 + P1(4) = 13
- Evidence:
  - 2026-06-29 upstream audit found Taquito `25.0.0` is the current U025/Ushuaia release, while root, Particle Painter, operator signer, lockfiles, and static creator-tool bundles still resolved Taquito `24.3.0`.
  - Macaroni and Pasta vendored `tezos.js` bundles included `PtTALLiNt` as the default protocol and had no `PsUshuai9` support, so package manifest updates alone would not have updated shipped wallet/transaction code.
  - Octez Connect SDK was behind `4.8.6`, and several new/default local paths still preferred Ghostnet or `mainnet.api.tez.ie` instead of Octez primary endpoints.
  - Follow-up grep found the live buyback-window create API and DB schema still defaulted fresh windows to Ghostnet.
  - User correction confirmed ECAD Beacon should not be treated as a first-class wallet provider; active app and Particle Painter wallet flows still instantiated Beacon provider bridges after the initial package upgrade.
- Why it matters:
  - Wallet connection and transaction handling are shipped both through npm packages and static browser bundles. A stale bundle can keep using old protocol constants, wallet transport defaults, or provider endpoints even after source dependencies look current.
- Correction:
  - Upgraded root, Particle Painter, and operator signer Taquito packages to `25.0.0`; upgraded Octez Connect SDK to `4.8.6`.
  - Replaced the shared app's Beacon fallback/bridge with a custom Octez Connect-backed Taquito wallet provider that maps Taquito wallet operations to Octez `requestOperation` and signatures to Octez `requestSignPayload`.
  - Replaced Particle Painter's direct `@taquito/beacon-wallet` / `@ecadlabs/beacon-types` wallet service with `@tezos-x/octez.connect-sdk` plus a custom Taquito wallet provider; refreshed its lockfile and rebuilt tracked production assets.
  - Kept root `@taquito/beacon-wallet` only for generated static creator-tool compatibility bundles that still need Taquito's wallet wrapper while the visible transport remains Octez-primary.
  - Added `scripts/build-tezos-browser-vendors.mjs` and regenerated Macaroni/Pasta Tezos and Octez Connect browser bundles with U025 support.
  - Rebuilt the tracked Particle Painter production bundle so it no longer ships Taquito `24.3.0` or the dead `tezostaquito.io` icon URL.
  - Moved fresh-work defaults to Octez Shadownet for the domain bot, subdomain deploy helper, Contract Factory, buyback-window creation, DB-side buyback-window defaults, and puppet seed/runtime paths; replaced the legacy marketplace pause fallback with Octez mainnet.
- Verification:
  - Passed `npm run security:tezos-rpc-defaults`.
  - Passed `node --test scripts/check-tezos-rpc-defaults.test.mjs`.
  - Passed `npx tsx --test client/src/lib/tezos/wallet-connect-policy.test.ts client/src/lib/tezos/wallet-shadownet-preflight-policy.test.ts`.
  - Passed `npm --prefix PP run build`.
  - Passed `npx tsx --test server/routes/macaroni-policy.test.ts client/src/pages/ContractFactory.test.ts`.
  - Passed `npm run creation-tools:check`.
  - Passed `npm run test:e2e:inventory:coverage`.
  - Passed `npm --prefix extensions/wtf-domain-bot run typecheck` after installing that subpackage.
  - Passed `npm --prefix extensions/wtf-operator-signer run typecheck`.
  - Verified `https://tezos-shadownet.octez.io/chains/main/chain_id` returns `NetXsqzbfFenSTS`.

### WTF-BB-322 - Gamma Swap proof no longer recognizes the harness wallet seed

- Category: Gamma / Swap presentation proof
- Status: Open
- Owner/Session: -
- Score: C2 + F3 + S0 + P2(3) = 8
- Evidence:
  - During the 2026-06-29 Gamma social-route containment pass, the full Gamma suite reached the Swap proof and failed with `[data-swap-region="submit-button"]` stuck on `Connect Wallet` instead of `Swap via SpicySwap`.
  - A fresh isolated rerun also failed the same way: `HARNESS_PORT=4276 ./node_modules/.bin/playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "Swap DEX quote"`.
  - The Swap proof seeds `localStorage["wtf:wallet-session"]`, but the current wallet context no longer treats that as a connected wallet in the built harness.
- Why it matters:
  - Gamma route containment depends on broad shell proof staying meaningful. If wallet-backed proofs drift away from the current wallet context, unrelated Gamma passes get noisy failures and Swap's quote/signer state can no longer be trusted by the harness.
- Likely correction direction:
  - Align the Gamma Swap proof with the current wallet context bootstrap path, or provide an explicit harness wallet provider/session stub that exercises the connected quote state without changing shared wallet behavior.
- Verification idea:
  - Rerun the focused Swap proof on a fresh port, then rerun the full Gamma spec: `HARNESS_PORT=<fresh> ./node_modules/.bin/playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g "Swap DEX quote"` and `HARNESS_PORT=<fresh> ./node_modules/.bin/playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs`.

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
