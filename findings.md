# WTFOS Beta Findings

Date: 2026-06-24

## P1 Onboarding

The beta first screen has been corrected from audit-board density toward a human-facing product home. It now leads with a distinctive dark visual hero, a clear "playable Tezos world" promise, a dark mission deck with an icon-led role deck, a visible EXP level/passport/questline card, one selected next move, a five-step quest-stage route ribbon, proof and return routes, live-signal counts, a non-button world-pulse strip, and six compact launch actions for questing, people, collecting, creating, tomorrow catch-up, and The Count admin review before exposing the deeper audit boards.

The beta home now adds a first-screen Play/People/Return loop inside the hero and a playable desk before the long-form material. The hero loop gives users an immediate action path before scrolling, the world pulse proves other people/objects/return hooks exist without creating another row of start buttons, and the desk gives the selected user one current quest, proof route, return route, EXP progress, five world lanes for quest/people/discovery/tomorrow/Count, visible 60-second answers, and a deliberate Research Deck opener. This makes the default experience feel like a product surface instead of a Wikipedia-style evidence page.

The beta home now demotes the simulated 5/5 A+ design-critic gate and deeper audit boards into the collapsible Research Deck. This keeps critique and answer evidence available without pretending real company employees reviewed the product or turning the first screen back into a report.

The beta first viewport answers what WTFOS is, what users can do, what to do first, what to do next, and why to return tomorrow. The next improvement was not more explanation; it was visible proof of people and activity.

The puppet retest snapshots now make the improvement claim inspectable on `/beta`: all six persistent agents compare production-baseline timings against beta timings for the six required checkpoints, with all 36 beta checkpoints under 60 seconds in the current beta model. This keeps the loop honest by showing where friction remains instead of hiding behind a single success statement.

The Puppet Memory Ledger now keeps each persistent puppet's task, success condition, six checks, confusion, hesitation, abandonment risk, delight, unexpected discovery, remaining friction, and next route in one visible surface. That makes the beta loop easier to run because the next improvement can be chosen from observed puppet memory instead of scattered notes.

The First-Minute Wayfinder now sits inside the Research Deck rather than interrupting the first product pass. It still maps eight common questions to existing sections, selected puppet paths, route-owned destinations, and atlas filters without creating a new assistant, changing rewards, or bypassing gates.

The Beta Section Compass now stays in the same Research Deck so the expanded shell is available for admins and puppet review without becoming the default human experience. It maps fourteen major beta boards to user questions, audience, stage, access boundary, use-when guidance, proof rationale, and next move while changing only beta-local hash/scroll state.

The Unlock Passport now gives each puppet one compact progression card before the deeper questline boards. It answers "what can I see, what should I do next, what proof matters, what can unlock, and what stays locked?" without asking the user to stitch Daily Return, Questlines, Governance, and The Count workbench together.

## P2 Navigation

Route bridges now connect intent to existing routes: what changed, people are active, activity is live, I found art, I want to make, I made something, I earned progress, and I need admin control. Discovery trails now convert those route bridges into five manageable sequences for collectors, creators, builders, community members, and The Count, with live proof snippets embedded inside each trail. The selected-puppet Journey Command Center now compresses the next path into five route-owned steps: orient, act, prove, return, and Count review. Every non-public trail step now explains what the sign-in, role, or admin gate protects before the user opens the existing gated route, and every trail now separates quiet data, protected data, unavailable providers, and admin-only data so users do not treat every missing signal as failure.

The Wayfinder improves this navigation layer by jumping directly to Now Signals, Public Proof, Puppet Paths, the App Visibility Atlas, or The Count's admin runbook. Creator and Count actions also apply the relevant persona/stage/tier filters so the user lands in the right context instead of scrolling through every beta board.

The Section Compass improves the next navigation layer by showing where the deeper beta boards live before users commit to scrolling. People Discovery, Attention Triage, Daily Return, Passports, Questlines, Governance, Relationships, Route Groups, Trails, Puppet Paths, Count, and Atlas all become explicit stops with a single jump button.

The App Relationship Navigator now makes the app-to-app handoff explicit. It covers first safe win, collector context, creator publishing, builder output, curator signal, community presence, economy spend, and Count liveops chains, with each card showing what comes before, what the sequence consumes, what it feeds into, what comes after, and what The Count watches.

The Route Group Guide now resolves the remaining app-name overlap before the full atlas. First win, collector economy, creator pipeline, builder output, curator signal, community comms, and Count liveops each get a plain-language cluster name, use-first guidance, use-next guidance, proof criteria, quiet rule, Count-watch note, route buttons, and an atlas-filter action.

## P3 Visibility

The visibility radar covers all requested signal types: active users, new users, creators, collectors, builders, curators, new art, new collections, new projects, new activity, new sales, new mints, community events, collaboration opportunities, interesting wallets, and trending content. The beta shell now also summarizes twelve existing public now-signal sources before the agent loop, including WTF LIVE presence, upcoming public events, WTF TV channels, public trade-board objects, and public XP activity, then repeats the relevant proof inside the trail where it changes the user's next step. The new Public Proof Board composes existing public object, creator-channel, play, and builder-output reads into four live-or-quiet cards, so a user can understand where Gallery, TV, Arcade, and Console fit without assuming quiet data is a broken app. Beta intentionally uses `/api/users/:username/activity` for profile proof and avoids auto-calling `/api/users/:username`, which records profile views.

The Creator Project Proof Ladder now extends Public Proof for the creator path. It walks through Studio drafts, Broot asset prep, Macaroni packaging, IPFS durable media, TV media channels, Console output, and Skywire broadcasts, while labeling each step as visible, inspect-in-owner-app, or role-gated proof. This gives creators a dependency sequence without beta reading private draft state, granting roles, pinning media, packaging drops, or publishing.

