# Gameshow Host Runbook

This runbook explains the host and contestant workflow inside wtfOS. The requested show has ten rounds, but its lineup is supplied by the producer. Until those games, rules, scoring, and required integrations are configured and rehearsed, the platform foundation must not be described as a ready-to-air show.

## Current Readiness — 2026-10-18

The producer will supply the lineup later. The configurable production system uses the verification below. Rehearsal challenges are not the selected games. Production release requires the normal Hetzner deployment, matching live commit health, and the opt-in production smoke described below.

| Evidence | Current result |
| --- | --- |
| Round operations | PostgreSQL lifecycle/concurrency checks pass. Distinct host, contestant, and outsider accounts completed the official local ten-round actor rehearsal, including preparation, saved submissions/grades, privacy, replay denial, exact audit reconciliation, progress projection, and completed-desktop reload. |
| Composer and wallet projection | Database tests pass for revision conflicts, canonical task identity/order, draft/live boundaries, raw token quantities, verified versus unknown network provenance, and stale wallet cursor coverage. |
| Contestant provisioning and private pages | Database/HTTP checks pass for preserved roles/purchases, scoped access, global app disables, private publication, owner/admin authorization, session revocation, and exclusion from public/PDS versions. Real Chromium confirms inline canvas scripts run under the private response CSP while cookies, browser storage, and outbound fetch remain blocked. |
| Production UI and canvas | The production build and all 13 focused inventory browser scenarios pass. They cover host/contestant stage, builder and agent draft recovery, progress sheet, provisioning, private wizard, and Broot painting/save/export/reload. Fixture browser responses prove UI behavior; database and real-actor tests provide separate persistence/authorization proof. |
| Desktop startup | Ordered event delivery regression checks pass. The same actual contestant launch improved from 11,463 ms to 1,473 ms; its season read improved from 9,695 ms to 10 ms. These are measured local runs, not a universal performance guarantee. |
| Inventory scheme | Coverage validation passes for all registered handles/routes/domains, including this change. Registry coverage does not claim every existing platform feature has full behavioral proof. |
| Repository TypeScript check | Clean production release checkout passes `NODE_OPTIONS=--max-old-space-size=6144 npm run check -- --pretty false`. Unrelated unfinished branch work is excluded from this release. |

The focused inventory command was:

```sh
npm run test:gameshow:postgres
npm run test:e2e:inventory -- --grep 'interaction inventory - gameshow|interaction inventory - Broot|contestant creates and publishes a private page'
npm run test:e2e:live:puppets -- --grep 'ten-round operational rehearsal'
npm run test:e2e:inventory:coverage
```

This is scoped behavior verification, not a claim that the entire platform inventory suite was run to completion.

The separate production smoke uses existing real actor credentials and the exact canonical origin. It never starts a local server, accesses the database, signs wallet operations, grades contestants, or publishes public content. It creates a uniquely marked upcoming show, proves host save/reload/progress and contestant workspace permissions, then removes only that untouched fixture through its normal APIs. Private-page proof requires a real eligible non-admin owner with a claimed site; it creates a unique private sentinel, checks owner/admin handoff and anonymous/outsider denial, preserves public version IDs, and removes only that sentinel. A production test account with incomplete identity prerequisites must not be made eligible through fabricated identity links.

```sh
WTF_E2E_LIVE_BASE_URL=https://wtfos.app \
WTF_E2E_START_SERVER=0 \
WTF_E2E_PUPPET_CREDENTIALS_PATH=/absolute/path/to/production-credentials.json \
WTF_GAMESHOW_PRODUCTION_SMOKE=1 \
WTF_GAMESHOW_PRIVATE_OWNER_ACTOR=eligible-owner-actor \
npx playwright test --config=playwright.live.config.mjs tests/playwright/live/gameshow-production.spec.mjs
```

The credentials file must explicitly declare `environment: production` and `targetBaseUrl: https://wtfos.app`. Keep it outside version control. The optional `WTF_GAMESHOW_ALLOW_PUPPET_SITE_CLAIM=1` permits only the normal product claim for an already eligible actor; a failed eligibility check remains a blocker. The host proof can be selected separately with `--grep 'production host'`. A local passing test or anonymous-only denial does not establish successful production private publishing.

Migrations `0129_gameshow_round_plans.sql`, `0130_gameshow_private_pages.sql`, and the production readiness repair `0131_backfill_manifest_bigint_id.sql` must apply through the normal deployment path before this runtime is activated; all were verified locally. Actual game integrations, chain actions, rewards, broadcast setup, and the producer's configured rules require their own rehearsal before the show airs.

## Prepare the Show

Write the rundown before activating a round. Each of the ten entries needs the following information from the producer:

