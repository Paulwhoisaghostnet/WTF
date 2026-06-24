# WTFOS Beta Visibility

Date: 2026-06-24

## Visibility Score

The beta source calculates visibility from 16 signals. Direct signals score 2, routed signals score 1, weak signals score 0.

Current beta score: 24/32, 75%.

## Direct Signals

- active users
- creators
- collectors
- builders
- new art
- new activity
- community events
- collaboration opportunities

## Routed Signals

- new users
- curators
- new collections
- new projects
- new sales
- new mints
- interesting wallets
- trending content

## Next Highest Impact

Implemented first pass: `/beta` now includes read-only now signals from existing public routes for WTF holders, EXP leaders, reward earners, marketplace listings, WTF LIVE room presence, upcoming calendar events, WTF TV channels, arcade discovery, recent arcade play, and console discovery. Signed-in-only surfaces are shown as protected return loops instead of being called anonymously.

Implemented relationship pass: `/beta` now turns now signals into discovery trails for collectors, creators, builders, community members, and The Count. This does not raise the raw visibility score by itself, but it improves time-to-next-step by showing which existing route should follow each signal.

Implemented public proof pass: `/beta` now adds public trade-board object signals and public profile XP activity signals. The activity proof uses the no-auth child endpoint `/api/users/:username/activity`; beta does not auto-call `/api/users/:username` because that route records profile view events. Public now-signal probes also use a beta-local read-only fetch helper so unavailable public signals do not create client error-log writes.

Implemented communication-map pass: `/beta` now explains W Feed, WIM, WTF LIVE, Digest, Mail, and Skywire as a social chain with before/after/return context. This improves people and activity visibility without creating a new assistant or replacing navigation.

Implemented trail-proof/liveops pass: `/beta` now embeds live proof snippets inside each discovery trail, so collector, creator, builder, community, and The Count paths show the relevant current signal before the user opens a deeper app. The Count also has six liveops command cards that name the trigger, owning surface, admin action, player outcome, audit proof, and risk control for admin-managed discovery loops.

Implemented protected-step/notification pass: every non-public discovery-trail step now explains what the sign-in, role, or admin gate protects before sending the user to login or the gated route. The Social Pulse now groups return-loop events into social attention, progress and unlocks, live/scheduled moments, creator recovery, collector/market motion, and Count/admin attention.

Implemented trail-state pass: every discovery trail now has a state readout for quiet data, protected data, unavailable providers, and admin-only data. This keeps quiet public signals, signed-in work, provider failures, and strict-admin authority from feeling like the same kind of dead end.

Implemented Count admin-summary pass: `/beta` now renders six Count summary cards for user needs, role gates, quest/challenge load, reward settlement, market operations, and automation definitions. The cards stay locked for anonymous/non-admin sessions and become live only through existing strict-admin APIs.

Implemented public proof-board pass: `/beta` now composes existing public now-signal reads into four first-minute proof cards: Fresh object, Creator channel, Playable project, and Builder output. Live cards show the returned public object or channel; quiet cards explain where Arcade or Console proof will appear when existing data returns. This improves gallery and creator/project discovery without adding endpoints, writing activity, or bypassing route gates.

Implemented notification-control pass: `/beta` now explains each notification loop through the existing action route, System Settings `/settings`, Digest `/digest`, and `/api/notifications/preferences`. This improves return-loop agency without adding endpoints, writing preferences, or bypassing Notification Center.

Implemented puppet-retest pass: `/beta` now shows before/after timing snapshots for all six persistent agents across all six required discovery checkpoints. This makes visibility improvements accountable to time-to-understand, time-to-first-success, and next-step discovery instead of only reporting qualitative confidence.

Implemented daily-return pass: `/beta` now converts six return loops into route-owned cards for changes, quests, people, objects, projects, and Count/admin review. This improves retention visibility by showing what to do today, why to return tomorrow, what proof exists, and where the existing app or admin surface owns the action.

Implemented unlock-passport pass: `/beta` now gives each user puppet plus The Count a compact progression passport for visible-now proof, next safe action, proof needed, unlocks next, locked boundaries, Count review, and return-tomorrow value. This does not change the raw visibility score, but it reduces progression ambiguity before users enter the deeper questline and governance boards.

Implemented unlock-questline pass: `/beta` now renders seven progression paths that connect side quests, challenges, EXP, rewards, roles, permissions, Count review, and abuse guards to existing route stages. This makes the unlock game visible without adding a new progression engine.

