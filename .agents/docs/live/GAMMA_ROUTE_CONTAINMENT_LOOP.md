# Gamma Route Containment Loop

Date: 2026-06-30

Scope: `gamma.wtfos.app` presentation containment only. Shared route fixtures, auth, APIs, data, wallet, contract, and app behavior remain unchanged.

## Current Pass

Covered route cluster: final mixed native backlog, Swap proof hardening, static/nested route audit, production-host routing proof, and live public hostname spot check

Covered routes: `/dues`, `/tezos-intel`, `/user/:username`, `/swap`, `/beta`, `/links`, `/faq`, `/discord/terms`, `/discord/privacy`, `/discord/linked-roles`, `/messages/dms/:id`, `/console`; local hostname-mode proof covers direct `gamma.wtfos.app/gallery` and `gamma.wtfos.app/leaderboard` routing through Chromium host mapping.

Result: Club Dues now renders through a Gamma-owned club-dues surface with header, payment, customization, registry, admin, status, and route-preserving Inbox/Operator Wallet handoff regions while preserving `/api/club-dues/*`, `/api/admin/club-dues/*`, wallet connect, `payClubMembership`, and `originateClubDuesContract`. Tezos Intel now renders through a Gamma-owned market-intel shell with score, compare, market pulse, source, metric, and control regions while preserving `/api/tezos-intel/*` hooks. Public user profiles now render through a Gamma-owned public-profile shell with tabs, About, social, wallet, trade-board, listings, activity, and DM regions while preserving public profile, listing, XP activity, and DM APIs. The Gamma Swap proof now seeds the current accepted Octez wallet session shape so the DEX quote chrome proves the connected-wallet state without changing Swap logic or DEX APIs. The previously documented static, nested, and console route exclusions are now directly proved inside `[data-gamma-application-content]` with Gamma breadcrumbs, no missing-route fallback, and no Classic desktop. Direct production-host routes now have both source-level routing guards and a Chromium host-mapped local proof that `gamma.wtfos.app/:route` stays inside Gamma without the local `/gamma` prefix. The React95 compatibility layer now has an explicit source guard proving Vite routes `react95` imports through the presentation adapter, with Classic/Beta still delegating to real React95 and Gamma rendering adapter primitives. A live public hostname spot check then found the deployed Gamma host is not yet equivalent to the local proof: `https://gamma.wtfos.app/` renders the Gamma landing shell, but `https://gamma.wtfos.app/gallery` and `/leaderboard` render the Classic desktop.

Root cause update: live `wtfos.app`/`gamma.wtfos.app` is serving commit `de0acb6`, and the deployed `index-wtf2-ChA9LqzT.js` bundle still contains the old App branch equivalent to `isGammaHost() && location === "/" ? matchPage("/gamma") : null`. That means every public Gamma deep route bypasses the Gamma shell before `GammaWtfos` can render. The current local dirty worktree has the broader `isGammaShellLocation(location)` branch and complete route workspace, but this checkout is behind `origin/main` and contains many unrelated dirty changes, so the live fix needs an isolated production-base branch rather than pushing this worktree wholesale.

## Verification

- Focused final-bucket source policy plus presentation helper policy: `8 passed`
- Focused final-bucket Gamma proof: `1 passed` on fresh `HARNESS_PORT=4298`, covering rendered `/dues`, `/tezos-intel`, and `/user/wtf-admin` as The Count and proving `/dues` -> `/gamma/messages` handoff containment
- Focused Swap source policy plus presentation helper policy: `8 passed`
- Focused Swap Gamma proof: `1 passed` on fresh `HARNESS_PORT=4301`
- Focused static/nested/console route proof: `1 passed` on fresh `HARNESS_PORT=4304`, covering `/beta`, `/links`, `/faq`, `/discord/terms`, `/discord/privacy`, `/discord/linked-roles`, `/messages/dms/1`, and `/console`
- Focused production-hostname and React95-adapter source policy plus presentation helper policy: `10 passed`
- Focused production-hostname Gamma proof: `1 passed` on fresh `HARNESS_PORT=4306`, using Chromium host resolver mapping for `gamma.wtfos.app` and proving direct `/gallery` -> `/leaderboard` navigation remains in Gamma without `[data-wtf-desktop]`
- Full Gamma shell suite with Swap, static/nested audit, and production-hostname proof included: `62 passed` on fresh `HARNESS_PORT=4307`
- Presentation-policy sweep: `153 passed`
- Full inventory coverage gate: complete for `113/113` registered route fixtures, `195/195` subdomain rows, and `852/852` normalized handles
- Live public hostname spot check: `https://gamma.wtfos.app/` rendered `[data-gamma-wtfos]=1`, but direct live `https://gamma.wtfos.app/gallery` and `https://gamma.wtfos.app/leaderboard` rendered `[data-wtf-desktop]=1` with no Gamma workspace or Gamma application content. Tracked as `WTF-BB-325`.
- Live asset root cause probe: `https://gamma.wtfos.app/api/health` reported commit `de0acb6`, matching `origin/main`; `https://gamma.wtfos.app/assets/index-wtf2-ChA9LqzT.js` still contains a root-only Gamma host branch and no `isGammaShellLocation` broad-route branch. Public `/gamma/gallery` and `/gamma/leaderboard` also fell into Classic, proving this is a stale/incomplete deployed client shell rather than only a Caddy path rewrite issue.
- Vite build: passed with `/opt/homebrew/bin/node ./node_modules/.bin/vite build`
- Full inventory suite: not rerun in this pass because broad inventory currently has unrelated open blockers in the board, including WTF Domains Settings wallet prefill drift (`WTF-BB-323`) and Recovery Mode route-smoke auth noise (`WTF-BB-322`). Gamma Swap wallet-seed drift (`WTF-BB-324`) is now verified fixed and the broad Gamma spec passes with Swap, the static/nested route audit, and the production-hostname route proof included.
- TypeScript: broad `tsc --noEmit --pretty false` remains a known inconclusive local gate from earlier passes because it stayed silent for several minutes and was terminated; focused source policy, Vite build, inventory coverage, and rendered Playwright proof passed.

