# WTF commission release evidence

Candidate commit: not cut  
Live commit: `be912715` at baseline capture  
Status: implementation in progress

| Journey | Status | Actor/environment | Automated proof | Durable result | Visual/trace evidence | Defect or blocker |
| --- | --- | --- | --- | --- | --- | --- |
| J-01 First-run wayfinding | PASS — LOCAL CANDIDATE | Fresh contestant + stale-session actor/local harness | shared task-map and Start Menu tests; `auth-session.spec.mjs` 2/2 | welcome completion persisted; `auth.welcome.completed` mirrored | Playwright screenshot/trace retained only on failure | Production deploy verification pending |
| J-02 Community store contribution | NOT RUN | — | — | — | — | WP-02 |
| J-03 Store purchase | NOT RUN | — | — | — | — | WP-02, `WTF-BB-182`, affected `WTF-BB-124/125` writes |
| J-04 Arcade creation | NOT RUN | — | — | — | — | WP-03; production has zero creator/Game Studio games |
| J-05 Arcade participation | NOT RUN | — | — | — | — | WP-03; production app disabled |
| J-06 Casino creation | NOT RUN | — | — | — | — | WP-04; no creator submission path |
| J-07 Casino participation | NOT RUN | — | — | — | — | WP-04; non-wagered acceptance, `WTF-BB-138` |
| J-08 Calendar participation | NOT RUN | — | — | — | — | WP-05 |
| J-09 Messaging | NOT RUN | — | — | — | — | WP-06 |
| J-10 Artist creation and mint | READY FOR BASELINE RETEST | Creator/local | `WTF-BB-617` focused proof | Owned Media + indexed receipt path | PixAlerce journey | Retained dirty-tree integration must be committed |
| J-11 Operator moderation | NOT RUN | — | — | — | — | WP-08 |
| J-12 Production discoverability | FIXED LOCALLY / PRODUCTION FAIL | Anonymous/member/local + production baseline | migration `0119`; catalog/start-menu tests; local DB read | commissioned local rows enabled, registered, and non-expiring; FAQ seeded | baseline API capture | Production deploy verification pending |

## Evidence rules

- A route load is skeleton evidence only.
- State-changing journeys require a user-visible result and an authoritative database, operation, indexer, or audit assertion.
- A mocked browser response cannot prove database migration or production registration state.
- A failed run remains in the history; a later successful rerun is appended with its own commit and timestamp.
- No chain write is authorized by this ledger. Shadownet or mainnet actions follow the owning workflow's explicit preflight and release authorization.
