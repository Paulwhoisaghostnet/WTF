# The Count Admin Puppet User Stories

Date: 2026-06-24

The Count manages WTFOS discovery as a fair liveops game using existing admin surfaces, EXP, levels, roles, permissions, side quests, challenges, rewards, and in-app market tools.

## Puppet Findings

| Signal | Finding |
| --- | --- |
| Confusion | Admin surfaces are powerful but scattered across users, roles, quests, rewards, automation, app gates, and market tabs. |
| Failure | The Count can create quests, challenges, rewards, or market items without enough audit context unless the beta hub points back to the owning admin surfaces. |
| Hesitation | EXP can suggest readiness while roles, permissions, app gates, and abuse signals still require explicit review. |
| Abandonment | Admin liveops tuning becomes brittle if routes do not show who needs help, what changed, and which system owns the next action. |
| Delight | A runbook can count progress, count risk, count rewards, and count the exact admin tab that proves an unlock is safe. |

| Story | Admin surface | Acceptance |
| --- | --- | --- |
| Triage a user into the right first quest. | Users, XP Log, Side Quests | The Count can identify missing profile, wallet, social, or message-board proof and route the user to a matching quest. |
| Create a daily discovery side quest. | Side Quests, Automation, Rewards | Completions are auditable, EXP appears in the XP log, and reward rows remain idempotent. |
| Build a creator unlock challenge. | Challenges, Roles, App Gates | A creator can submit proof, receive feedback, and be reviewed for the correct role or surface unlock. |
| Manage roles and permissions without leaking admin power. | Roles, OS Admin, App Gates | EXP can signal readiness, but route access still respects role and surface gates. |
| Tune rewards and in-app market sinks. | Rewards, In-App Market, Contract Ledger | Market items, sale windows, reward payouts, and failed or pending payments are visible. |
| Audit abuse before a loop becomes farmable. | Automation, XP Log, Rewards, System Logs | The Count can see trigger, user, reward action, completion state, and audit trail. |

## Unlock Governance Matrix

The beta matrix turns each puppet path into an admin decision contract. Before scaling a loop, The Count reviews the existing proof, EXP signal, reward or market sink, role boundary, Count-owned decision, and anti-farm guard for New Tezos User, Collector, Creator, Builder, Curator, Community Member, and The Count.

| Governed path | Count management question | Existing user route | Count route |
| --- | --- | --- | --- |
| New Tezos User | Did the user earn one safe win without wallet pressure or automatic role movement? | `/side-quests` | `/admin` |
| Collector | Did the collector understand an object before market or reward pressure increased? | `/gallery` | `/admin` |
| Creator | Did the creator prove a draft can move toward durable publishing before role access expands? | `/studio` | `/admin` |
| Builder | Did the builder produce mapped, testable, playable, or discussable output before a surface unlock? | `/game-studio` | `/admin` |
| Curator | Did the curator turn discovery into useful public signal before rewarded curation scales? | `/gallery` | `/admin` |
| Community Member | Did the user find people and take one healthy social action before repeat rewards grow? | `/w` | `/admin` |
| The Count | Is the loop safe to scale before it changes rewards, roles, market pressure, or visibility? | `/admin` | `/admin` |

## Unlock Passport Review

The Unlock Passport is the player-readable version of The Count's review contract. Each card states what the user can see now, which existing route is safe to open next, which proof route matters, what can unlock, what must stay locked, and why the user should return tomorrow. The Count uses that readout to check whether a side quest, challenge, reward, role, market sink, or visibility change needs clearer evidence before admin action.

## App Relationship Review

The App Relationship Navigator is The Count's handoff map. Before scaling a loop, The Count can inspect whether the player path has clear comes-before context, consumed inputs, downstream outputs, next route, and Count-watch rule for first safe win, collector context, creator publishing, builder output, curator signal, community presence, economy spend, and Count liveops chains.

## Beta Admin Workbench

| Job | Existing admin route | Existing player route | Count acceptance |
| --- | --- | --- | --- |
| Triage user need | `/admin` | `/side-quests` | The Count can inspect user, EXP, profile, and quest evidence before recommending a safe first or recovery route. |
| Create side quest | `/admin` | `/side-quests` | The Count can define criteria, caps, verifier ownership, EXP, rewards, and route handoff before surfacing the loop. |
| Create challenge arc | `/admin` | `/challenges` | The Count can connect proof stages to review, reward, role, and app-gate decisions without automatic unlocks. |
| Configure reward | `/admin` | `/wtfiam` | The Count can inspect payout state, inventory effect, settlement, and caps before changing reward value. |
| Review role or app gate | `/admin` | `/mission-control` | The Count can grant only narrow, reversible access while EXP remains evidence instead of authority. |
| Manage market sink | `/admin` | `/marketplace` | The Count can separate public preview, signed-in action, wallet authority, and admin market configuration. |
| Audit automation | `/admin` | `/challenges` | The Count can compare verifier triggers, SystemEvent handles, reward deltas, caps, cooldowns, and suspicious clusters. |
| Review visibility | `/admin` | `/notifications` | The Count can decide whether a signal should be surfaced, notified, digested, or kept quiet/admin-only. |