## Route Accounting

Shared route fixtures: 113

Direct Gamma containment proofs after this pass: 113 fixture paths or pattern-equivalent paths

Raw uncovered fixture paths after this pass: 0

App-containment backlog: 0

Live public-host direct-route samples after this pass: 3

Live public-host Gamma samples passing: 1 (`/`)

Live public-host deep-route samples falling back to Classic: 2 (`/gallery`, `/leaderboard`)

Previously documented exclusions now have direct rendered Gamma proof and are no longer excluded from route accounting:

- `/beta`
- public docs and link pages: `/links`, `/faq`
- Discord legal/linked-role static pages: `/discord/terms`, `/discord/privacy`, `/discord/linked-roles`
- nested DM detail route under the Inbox shell: `/messages/dms/:id`
- WTF Console: `/console`

## Remaining App-Containment Backlog

| Domain | Remaining | Notes |
| --- | ---: | --- |
| desktop-os | 0 | Desktop OS cluster is closed after Map Lab. |
| gameshow | 0 | Gameshow leftovers are closed after DedRooms, WTF Recapture, and Mint Portal. |
| social | 0 | Social cluster is closed after Digest, W aliases, Dear Diary, CRP nominations, Telegram digest, Mail, Messages, Board, Skywire, WIM, Dicksword, LIVE, tz2at, and profile-level social surfaces already proved. |
| club-dues | 0 | Club Dues is closed after `/dues` rendered with Gamma payment, customization, registry, admin, and handoff regions. |
| media | 0 | Gallery/token aliases and colleKT are closed. |
| pasta-protocol | 0 | Pasta Protocol and CH-EASE handoff routes are closed. |
| admin | 0 | Native admin route cluster is closed after Control Board, Backup Manager, Contract Factory, Operator Wallet, and UX Lab. |
| wallet | 0 | Tezos Intel is closed after `/tezos-intel` rendered with Gamma score, compare, market-pulse, and source panels. |
| identity | 0 | Public user profile is closed after `/user/wtf-admin` rendered with Gamma About, social, wallet, trade-board, listings, activity, and DM regions. |

## Pass Estimate

Expected remaining loop passes from routes uncovered so far: 0 local route-containment passes, plus 1 live deployment/routing verification pass.

Standing rule: every Gamma loop pass must update this estimate from the uncovered route set. Only routes with rendered Gamma application-content proof count as closed; incidental links, launch buttons, and handoff URLs do not close a route until the destination surface is asserted inside the Gamma shell.

Basis: `113/113` registered route fixtures now have direct or pattern-equivalent rendered Gamma containment proof, and `0` raw fixture paths remain uncovered locally. The last 8 raw paths were the former static/nested/console exclusions, and this pass converted them into direct Gamma shell assertions. The production-hostname code path is proved locally with Chromium host mapping for representative public discovery routes, so the local estimate is not relying solely on the `/gamma` harness prefix. However, the live public hostname probe found `2/2` sampled deep routes still falling back to Classic, so the public delivery estimate is one remaining pass: promote or repair the live Gamma hostname routing/build, then rerun live selector proof.

Optimistic path: no further local route-containment pass is needed unless a new route fixture is added or a verified route regresses.

Pessimistic path: 1 live routing/deployment hardening pass remains for the current goal, because public `gamma.wtfos.app` deep routes are still rendering Classic. A separate 1 hardening pass may remain if full inventory blockers outside Gamma containment are in scope; current non-Gamma blockers are WTF Domains Settings wallet prefill drift and Recovery Mode route-smoke auth noise.

Recommended next pass: create an isolated branch from `origin/main`, apply only the Gamma presentation shell/runtime/test slice needed for `gamma.wtfos.app/:route` containment, verify it locally against the production-base branch, then deploy and rerun live `/`, `/gallery`, `/leaderboard`, and at least one auth-gated route proof before considering the public Gamma goal done.
