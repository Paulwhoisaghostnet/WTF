# Gameshow Operations

## Purpose

The WTF Gameshow uses wtfOS as its stage. A season groups rounds; each round explains its rules and contains the challenges contestants can complete. The host operates the show through Control Board, while contestants use the normal desktop and Rounds app.

The current production brief requests ten rounds. The producer supplies the lineup, scoring, tie handling, elimination policy, schedule, and rewards. Existing seed data is not an approved lineup, and creating ten round records does not establish that ten games are ready to run.

For the operator sequence, see the [Gameshow Host Runbook](../gameshow-host-runbook.md).

## WTF OS Connection

Gameshow operations belong to the [WTF OS domain](wtf-os.md) and its [registry](wtf-os-registry.md). They extend the existing shell and kernel instead of introducing a separate contestant account system, desktop, reward ledger, or wallet authority.

| Surface | Responsibility | Access |
| --- | --- | --- |
| `/control-board` | Host operations, contestant state, round control, and operator audit history. | The browser route remains strict-admin. Gameshow API operations also enforce `manage_gameshow`. |
| `/rounds` | Contestant orientation, season and round context, rules, and current work. | Signed-in user. |
| `/rounds/:id` | An individual round's details and challenges. | Signed-in user. |
| `/challenges` | Challenge instructions, evidence submission, and the contestant's submission status. | Signed-in browser surface; API permissions depend on the operation. |
| `/admin` | Existing season, round, challenge, and submission editors. | Strict-admin browser surface; challenge mutations enforce `manage_challenges`. |
| `/mission-control` | Cross-app orientation, rewards, failures, and the next useful action. | Signed-in user. |

The host is a steward of the show. Admin controls must not become the contestant experience. The Rounds app remains inside the OS window system, and app handoffs retain the active presentation shell. Help must explain the action and its consequence; a tooltip must not be the only place a critical rule or failure reason appears.

The authority chain is the existing one: authenticated identity and permissions, persisted season/round/challenge state, normalized events, challenge and reward services, user feedback, and operator audit. Contestant evidence remains associated with its author. Rewards need a recorded cause and retry-safe grants; a grade or a successful UI request is not proof of a blockchain payout.

## Main Code

| Owner | Files |
| --- | --- |
| Persistent season, round, contestant, challenge, submission, and operator-action records | `shared/schema-gameshow.ts` |
| Shared stage, composer, and progress contracts | `shared/gameshow.ts`, `shared/gameshow-plan-schema.ts` |
| Existing tool handoffs and preparation associations | `shared/gameshow-tools.ts`, `shared/schema-gameshow.ts`, `drizzle/0129_gameshow_round_plans.sql` |
| Stage reads, enrollment, guarded lifecycle, and submission policy | `server/features/gameshow/policy.ts`, `server/features/gameshow/service.ts`, `server/features/gameshow/routes.ts`, `server/features/gameshow/index.ts` |
| Preparation editor guards and audit records | `server/features/gameshow/editing.ts` |
| Atomic show creation and round composition | `server/features/gameshow/composer.ts` |
| Contestant progress and scoped wallet evidence projection | `server/features/gameshow/progress.ts` |
| Explicit contestant tool preparation and scoped Macaroni access | `shared/gameshow-provisioning.ts`, `server/features/gameshow/provisioning.ts`, `server/features/gameshow/provisioning-routes.ts` |
| Private project publication and session-bound subdomain access | `server/features/wtf-sites/private-pages.ts`, `server/features/wtf-sites/private-page-http.ts`, `client/src/features/wtf-subdomains/UserSitesPanel.tsx`, `drizzle/0130_gameshow_private_pages.sql` |
| Indexed wallet source provenance | `server/lib/wallet-event-provenance.ts`, `server/lib/wallet-events.ts` |
| Host page and contestant page shells | `client/src/pages/ControlBoard.tsx`, `client/src/pages/Rounds.tsx`, `client/src/pages/RoundDetail.tsx` |
| Host console, contestant desk, shared stage query, and accessible help | `client/src/features/gameshow/` |
| Existing challenge and grading UI | `client/src/pages/Challenges.tsx`, `client/src/features/admin/tabs/ChallengesAdminTab.tsx` |
| Existing season and round editors | `client/src/features/admin/tabs/SeasonsAdminTab.tsx`, `client/src/features/admin/tabs/RoundsAdminTab.tsx` |
| Existing gameshow route owners | `server/routes/control-board.ts`, `server/routes/seasons.ts`, `server/routes/challenges.ts` |
| Normalized event ingestion and reward actions | `server/challenges/events/`, `server/challenges/actions/` |
| Browser and permission discovery | `client/src/routes/page-defs.ts`, `shared/wtf-browser-routes.ts`, `server/lib/wtf-access.ts` |
| Shell and package acceptance | `client/src/features/admin-os/admin-surface-registry.ts`, `shared/wtf-app-packages.ts`, `shared/wtf-docregistry.ts` |
| Behavior coverage | `tests/e2e/inventory/behavior-assertions.mjs`, `tests/e2e/puppets/`, `tests/playwright/live/` |
| Local PostgreSQL lifecycle, composer, migration, and evidence proofs | `server/features/gameshow/service.test.ts`, `server/features/gameshow/production.test.ts`, `server/lib/wallet-event-provenance.test.ts` |

