# WTF Commission Fulfillment Execution Plan

**Plan status:** Controlling implementation plan  
**Baseline audited:** 2026-08-29  
**Execution updated:** 2026-08-29 — WP-00 through WP-06 complete; WP-07 active
**Implementation candidate due:** 2026-09-04  
**Focused test week:** 2026-09-05 through 2026-09-11  
**Customer presentation:** 2026-09-14  
**Correction cushion:** 2026-09-15 through 2026-09-30  
**Primary product shell:** wtfOS Classic operating-system interface  
**Future accessibility shells:** Beta and Gamma; included in the September cushion, but not allowed to replace or fork the commissioned Classic workflows

## 1. Purpose and authority

This document is the build manifest for completing the commission. It is intentionally more specific than a delivery calendar. A work package is complete only when its named customer journey works through the production-shaped system, its durable result is verified, its interaction inventory is current, and its browser proof passes.

The commission is interpreted as requiring all of the following:

1. A community member can understand the platform from the wtfOS desktop without prior instruction.
2. Store, Arcade, Casino, Calendar, and Messaging are clearly discoverable commissioned applications, not hidden experiments.
3. A permitted community creator can make and submit an item for the Store.
4. A community creator can build, preview, submit, and track a game for the Arcade.
5. A community creator can build, preview, submit, and track a non-wagered game for the Casino sandbox.
6. A community member can browse events, create a personal event, submit an event to the gameshow, and track the submission.
7. A community member can understand the difference between WIM/direct messages, Inbox/mail, public community posts, and Contact Admin, and can send from the relevant surface.
8. A Tezos artist can create media, preserve/export it, choose a minting destination, mint with a linked wallet, and recover a verified receipt.
9. Operators can moderate community submissions and understand why something is pending, approved, rejected, or disabled.
10. The commissioned journeys work in the Classic OS on desktop and mobile-sized viewports, have plain-language guidance, and fail with a next action rather than a dead end.

This plan does **not** silently interpret “Casino” as authorization for production value-bearing gambling. The existing code and bounty board require wagering to remain fail-closed until compliance, settlement, and house accounting are proven. Section 4 records the decision required from the commission owner.

## 2. Completion contract

The commission may be presented as fulfilled only when every journey below is marked `PASS` in a release evidence ledger.

| Journey | Actor | Required start | Required durable finish | Proof owner |
| --- | --- | --- | --- | --- |
| J-01 First-run wayfinding | New community member | First authenticated Classic desktop | Member can identify Play, Create, Shop, Events, and Talk; can reopen help later | WP-01 / WP-09 |
| J-02 Community store contribution | Trusted creator | Store or Create menu | Owned draft exists, submission is moderated, approved item appears in Store | WP-02 |
| J-03 Store purchase | Member | Approved community item card | Server-authoritative purchase/inventory record and visible receipt | WP-02 |
| J-04 Arcade creation | Creator | Game Studio from Create or Arcade | Project, build, submission, moderation state, published Arcade game | WP-03 |
| J-05 Arcade participation | Member | Arcade catalog | Play session and visible result/score using the configured play policy | WP-03 |
| J-06 Casino creation | Creator | Game Studio or Casino “Create a table game” | Non-wagered sandbox build, submission, moderation state, playable Casino sandbox entry | WP-04 |
| J-07 Casino participation | Eligible member | Casino catalog | Membership/access explanation and playable non-wagered session; wagering remains visibly unavailable | WP-04 |
| J-08 Calendar participation | Member | Calendar | Personal event or submitted gameshow ticket remains visible with status | WP-05 |
| J-09 Messaging | Member | Inbox communication hub | Sent DM/mail/admin message appears in the correct conversation and unread state updates | WP-06 |
| J-10 Artist creation and mint | Creator | Create menu or owned media | Exported/preserved artifact, selected mint destination, linked-wallet operation, indexed receipt | WP-07 |
| J-11 Operator moderation | Operator | Admin Control Suite | Store, Arcade, Casino, and Calendar submissions can be reviewed and decided with audit history | WP-08 |
| J-12 Production discoverability | Anonymous/member/operator | Public entry or Classic desktop | Commissioned routes are enabled, documented, role-correct, and reachable from the OS | WP-01 / WP-09 |

“Page loads” is not proof of a journey. Skeleton coverage proves reachability; the durable finish named above proves the commissioned behavior.

## 3. Audited baseline and gap catalog

Baseline source is `main` at `70b7cc46cc82`. The production health check observed during the audit reported the same release family. The live app registry, not the source defaults, is authoritative for what customers can presently use.

| Area | Existing implementation | Audited gap | Completion implication |
| --- | --- | --- | --- |
| Classic OS | Start Menu, desktop icons, command palette, app windows, runtime app registry | Live registry enables only a small subset; commissioned Arcade/Casino/Studio/Game Studio and several creator services are disabled | Registry repair and production enablement are release-critical |
| First run/help | `WelcomeMessage.tsx`, Reggie, FAQ route | Welcome focuses on acknowledgement/profile; live FAQ is empty; no commission-level task map | Add persistent task-based wayfinding and seeded help |
| Store | WTFIAM catalog/cart/checkout, creator API, admin market tab | Creator endpoint is permission-only and has no creator-facing UI or lifecycle; item is made active immediately | Add owned draft, submission, moderation, storefront proof |
| Arcade | Public catalog, sessions, scores, play tickets, source import, Game Studio | Live Arcade is disabled; live data has no creator/Game Studio publications; app catalog calls Arcade optional | Make commissioned Arcade core/discoverable and prove create-to-play loop |
| Casino | Membership/access, three game services, audit trail | No creator builder/submission path; wagering intentionally fail-closed; app is role-gated | Deliver a clearly labeled non-wagered creator sandbox; do not claim real wagering |
| Calendar | Public events, TTC feed, personal entries/tickets, operator decisions, ICS | Mobile week layout clips; contribution paths need guided status and live proof | Repair responsive behavior and prove member/operator loop |
| Messaging | Inbox, WIM, DMs, W feed, Message Board, Digest, Contact Admin | Surfaces are numerous and terminology is unclear from the OS | Use Inbox as the communication map and make each destination explicit |
| Creation tools | Sixteen registered tools, Studio, Game Studio, IPFS, Pasta suite | Tools are plentiful but their export/preserve/mint/publish handoffs are not one understandable runway | Finish and expose the shared creator runway |
| Minting | Mint Portal, Pasta publishers, dirty-tree Mint Manager work | Mint Portal is challenge-oriented; several tools are gated; receipt integration is not yet a clean release | Integrate Mint Manager as the artist-facing destination chooser and prove receipts |
| Tests | 234 inventory rows, route fixtures, workflows, behavior assertions, live puppets | Inventory coverage currently reports skeleton complete while full feature behavior is incomplete | Add behavior assertions for every J-journey and run actor-backed proofs |
| Live phase harness | `package.json` declares `test:e2e:live:phases` | Most referenced `tests/playwright/live/phase*.spec.mjs` files, including `phase7-arcade-casino.spec.mjs`, are absent from the audited worktree | Restore/recreate domain-owned actor specs or correct the script before citing the phased suite as evidence |
| Beta/Gamma | Alternate route shells and inventory tests | Customer chose Classic OS; alternate shells risk becoming divergent products | Treat as accessibility presentations over shared contracts during cushion |

