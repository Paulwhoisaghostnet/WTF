# Gamma Route Containment Loop

Date: 2026-06-30

Scope: `gamma.wtfos.app` presentation containment only. Shared route fixtures, auth, APIs, data, wallet, contract, and app behavior remain unchanged.

## Current Pass

Covered route cluster: production-base Gamma shell transplant, desktop utility handoffs, Message Board dialog chrome, static/nested route audit, production-host routing proof, and live public hostname spot check

Covered routes: all `112/112` production-base registered route fixtures, including `/dues`, `/tezos-intel`, `/user/:username`, `/swap`, `/beta`, `/links`, `/faq`, `/discord/terms`, `/discord/privacy`, `/discord/linked-roles`, `/messages/dms/:id`, `/console`, `/cli`, `/mission-control`, `/messageboard`, and direct `gamma.wtfos.app/gallery` -> `gamma.wtfos.app/leaderboard` routing through Chromium host mapping.

Result: Club Dues now renders through a Gamma-owned club-dues surface with header, payment, customization, registry, admin, status, and route-preserving Inbox/Operator Wallet handoff regions while preserving `/api/club-dues/*`, `/api/admin/club-dues/*`, wallet connect, `payClubMembership`, and `originateClubDuesContract`. Tezos Intel now renders through a Gamma-owned market-intel shell with score, compare, market pulse, source, metric, and control regions while preserving `/api/tezos-intel/*` hooks. Public user profiles now render through a Gamma-owned public-profile shell with tabs, About, social, wallet, trade-board, listings, activity, and DM regions while preserving public profile, listing, XP activity, and DM APIs. The Gamma Swap proof now seeds the current accepted Octez wallet session shape so the DEX quote chrome proves the connected-wallet state without changing Swap logic or DEX APIs. The previously documented static, nested, and console route exclusions are now directly proved inside `[data-gamma-application-content]` with Gamma breadcrumbs, no missing-route fallback, and no Classic desktop. Direct production-host routes now have both source-level routing guards and a Chromium host-mapped local proof that `gamma.wtfos.app/:route` stays inside Gamma without the local `/gamma` prefix. The React95 compatibility layer now has an explicit source guard proving Vite routes `react95` imports through the presentation adapter, with Classic/Beta still delegating to real React95 and Gamma rendering adapter primitives. A live public hostname spot check then found the deployed Gamma host is not yet equivalent to the local proof: `https://gamma.wtfos.app/` renders the Gamma landing shell, but `https://gamma.wtfos.app/gallery` and `/leaderboard` render the Classic desktop.

Root cause update: live `wtfos.app`/`gamma.wtfos.app` is serving commit `de0acb6`, and the deployed `index-wtf2-ChA9LqzT.js` bundle still contains the old App branch equivalent to `isGammaHost() && location === "/" ? matchPage("/gamma") : null`. That means every public Gamma deep route bypasses the Gamma shell before `GammaWtfos` can render. The isolated branch `codex/gamma-live-shell` now carries the production-base Gamma route-shell runtime/test slice with local proof green; the remaining work is promoting that branch through the normal deployment path and rerunning live public selector proof.

## Verification