Add game-specific integration beside its owning domain. Arcade sessions and scores belong to Arcade/Console; challenge judgments belong to challenge services; wallet writes belong to the shared wallet and signer boundaries. Keep show coordination in a gameshow module instead of adding game engines to the page component.

## API and Lifecycle

| Operation | Contract |
| --- | --- |
| `GET /api/gameshow/seasons/:id/stage` | Authenticated snapshot of the season, rounds, roster, and caller's participation state. Contestants receive their own answers; managers receive the review queue. The response is private and not HTTP-cacheable. |
| `POST /api/seasons/:id/contestants` | Gameshow manager enrolls an existing `username` as `active` or `reserve`. Repeating enrollment returns the existing record; it does not change that record's status or the account's global role. |
| `POST /api/rounds/:id/start` | Opens a prepared upcoming round and its challenges. Requires published rules and judging criteria, an eligible active roster, completed earlier rounds, and no other active or grading round. |
| `POST /api/rounds/:id/close` | Changes an active round and its open challenges to grading so further submissions are rejected. |
| `POST /api/rounds/:id/advance` | Completes a grading round after its submitted entries and draft eliminations are resolved. The next round awaits a separate start cue. Completing the final remaining round completes the season. |
| `POST /api/challenges/:id/submit` | Existing submission API, guarded by season membership, ante policy, current round/challenge state, deadline, and duplicate-submission protection for season challenges. |
| `PUT /api/submissions/:id/grade` | Existing challenge judgment and reward path. Season-backed submissions are judged while their round is grading. After completion, only replay of the saved grade with unchanged or omitted feedback is accepted for reward recovery; the original result, grader, and grading time are preserved. |
| `GET /api/gameshow/composer` | Gameshow managers discover the versioned round-input JSON Schema, show-creation schema, canonical tool handoffs, and versioned write paths. |
| `POST /api/gameshow/seasons` | Gameshow manager supplies `name`, `number`, and optional `description`; the transaction creates the season and exactly ten unconfigured upcoming rounds. No tasks, fee, game rules, scoring, or rewards are invented. Returns `{id, roundIds}`. |
| `GET /api/gameshow/rounds/:id/plan` | Gameshow manager reads canonical round/task content, task tool/watch associations, and the saved revision. An existing round with no production associations has revision `0`. |
| `PUT /api/gameshow/rounds/:id/plan` | Gameshow manager submits the shared input with `expectedRevision`. Saves the round, canonical draft challenges, ordered associations, revision, and operator audit in one transaction. Returns the full saved plan, including assigned task IDs. |
| `GET /api/gameshow/seasons/:id/progress` | Private, noncacheable manager snapshot of roster rows, round/task submission and grade counts, linked wallets, index timestamps, and configured token observations. No scoring or winner is derived. |
| `POST /api/gameshow/seasons/:id/contestants/:userId/provision` | Explicitly selected `appKeys` prepare an active/reserve contestant's tools. Adds the contestant role, selected Domains/Pasta passes, and Pasta's narrow `gameshow_creator` role. Preserves prior roles/purchases and global app disables; Studio needs no pass. No wallet signature, payment, domain claim, admin role, or publication is implied. |

Lifecycle writes and their `operator_actions` records commit together. The normalized `app.interaction.tracked` event carries the action in `metadata.handle`: `gameshow.contestant.enrolled`, `gameshow.round.started`, `gameshow.round.closed`, `gameshow.round.advanced`, or `gameshow.submission.graded`. Preparation editors also emit `gameshow.season.edited`, `gameshow.round.edited`, and `gameshow.challenge.edited`. These events preserve existing automation ownership.

Show creation and composition add `gameshow.season.created` and `gameshow.round.plan.saved`. Their audits are committed with their writes; event and calendar projection failures are logged against the committed audit ID. Retrying a stale composition cannot silently overwrite another producer's changes.

The existing season, round, and challenge editors retain their preparation role. Season-backed round/challenge status changes must use host cues; season status must agree with its rounds. Started rounds cannot be reassigned to another season, and challenge reassignment is restricted to drafts in upcoming rounds.

`server/features/gameshow/editing.ts` keeps existing preparation editors behind the same lock order. Their audited handles are `gameshow.season.edited`, `gameshow.round.edited`, and `gameshow.challenge.edited`. Season-backed status changes go through host cues; started records cannot be detached to bypass eligibility. An archived grade may be replayed with the same grade and unchanged feedback to retry its existing reward path, with `rewardRecovery` recorded in the audit. This does not change the archived result or establish reward settlement proof.