### 3.1 Existing work that must be preserved

The baseline worktree is not clean. It contains active Mint Manager, PixAlerce, Macaroni, admin registry, and E2E work, including new files under:

- `client/src/features/media-library/`
- `client/src/features/creation-tools/`
- `server/routes/mint-manager.ts`
- `public/creation-tools/pixalerce/`
- `public/creation-tools/macaroni/`
- `.agents/docs/live/`
- `tests/e2e/inventory/` and `tests/playwright/`

WP-00 must classify and preserve this work before commission implementation begins. No work package may recreate, discard, or mass-format these files. The Mint Manager work corresponds to verified bounty history `WTF-BB-617` and should be integrated, not replaced.

### 3.2 Relevant open/in-progress bounty constraints

| Bounty | Constraint on this plan |
| --- | --- |
| `WTF-BB-124` | Marketplace/barter writes must bind contract sends to the expected linked wallet before the store/market journey is considered safe |
| `WTF-BB-125` | External marketplace wallet contracts require signer preflight before builders touch them |
| `WTF-BB-138` | Casino wagering stays fail-closed until compliance, settlement, and house accounting exist |
| `WTF-BB-182` | An active sale must visibly render in WTFIAM; current inventory proof exposes a storefront mismatch |
| `WTF-BB-422` | Pasta browser-to-chain proof still needs fresh aggregate Shadownet evidence and screenshots before it is release evidence |

## 4. Decisions that block scope, not implementation discovery

These are genuine owner decisions. They cannot be safely invented by an implementer.

### D-001 — Meaning of commissioned Casino at September presentation

**Recommended acceptance:** Casino is an enabled, navigable, creator-submittable, non-wagered game sandbox. Existing membership may remain as an access product, but every game shows “Practice / no wagering,” and wager endpoints remain fail-closed.

**If the customer requires real-value wagering:** move the Casino wagering claim outside the September commission acceptance until legal/compliance ownership, economic settlement, house accounting, abuse controls, smart-contract scope, and a separate security release are approved. The rest of the commission can still ship.

### D-002 — Who may contribute Store items

**Recommended acceptance:** any account with existing `trusted_market_creator` permission can draft and submit; operators approve publication. Regular members see how to request creator status rather than a disabled control with no explanation.

Changing this to all authenticated users requires an explicit moderation/abuse policy decision; the UI and APIs below still support that later expansion.

### D-003 — Commissioned apps versus purchasable apps

**Recommended acceptance:** Store, Arcade, Calendar, Inbox, and the basic creator runway are commissioned core surfaces and cannot require a prior WTFIAM purchase. Casino may remain membership-gated, but its purpose and access steps must be visible. Specialist creator tools may retain role/inventory gates only when the OS provides a visible request/unlock path.

### D-004 — Active dirty-tree ownership

Before implementation starts, the current Mint Manager/PixAlerce/Macaroni changes must be assigned to an integration commit or a named retained branch. Until that happens, WP-01, WP-07, and WP-08 have overlapping file ownership and cannot be safely merged.

## 5. Dependency order

```text
WP-00 Baseline and worktree reconciliation
  └─ WP-01 Commission information architecture, registry, and wayfinding
       ├─ WP-02 Community Store
       ├─ WP-03 Arcade + Game Studio
       ├─ WP-04 Casino creator sandbox
       ├─ WP-05 Calendar participation
       ├─ WP-06 Messaging clarity
       └─ WP-07 Artist creation + mint runway
            └─ WP-08 Operator moderation and cross-domain integration
                 └─ WP-09 Release candidate and production enablement
                      └─ TW-01 Focused test week
                           └─ PR-01 Customer presentation
                                └─ CX-01 Correction cushion and Beta/Gamma accessibility work
```

WP-02 through WP-07 may proceed in parallel only after WP-00 freezes file ownership and WP-01 freezes the shared app/access contracts. WP-08 and WP-09 are convergence packages; they must not be treated as cleanup that can be skipped when feature work runs late.

## 6. Work package catalog

### WP-00 — Baseline, worktree, and evidence ledger

**Outcome:** one reproducible implementation baseline with no ambiguous ownership of existing changes.

**Inputs**

- `main` / `70b7cc46cc82`
- Current `git status`
- `.agents/docs/live/LESSONS_LEARNED.md`
- `.agents/docs/live/BUG_BOUNTY_BOARD.md`
- This plan

**Tasks**

- [ ] Record the production health commit, database readiness, and `/api/apps/desktop` response in `artifacts/commission-2026-09/baseline/`.
- [ ] Split the dirty tree into named change groups: Mint Manager, PixAlerce bundle rebuild, Macaroni, admin app registry, inventory/live tests, and unrelated work.
- [ ] Preserve each group in a reviewable integration commit or retained branch; do not rewrite bundled PixAlerce asset filenames by hand.
- [ ] Create `artifacts/commission-2026-09/release-evidence.md` containing J-01 through J-12 with columns for status, build commit, actor, command/spec, screenshot/trace, durable side effect, and defect link.
- [ ] Confirm local database migrations through `0116_desktop_app_registration_resilience.sql`, plus any later migration already present after reconciliation.
- [ ] Reconcile `package.json`'s `test:e2e:live:phases` script with the files actually present under `tests/playwright/live/`. Missing phase specs are release-harness gaps, not passing tests.
- [ ] Run the baseline typecheck, build, inventory coverage, and focused existing policies before feature edits.

**Verification**

```bash
npm run check -- --pretty false
npm run build
npm run test:e2e:inventory:coverage
git diff --check
```

**Exit evidence**

- Existing work is recoverable and attributable.
- The release evidence ledger exists and every commissioned journey begins as `NOT RUN`, not assumed pass.
- Subsequent work packages can name files without colliding with unclassified changes.

---

### WP-01 — Classic OS information architecture, app registry, onboarding, and help

**Outcome:** members can locate and understand commissioned workflows from the Classic OS.

**Primary files**

- `shared/wtfos-app-catalog.ts`
- `shared/desktop-apps.ts`
- `shared/types.ts`
- `shared/wtfos-app-catalog.test.ts`
- `shared/wtf-browser-routes.ts`
- `shared/wtf-browser-route-access.ts`
- `client/src/routes/page-defs.ts`
- `client/src/components/layout/start-menu-app-gates.ts`
- `client/src/components/layout/start-menu-model.ts`
- `client/src/components/layout/StartMenu.tsx`
- `client/src/features/desktop/DesktopIcons.tsx`
- `client/src/features/command-palette/command-palette-model.ts`
- `client/src/components/layout/CommandPalette.tsx`
- `client/src/components/WelcomeMessage.tsx`
- `client/src/pages/Faq.tsx`
- `server/routes/desktop-apps.ts`
- `server/lib/desktop-app-runtime.ts`
- `server/features/app-registry/`
- `server/routes/faq.ts`
- `shared/wtf-docregistry.ts`
- `drizzle/0091_desktop_app_doc_registry.sql`