- TypeScript: `npm run check` passed after the branch CI Typecheck failure was narrowed to presentation-marker prop typing.
- Focused board/desktop utility source policies after production-base transplant: `4 passed`
- Focused Gamma shell plus presentation helper policies: `10 passed`
- Presentation-policy sweep: `148/148 passed`
- Vite build: passed with `/opt/homebrew/bin/node ./node_modules/.bin/vite build`
- Hidden-worktree harness probe: after allowing `dotfiles: "allow"` in the local Playwright harness, `curl http://127.0.0.1:4317/gamma` and the built `index` asset returned `200`
- Focused rendered rerun for the two previously failing buckets: desktop utility route handoffs plus Message Board chrome/dialogs `2/2 passed` on fresh `HARNESS_PORT=4319`
- Full Gamma shell suite with static/nested audit, production-hostname proof, The Count admin suite, desktop utility CLI handoff, Message Board dialogs, TV, social, media, and mobile proof included: `61/61 passed` on fresh `HARNESS_PORT=4321`
- Full inventory coverage gate: complete for `112/112` registered route fixtures, `195/195` subdomain rows, and `852/852` normalized handles
- `git diff --check`: passed
- Live public hostname spot check: `https://gamma.wtfos.app/` rendered `[data-gamma-wtfos]=1`, but direct live `https://gamma.wtfos.app/gallery` and `https://gamma.wtfos.app/leaderboard` rendered `[data-wtf-desktop]=1` with no Gamma workspace or Gamma application content. Tracked as `WTF-BB-325`.
- Live asset root cause probe: `https://gamma.wtfos.app/api/health` reported commit `de0acb6`, matching `origin/main`; `https://gamma.wtfos.app/assets/index-wtf2-ChA9LqzT.js` still contains a root-only Gamma host branch and no `isGammaShellLocation` broad-route branch. Public `/gamma/gallery` and `/gamma/leaderboard` also fell into Classic, proving this is a stale/incomplete deployed client shell rather than only a Caddy path rewrite issue.
- Full inventory suite: not rerun in this pass because broad inventory currently has unrelated open blockers in the board, including WTF Domains Settings wallet prefill drift (`WTF-BB-323`) and Recovery Mode route-smoke auth noise (`WTF-BB-322`). Gamma Swap wallet-seed drift (`WTF-BB-324`) is now verified fixed and the broad Gamma spec passes with Swap, the static/nested route audit, and the production-hostname route proof included.
- Branch CI note: GitHub Quality Gates run `28419292561` failed at Typecheck before build because two presentation-only typings were missing. Local `npm run check` now passes after typing Tezos Intel `data-tezos-intel-region` attrs and adding the marketplace `surfaceVariant` prop. Follow-up Quality Gates run `28419602338` then passed Typecheck, Vite env policy, Build, and Inventory coverage, but broad Inventory Playwright smoke twice timed out the healthy `social post to reward automation loop`; `WTF-BB-326` fixes the test timeout budget and now needs fresh branch CI.

## Route Accounting

Shared route fixtures: 112

Direct Gamma containment proofs after this pass: 112 fixture paths or pattern-equivalent paths

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

Expected remaining loop passes based on routes uncovered so far: 0 local route-containment passes, plus 1 live deployment/routing verification pass.

Standing rule: every Gamma loop pass must update this estimate from the uncovered route set. Only routes with rendered Gamma application-content proof count as closed; incidental links, launch buttons, and handoff URLs do not close a route until the destination surface is asserted inside the Gamma shell.

Basis: `112/112` registered route fixtures now have direct or pattern-equivalent rendered Gamma containment proof, and `0` raw fixture paths remain uncovered locally. The production-base branch intentionally excludes the accidental `/applications` route because it is not part of the current registered route set and would add a new surface. The production-hostname code path is proved locally with Chromium host mapping for representative public discovery routes, so the local estimate is not relying solely on the `/gamma` harness prefix. However, the live public hostname probe found `2/2` sampled deep routes still falling back to Classic, so the public delivery estimate is one remaining pass: promote or repair the live Gamma hostname routing/build, then rerun live selector proof.

Optimistic path: no further local route-containment pass is needed unless a new route fixture is added or a verified route regresses.

Pessimistic path: 1 live routing/deployment hardening pass remains for the current goal, because public `gamma.wtfos.app` deep routes are still rendering Classic. A separate 1 hardening pass may remain if full inventory blockers outside Gamma containment are in scope; current non-Gamma blockers are WTF Domains Settings wallet prefill drift and Recovery Mode route-smoke auth noise.

Recommended next pass: review/promote the isolated `codex/gamma-live-shell` branch, deploy it through the normal path, then rerun live `/`, `/gallery`, `/leaderboard`, and at least one auth-gated route proof before considering the public Gamma goal done.
