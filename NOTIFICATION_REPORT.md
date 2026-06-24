# WTFOS Beta Notification Report

Date: 2026-06-24

Notify when the event creates curiosity, progress, retention, collaboration, or recovery. Notifications must point back to owner routes and never replace navigation.

The beta Social Pulse groups events by why the user should care:

| Group | Event | Value | Target route |
| --- | --- | --- | --- |
| Social attention | Reply, mention, follow, DM | Curiosity and collaboration | `/notifications` |
| Progress and unlocks | Side quest, challenge, EXP, or reward state changed | Progress and retention | `/side-quests` |
| Live and scheduled moments | Live room, stage, or scheduled event active soon | Presence and collaboration | `/live` |
| Creator recovery | Followed creator published, pinned, or promoted work | Discovery | `/gallery` |
| Collector and market motion | Token, listing, sale, or market signal changed | Collector urgency | `/rat-race` |
| Creator recovery | Draft, pin, domain, or publish job needs action | Recovery | `/studio` |
| Count admin attention | Quest, challenge, reward, role, or market operation needs review | Management | `/admin` for The Count only |

The Count should receive enough context to audit the event: user, trigger, completion state, reward action, and related admin tab.

The Count admin summary panel is now the daily pre-notification scan for these review events. It reads only existing admin-gated counts and then routes back to `/admin` for the actual work.

The Count Admin Workbench adds a visibility-review job for notification and communication surfacing. It asks whether a signal is public, protected, unavailable, or admin-only; points to `/admin`, `/notifications`, `/settings`, `/digest`, and communication routes; and keeps delivery and preference changes inside existing owner surfaces.

## Notification Control Map

The beta shell now adds a preference education layer without changing notification delivery. Each Social Pulse group has a matching control card that explains:

- where the user acts now: Notification Center, Side Quests, WTF LIVE, Studio, Rat Race, or Admin
- where the user tunes delivery: System Settings at `/settings`
- where the user catches up later: Digest at `/digest`
- which existing preference contract owns the saved state: `/api/notifications/preferences`
- what quiet data means before the user treats the loop as broken

This keeps notifications as routing and retention guidance. Beta does not read or write preferences directly and does not create a second notification system.

## Attention Triage Addendum

The beta shell now adds an Attention Triage Board above the daily-return layer. It treats notifications as one signal among public proof, protected social surfaces, market heat, creator/project recovery, scheduled events, and Count/admin queues.

The People Discovery Board now sits before that triage layer and answers which people are worth looking at before a notification exists: active users, new users, creators, collectors, builders, curators, collaborators, and interesting wallets. This reduces pressure on notifications to be the only social visibility surface and keeps notification delivery/preferences unchanged.

The Route Group Guide now clarifies which cluster owns a user's next return path before a notification exists. Community Comms separates feed, direct follow-up, live presence, calendar timing, digest catch-up, mail, notifications, and Skywire; Count Liveops separates admin review, quest criteria, challenge proof, reward impact, market sinks, policy, and user cockpit context. This keeps notifications as a signal, not the only navigation model.

The Count Liveops Recipe Board now treats notifications as one controlled effect inside a larger unlock recipe. Starter witness and community return recipes point to Notifications, Settings, and Digest only after side quest, challenge, reward, and anti-farm context is clear, so beta does not create a second notification system or use notifications as a substitute for route-owned progress.

The board maps seven attention questions to existing owner routes:

- first safe action -> `/side-quests`
- people moving now -> `/w`
- collector heat -> `/gallery`
- creator recovery -> `/studio`
- play or builder output -> `/arcade`
- tomorrow catch-up -> `/digest`
- Count hot queue -> `/admin`

Each card shows live/protected/quiet proof signals, a route-owned next action, a quiet fallback, and The Count/admin control note. Beta still does not create notifications, save preferences, send digests, settle rewards, grant roles, or bypass admin gates.

## Wayfinder Addendum

The First-Minute Wayfinder now exposes people-now, creator-runway, and Count-review prompts before the notification boards. These prompts route users toward existing proof and owner surfaces first, so notifications remain contextual signals rather than the only way to recover work or discover other users.

The Section Compass now exposes Attention Triage, Daily Return, People Discovery, Count runbook, and App Visibility Atlas as explicit beta board jumps after the Wayfinder. This keeps notifications as one recoverable signal family inside the larger discovery map instead of making Notification Center carry all orientation work.