**Required changes**

- [ ] Reclassify commissioned apps in `shared/wtfos-app-catalog.ts`: Store, Arcade, Calendar, Inbox, and the entry-level creator runway are core; do not leave Arcade as `optional` or Game Studio as undiscoverable specialist-only functionality when community game creation is commissioned.
- [ ] Keep server authorization authoritative. Menu placement must not grant a permission the route/API rejects.
- [ ] Repair live desktop app registrations through the existing admin/runtime path so production state matches the approved commission catalog; do not rely only on `DEFAULT_DESKTOP_APP_CONFIG`.
- [ ] Define five stable Start Menu task groups: **Play**, **Create**, **Shop**, **Events**, and **Talk**. Existing product names remain available beneath those task labels.
- [ ] Make the first-run welcome a task chooser with the five paths, a short plain-language explanation, and “Show this guide again” in persistent help/settings.
- [ ] Seed FAQ content through the existing `/api/faq` model for: getting started, creator access, Arcade publishing, Casino practice mode, Store submissions, Calendar submissions, messaging choices, wallets, minting, preservation, transaction safety, and support.
- [ ] Every gated item must display the reason and next action: sign in, link wallet, request creator access, acquire membership, or contact admin.
- [ ] Provide contextual “What can I do here?” help in the shell or app window without creating a competing navigation system.
- [ ] Keep Beta and Gamma routes out of primary onboarding language. They are future accessibility views, not separate products.

**Runtime/API contract**

- `GET /api/apps/desktop` is the canonical availability source.
- `GET /api/faq` must return seeded, ordered help content in a fresh production-shaped database.
- App launch eligibility is the intersection of runtime enablement, authentication, role/permission, and inventory/membership prerequisites.
- A disabled app may be advertised only with an explanatory unlock/request path; it must not launch into an unexplained “disabled by admin” dead end.

**Behavior proof**

- [ ] Anonymous user can understand the product and reach public Calendar and Arcade information.
- [ ] New member sees the five-task first-run guide and opens one destination.
- [ ] Returning member reopens the guide from the OS.
- [ ] Creator sees Game Studio and creator/mint destinations.
- [ ] Ineligible member sees a plain-language creator or Casino access path.
- [ ] Admin-disabled app is consistently removed or explained in Start Menu, desktop icons, command palette, and browser metadata.

**Focused tests**

```bash
npx tsx --test shared/wtfos-app-catalog.test.ts shared/wtf-browser-route-access.test.ts client/src/components/layout/start-menu-app-gates.test.ts client/src/features/desktop/DesktopIcons.test.tsx server/routes/desktop-apps-resilience-policy.test.ts
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/start-menu.spec.mjs tests/playwright/inventory/routes.spec.mjs --project=chromium
```

**Exit gate:** J-01 and the local portion of J-12 are `PASS`.

---

### WP-02 — Community Store creation, moderation, publication, and purchase

**Outcome:** a trusted creator can submit an item and a member can find and obtain an approved item.

**Primary files**

- `client/src/pages/WtfInAppMarketplace.tsx`
- `client/src/features/wtfiam/WtfIamShell.tsx`
- `client/src/features/wtfiam/WtfIamTabs.tsx`
- `client/src/features/wtfiam/WtfIamItemCard.tsx`
- `client/src/features/wtfiam/useWtfIamMarket.ts`
- `client/src/features/wtfiam/types.ts`
- `client/src/features/admin/tabs/InAppMarketAdminTab.tsx`
- `server/routes/in-app-market.ts`
- `server/features/in-app-market/creator-items.ts`
- `server/features/admin/in-app-market-routes.ts`
- `shared/schema-market.ts`
- `client/src/lib/tezos/marketplace.ts`
- `server/routes/marketplace.ts`

**Data changes**

The present `in_app_market_items.active` boolean cannot express an owned creator draft, submitted moderation state, rejection reason, or decision history. Add the next generated migration after WP-00 reconciliation with either:

- a dedicated creator submission table referencing the published item, or
- explicit owner/lifecycle/decision fields with an audit table.

The model must retain: creator user, draft payload, asset/media reference, category, price/stock proposal, status (`draft`, `submitted`, `approved`, `rejected`, `withdrawn`), reviewer, decision note, timestamps, and resulting storefront item id. Published catalog state remains server-authoritative.

**Required changes**

- [ ] Add **Sell / Submit an item** to WTFIAM for eligible creators and a creator-access explanation for others.
- [ ] Reuse owned media from the media library; reject arbitrary unowned media references server-side.
- [ ] Save drafts without publishing them.
- [ ] Add My submissions with status, rejection reason, edit/resubmit, and storefront link after approval.
- [ ] Change the existing immediate-active creator path so creator submission cannot bypass moderation.
- [ ] Add an operator queue to the existing In-App Market admin surface with preview, approve, reject-with-reason, and audit history.
- [ ] On approval, create/activate exactly one catalog item and preserve creator attribution in metadata.
- [ ] Ensure an active sale price visibly renders in the item card, closing `WTF-BB-182` before the Store journey passes.
- [ ] For on-chain listing/purchase handoffs, close or explicitly block the affected sends from `WTF-BB-124` and `WTF-BB-125`; no wallet write may proceed from stale account state.

**API contract**

Keep `POST /api/in-app-market/creator-items` only if its semantics are migrated to “create owned draft/submit,” or replace it with a versioned set and update all callers. The complete lifecycle requires authenticated equivalents of:

- list my creator submissions;
- create/update my draft;
- submit/withdraw my submission;
- operator list/detail/approve/reject;
- public catalog read through `GET /api/in-app-market`.

Exact route names are chosen during implementation to match existing route conventions; once chosen they must be added to the interaction inventory and domain workflow before merge.

**Behavior proof**

- [ ] Trusted creator selects owned media, saves a draft, submits, and sees `submitted` after reload.
- [ ] A different regular user cannot read or mutate that draft.
- [ ] Operator previews and approves it with an audit record.
- [ ] Item appears in the correct WTFIAM category with creator attribution and accurate price/sale state.
- [ ] Member obtains it and sees inventory/receipt state after reload.
- [ ] Rejection returns a visible reason and supports edit/resubmit.

**Focused tests**

```bash
npx tsx --test client/src/features/wtfiam/wtfiam-presentation-policy.test.ts server/features/in-app-market/pricing.test.ts server/routes/in-app-market-app-store-policy.test.ts
npx playwright test tests/playwright/inventory/market-pricing.spec.mjs --project=chromium
npm run contract:test:in-app-market
npm run test:e2e:inventory:coverage
```