| Decision | What contestants and the host need to know |
| --- | --- |
| Game and location | The game name and where contestants perform the action. |
| Rules and eligibility | What counts, what does not count, and who may participate. |
| Timing | When play opens, when submissions close, and when judging happens. |
| Evidence | What the contestant submits and how the host verifies it. |
| Scoring | How results are judged, including any tie or dispute procedure. |
| Consequences | Any elimination, immunity, reward, or advancement rule. |
| Dependencies | Any account, wallet, contract, external game, media room, or integration the round actually uses. |

Do not adopt an existing scaffold's ante, elimination counts, or game names without the producer's decision. A rule that is not automated must identify the host's manual judging step.

Use **Build Rounds** in Control Board to create a show with ten empty slots, then define each round's objective, rules, ordered contestant steps, required tools, evidence, and judging criteria. Save preparation before starting play. The existing **Seasons**, **Rounds**, and **Challenges** editors in `/admin` remain the owners for established administrative settings; the builder writes the same round and challenge records. Keep unpublished challenges in draft while instructions are incomplete. A round title alone is not a game definition.

Under **Work with an agent**, export the current round JSON and agent brief, dictate your intended game to your agent, then import its returned JSON for review. Importing loads an unsaved draft; **Save round preparation** persists it. The saved revision prevents a stale agent draft from replacing newer work. An authenticated, paired agent can inspect `/api/gameshow/composer` and use the documented versioned API with its existing read/write scopes. No agent brief supplies missing scoring, rewards, fees, or elimination choices.

The editors save preparation fields. For a season-backed round or challenge, use **Run Show** to change live status; a conflicting status change in the general editor is rejected. Started rounds cannot move to another season, and only draft challenges in upcoming rounds can be reassigned.

Confirm the contestant roster and the intended season. A registered account, a linked wallet, and an active season contestant are different things. If the configured season requires an ante, follow the existing ante workflow and confirm its recorded status before announcing eligibility; do not manufacture a fee for a show that has none.

## Open the Host and Contestant Workspaces

The host opens **Control Board** at `/control-board` from the existing OS. Its **Run Show** tab opens the host console. This browser route requires an admin account. Backend gameshow controls separately enforce `manage_gameshow`; challenge editing and grading enforce `manage_challenges`. The account's “host” label alone is not sufficient for the strict-admin browser route.

Use **Contestant check-in** to enroll an existing username as active or reserve. Re-enrolling someone already on the roster preserves their existing status. Use the existing contestant controls to promote a reserve or resolve an eliminated contestant's status; enrollment does not silently reinstate them. **Show preparation** identifies missing rules, challenges, or judging criteria and links to the existing editors.

Then use **Prepare contestant workspace** for each enrolled active or reserve contestant. Review the selected tools before applying the action. It adds the gameplay `contestant` role while keeping the account's original roles. WTF Domains and Pasta receive ordinary inventory app passes when selected; Studio is already a core app and needs no artificial pass. Choosing Pasta also adds the narrowly scoped `gameshow_creator` role for Macaroni's `use_managed_macaroni` permission. This does not grant admin, CH-EASE, moderation, or trusted-publishing bypasses. Existing purchases remain intact, repeat preparation does not duplicate passes, and disabled apps remain unavailable. An account in time out must be resolved through moderation first.

These account grants persist until an operator revokes them through the normal Roles and inventory owners. They do not expire or disappear when a round ends. If a prepared contestant already has the desktop open, refresh their session so its role and app availability reflect the new grants.

Contestants sign in and open **Rounds** at `/rounds`. They remain in the normal wtfOS desktop, with the launcher, taskbar, windows, and their other apps available. **Round Detail**, **Challenges**, and **Mission Control** provide the surrounding rules, submission, reward, and next-action context. Contestants should not need an admin screen to learn how to play.

Run the rehearsal with distinct host and contestant sessions. Opening both views as an administrator does not prove contestant permissions or privacy.

## Publish a Contestant Page Privately

Open **WTF Domains** from the contestant workspace or use **Subdomain Setup** in Settings. Claim the account's `username.wtfos.me` host through the existing wallet, social-account, and Bluesky/WTF DID eligibility checks. Tool preparation does not invent identity proof or silently sign a Tezos transaction. The `wtfos.me` hosted page and the optional `wtf.tez` on-chain name are separate workflows.

The page wizard starts new pages with **Private: me & admin review** selected. Enter a slug, title, and text, then **Create page**. The HTML editor remains available for advanced work. **Save** stores a draft; **Publish private page** makes the saved version available on `https://username.wtfos.me/_private/slug`. **Open private page** transfers a page- and host-scoped ticket from the current sign-in session. Only the owner and current strict-admin accounts can read it; other contestants and anonymous visitors cannot. A host reviewing the private address can follow its WTF Domains sign-in handoff.

