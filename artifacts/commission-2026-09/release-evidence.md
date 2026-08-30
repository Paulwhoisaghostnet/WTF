# WTF commission release evidence

Candidate commit: not cut  
Live commit: `be912715` at baseline capture  
Status: implementation in progress

| Journey | Status | Actor/environment | Automated proof | Durable result | Visual/trace evidence | Defect or blocker |
| --- | --- | --- | --- | --- | --- | --- |
| J-01 First-run wayfinding | PASS — LOCAL CANDIDATE | Fresh contestant + stale-session actor/local harness | shared task-map and Start Menu tests; `auth-session.spec.mjs` 2/2 | welcome completion persisted; `auth.welcome.completed` mirrored | Playwright screenshot/trace retained only on failure | Production deploy verification pending |
| J-02 Community store contribution | PASS — LOCAL CANDIDATE | Trusted creator + operator/local harness | creator policy 2/2; Store browser 2/2 | hidden submitted row; attributed review status/note; approval controls visibility | Playwright screenshot/trace retained only on failure | Real DB actor retest pending |
| J-03 Store purchase | PASS — HARNESS / LIVE PROOF PENDING | Approved creator item + buyer/local harness | approved listing enters EXP cart and completes checkout | owned inventory granted; intent/completion events emitted | Playwright screenshot/trace retained only on failure | Mainnet WTF path remains governed by existing wallet/contract proof; actor DB retest pending |
| J-04 Arcade creation | PASS — REAL DB LOCAL CANDIDATE | Trusted creator/local production server + PostgreSQL | attribution/stats policy 4/4; focused live puppet 1/1 | project, ZIP build/checksum/history, published project status, Arcade game/version linkage, derived creator/Game Studio counts | Playwright trace retained only on failure | Production deploy verification pending |
| J-05 Arcade participation | PASS — LOCAL CANDIDATE | Public catalog/detail + trusted creator/local production server | public catalog/detail finds unique submitted slug with creator and Game Studio source label; existing all-catalog session/score proof retained | active public Arcade row and version metadata persisted | Playwright trace retained only on failure | Production app enablement and post-deploy public smoke pending |
| J-06 Casino creation | PASS — REAL DB LOCAL CANDIDATE | Trusted creator + operator/local production server + PostgreSQL | outcome policy 2/2; browser creator/review proof 1/1; focused live actor proof 1/1 | submitted table hidden; creator status retained; self-approval blocked; operator review attribution/note persisted; approved creator table published | Playwright trace retained only on failure | Production deploy verification pending |
| J-07 Casino participation | PASS — REAL DB LOCAL CANDIDATE | Member with app pass + active membership/local production server | built-in API and community practice live proofs 2/2 | practice result and play count persisted; SystemEvent records `practiceOnly=true`, null wager, and null reward | Playwright trace retained only on failure | Real-value wagering intentionally remains fail-closed under `WTF-BB-138`; production deploy verification pending |
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