The shared stage query refreshes on the existing Control Board foreground cadence and can be refreshed manually. The database remains authoritative across reloads. The host console shows stale-state feedback when a refresh fails; it does not infer that a failed request completed an action.

## Round Composition and Agent Access

The builder is a production editor around existing owners. Round objective and show-wide rules remain in `rounds.description` and `rounds.rules`; judging instructions belong to `challenges.criteria`. Evidence, grades, rewards, and task identities stay in the existing challenge tables. `gameshow_round_plans` stores only a versioned ordered list of challenge references, tool IDs, optional token watches, and an optimistic revision. It is not a second task engine or score ledger. Migration `0129_gameshow_round_plans.sql` must run before the updated server reads these associations.

`GameshowRoundPlanInput` is validated by the same strict schema in the browser, HTTP owner, and imported agent draft. Existing task IDs must belong to that round, and duplicates or unknown tools are rejected. Omitted draft tasks are removed only while the whole round remains upcoming, all its tasks are draft, and none has contestant evidence. Retained tasks keep their IDs and existing reward settings. New tasks use existing zero-reward defaults. Blank draft instructions and judging criteria may be saved; the start cue still rejects incomplete rules, instructions, or criteria.

Composition uses the same season → round → challenge locking order as live cues. The supplied revision must match the saved revision, then increases atomically. Existing round/challenge editor changes also invalidate an existing plan revision. A conflicting writer receives HTTP 409 and must reload and reconcile the saved plan. Once the round starts, this composer cannot replace its preparation.

The paired agent uses the existing `wtf_api_request` MCP tool and `/api/v1` API surface. It first reads `/api/v1/gameshow/composer` and `/api/v1/gameshow/rounds/:id/plan`, then submits the same `GameshowRoundPlanInput` to `PUT /api/v1/gameshow/rounds/:id/plan`. Read calls require `api:read`; mutations require `api:write`; the account must also pass the route's `manage_gameshow` check. Pairing does not grant host authority. Export/import gives the host a reviewable draft without introducing a second model runtime, microphone permission, or bypass of app gates. Saving a draft never opens the round.

`shared/gameshow-tools.ts` contains handoffs to existing tools and their owning routes, not another application registry. Assigning a tool tells contestants what to open; it does not sign a wallet operation, provision access, publish a site, or declare that a prerequisite has been met. Those actions remain with their respective owners.

## Progress and Wallet Evidence

The progress sheet derives a contestant-by-round matrix from the season roster, canonical challenges, and persisted submissions. Counts distinguish pending, pass, fail, and bonus judgments. The chart and CSV preserve those categories; no points, rank, tie result, or elimination policy is inferred. Token observations do not create a submission or grade.

Wallet identities come from existing verified `user_wallets` links. Wallet addresses are globally unique in that table. The host sees cursor status, last sync time, backfill state, and index errors; the ordinary stage snapshot does not expose these host diagnostics. Refresh uses existing wallet indexing and its scheduler, not a new gameshow RPC poller. A wallet owner, or an account with `manage_users`, can request the existing `POST /api/cockpit/sync/:wallet`; the Dashboard's wallet-sync control uses this endpoint. Refreshing the sheet alone only rereads persisted data.

A token watch explicitly declares Tezos mainnet, a KT1 contract, and optionally one token ID. The projection includes indexed mints, burns, and incoming/outgoing transfers only for current roster wallets, matching watches, and the round's actual host-open to host-close interval. Active rounds use the current read time as their upper bound. Current holdings are not substituted for mints or round activity. Raw token quantities remain strings so display does not lose integer precision.

Historical `wallet_events` rows have no network column. Their network must not be guessed from today's environment. The single wallet-event ingestion owner now writes a reserved local `__wtfosIndexer` provenance object after overwriting any upstream value with that key. Only the configured canonical `https://api.tzkt.io/v1` source establishes mainnet provenance; unknown custom sources and old rows remain unverified. No historical backfill is relabeled by this change. Mainnet token/operation links require this per-event provenance. Preview URLs pass protocol filtering and use existing IPFS rendering policy; missing previews remain visible as unavailable.

The sheet distinguishes an unconfigured watch, a not-yet-started round, unavailable indexing, incomplete coverage, and an indexed observation set. A cursor from before the round opened cannot produce a misleading zero count: counts remain unavailable. A closed round remains incomplete until its linked-wallet cursors cover closing time; index failures, missing backfills, or unverified observed events also remain explicit. Even an indexed observation set is a persisted source view, not an assertion of immediate chain completeness or proof of the published game outcome.

## Notes

