# WTFOS Beta Discovery Report

Date: 2026-06-24

Scope: beta UI/UX only. Existing WTFOS app logic, API contracts, wallet flows, database structure, contract logic, and production purpose remain unchanged.

## Recommendation

Use `beta.wtfos.app` as a guided community hub over the existing WTFOS route map. Discovery should feel like a manageable unlock game using existing EXP levels, roles, permissions, side quests, challenges, rewards, leaderboards, and in-app market surfaces.

## Puppet Audit

| Puppet | First tool | Next tool | Confusion | Failure | Hesitation | Abandonment | Delight |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New Tezos User | Side Quests | Gallery | WTFOS sounds powerful, but the first safe action is not obvious. | Clicks wallet-heavy or market routes before understanding identity. | Pauses when sign-in, wallet, EXP, and role words appear before a small win. | Leaves if the first screen feels like a pile of app names. | A first quest with EXP and no wallet pressure. |
| Collector | Gallery | Rat Race | Collection, portfolio, gallery, and market signals are split. | Finds an object but misses Hoard, Rat Race, or creator context. | Pauses between Gallery, Hoard, and WTFIAM. | Leaves after passive browsing if no related action appears. | Gallery to Hoard to Rat Race feels intentional. |
| Creator | Studio | Broot | Studio, Broot, Macaroni, pinning, domains, and Skywire do not reveal order. | Starts in a tool without knowing the publish or promotion route. | Pauses before wallet, IPFS, or domain steps because readiness is unclear. | Leaves if a draft or publish job has no recovery prompt. | Studio to Broot to Pinning to Domains becomes a pipeline. |
| Builder | Game Studio | Map Lab | Builder tools span game, map, console, and admin-adjacent metaphors. | Finds a prototype surface but misses map, test, or route context. | Pauses when a route looks experimental and the output is not stated. | Leaves if builder tools feel disconnected from users and rewards. | Prototype to map to console is visible. |
| Curator | Gallery | CRP Nominations | Discovery, nomination, broadcast, and social proof are separated. | Discovers good work but does not know how to nominate or share. | Pauses when curation looks like browsing instead of contribution. | Leaves if there is no visible public impact. | A route from discovery to nomination. |
| Community Member | W Feed | WTF LIVE | W Feed, WIM, WTF LIVE, Skywire, Mail, and Digest compete. | Reads activity but does not join, reply, quest, or return. | Pauses if other people do not look currently active. | Leaves if WTFOS feels empty or only tool-focused. | People, rooms, digest, and notifications feel connected. |
| The Count | Admin Control Suite | Side Quests, Challenges, Roles, Rewards, In-App Market | Admin surfaces are powerful but scattered. | Creates quests, challenges, rewards, or market items without enough audit context. | Pauses when EXP readiness and role/permission gates disagree. | Stops tuning if admin routes do not show who needs help and what changed. | A runbook for counting progress, risk, rewards, and user needs. |

## App Visibility Tiers

Tier 1 Core Daily Use: Side Quests, Challenges, Mission Control, Notifications, Leaderboards, Gallery, W Feed, Profile.

Tier 2 Regular Use: Studio, Broot, Skywire, WTF LIVE, Hoard, Rat Race, WTFIAM, WTF Domains, IPFS Pinning, creation tools.

Tier 3 Occasional Use: desktop utilities, settings, command palette, media libraries, controlled browser, task manager.

Tier 4 Experimental: Skywire, WTF LIVE, Mail, DedRooms, Rat Race, Map Lab, casino surfaces where applicable.

Tier 5 Hidden Advanced: Admin Control Suite, recovery tools, role and permission management, operator wallets, contract factory, backup and recovery.

The executable source is `client/src/features/beta/beta-app-catalog.ts`; `client/src/features/beta/beta-app-catalog.test.ts` verifies desktop app, creation tool, unlock ladder, Count story coverage, and The Count liveops command deck.

## App Visibility Atlas Addendum

The beta shell now makes the full catalog filterable by search, visibility tier, user stage, and puppet path. This turns the hiding policy into an admin-visible workflow: reviewers can first try better grouping, explanation, routing, and surfacing, then inspect whether any app still belongs in a lower-visibility tier. The empty state is reversible and keeps discovery validation separate from app functionality, permissions, and route ownership.

## First-Minute Wayfinder Addendum

The beta shell now adds eight Wayfinder prompts after the hero: Safe first win, People now, Object hunt, Creator runway, Builder output, Choose my path, Find a tool, and Count review. Each prompt jumps to an existing beta section, applies beta-local puppet or atlas filters when useful, and shows the existing route plus access hint. This improves first-minute discovery without creating an assistant, writing state, changing rewards, or bypassing app gates.

## Section Compass Addendum

