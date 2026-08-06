# WTFOS Beta Journeys

Date: 2026-06-24

## Persistent Agents

| Agent | First success | Next route |
| --- | --- | --- |
| New User | Understand WTFOS and start one safe quest. | `/side-quests` |
| Creator | Discover Studio and the publishing pipeline. | `/studio` |
| Collector | Move from art discovery to collection and market context. | `/gallery` |
| Curator | Turn discovery into nomination, share, or public proof. | `/gallery` |
| Builder | Connect Game Studio, Map Lab, Console, and Arcade. | `/game-studio` |
| Community | Find people, live activity, and communication surfaces. | `/w` |

## Journey Metrics

The beta page now displays the required journey measures for the selected agent:

- time to understand
- time to first success
- time to tool discovery
- time to people discovery
- time to activity discovery
- time to next step

## First-Minute Wayfinder

The beta page now adds eight first-minute prompts directly after the hero: safe first win, people now, object hunt, creator runway, builder output, choose my path, find a tool, and Count review. Each prompt jumps to an existing beta section, selects a puppet path or atlas filter when useful, and exposes the existing owner route plus access hint.

The Wayfinder is navigational only. It does not create quests, write notifications, grant roles, settle rewards, change market state, or bypass public/session/admin route gates.

## Section Compass

The beta page now adds a fourteen-stop Section Compass after the Wayfinder. It maps now signals, public proof, people discovery, attention triage, daily return, passports, questlines, governance, relationships, route groups, trails, puppet paths, Count runbook, and App Visibility Atlas to a question, audience, stage, access boundary, proof rationale, and next move.

The compass is page navigation only. It updates the `/beta` hash and scroll target so users can find the right board without opening apps, changing filters, writing state, creating an assistant, or bypassing existing gates.

## Retest Loop

Each agent attempts to understand WTFOS, find people, find activity, find a useful tool, perform a task, and discover the next step. Confusion, hesitation, dead ends, abandonment risk, success, delight, and unexpected discovery are stored in `client/src/features/beta/beta-agent-loop.ts`.

The beta page now renders puppet retest snapshots for all six persistent agents. Each snapshot compares the production app-name scan against the beta guided shell for time to understand, time to first success, time to tool discovery, time to people discovery, time to activity discovery, and time to next step. All 36 beta checkpoint timings remain under 60 seconds in the current model, and each card records the remaining friction to watch before the next loop.

## Puppet Memory Ledger

The beta page now renders a Puppet Memory Ledger beside the retest loop. Each persistent puppet has one card that keeps its first task, success condition, six pass/fail discovery checks, confusion, hesitation, dead-end note, abandonment risk, success, delight, unexpected discovery, remaining friction, next route, and saved-time evidence together.

The ledger makes the test users feel persistent without creating a required assistant or new automation layer. It is read-only beta evidence for deciding the next UI/UX improvement.

## Discovery Trails

The beta page now gives users five role-based trails before the deeper audit sections:

- Collector: Leaderboard -> Gallery -> Marketplace -> Rat Race -> WTFIAM.
- Creator: Studio -> Broot -> Macaroni -> IPFS Pinning -> Skywire.
- Builder: Game Studio -> Map Lab -> Console -> Arcade -> W.
- Community: Leaderboard -> Arcade -> W -> WTF LIVE -> Notifications.
- The Count: Leaderboard -> Side Quests -> Challenges -> WTFIAM -> Admin.

Each trail states the trigger, success condition, return-tomorrow reason, route access level, why each existing app comes next, the live proof snippets that make the path feel current, the state readout for quiet/protected/unavailable/admin-only data, and the protected-step explanation for every non-public route.

## Journey Command Center

The selected puppet path now includes a compact command center that stitches the scattered journey evidence into five existing route-owned steps:

- Orient: public or low-risk proof that WTFOS is active.
- Act: the first useful task for the selected puppet.
- Prove: the route that makes identity, collection, creation, project, curation, or community progress legible.
- Return: the route that explains why tomorrow matters.
- Count: a strict-admin review step that keeps unlocks, rewards, roles, and abuse review managed by The Count without granting authority through EXP.

This surface is navigational only. It does not create quests, write notifications, alter rewards, change roles, or bypass app gates.

## Public Proof Board

Before choosing a trail, a user now sees four compact proof cards:

- Fresh object: public trade-board or marketplace rows route the user toward Gallery.
- Creator channel: public WTF TV channel rows route the user toward TV and creator/media discovery.
- Playable project: public Arcade discovery or recent-score rows route the user toward Arcade.
- Builder output: public Console discovery rows route the user toward Console, Game Studio, and Map Lab context.

Quiet cards remain visible with explanation copy, which helps puppets distinguish "no current rows" from "this app has no purpose."

## People Discovery Board