- [The Law, Delivered](../../The%20Law%2C%20Delivered.md) requires user orientation, shell placement, permissions, event output, audit, and verification. It names `WTF-Bible.md` as doctrine. This checkout does not contain that file; the reviewed local copy is `../WTF-ux-interoperability-clone/WTF-Bible.md`, also identified by [AT Protocol decisions](../atproto/00-decisions.md). A collaborator should obtain that doctrine source from the maintainer; do not treat a missing file as permission to invent replacement rules.
- Preserve the existing strict-admin browser gate. A product title such as “host” does not itself grant an account permission. Do not broaden cohost or user-management privileges to make show controls reachable.
- Historical Test Gameshow and Season 3 scaffolders are explicit setup tools. Their games, network references, contestant counts, fees, rewards, and elimination defaults are not new production policy.
- Use the configured network and existing user-wallet preflight for any chain-backed game. The local test network is Tezos Shadownet; mainnet and Etherlink must remain explicitly distinguished. Never infer a production contract from historical scaffold text.
- Changes to interactions, APIs, events, or permissions require the corresponding interaction inventory and domain-owned E2E records. Route smoke proves reachability; a host/contestant rehearsal must also prove persisted submissions, grades, lifecycle transitions, and any promised rewards.
- Persisted show data uses the platform database and its existing backup ownership. Retaining results is not evidence that a backup can restore; any recovery guarantee requires the platform's restore proof.

## Add a Game or Contestant Tool

Start by composing a round with existing tools and challenge evidence. A game that only needs instructions, a submission, and host judgment requires no new engine or migration. Use the builder or the shared plan schema; supply the game's real rules and judging criteria.

If a new integration is necessary, implement its behavior in its owning domain and add its route/package/access metadata through the existing registries. Only then add a handoff in `shared/gameshow-tools.ts`. The contestant workspace reads canonical browser and app access instead of treating a round assignment as permission. Add state-changing proof in that domain, then link its behavior assertion and interaction handles into the inventory.

Keep client components in `client/src/features/gameshow/`, coordination in `server/features/gameshow/`, and browser/agent contracts in `shared/gameshow*.ts`. Reuse the stage, progress projection, and canonical challenge records. Never introduce a parallel contestant identity, client-owned score ledger, hidden grant, or implicit chain transaction.

For project files, retain the existing Studio upload and File Manager library ownership. Broot and Pasta keep their existing local draft/portable export formats. Private hosted HTML belongs to WTF Domains and migration `0130_gameshow_private_pages.sql`; it is excluded from public site snapshots and PDS publication. See the host runbook for audience and publishing details.

## Contributor Verification

Run the focused tests owned by the changed gameshow module, then `npm run check`, `npm run build`, and `npm run test:e2e:inventory:coverage`. UI changes also require `npm run test:e2e:inventory`. For permissions, persistence, grading, or rewards, run the relevant actor-backed workflow through `npm run test:e2e:live:puppets`, or record the precise blocker and the unproven behavior.

```sh
npx tsx --test server/features/gameshow/service.test.ts server/features/gameshow/production.test.ts server/lib/wallet-event-provenance.test.ts
```

The PostgreSQL proofs use isolated schemas and accept only a local `GAMESHOW_TEST_DATABASE_URL` or local `DATABASE_URL`; otherwise they skip rather than write a remote database. The production test executes the exact additive migration twice, proves concurrent creation/save conflicts, preserves canonical IDs, verifies task ordering and stage handoffs, rejects live-plan replacement, and distinguishes unavailable/unverified/verified wallet evidence. The provenance unit test proves that old cache and forged upstream provenance cannot gain a mainnet claim. These proofs do not establish live indexer latency, real contestant wallet readiness, chain reward settlement, or production deployment.

Test the actual transition and its durable effect: contestant submits, host sees that submission, host grades it, contestant sees the grade, and the next round cannot be opened by replaying an old action. Keep future game-specific assertions with their domain and link them from the shared behavior registry.

`tests/playwright/inventory/gameshow-stage.spec.mjs` uses intercepted responses to prove host controls, contestant receipts, shell handoffs, tooltips, and narrow layouts. `gameshow-production.spec.mjs` proves ordered task editing, agent import review, stale-revision recovery, sheet/filter/chart/CSV/token display, and explicitly selected provisioning. `wtf-sites-private.spec.mjs` owns the private-page wizard. These fixtures do not prove database persistence, authorization enforcement, or reward settlement; those claims belong to the backend and actor-backed tests.

The actual local actor test in `tests/playwright/live/gameshow-stage.spec.mjs` creates a show through the composer, configures its ten rounds, enrolls a distinct contestant, opens/closes/grades/archives every round, checks unauthorized and replayed actions, reconciles the progress projection and operator audit, then reloads the completed contestant desktop. Its isolated fixture challenges have no rewards and are not the producer's lineup.