The beta shell now adds a fourteen-stop Section Compass after the Wayfinder. It maps the expanded `/beta` page to now signals, public proof, people discovery, attention triage, daily return, passports, questlines, governance, relationships, route groups, trails, puppet paths, Count runbook, and App Visibility Atlas. Each card names the user question, audience, stage, access boundary, use-when context, proof rationale, and next move, then jumps only through beta-local hash and scroll state.

## Journey Command Center Addendum

The beta shell now adds a selected-puppet command stack inside Puppet Paths. New user, collector, creator, builder, curator, and community paths each show five route-owned steps: orient, act, prove, return, and Count review. This reduces cross-board stitching and makes the "what should I do next?" answer immediately actionable without adding assistant behavior or changing any app.

## Discovery Trail Addendum

The beta shell now adds `client/src/features/beta/beta-discovery-trails.ts` and renders five trail cards on `/beta`: Collector, Creator, Builder, Community, and The Count. Each trail uses existing route handles, records the access level for each step, ties selected steps back to read-only now signals, embeds the relevant live proof snippets inside the trail, distinguishes quiet/protected/unavailable/admin-only states, explains what each non-public gate protects, and states the success condition plus return-tomorrow reason. This improves app discovery without rebuilding any app.

The beta shell now also renders puppet retest snapshots from `client/src/features/beta/beta-agent-loop.ts`. The snapshots compare the production app-name scan with the beta guided shell for all six requested timing measures, so a reviewer can see which beta organization is being kept and which friction remains before the next loop.

## Puppet Memory Ledger Addendum

The beta shell now renders a Puppet Memory Ledger from the same persistent-agent loop. Each of the six puppets has a memory card with its first task, success condition, six discovery checks, confusion, hesitation, dead-end note, abandonment risk, success, delight, unexpected discovery, remaining friction, next route, and saved-time evidence. This makes the recorded test-user memory discoverable inside beta without adding an assistant, rewriting navigation, or changing any app behavior.

The read-only now signal layer now pulls twelve public signals: WTF holders, EXP leaders, reward earners, market listings, public trade-board objects, public profile XP activity, WTF LIVE room presence, upcoming calendar events, WTF TV channels, arcade discovery, recent play, and console discovery. Protected surfaces remain described as signed-in loops instead of being called anonymously.

Profile discovery safety note: beta links to public profiles, but its now-signal proof comes from `/api/users/:username/activity` rather than auto-fetching `/api/users/:username`, because the top-level profile route emits a profile-view event.

## Public Proof Board Addendum

The beta shell now renders four public proof cards before the role trails: Fresh object, Creator channel, Playable project, and Builder output. Each card composes existing public now-signal reads and routes to the existing app that owns the next step: Gallery, TV, Arcade, or Console. Quiet proof remains visible with explanation copy so users understand the route still has value when current public rows are empty.

## Creator Project Proof Ladder Addendum

The beta shell now renders seven creator proof rows inside Public Proof: Workspace draft, Asset prep, Package drop, Durable media, Media channel, Project output, and Broadcast signal. Each row names the owner surface, existing route gate, visible proof, current limit, next dependency, and no-write boundary. Macaroni remains role-gated, Studio/Broot/IPFS/TV/Console remain behind their existing session gates, and Skywire remains the optional public broadcast route.

## People Discovery Board Addendum

The beta shell now renders eight people-discovery cards after public proof: Active users, New users, Creators, Collectors, Builders, Curators, Collaborators, and Interesting wallets. Each card groups three existing now signals, explains why that kind of person matters, names the next action, and preserves a quiet fallback route. This directly addresses social visibility without adding people search, follow logic, messaging logic, profile-view writes, or new social APIs.

## People Proof Gap Matrix Addendum

The beta shell now renders eight proof-gap rows inside People Discovery. Each row marks the role as direct, routed, or weak proof, lists three existing now-signal sources, explains the current weakness, names the next beta UI move, preserves a quiet fallback, and repeats the no-write boundary before opening the existing proof route. Curator proof remains explicitly weak until Gallery, CRP nomination, Skywire, W, and Side Quest context can prove curation more clearly without app rewrites.

## Attention Triage Board Addendum

The beta shell now renders seven attention triage cards after the public proof layer: First safe action, People moving now, Collector heat check, Creator recovery, Play or inspect output, Tomorrow catch-up, and Count hot queue. Each card maps three existing now-signal sources to one existing route, shows whether proof is live/protected/quiet, explains what to do next, names the quiet fallback, and states what The Count controls. This improves the "what should I do next?" answer without creating notification delivery, assistant behavior, reward settlement, role grants, or app rewrites.

## Daily Return Board Addendum

The beta shell now renders six daily return cards before the role trails: Check what changed, Complete one quest, See people moving, Find one object, Move one project forward, and Review one liveops queue. Each card states what to do today, why to return tomorrow, which EXP/role/quest/reward/permission hook it depends on, what visible proof supports it, and what The Count controls when liveops management is required. All cards route only to existing WTFOS surfaces.