Add a domain-owned Playwright creator-to-approval-to-purchase spec. J-02 and J-03 do not pass without the durable database assertions.

**Exit gate:** J-02 and J-03 are `PASS`; `WTF-BB-182` is Verified; affected wallet writes from `WTF-BB-124/125` are fixed or visibly unavailable.

---

### WP-03 — Arcade and Game Studio create-to-play loop

**Outcome:** Arcade is a commissioned core destination and community-built games can reach it through moderation.

**Primary files**

- `client/src/pages/Arcade.tsx`
- `client/src/pages/GameStudio.tsx`
- `client/src/pages/Console.tsx`
- `server/routes/arcade.ts`
- `server/routes/game-studio.ts`
- `server/features/arcade/`
- `server/features/game-studio/catalog.ts`
- `server/features/game-studio/projects.ts`
- `server/features/game-studio/packaging.ts`
- `shared/schema-game-studio.ts`
- `shared/schema-liveops.ts`
- `drizzle/0057_console_arcade_studio_foundation.sql`
- `drizzle/0058_game_studio_projects.sql`
- `drizzle/0060_game_studio_project_builds.sql`
- `drizzle/0062_arcade_play_ticket.sql`
- `client/src/features/admin/tabs/ConsoleAdminTab.tsx`
- `docs/domains/arcade-console-game-studio.md`
- `docs/domains/arcade-console-game-studio-registry.md`

**Required changes**

- [ ] Enable and classify Arcade as commissioned core in the OS and runtime registry.
- [ ] Give Arcade a visible **Make a game** action that opens Game Studio without requiring users to know the product name.
- [ ] Keep the existing template/scaffold/project/build APIs and present them as a numbered journey: choose template, edit, preview, validate, submit, track.
- [ ] Persist the selected publish target on the project instead of inferring intent only at submit time.
- [ ] Show build validation failures next to the relevant file/manifest requirement with a correction action.
- [ ] Ensure `POST /api/game-studio/projects/:id/submit` and `POST /api/arcade/submit` produce one traceable submission, not duplicate records.
- [ ] Add My Arcade Games status to Game Studio and/or Arcade: draft, build failed, submitted, approved/published, rejected.
- [ ] Preserve creator attribution, game provenance, report controls, session policy, score validation, and creator payout audit.
- [ ] Add operator preview/sandbox, approve, reject-with-reason, disable, and audit controls to the existing Arcade admin surface.
- [ ] Seed or approve at least one creator-owned release-candidate game through the normal workflow; do not hand-edit a production catalog row as proof.

**Existing API surface to retain**

- `GET /api/game-studio/templates`
- `GET /api/game-studio/targets`
- `POST /api/game-studio/projects`
- `PATCH /api/game-studio/projects/:id`
- `POST /api/game-studio/projects/:id/build`
- `POST /api/game-studio/projects/:id/submit`
- `GET /api/arcade/my-games`
- `POST /api/arcade/submit`
- `GET /api/arcade/games`
- authenticated play-intent/session/score routes in `server/routes/arcade.ts`

**Behavior proof**

- [ ] Creator starts from Arcade or Create, scaffolds a template, previews it, builds it, submits it, and sees the same submission after reload.
- [ ] Operator previews the submitted build in the Arcade sandbox and approves it.
- [ ] Public/member Arcade catalog shows the creator game and attribution.
- [ ] Member starts a session and records a result according to the configured play policy.
- [ ] Invalid score/session input is rejected and audited.
- [ ] Mobile/touch launch and game controls work for the selected release-candidate game.

**Focused tests**

```bash
npx tsx --test server/features/game-studio/catalog.test.ts server/features/game-studio/projects.test.ts server/features/game-studio/packaging.test.ts server/features/arcade/source-import.test.ts server/features/arcade/source-proxy.test.ts server/features/arcade/payment.test.ts client/src/pages/game-studio-presentation-policy.test.ts client/src/pages/arcade-console-presentation-policy.test.ts
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/inventory/feature-depth.spec.mjs --project=chromium
```

Create or restore the planned actor-backed creator → operator → player spec at `tests/playwright/live/phase7-arcade-casino.spec.mjs`, or correct `test:e2e:live:phases` to reference an equivalently domain-owned live spec that actually exists.

**Exit gate:** J-04 and J-05 are `PASS` on the release candidate.

---

### WP-04 — Casino creator sandbox and safe participation

**Outcome:** Casino fulfills community game creation and play without misrepresenting unimplemented wagering.

**Primary files**

- `client/src/pages/Casino.tsx`
- `client/src/pages/GameStudio.tsx`
- `client/src/lib/tezos/casino.ts`
- `server/routes/casino.ts`
- `server/routes/game-studio.ts`
- `server/features/casino/access.ts`
- `server/features/casino/audit.ts`
- `server/features/casino/games/types.ts`
- `server/features/casino/games/index.ts`
- `server/features/casino/games/`
- `server/features/game-studio/catalog.ts`
- `shared/schema-casino.ts`
- `shared/schema-game-studio.ts`
- `drizzle/0068_casino_domain_membership.sql`
- `client/src/features/admin-os/admin-surface-registry.ts`

**Data/API design**

Extend the existing Game Studio target union from `arcade | console` to include `casino-sandbox`. Persist target and rules-manifest version on the project/build. Add a creator submission lifecycle for Casino builds, with owner, build checksum, rules manifest, moderation state, reviewer decision, published sandbox game key, and audit history.

Do not reuse `casino_wager_sessions` as a creator publication table. It represents a different economic concept and currently defaults to planned/fail-closed behavior.

**Required changes**

- [ ] Resolve D-001 and write the chosen product wording into Casino help, access status, and test expectations.
- [ ] Add `casino-sandbox` to `GAME_STUDIO_TARGETS` and expose Casino-compatible templates/rules hooks.
- [ ] Add **Create a Casino game** from Casino and Create; route it into the shared Game Studio rather than creating a second editor.
- [ ] Validate deterministic rule inputs/outputs, asset ownership, build checksum, prohibited external calls, and sandbox framing before submission.
- [ ] Add creator status and operator moderation/preview for Casino submissions.
- [ ] Publish approved builds into a distinct `Community practice games` section.
- [ ] Mark every community entry as non-wagered. Do not call practice points, XP, or simulated balances “XTZ,” “WTF wager,” “payout,” or “cash.”
- [ ] Preserve existing membership/access explanations and game audit logging.
- [ ] Keep value-bearing quote/press/bet operations fail-closed unless a later separately authorized release proves compliance, settlement, and house accounting.

**Behavior proof**