## Count Liveops Recipe Board

The recipe board is The Count's bridge between a user need and a manageable rollout. It does not create quests, challenges, rewards, roles, market items, notifications, or app gates from beta. It gives The Count a no-write blueprint before opening the existing owner surfaces.

| Recipe | User need | Existing stage sequence | Count acceptance |
| --- | --- | --- | --- |
| Starter witness | A new user needs one safe win before wallet, market, or role pressure. | `/leaderboard` -> `/side-quests` -> `/profile` -> `/wtfiam` -> `/mission-control` -> `/notifications` | EXP is evidence, the side quest is capped, rewards are small/idempotent, and no authority is granted. |
| Creator publish | A creator needs an ordered publish runway before trusted-creator access expands. | `/studio` -> `/tools/broot` -> `/tools/macaroni` -> `/wtfiam` -> `/ipfs-pinning` -> `/skywire` | Macaroni stays role-gated, artifacts prove readiness, and role/app access is narrow and reversible. |
| Collector market | A collector needs object and reward context before market urgency. | `/gallery` -> `/side-quests` -> `/dashboard` -> `/wtfiam` -> `/marketplace` -> `/rat-race` | Public object proof comes before spend prompts, market state keeps uncertainty visible, and reward sinks are capped. |
| Builder surface | A builder needs to prove testable output before app gates expand. | `/game-studio` -> `/map-lab` -> `/console` -> `/challenges` -> `/admin` -> `/w` | Output proof and challenge review come before any admin app-gate change. |
| Curator signal | A curator needs nomination-quality proof before rewards or amplification scale. | `/gallery` -> `/side-quests` -> `/crp-nominate` -> `/wtfiam` -> `/admin` -> `/w` | Proof quality, duplicate review, caps, and visibility decisions are explicit. |
| Community return | A community member needs one healthy social action and a non-noisy return cue. | `/w` -> `/side-quests` -> `/live` -> `/challenges` -> `/settings` -> `/digest` | Participation rewards remain meaningful, rate-limited, and preference-aware. |

## Beta Command Deck

| Command | Existing owner surface | Trigger | Audit proof | Risk control |
| --- | --- | --- | --- | --- |
| Route a user to the first useful quest. | Side Quests, Users, XP Log | A new or stalled user has no clear next step. | Quest completion row, XP log entry, and notification or Mission Control state. | Keep completion caps, verifier handles, and manual-review flags visible. |
| Build a multi-step unlock challenge. | Challenges, Roles, App Gates | A user has enough activity to deserve a guided unlock arc. | Submission state, reviewer decision, challenge reward row, and role/app-gate change. | EXP suggests readiness, but explicit roles and permissions remain authoritative. |
| Tune rewards and market sinks. | Rewards, WTFIAM, In-App Market | Users are earning value without a meaningful spend or inventory path. | Reward ledger row, inventory row, market item state, and redemption history. | Use caps, idempotency, and sale windows before increasing reward value. |
| Grant role or app access from proof. | Admin Roles, Desktop Apps, Start Menu Gates | A readiness threshold is met but operator power must stay protected. | Role change audit entry, affected app gate, admin actor, and route availability. | Grant the narrowest role or surface access; keep admin authority reversible. |
| Manage in-app market availability. | Marketplace, Contract Ledger, Skywire Market Feed | A listing, trade-board object, sale window, or reward sink needs context. | Market item row, listing or trade-board signal, contract ledger state, and promotion event. | Separate public preview, signed-in action, and wallet/contract authority. |
| Audit a farmable loop before scaling it. | Automation, XP Log, Rewards, System Logs | Completions, EXP spikes, repeated proofs, or reward rows cluster around one task. | SystemEvent handle, completion row, reward delta, and admin review note. | Add cooldowns, per-user caps, proof variety, or manual review before increasing visibility. |

## Beta Summary Counts

| Summary | Existing source | Management question |
| --- | --- | --- |
| User needs | `/api/admin/users` | Which users may need a quest, role, or recovery route next? |
| Role gates | `/api/admin/role-access` | Which roles and admin surfaces define the unlock boundary? |
| Quest and challenge load | `/api/admin/stats` | How much side quest and challenge content exists for discovery? |
| Reward settlement | `/api/admin/reward-ledger?paid=false` | Which reward rows need settlement review before trust erodes? |
| Market operations | `/api/admin/in-app-market/items` | Which items, sale windows, or pricing surfaces shape the spend loop? |
| Automation definitions | `/api/admin/challenge-automation/challenges` | Which automated challenge definitions need audit before scaling? |