After public proof, the beta page now shows eight people-discovery roles: active users, new users, creators, collectors, builders, curators, collaborators, and interesting wallets. Each card groups three existing now signals, names why that type of person matters, states the next action, and keeps a quiet fallback route visible.

This board answers "why should I care about other users?" without creating a social graph, auto-follow system, assistant, or new communication app. It simply routes existing proof toward W, LIVE, Leaderboards, Gallery, TV, Console, Calendar, and related WTFOS surfaces through their current gates.

## Attention Triage Board

The beta page now adds a decision layer between public proof and deeper journeys. Seven triage cards answer what matters now:

- First safe action: public EXP/reward proof plus protected Notifications route new users toward Side Quests.
- People moving now: profile activity, WTF LIVE room proof, and Calendar route community members toward W, LIVE, Calendar, or Digest.
- Collector heat check: trade-board objects, market listings, and Rat Race heat route collectors through Gallery before deeper market context.
- Creator recovery: TV channels, Console discovery, and Notifications route creators back to Studio and publishing steps.
- Play or inspect output: Arcade discovery, recent play, and Console discovery route builders toward playable or inspectable output.
- Tomorrow catch-up: Notifications, W Feed, and Calendar route return visits toward Digest and owning routes.
- Count hot queue: Notifications, EXP proof, and reward proof route The Count toward strict-admin review when operator attention is required.

Each card names the existing route, linked proof signals, quiet fallback, and Count/admin manageability note. It is navigational only; it does not create notifications, grant rewards, change roles, or write preferences.

## Daily Return Board

The beta page now surfaces six daily loops before the deeper trails:

- Check what changed: Notifications, Digest, Mission Control, and Settings.
- Complete one quest: Side Quests, Challenges, Leaderboards, and WTFIAM.
- See people moving: W Feed, WTF LIVE, WIM, and Skywire.
- Find one object: Gallery, Rat Race, portfolio, and Marketplace.
- Move one project forward: Studio, Broot, IPFS Pinning, and WTF Domains.
- Review one liveops queue: Admin, Challenges, Side Quests, and WTFIAM for The Count only.

Each card states the user question, the action to take today, the reason to return tomorrow, the existing progression hook, the visible proof signal, and what The Count controls when that loop needs admin management.

## Unlock Passport

The beta page now adds a compact passport between daily loops and questlines. New Tezos User, Collector, Creator, Builder, Curator, Community Member, and The Count each get one card that states:

- what is visible now
- the next safe action
- the proof needed
- what can unlock next
- what stays locked
- what The Count reviews
- why to return tomorrow

This is the user-facing companion to the governance matrix and Count Admin Workbench. It explains EXP, levels, roles, rewards, permissions, side quests, challenges, and market sinks without creating a new progression engine or granting authority from beta.

## Unlock Questline Board

The beta page now makes the unlock game explicit with seven questlines:

- First safe win: new users move from public proof to one setup side quest, profile proof, a starter challenge, and notifications.
- Collector path: Gallery proof leads to object-discovery side quests, portfolio, Rat Race, and WTFIAM.
- Creator runway: Studio, Broot, Macaroni, IPFS Pinning, and Skywire become one creator challenge arc.
- Builder proving ground: Game Studio, Map Lab, Console, Arcade, and W connect experiments to feedback.
- Curator signal chain: Gallery, curation side quests, CRP nomination, Skywire, and W turn taste into public proof.
- Community pulse: W, WTF LIVE, WIM, Calendar, and Digest make social return loops manageable.
- Count liveops review: Admin, Side Quests, Challenges, WTFIAM, and Admin again frame operator review without letting EXP grant authority.

Each questline names the side quest, challenge, reward/EXP hook, role or permission boundary, Count review, abuse guard, and five route stages. The board is explanatory and navigational only; it does not create quests, grant roles, settle rewards, or change permissions.

## Unlock Governance Matrix

The beta page now adds a governance matrix after the questline board. For New Tezos User, Collector, Creator, Builder, Curator, Community Member, and The Count, it names the evidence to inspect, how EXP should be interpreted, which reward or market sink is involved, which role or permission boundary applies, what decision The Count owns, and which anti-farm guard should be visible.

This surface is navigational and explanatory only. It does not create quests, grant roles, settle rewards, change market state, alter automation, or bypass admin gates.

## App Relationship Navigator

The beta page now adds eight relationship chains between governance and discovery trails:

- First safe win: Leaderboard -> Side Quests -> Profile -> Challenges -> Notifications.
- Collector context: Gallery -> portfolio -> Rat Race -> Marketplace -> Trade Boards -> WTFIAM.
- Creator publish: Studio -> Broot -> Macaroni -> IPFS Pinning -> WTF Domains -> Skywire.
- Builder output: Game Studio -> Map Lab -> Console -> Arcade -> W.
- Curator signal: Gallery -> Side Quests -> CRP Nominate -> Skywire -> W.
- Community presence: W -> WTF LIVE -> WIM -> Calendar -> Digest.
- Economy spend: Side Quests -> Leaderboard -> WTFIAM -> Marketplace -> Trade Boards -> Rat Race.
- Count liveops: Admin -> Side Quests -> Challenges -> WTFIAM -> Admin.