- [ ] Creator builds and submits a Casino sandbox game through Game Studio.
- [ ] Operator previews deterministic rules and approves it.
- [ ] Eligible member finds and plays it in Casino with an explicit no-wager label.
- [ ] Ineligible member understands membership/access requirements.
- [ ] Attempts to invoke value-bearing behavior remain rejected and audited.
- [ ] No client-supplied outcome or balance is accepted as authoritative.

**Focused tests**

```bash
npx tsx --test server/features/casino/audit.test.ts server/features/casino/games/wtf-button/rules.test.ts server/features/casino/games/rug-pull/rules.test.ts server/features/casino/games/guinea-pig-raceway/rules.test.ts client/src/pages/casino-presentation-policy.test.ts client/src/pages/casino-tables-presentation-policy.test.ts client/src/lib/tezos/casino-policy.test.ts
npm run casino:wtf-button:simulation
npm run casino:tables:simulation
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/casino-raceway-scene.spec.mjs tests/playwright/casino-raceway-assets.spec.mjs --project=chromium
```

Add actor-backed creator → operator → practice player coverage and a fail-closed wager assertion to the live phase-7 suite.

**Exit gate:** J-06 and J-07 are `PASS`; `WTF-BB-138` remains correctly In Progress or becomes Verified only under its own stronger contract. The commission report must not claim real wagering.

---

### WP-05 — Calendar contribution and responsive planning

**Outcome:** members can plan, contribute, and track gameshow/community events.

**Primary files**

- `client/src/pages/Calendar.tsx`
- `client/src/features/calendar/calendar-handoff.ts`
- `client/src/features/calendar/calendar-reminders.ts`
- `server/routes/calendar.ts`
- `server/lib/calendar-sync.ts`
- `shared/schema-liveops.ts`
- `drizzle/0024_calendar.sql`
- `client/src/pages/calendar-presentation-policy.test.ts`

**Required changes**

- [ ] Retain Browse, personal entries, gameshow submission/tickets, TTC handoff, reminders, and ICS.
- [ ] Make the distinction between **Add to my calendar**, **Submit to WTF**, and **Submit to TTC** explicit before the user enters data.
- [ ] Show the signed-in member’s tickets with pending/approved/rejected state and decision note after reload.
- [ ] Fix week-view clipping and horizontal overflow at mobile sizes; preserve day, week, month, and agenda semantics.
- [ ] Ensure event cards expose time zone/source, organizer/link, and the next action.
- [ ] Verify operator decision creates/updates the intended gameshow event exactly once.
- [ ] Preserve public read access while keeping event management permissioned.

**Existing API surface to retain**

- `GET /api/calendar/events`
- `POST /api/calendar/tickets`
- `GET /api/calendar/tickets/mine`
- operator queue/decision routes
- `GET /api/calendar/feed.ics`

**Behavior proof**

- [ ] Anonymous user browses a useful responsive calendar.
- [ ] Member adds a personal event and sees it after reload.
- [ ] Member submits a gameshow event and sees pending status.
- [ ] Operator approves/rejects and member sees the result.
- [ ] Approved event appears once in the correct public period.
- [ ] ICS feed remains valid and source ownership is not blurred.

**Focused tests**

```bash
npx tsx --test client/src/pages/calendar-presentation-policy.test.ts client/src/features/calendar/calendar-reminders.test.ts
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/inventory/routes.spec.mjs --project=chromium -g "Calendar"
```

Add desktop and mobile screenshots plus actor-backed ticket moderation to the release ledger.

**Exit gate:** J-08 is `PASS`.

---

### WP-06 — Messaging information architecture and send/recovery loops

**Outcome:** members know where to communicate and every message surface supports its advertised action.

**Primary files**

- `client/src/pages/Mail.tsx`
- `client/src/pages/Wim.tsx`
- `client/src/pages/Messages.tsx`
- `client/src/pages/MessageBoard.tsx`
- `client/src/pages/Digest.tsx`
- `client/src/features/w/messages/WMessagesPanel.tsx`
- `server/routes/mail.ts`
- `server/routes/messages.ts`
- `server/features/mail/`
- `shared/schema-mail.ts`
- `shared/schema-dm.ts`
- `shared/schema-board.ts`
- `drizzle/0083_comms_mail_mesh.sql`
- `drizzle/0092_mail_provisioning.sql`

**Required changes**

- [ ] Treat Inbox (`/mail`) as the communication map, not as a replacement transport.
- [ ] Present four plain-language choices: **Chat with a member** (WIM/DM), **Send durable mail** (Inbox mail), **Post to the community** (W/Message Board), and **Contact the team** (Admin Inbox).
- [ ] Preserve transport-specific APIs and identity; do not merge records into an ambiguous universal message.
- [ ] Ensure Inbox can compose/reply/forward mail and compose/reply to surfaced DM conversations.
- [ ] Show unread counts and last activity consistently at the OS, Inbox, WIM, and Contact Admin entry points.
- [ ] Explain mail provisioning/eligibility and provide the next action rather than an error-only state.
- [ ] Provide empty states that say who can be contacted and how to begin.
- [ ] Verify mobile composer, keyboard focus, attachment errors, send progress, and retry states.

**Existing API surface to retain**

- `/api/messages/users`
- `/api/messages/dms` and `/api/messages/dms/:id/messages`
- `/api/mail/status`, `/api/mail/messages`, `/api/mail/send`
- existing Admin Inbox endpoints and `/api/comms/unread-count`

**Behavior proof**

- [ ] Member selects a user, sends a DM, reloads, and recovers the conversation in WIM/Inbox.
- [ ] Eligible member sends mail and recovers delivery state.
- [ ] Member contacts admin and both user/admin see the same thread with role-correct fields.
- [ ] Unread counts increment and clear from durable server state.
- [ ] Public posting remains visibly distinct from private communication.

**Focused tests**

```bash
npx tsx --test client/src/pages/mail-presentation-policy.test.ts client/src/pages/messages-presentation-policy.test.ts client/src/pages/Messages.test.ts client/src/pages/Wim.test.ts server/routes/mail.test.ts server/routes/messages-user-roster-policy.test.ts server/features/mail/service.test.ts server/features/mail/gates.test.ts
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/inventory/wim-owner-controls.spec.mjs --project=chromium
```

Extend the existing communications workflow with actor-to-actor send/read assertions rather than route-only probes.

**Exit gate:** J-09 is `PASS`.

---

### WP-07 — Tezos artist creation, preservation, minting, and receipt runway

**Outcome:** an artist can move from making work to a verified Tezos mint without learning the platform’s internal app boundaries.

**Primary files**