The People Discovery Board now turns those signals into human roles: active users, new users, creators, collectors, builders, curators, collaborators, and interesting wallets. Each card answers who to look at, why the user should care, what proof exists, what to do next, and what route stays useful when the signal is quiet.

The People Proof Gap Matrix now makes that social layer auditable. Active-user, newcomer, creator, collector, builder, curator, collaborator, and wallet proof are each marked direct, routed, or weak, with current weakness, next beta move, quiet fallback, and no-write boundary copy before the user opens the existing proof route.

The new Attention Triage Board turns visibility into action. It groups first safe action, people moving now, collector heat, creator recovery, play/builder output, tomorrow catch-up, and Count hot queues into seven cards that show the linked signals, the existing owner route, the quiet fallback, and The Count/admin manageability note. This gives users a clearer "what matters now?" answer without creating notifications, writing preferences, or bypassing signed-in/admin gates.

## P4 App Discovery

The App Visibility Atlas still classifies every desktop app and creation tool. It now filters the full catalog by search, visibility tier, user stage, and puppet path, with a reversible empty state that reminds reviewers to explain, group, route, and surface before hiding apps. The added route bridges and discovery trails reduce dependence on raw app names, and the beta catalog now includes the existing authenticated On Chain Market and Trade Boards routes so market discovery is not a hidden jump.

The relationship navigator reduces the remaining app-discovery gap by showing why a user should open the next tool after a success. It does this without changing any app purpose: route buttons still point to the same WTFOS surfaces and respect public, signed-in, role, and admin access.

The route-group guide reduces the "are these duplicate apps?" gap by grouping similar routes before atlas browsing. It keeps the app policy intact: explain and group first, then route to the existing owner surface; no app is hidden or relabeled by this pass.

## P5 Admin Manageability

The Count remains the admin puppet. EXP can signal readiness, but admin authority stays explicit and permissioned. The beta shell now adds six Count command cards for first-quest triage, challenge arcs, reward economy tuning, role/permission review, market management, and abuse-loop audits. It also adds six strict-admin Count summary cards that read users, role-access surfaces, platform stats, unpaid reward rows, market admin items/sales, and challenge automation definitions only when the existing admin APIs allow the session.

The new Unlock Questline Board gives The Count a clearer liveops view of the same game loop: each user path names the side quest, challenge, reward/EXP hook, role or permission boundary, admin surface, review action, and abuse guard before linking to existing owner routes. This makes unlock management visible without adding a new admin authority path.

The Unlock Governance Matrix now converts those questlines into an admin decision contract. For every puppet path it names the proof The Count should inspect, how EXP should be interpreted, which reward or market sink is affected, where the role/permission boundary sits, what decision The Count owns, and which anti-farm controls need to be visible before scaling the loop.

The Unlock Passport is the user-readable version of that admin decision contract. It keeps The Count's review visible on every path while making the player's next safe action and locked boundaries understandable before they open the deeper admin/governance surfaces.

The Count Admin Workbench now turns that contract into eight concrete operator jobs: triage user need, create side quest, create challenge arc, configure reward, review role or app gate, manage market sink, audit automation, and review visibility. Each job names the existing admin route, player route, source of truth, setup checklist, decision gate, proof, risk control, and success signal without writing admin state from beta.

The Count Liveops Recipe Board now turns those jobs into six rollout blueprints for starter witness, creator publish, collector market, builder surface, curator signal, and community return loops. Each recipe tells The Count how to interpret EXP, which side quest and challenge shape the path, where reward and role/permission boundaries sit, which market or notification effect is allowed, and which six existing route stages carry the work without beta writing admin state.

The Journey Command Center gives The Count a per-puppet review shortcut without creating a new admin tool. Each selected puppet path ends in an admin-gated Count review step, while the user-facing steps remain public or session routes owned by existing apps.

## P7 Communication

The beta shell now includes a Communication Map that explains W Feed, WIM, WTF LIVE, Digest, Mail, and Skywire as one chain: public proof, shared feed, direct conversation, live gathering, recap, slower inbox, and external broadcast. This reduces social-surface ambiguity without replacing any existing app navigation or auth gate.

## P8 Notifications

The Social Pulse is now grouped by return-loop value instead of appearing as a flat event list. Users can scan social attention, progress and unlocks, live and scheduled moments, creator recovery, collector and market motion, and Count admin attention, then open the existing route that owns the event without any notification delivery or preference logic changing.

The beta Notification Control Map now explains the user-control path for each loop: act in the owning app, tune delivery in System Settings at `/settings`, catch up in Digest at `/digest`, and preserve `/api/notifications/preferences` as the existing preference contract. This reduces notification confusion without creating an assistant or a second notification settings layer.

The Attention Triage Board now sits between raw signals and notification groups. It explains which proof is live, which proof is protected or quiet, and which route should own the next action, so notifications become one input to a decision rather than the only recovery surface.

## P9 Retention

The beta Daily Return Board now turns "why return tomorrow?" into six concrete existing-route choices: check what changed, complete one quest, see people moving, find one object, move one project forward, or review one liveops queue as The Count. Each card ties the action to EXP, roles, permissions, quests, rewards, visible proof, and Count manageability without adding a new loop engine.

The Unlock Passport gives each daily return loop a progression memory: what changed today can become proof tomorrow, but role grants, market pressure, admin authority, wallet actions, and contract decisions remain locked until the existing owner surfaces prove readiness.