Each chain states what comes before, what the sequence consumes, what it feeds into, what comes after, and what The Count watches. The route buttons use existing WTFOS routes and keep their current public, signed-in, role, or admin gates.

## Route Group Guide

The beta page now adds seven route-group cards after the relationship navigator:

- First Win Group: Leaderboards, Side Quests, Profile, Challenges, and Notifications explain the low-risk first route.
- Collector Economy Group: Gallery, portfolio, Marketplace, Rat Race, Trade Boards, and WTFIAM separate inspection, ownership, heat, trade intent, and inventory.
- Creator Pipeline Group: Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, Skywire, and TV explain the publish runway.
- Builder Output Group: Game Studio, Map Lab, Console, Arcade, and W explain how projects become inspectable, playable, and discussable.
- Curator Signal Group: Gallery, Side Quests, CRP nomination, Skywire, W, TV, and Leaderboards explain how taste becomes public contribution.
- Community Comms Group: W, WIM, WTF LIVE, Calendar, Digest, Mail, Notifications, and Skywire explain the communication chain.
- Count Liveops Group: Admin, Side Quests, Challenges, WTFIAM, Marketplace, Settings, and Mission Control explain operator review without granting authority.

Each group states what to use first, what to use next, which proof matters, what quiet data means, and what The Count watches. The atlas-filter button changes only beta-local atlas filters.

## Trail State Readouts

Each trail now distinguishes four kinds of friction before the user opens a deeper app:

- Quiet data: the existing route is valid, but the current public signal has no rows yet.
- Protected data: the next step belongs to a signed-in or role-gated owner surface.
- Unavailable provider: a public data source failed and the user should keep the route path instead of assuming WTFOS is empty.
- Admin-only data: The Count can review strict-admin surfaces, but EXP and role readiness never grant operator power.

## Notification Return Loops

The beta Social Pulse now groups return-loop events into six journeys:

- Social attention: replies, mentions, follows, and DMs route to Notifications.
- Progress and unlocks: side quest, challenge, EXP, and reward changes route to Side Quests.
- Live and scheduled moments: rooms, stages, and upcoming events route to WTF LIVE.
- Creator recovery: drafts, pinning, domains, and publish jobs route to Studio.
- Collector and market motion: token, listing, sale, and market signals route to Rat Race.
- Count admin attention: quest, challenge, reward, role, and market operations route to the strict-admin suite.

The Notification Control Map adds the next question for each loop: where do I act, where do I tune it, and where do I catch up later? The answer stays inside existing WTFOS surfaces: the owning route for action, `/settings` for preferences, `/digest` for recap, and `/api/notifications/preferences` for saved preference state.

## The Count Admin Journey

The Count now has a beta Admin Workbench before the command deck. It maps eight recurring jobs to existing owner routes: triage user need, create side quest, create challenge arc, configure reward, review role or app gate, manage market sink, audit automation, and review visibility. Each card asks the management question, lists a three-step setup checklist, names the existing admin route and player route, and states the decision gate, proof to inspect, risk control, and success signal.

The Count now also has a Liveops Recipe Board after the workbench. It maps six rollout blueprints:

- Starter witness: a new user moves from public proof to a capped first quest, visible EXP, Mission Control, and Notifications.
- Creator publish: Studio, Broot, role-gated Macaroni, IPFS Pinning, WTFIAM, and Skywire become one reviewed publish path.
- Collector market: Gallery, Side Quests, portfolio, WTFIAM, Marketplace, and Rat Race separate object proof from market pressure.
- Builder surface: Game Studio, Map Lab, Console, Challenges, Admin, and W prove output before any app gate changes.
- Curator signal: Gallery, Side Quests, CRP nomination, WTFIAM, Admin, and W turn taste into reviewable public signal.
- Community return: W, Side Quests, WTF LIVE, Challenges, Settings, and Digest create a healthy return loop without notification spam.

Each recipe names EXP use, side quest, challenge, reward, role or permission boundary, market or notification effect, Count decision, anti-farm rule, player return reason, and the no-beta-write rule. Route-stage buttons open existing owner surfaces only.

The Count journey now has a liveops command deck on `/beta`:

- route a user to the first useful quest
- build a multi-step unlock challenge
- tune rewards and market sinks
- grant role or app access from proof
- manage in-app market availability
- audit a farmable loop before scaling it

Each command uses existing gated owner surfaces and names the trigger, admin action, player outcome, audit proof, and risk control.

The Count journey also has a strict-admin summary panel. Anonymous and non-admin users see locked cards; the admin puppet sees live counts for user needs, role gates, quest/challenge load, reward settlement, market operations, and automation definitions from existing admin endpoints only.