- `client/src/features/creation-tools/tool-registry.ts`
- `client/src/features/creation-tools/CreationToolFrame.tsx`
- `client/src/features/creation-tools/creation-tool-export-bridge.ts`
- `client/src/pages/CreationTool.tsx`
- `client/src/pages/MyPhotos.tsx`
- `client/src/pages/MyVideos.tsx`
- `client/src/pages/FileManager.tsx`
- `client/src/features/media-library/MintManagerDialog.tsx`
- `client/src/features/media-library/mint-manager.ts`
- `client/src/pages/MintPortal.tsx`
- `client/src/features/mint-portal/GenerativeArtPanel.tsx`
- `client/src/pages/Studio.tsx`
- `client/src/pages/StudioProject.tsx`
- `client/src/features/studio/StudioProjectJourney.tsx`
- `client/src/pages/IpfsPinning.tsx`
- `client/src/features/ipfs-pinning/`
- `server/routes/media-library.ts`
- `server/routes/mint-manager.ts`
- `server/routes/mint-portal.ts`
- `server/routes/ipfs-pinning.ts`
- `server/routes/studio.ts`
- `server/routes/studio-files.ts`
- `server/routes/studio-drive.ts`
- `server/features/ipfs-pinning/`

**Required changes**

- [x] Preserve and integrate the current Mint Manager/PixAlerce/Macaroni work after WP-00.
- [x] Make **Create** begin with outcomes, not tool names: make image/animation/3D/game; continue a project; preserve/export; mint/publish.
- [x] Keep all sixteen creation tools discoverable through descriptions of what they make and their supported export destinations.
- [x] Require every commissioned creation tool to provide at least one honest export: owned Media, device download, or project handoff. A tool that cannot export must say so before work begins.
- [x] Standardize the export bridge into owned Media plus an optional immediate Mint Manager handoff.
- [x] Use Mint Manager as the destination chooser for HEN/Teia, Objkt-ready standard collection, compatible associated contract, and new Pasta contract workflows already represented by the active work.
- [x] Keep wallet signing late: prepare metadata/media/contract choice first; require linked-wallet/network preflight immediately before the operation.
- [x] Persist resumable non-secret mint state and never persist seed phrases/private keys.
- [x] Record operation hash, network, contract, token id when indexed, artifact reference, minter, and verification status through the receipt route.
- [x] Expose a human-readable receipt with explorer link and recovery/retry state.
- [x] Keep challenge-specific Mint Portal functions available, but do not make challenge language the only way a general artist discovers minting.
- [x] Complete fresh Shadownet proof for the Spaghetti Pasta path selected for the commission presentation. `WTF-BB-422` remains in progress for its broader all-Pasta aggregate scope and is not represented as closed by this package.

**Behavior proof**

- [x] Creator opens at least one image tool and one generative/contract tool from Create, understands the output before launch, and produces an artifact.
- [x] Artifact appears in owned Media and can reopen Mint Manager later.
- [x] Linked-wallet and selected-network identity are shown immediately before signing.
- [x] A Shadownet mint succeeds through the UI and returns an indexed receipt.
- [x] Reopening the media item shows the same receipt and mint destination.
- [x] Wrong network, unlinked wallet, failed pin, rejected signature, and indexer delay each show a safe recovery action.
- [x] Mainnet is never silently substituted for Shadownet or vice versa.

**Focused tests**

```bash
npx tsx --test client/src/features/creation-tools/creation-tool-presentation-policy.test.ts client/src/features/media-library/mint-manager.test.ts client/src/features/media-library/hen-mint.test.ts client/src/pages/MintPortal.test.ts server/routes/mint-manager.test.ts server/routes/mint-portal-policy.test.ts server/features/ipfs-pinning/records.test.ts server/features/ipfs-pinning/pasta-proof.test.ts
npm run creation-tools:check
npm run macaroni:desktop:check
npm run pasta-suite:desktop:check
npm run pasta:live-readiness:check
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/inventory/pixalerce.spec.mjs tests/playwright/inventory/ipfs-pinning-manager.spec.mjs tests/playwright/inventory/pasta-protocol-publishing.spec.mjs --project=chromium
```

Run the applicable Shadownet UI-live and live-puppet proof selected by the presentation mint destination; archive operation/indexer evidence in the release ledger.

**Exit gate:** J-10 is `PASS`; no presentation mint path depends on unverified or stale proof.

**Completion evidence (2026-08-30 UTC):** the selected Spaghetti presentation path originated `KT1Ww8CpKRS5ffVd51vWNxJ6EBxEhCj7BhtN`, created token `0`, minted two editions in `oomCgp54okowgvWTc8fD4AkbaVYnj2Kch6NtxmknWz4UQjXA3NL`, opened a sale, and completed a separate-collector buy on Shadownet. The fresh UI-LIVE receipt is archived under `artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260829-commission/` with receipt SHA-256 `526ab3c761c9d3149d3c0e7a69b1c58b4f0c4a07e4912dc1fa5ac68edbab3a2d`. A real PostgreSQL/live-browser actor proof bound that exact mint to owned Media and recovered the same server-verified receipt without browser-local state. Focused creation/mint tests pass 22/22, Spaghetti UI-live checks pass 6/6, TypeScript passes, inventory coverage passes, and the complete browser inventory passes 697/697.

---

### WP-08 — Operator moderation, documentation, inventory, and cross-domain handoffs

**Outcome:** community contribution is operable after launch and all new interactions are owned by the repository’s test spine.

**Primary files**

- `client/src/pages/Admin.tsx`
- `client/src/features/admin-os/admin-surface-registry.ts`
- `client/src/features/admin/tabs/InAppMarketAdminTab.tsx`
- `client/src/features/admin/tabs/ConsoleAdminTab.tsx`
- `client/src/features/admin/tabs/StudioAdminTab.tsx`
- `client/src/features/admin/tabs/DesktopAppsAdminTab.tsx`
- `client/src/features/admin/useAdminDataQueries.ts`
- `.agents/docs/live/user-interaction-inventory.md`
- `tests/e2e/inventory/route-fixtures.mjs`
- `tests/e2e/inventory/domain-workflows.mjs`
- `tests/e2e/inventory/behavior-assertions.mjs`
- `tests/e2e/puppets/`
- `tests/playwright/inventory/`
- `tests/playwright/live/`
- `shared/wtf-app-packages.ts`
- `shared/wtf-docregistry.ts`

**Required changes**

- [ ] Add one operator queue summary for Store, Arcade, Casino, and Calendar pending submissions; each row links to the owning domain decision surface.
- [ ] Preserve domain ownership: the summary must not implement four duplicate moderation systems.
- [ ] Register every added route, API handle, interaction, status transition, and normalized SystemEvent in the interaction inventory.
- [ ] Add/update route fixtures for every added route.
- [ ] Add domain workflow probes for every added API, including role-correct failure status.
- [ ] Add behavior assertions for J-01 through J-12 with exact source/test/evidence ownership.
- [ ] Add actor-backed live puppet paths for creator, regular member, operator, and wallet-linked creator where the workflow changes durable state.
- [ ] Update app documentation registration so enabled commissioned apps are not stale or revoked in production.
- [ ] Verify cross-domain handoffs preserve context and return path: Store ↔ Media, Arcade/Casino ↔ Game Studio, Calendar ↔ tickets, Inbox ↔ transport, Media ↔ Mint Manager.
- [ ] Add audit/telemetry only where it proves a meaningful state transition; do not create click events as a substitute for behavior proof.

