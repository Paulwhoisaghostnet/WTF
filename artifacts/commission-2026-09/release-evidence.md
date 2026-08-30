# WTF commission release evidence

Candidate commit: SELF
Live commit: `be912715` at baseline capture
Status: ready for the final candidate gate, then the reserved focused test week

| Journey | Status | Actor/environment | Automated proof | Durable result | Visual/trace evidence | Defect or blocker |
| --- | --- | --- | --- | --- | --- | --- |
| J-01 First-run wayfinding | PASS — LOCAL CANDIDATE | Fresh contestant and stale-session actor / Classic harness | `auth-session.spec.mjs`; shared task-map tests | Welcome completion persists and `auth.welcome.completed` is retained | `screenshots/J-01-{desktop,mobile}.png` | — |
| J-02 Community store contribution | PASS — LOCAL CANDIDATE | Trusted creator and operator / browser plus PostgreSQL actor | Store creator policy, browser story, live puppets | Hidden submitted item, attributed review, approved storefront item | `screenshots/J-02-{desktop,mobile}.png` | — |
| J-03 Store purchase | PASS — LOCAL CANDIDATE | Approved-item buyer / browser plus PostgreSQL actor | Store purchase browser story and live puppets | Authoritative checkout, inventory grant, intent/completion events | `screenshots/J-03-{desktop,mobile}.png` | — |
| J-04 Arcade creation | PASS — LOCAL CANDIDATE | Trusted creator and operator / production server plus PostgreSQL | Arcade policy, creator browser story, live puppets | Project, ZIP checksum/build history, review state, Arcade version link | `screenshots/J-04-{desktop,mobile}.png` | — |
| J-05 Arcade participation | PASS — LOCAL CANDIDATE | Member/player / public catalog plus live puppet | Arcade catalog, session, score, and report workflows | Public creator-attributed game, play session, visible score/result | `screenshots/J-05-{desktop,mobile}.png` | — |
| J-06 Casino creation | PASS — LOCAL CANDIDATE | Trusted creator and operator / PostgreSQL actor | Casino outcome policy, browser story, live puppets | Hidden submitted practice table, attributed moderation, approved floor entry | `screenshots/J-06-{desktop,mobile}.png` | — |
| J-07 Casino participation | PASS — LOCAL CANDIDATE | Eligible and ineligible members / PostgreSQL actor | Casino membership, built-in, and community practice live proofs | Practice result and play count persist with null wager and reward | `screenshots/J-07-{desktop,mobile}.png` | — |
| J-08 Calendar participation | PASS — LOCAL CANDIDATE | Member and operator / PostgreSQL actor | Calendar policy, browser story, live puppets | Going/reminder choice survives reload; clear removes durable plan | `screenshots/J-08-{desktop,mobile}.png` | — |
| J-09 Messaging | PASS — LOCAL CANDIDATE | Sender, recipient, outsider, and operator / PostgreSQL actor | Messages safety browser story and live puppets | Unread/read state, private report, disposition note, content-safe audit | `screenshots/J-09-{desktop,mobile}.png` | — |
| J-10 Artist creation and mint | PASS — SHADOWNET + LOCAL CANDIDATE | Linked-wallet creator and separate collector | Creation policies, Mint Manager actor proof, Spaghetti UI-LIVE proof | Owned-media receipt recovers operation `oomCgp54okowgvWTc8fD4AkbaVYnj2Kch6NtxmknWz4UQjXA3NL`, contract `KT1Ww8CpKRS5ffVd51vWNxJ6EBxEhCj7BhtN`, token `0` | `screenshots/J-10-{desktop,mobile}.png`; `../pasta-protocol-proof-runs/pasta-alpha-proof-20260829-commission/` | — |
| J-11 Operator moderation | PASS — LOCAL CANDIDATE | Strict admin and ordinary member / browser plus PostgreSQL | Operator queue browser and live actor proofs; full live puppets | Exact Store, Arcade, Casino, Calendar pending counts; member receives 403; each row opens its owning queue | `screenshots/J-11-{desktop,mobile}.png` | — |
| J-12 Production discoverability | READY FOR TEST — LOCAL CANDIDATE | Anonymous, member, creator, operator / Classic harness and app registry | Route/app policy, inventory coverage, live puppet roles | Migration `0119` idempotently enables and documents commissioned apps and seeds Help | `screenshots/J-12-{desktop,mobile}.png` | Production promotion and post-deploy smoke remain intentionally outside this candidate pass |

## Candidate evidence

- TypeScript and production build pass.
- Inventory coverage accepts 237 rows, 973 handles, 118 routes, 125 behavior assertions, 182 app-owned bindings, 16 workflows, and 73 admin surfaces.
- The production-shaped actor-backed suite passes 178/178 after applying migrations through `0123_media_mint_receipts.sql`.
- The first complete inventory attempt passed 698/699 and exposed a late-night fixture that placed its Calendar event in the next week; the corrected Calendar journey passes focused and the final clean 699-journey candidate rerun is the remaining freeze command.
- Focused release-harness and traffic-light policy tests pass 5/5.
- Desktop and mobile evidence capture passes 2/2 and produces 24 screenshots under `screenshots/`.
- The selected Spaghetti receipt SHA-256 is `526ab3c761c9d3149d3c0e7a69b1c58b4f0c4a07e4912dc1fa5ac68edbab3a2d`.

## Evidence rules

- A route load is skeleton evidence only.
- State-changing journeys require a user-visible result and an authoritative database, operation, indexer, or audit assertion.
- A mocked browser response cannot prove database migration or production registration state.
- A failed run remains in the history; a later successful rerun is recorded separately.
- No production deploy or mainnet chain write is authorized by this ledger.