Private page HTML stays in the application database. It is omitted from public site versions, bundles, and PDS records. The private host response is not cached. Self-contained HTML, embedded media, canvas, and inline project scripts run in an opaque-origin sandbox; they cannot use platform cookies, browser storage, external embeds, or network requests. Use project file import/export to preserve work. A private preview does not establish a live wallet, mint, or external API connection; those actions remain in the original authenticated Pasta tool and its wallet workflow. Source-session expiry or logout ends private-page access. Editing the draft does not change the hosted private version until it is published again. Public-site rollback does not change the separately published private version.

**Publish public pages** is a different action: it shares public pages and attached site assets. Site assets are public resources, so keep confidential files in the private library or Studio workflow. An existing public page cannot be relabeled private; create a new private slug. This also prevents a concurrent public publish from racing a privacy change, and previously published copies cannot be recalled. Public-to-private conversion is rejected even if an old public page was deleted and recreated with that slug.

## Run a Round

1. Select the intended season and round. Read its published rules from the contestant view before announcing the start.
2. Confirm the round's actual game or activity is available. Resolve missing instructions, roster eligibility, and any required integration before opening play.
3. Select **Start round** in **Run Show**. The server checks published instructions, judging criteria, roster eligibility, ante requirements, and progression before opening the round. Tell contestants where to play, what evidence to submit, and the closing condition. Follow the server's reported state after refresh or reconnect.
4. Contestants complete the activity and submit their evidence through its configured challenge. Confirm the submission appears in their own status and in the host's review queue.
5. Select **Close round entries** for judging. The **Round review queue** shows pending submissions. Choose the result, explain the decision, and select **Save result**. This uses the existing challenge grading service. `pending`, `pass`, `fail`, and `bonus` are challenge grades; they do not establish a new show-wide numeric scoring system.
6. Apply only the announced contestant and elimination policy. Control Board's existing **Cohort**, **Round**, and **Audit** areas provide contestant operations, elimination review, and the operator record. Resolve draft eliminations before advancing.
7. Select **Archive round** only when its submitted entries and draft eliminations are resolved. The completed round appears in **Run sheet and archived results**. Archiving does not start the next round: select its separate **Start round** control when the host is ready. **Archive final round** completes the season once every round is completed.

Repeat the approved rundown through round ten. Preserve the season's rounds, submissions, grades, contestant outcomes, and audit records after the finale. Publish the champion or final ranking only from the scoring and tie policy the producer approved and the evidence the host reviewed.

## Explain State to Contestants

| State or problem | Meaning and next action |
| --- | --- |
| Upcoming | The round has not opened. Read the instructions and wait for the host. |
| Active | The host has opened the round. Follow its rules and submission deadline. |
| Grading | Play is closed for review. Look for the host's grade or feedback. |
| Completed | The round is finished. Review the recorded outcome and the next round. |
| Not in the active roster | Ask the host to check your season contestant record. An account login alone does not establish eligibility. |
| Submission rejected | Read the reason, verify the selected round and its current state, and follow the available corrective action. Do not assume a failed request counted. |
| Reward shown | Check whether it is earned, claimable, claimed, or still awaiting its payout workflow. A pass grade is not an on-chain receipt. |

Keep critical instructions visible. Tooltips provide extra context for controls, while rule text and error messages explain decisions directly.

## Rehearse Before Announcing Readiness

Walk a contestant through all ten approved games, including each actual game launch or external dependency. For every round, verify that the host sees the submitted evidence, the contestant sees the host's judgment, and refresh preserves the result. Confirm that an ordinary contestant cannot operate host controls or read another contestant's private evidence.

Exercise a repeated host click and a reconnect so progression does not skip or reactivate rounds. Confirm the finale preserves its outcome. For any promised reward or chain action, separately prove its real permission, verification, and settlement path; a mock response or successful route load is not that proof.

The **Test Gameshow** and **Season 3** tabs are historical scaffold tools. They can prepare their own predefined records; they do not prove this show's approved ten games, schedule, scoring, or production dependencies. Do not run them as an incidental step during a live show.

## Recover During the Show

If the host or contestant connection drops, reopen the same season and read the persisted state before retrying an action. Inspect **Audit** for the operator action and the challenge's stored submission or grade. If a control refuses a transition, resolve the reason it reports instead of changing round status through an unrelated editor to bypass the guard.

For a disputed result, retain the evidence and record the host's explanation with the supported grading or contestant action. Do not silently rewrite the announced rule. For an unavailable game or integration, pause the show and make the producer's decision explicit; an invented replacement result is not recovery.

Archived grades and feedback cannot be changed. If a saved result's existing reward path needs retry, the grading API accepts the same saved grade with unchanged or omitted feedback; it preserves the original result, grader, and grading time and records the recovery attempt. This retry does not itself prove the reward was delivered—check the reward owner's recorded outcome.

The platform's Backup Manager is the restore authority. This runbook does not claim a restore guarantee without a successful restore proof for the relevant database backup.

See [Gameshow Operations](domains/gameshow-operations.md) for code ownership, doctrine boundaries, and developer verification.