**Required verification**

```bash
npm run test:e2e:inventory:coverage
npm run test:e2e:inventory
npm run test:e2e:live:puppets
```

If the live-puppet suite is blocked by external infrastructure, the release ledger must name the exact blocker and the commissioned journey remains `BLOCKED`, not passed by a mock.

**Exit gate:** J-11 is `PASS`; inventory coverage accepts all interactions; state-changing journeys have behavior assertions and actor-backed evidence.

---

### WP-09 — Release candidate, production registration, and freeze

**Outcome:** a single production candidate exposes the commissioned platform exactly as tested.

**Tasks**

- [ ] Merge only reconciled commission work into the release candidate; no unrelated dirty-tree files.
- [ ] Apply migrations to a production-shaped staging database and verify downgrade/recovery procedure where the migration changes community submissions.
- [ ] Seed required FAQ/help content and app documentation registrations idempotently.
- [ ] Enable commissioned apps through the authoritative desktop app registry and verify role-specific responses.
- [ ] Build once; use the same commit for focused test week.
- [ ] Capture desktop and mobile screenshots for all J-journeys.
- [ ] Run typecheck, build, focused domain tests, inventory coverage, full inventory Playwright, live puppets, and Shadownet proofs.
- [ ] Generate the traffic-light report and reconcile every red item against J-01 through J-12.
- [ ] Freeze feature changes at candidate cut. During test week, accept only defects that leave a J-journey unmet or unproven.

**Candidate gate**

```bash
npm run check -- --pretty false
npm run build
npm run creation-tools:check
npm run test:e2e:inventory:coverage
npm run test:e2e:inventory
npm run test:e2e:live:puppets
npm run test:e2e:traffic-light:report
git diff --check
```

Additional contract/Shadownet commands from WP-02 and WP-07 are required when those paths are included in the candidate.

**Exit gate:** all J-journeys are at least `READY FOR TEST`; production-shaped app registry contains no unexplained commissioned-app disablement; candidate commit is frozen.

## 7. Implementation week runbook: 2026-08-31 through 2026-09-04

This schedule orders dependencies. It does not waive a work package exit gate.

### Monday, August 31 — establish the product contract

- Finish WP-00.
- Resolve D-001 through D-004.
- Freeze the app classification, role/access matrix, shared statuses, submission/audit shape, and five-task navigation labels in WP-01.
- Create the release evidence ledger.
- Begin registry, first-run, help, and FAQ work.

**End-of-day evidence:** clean/recoverable baseline, decided Casino wording, fixed file ownership, agreed app/access matrix, WP-01 tests running.

### Tuesday, September 1 — make community contribution paths real

- Complete WP-01 local implementation.
- Implement Store draft/submission/moderation spine in WP-02.
- Complete Arcade project/build/submission status and operator preview in WP-03.
- Implement Casino sandbox target/submission data spine in WP-04.
- Begin Calendar and Messaging presentation corrections in WP-05/WP-06.

**End-of-day evidence:** creators can persist Store, Arcade, and Casino submissions locally; commissioned apps are discoverable in the Classic OS.

### Wednesday, September 2 — close domain loops

- Close Store approval-to-storefront and purchase proof.
- Close Arcade approval-to-catalog and play/score proof.
- Close Casino approval-to-practice catalog and fail-closed wager proof.
- Close Calendar member-to-operator-to-member status proof.
- Close DM/mail/admin send and recovery proof.
- Integrate the active Mint Manager branch into the creator runway.

**End-of-day evidence:** J-02 through J-10 have local actor journeys, with open failures logged against exact steps.

### Thursday, September 3 — integrate operators, inventory, and Shadownet

- Complete WP-08 operator summaries and domain queues.
- Update all interaction inventory, route fixtures, workflows, behavior assertions, and live actors.
- Run Shadownet proofs for the presentation mint/store paths.
- Repair only failures that leave a commission journey unmet.
- Build the release candidate and begin complete desktop/mobile pass.

**End-of-day evidence:** inventory coverage passes; all state-changing journeys have actor-backed tests; candidate blockers are explicit.

### Friday, September 4 — candidate cut

- Complete WP-09.
- Run the full candidate gate from a clean checkout and production-shaped database.
- Verify authoritative app registry/documentation state.
- Capture presentation screenshots/traces and freeze the candidate.
- Publish a go/no-go report listing each J-journey and evidence.

**End-of-day evidence:** immutable candidate commit, release ledger, no unexplained red commission journey. If any J-journey is red, label the candidate incomplete rather than compressing the test week into implementation.

## 8. Focused test week: 2026-09-05 through 2026-09-11

The test week validates the frozen candidate; it is not a second feature sprint.

### TW-01 Test matrix

| Test lane | Required actors/environments | Evidence required |
| --- | --- | --- |
| First-run comprehension | Fresh anonymous, fresh member, returning member | Task-choice completion, guide recovery, no unexplained terms/dead ends |
| Navigation/permissions | Anonymous, member, creator, operator | Route/menu/command palette parity and correct access explanation |
| Store | Creator, operator, buyer | Draft, moderation, storefront, purchase/inventory persistence |
| Arcade | Creator, operator, player | Build checksum, submission, publish, session, score, rejection/audit |
| Casino sandbox | Creator, operator, eligible/ineligible member | Publish/play, membership explanation, explicit no-wager, fail-closed economic calls |
| Calendar | Anonymous, member, operator | Browse, personal event, ticket decision, public event, ICS, mobile layout |
| Messaging | Two members and operator | DM, mail, admin contact, unread/read, reload recovery |
| Creation/mint | Creator with linked Shadownet wallet | Create/export/preserve/sign/index/receipt/reopen, plus failure recovery |
| Accessibility | Keyboard, reduced motion, high zoom, mobile viewport | Focus visibility, labels, no trapped dialogs, readable reflow |
| Production operations | Operator | App registry, docs freshness, migrations, health, logs/audit, rollback evidence |

### Daily testing sequence

- **September 5–6:** scripted actor journeys and browser/device matrix; record defects against J-step IDs.
- **September 7–8:** comprehension sessions using only in-product guidance; fix blockers and misleading copy, then rerun the entire affected journey.
- **September 9:** wallet/network/Shadownet, security, authorization, ownership, and failure-recovery testing.
- **September 10:** production-shaped deployment rehearsal, migrations, app registrations, monitoring, and rollback verification.
- **September 11:** final regression from a clean candidate, evidence-ledger sign-off, presentation go/no-go.

No arbitrary bug-count threshold is used. A defect blocks presentation when it leaves any J-journey unmet or unproven. Cosmetic issues that do not affect the completion contract are logged for the cushion.

## 9. Customer presentation: 2026-09-14

The presentation must use the tested build and follow the commission journeys, not a tour of disconnected pages.