Implemented attention-triage pass: `/beta` now turns public, protected, and admin-gated signals into seven route-owned next actions: first safe action, people moving now, collector heat, creator recovery, play/builder output, tomorrow catch-up, and Count hot queue. This does not change the raw visibility score, but it improves actionability by showing which signal is live, which signal is protected or quiet, and which existing WTFOS route owns the next move.

Implemented atlas-filter pass: `/beta` now filters the full App Visibility Atlas by search, visibility tier, user stage, and puppet path. This does not alter app behavior or raw signal scoring, but it makes app discoverability and hiding decisions inspectable for users, puppets, and The Count before any route is demoted.

Implemented journey-command pass: `/beta` now turns the selected puppet path into five existing route-owned steps for proof, action, proving, return, and Count review. This does not raise the raw visibility score, but it improves visibility-to-action by putting the most relevant proof and next route in one compact command stack.

Implemented first-minute Wayfinder pass: `/beta` now puts eight arrival questions directly after the hero and jumps users to current people/activity proof, public object/project proof, selected puppet paths, the App Visibility Atlas, or The Count runbook. This does not raise the raw visibility score, but it reduces the time between seeing a visibility signal and finding the right existing route.

Implemented unlock-governance pass: `/beta` now maps every puppet path to evidence, EXP signal, reward or market sink, role boundary, Count decision, and anti-farm guard. This does not raise the raw visibility score, but it makes visibility safer to act on because users and admins can tell when proof is only review evidence versus a real permission or reward change.

Implemented app-relationship-navigator pass: `/beta` now maps first safe win, collector, creator, builder, curator, community, economy, and Count liveops chains with comes-before, consumes, feeds-into, comes-after, Count-watch, and route-step handoffs. This does not raise the raw visibility score, but it improves visibility-to-next-step by explaining why each existing tool exists and where its output should go.

Implemented Count-admin-workbench pass: `/beta` now maps eight admin jobs to existing admin routes, player routes, evidence, checklists, decision gates, risk controls, and success signals. This does not raise raw public visibility, but it improves admin-managed visibility because The Count can decide what to create, reward, gate, surface, audit, or keep quiet without inventing new admin logic.

Implemented Count-liveops-recipe pass: `/beta` now maps six rollout recipes to existing EXP, side quest, challenge, reward, role, market, notification, and app-gate surfaces. This does not raise raw public visibility, but it improves admin-managed visibility by showing exactly which proof, risk, route stage, and no-write boundary The Count should inspect before surfacing an unlock loop.

Implemented puppet-memory-ledger pass: `/beta` now shows six persistent puppet memory cards and 36 checkpoint pills so confusion, hesitation, abandonment risk, delight, unexpected discovery, remaining friction, and next route are visible before the next UI/UX iteration. This does not raise the raw visibility score, but it improves loop visibility because reviewers can see why a change should be kept or where it should evolve.

Implemented people-discovery pass: `/beta` now groups existing now signals into eight human roles: active users, new users, creators, collectors, builders, curators, collaborators, and interesting wallets. This does not change raw signal scoring, but it improves social visibility by showing who the signal represents, why the user should care, what to do next, and which route remains useful when public data is quiet.

Implemented people-proof-gap pass: `/beta` now adds a People Proof Gap Matrix under People Discovery. It classifies each human role as direct, routed, or weak proof, names the current proof and weakness, gives the next beta UI move, and repeats the no-write boundary before users open existing routes through their current gates.

Implemented route-group guide pass: `/beta` now names seven overlapping route clusters before the full atlas: first win, collector economy, creator pipeline, builder output, curator signal, community comms, and Count liveops. This does not change raw public visibility scoring, but it improves visibility-to-route comprehension by explaining use-first, use-next, proof, quiet-rule, Count-watch, and existing route buttons for each cluster.

Implemented section-compass pass: `/beta` now maps fourteen major beta boards to question-led section jumps after the Wayfinder. This does not change raw public visibility scoring, but it improves visibility-to-board comprehension by helping users find people proof, activity proof, return loops, governance, Count liveops, and atlas review without relying on long-scroll discovery.

Next highest impact: use Wayfinder, Section Compass jumps, atlas filter results, relationship chains, governance rows, and puppet retests together to identify which remaining route groups need stronger explanation before expanding gallery and creator/project snippets from existing public data.