## Unlock Passport Addendum

The beta shell now renders seven unlock passports before the deeper questline board: New Tezos User, Collector, Creator, Builder, Curator, Community Member, and Count Operator. Each passport states what is visible now, the next safe action, proof needed, what unlocks next, what stays locked, what The Count reviews, and why to return tomorrow. This gives users a compact progression readout while preserving existing side quest, challenge, EXP, reward, market, role, permission, wallet, and admin behavior.

## Unlock Questline Board Addendum

The beta shell now renders seven unlock questlines: First safe win, Collector path, Creator runway, Builder proving ground, Curator signal chain, Community pulse, and Count liveops review. Each questline links five existing routes and names the side quest, challenge, reward/EXP hook, role or permission boundary, admin surface, Count review, and abuse guard. This directly ties discovery to existing side quests and challenges while keeping role grants, reward settlement, and admin decisions inside current owner surfaces.

## Unlock Governance Matrix Addendum

The beta shell now renders a seven-row governance matrix for starter witnesses, collectors, creators, builders, curators, community members, and The Count. Each row names the proof to inspect, how EXP should be treated, which reward or market sink is affected, where the role boundary sits, what Count decision is required, and which anti-farm guard should be visible. This makes the unlock game manageable for admins without changing side quest, challenge, reward, role, market, automation, or admin logic.

## App Relationship Navigator Addendum

The beta shell now renders eight relationship chains before the discovery trails: first safe win, collector context, creator publish, builder output, curator signal, community presence, economy spend, and Count liveops. Each chain explains what comes before, what the route sequence consumes, what it feeds into, what comes after, what The Count watches, and which existing route buttons carry the handoff. This improves app discovery and next-step comprehension without rebuilding apps, changing app purpose, altering route gates, or creating new progression state.

## Route Group Guide Addendum

The beta shell now renders seven route-group guide cards before the discovery trails: First Win, Collector Economy, Creator Pipeline, Builder Output, Curator Signal, Community Comms, and Count Liveops. Each card resolves app-name overlap by naming what to use first, what to use next, which proof to look for, what quiet data means, what The Count watches, and which existing routes belong to the cluster. Each card also applies existing App Visibility Atlas filters, so users can move from cluster understanding to catalog browsing without new routes, app rewrites, permission changes, or state writes.

## Count Admin Workbench Addendum

The beta shell now renders eight Count workbench jobs: triage user need, create side quest, create challenge arc, configure reward, review role or app gate, manage market sink, audit automation, and review visibility. Each card points to existing admin and player routes, names the source of truth, lists a setup checklist, and states the decision gate, proof, risk control, and success signal. This helps The Count create or manage discovery loops without creating a new admin engine or changing existing sidequest, challenge, reward, role, market, notification, or app-gate behavior.

## Count Liveops Recipe Board Addendum

The beta shell now renders six Count liveops recipes: starter witness, creator publish, collector market, builder surface, curator signal, and community return. Each recipe turns one user need into six existing route stages and names EXP use, side quest, challenge, reward, role or permission boundary, market or notification effect, Count decision, anti-farm rule, player return reason, and no-beta-write policy. This makes unlock discovery manageable for admins without creating quests, challenges, rewards, roles, market items, notifications, app gates, or admin writes from beta.

## Communication Map Addendum

The beta shell now renders a six-surface communication map: W Feed, WIM, WTF LIVE, Digest, Mail, and Skywire. Each card states when to use the existing app, what feeds it, what comes before it, what comes after it, and why it creates a return loop. This addresses community-member hesitation around whether WTFOS has one social surface or several unrelated ones.

## Count Liveops Addendum

The Count now has six beta command cards for first-quest triage, challenge arcs, reward economy tuning, role/permission review, market management, and farmability audits. Each card names the trigger, owning surface, admin action, player outcome, audit proof, and risk control. These are beta navigation/runbook surfaces only; they do not add admin authority, reward logic, market behavior, or bypasses around the existing `/admin`, quest, challenge, role, reward, or marketplace gates.

The Count also has six strict-admin summary cards: user needs, role gates, quest/challenge load, reward settlement, market operations, and automation definitions. These cards are locked unless the current session is already an admin, and the live values come only from existing admin endpoints.

## Notification Group Addendum

The beta shell now groups notification/return-loop events into social attention, progress and unlocks, live and scheduled moments, creator recovery, collector and market motion, and Count admin attention. Each group points to an existing route and preserves that route's current public, session, or admin gate.

The beta shell also adds a Notification Control Map for the same groups. The map explains the existing action route, the existing System Settings route for preferences, the existing Digest route for catch-up, and the `/api/notifications/preferences` preference contract. Beta does not replace Notification Center or write notification preferences directly.