1. New member enters wtfOS and uses Play/Create/Shop/Events/Talk.
2. Creator makes or selects media and submits a Store item.
3. Operator approves it; member finds it in the Store.
4. Creator builds and submits an Arcade game; operator publishes; member plays.
5. Creator submits a Casino practice game; member plays with explicit non-wager wording.
6. Member submits a Calendar event and sees its status.
7. Member sends a DM and contacts the team through the correct messaging paths.
8. Artist exports work, selects a mint destination, performs the approved Shadownet proof, and opens the verified receipt.
9. Operator opens the unified pending summary and the owning domain queues.
10. Customer receives the release ledger showing the tested commit and evidence for J-01 through J-12.

If real-value Casino wagering has not completed its separate compliance/security contract, say so directly in the presentation. Do not disguise the practice sandbox as wagering.

## 10. Correction cushion and Beta/Gamma accessibility work: 2026-09-15 through 2026-09-30

### Customer correction intake

- Convert presentation feedback into one of: commission defect, accessibility defect, content/configuration correction, or new scope.
- Link commission defects to the exact J-step they break and rerun that entire journey after correction.
- Keep configuration/content corrections idempotent and production-auditable.
- Treat net-new capabilities as a separate approved scope; do not destabilize the accepted candidate silently.

### Beta/Gamma future accessibility package

Beta and Gamma remain alternate presentations over shared product contracts. During the cushion:

- [ ] Inventory which Classic tasks are easier or harder in Beta/Gamma for keyboard-only, high-zoom, reduced-motion, low-vision, touch, and cognitive wayfinding needs.
- [ ] Define a shared launcher/accessibility contract so availability, permissions, app names, help content, and durable APIs come from the same sources as Classic.
- [ ] Remove any Beta/Gamma-only business logic where it creates product drift; retain view-specific layout and interaction adaptations.
- [ ] Add parity tests for Play/Create/Shop/Events/Talk destinations without requiring pixel or layout parity.
- [ ] Present Beta/Gamma as opt-in accessibility views only after the shared commissioned journeys are proven in Classic.

Beta/Gamma completion is not allowed to reopen or replace the accepted Classic OS design unless the customer explicitly changes the commission.

## 11. Release evidence and defect rules

Each J-journey record must contain:

- candidate and live commit;
- date/time and environment;
- actor identity/role (never secret material);
- starting route and OS launch path;
- API/status transitions exercised;
- durable database or chain/indexer side effect;
- automated spec/command;
- screenshot, trace, or operation link where applicable;
- result: `PASS`, `FAIL`, or `BLOCKED`;
- defect/bounty reference for failures.

After any fix, add the cause and future rule to `.agents/docs/live/LESSONS_LEARNED.md`, update the relevant bounty state, and rerun the full affected journey. Do not edit prior evidence to make a failed run look successful.

## 12. Definition of done for every commissioned surface

A surface is done only when all applicable statements are true:

- It has one canonical product name and plain-language purpose.
- It is reachable from the Classic OS by the intended actor.
- Runtime registration, route access, UI gating, and API authorization agree.
- A first-time user sees the primary action and prerequisites.
- Empty, loading, denied, failed, submitted, approved, and completed states provide a next action.
- State-changing actions produce a server-authoritative durable result.
- Ownership and role boundaries are tested with a second actor.
- Mobile-sized and keyboard interaction are usable.
- Documentation and FAQ content match live behavior.
- Interaction inventory, route fixture, domain workflow, behavior assertion, and live actor coverage are current where applicable.
- Production uses the tested commit and authoritative app registry state.

## 13. “Do not declare the commission fulfilled if…” gate

Do not declare fulfillment when any of the following is true:

- Arcade or another commissioned app still opens to “disabled by admin.”
- A creator API exists but there is no understandable UI entry and owned status view.
- A Store item publishes immediately without operator moderation under the selected policy.
- A Game Studio build cannot be traced to the item players see.
- Casino community creation exists only as a source-code extension point.
- Casino UI implies real wagering while settlement/compliance remains fail-closed.
- Calendar submissions disappear after send or mobile planning remains clipped.
- Messaging terminology forces the customer to explain which app to use.
- Mint success is inferred from a wallet popup without indexed receipt evidence.
- FAQ/help is empty, stale, or describes apps that production disables.
- Inventory coverage passes only because the route exists while feature behavior remains unproved.
- The presentation uses a different commit/configuration from the focused test candidate.

## 14. Execution ledger

This table is updated during implementation. `DONE` requires the exit gate named in the work package.

| Package | Status | Depends on | Completion evidence |
| --- | --- | --- | --- |
| WP-00 Baseline/worktree | DONE | — | Reconciled baseline commit `c5375cd8` |
| WP-01 OS/wayfinding | DONE | WP-00, D-003, D-004 | J-01/local J-12 implementation `1a6ad919`; Classic is canonical and Beta/Gamma remain alternate views |
| WP-02 Store | DONE | WP-01, D-002 | Moderated contribution and purchase proof `f32e3059` |
| WP-03 Arcade | DONE | WP-01 | Game Studio-to-Arcade publication proof `517b5afa` |
| WP-04 Casino sandbox | DONE | WP-01, D-001 | No-value community table creation/moderation/play proof `d3ac7433` |
| WP-05 Calendar | DONE | WP-01 | Durable participation/reminder proof `c53c0a50`; inventory passed 691/691 |
| WP-06 Messaging | DONE | WP-01 | WTF-BB-628: unread/read, recipient report, operator disposition, and privacy-safe audit proof; inventory passed 692/692 |
| WP-07 Creation/mint | DONE | WP-00, WP-01, D-004 | J-10 fresh Spaghetti UI-live mint/index/collector proof + durable owned-media receipt; inventory passed 697/697 |
| WP-08 Operator/integration | IN PROGRESS | WP-02–WP-07 | J-11 + inventory/live evidence |
| WP-09 Release candidate | WAITING ON WP-07/WP-08 | WP-01–WP-08 | J-01–J-12 ready/tested |
| TW-01 Focused test week | NOT STARTED | WP-09 | Signed release ledger |
| PR-01 Presentation | NOT STARTED | TW-01 | Customer demonstration on tested build |
| CX-01 Cushion/accessibility | NOT STARTED | PR-01 | Accepted corrections + Beta/Gamma accessibility plan/evidence |

## 15. Immediate first actions

The next implementation session starts with these actions in order:

1. Complete WP-00 and preserve the active Mint Manager/PixAlerce/Macaroni work.
2. Obtain D-001 through D-004 decisions and write them into the release evidence ledger.
3. Change the commissioned app classification/runtime registrations and build the five-task wayfinding model in WP-01.
4. Freeze the shared creator submission lifecycle used by Store, Arcade, and Casino before building three separate UIs.
5. Begin WP-02 through WP-07 against that shared contract.

Until steps 1–4 are complete, adding more app screens would increase surface area without making the commission more deliverable.
