# Guinea Pig Raceway Plan

Status: mocked-playable, fail-closed for live value transfer.

Guinea Pig Raceway is the Casino's live 3D race table for WTF-denominated wagers. The current shipped module exposes `/casino/guinea-pig-raceway`, Casino-gated mock APIs, deterministic race cards, GLB racer assets, a lightweight Three.js table renderer, mocked WTF betting/effect actions, and replay metadata. Players buy into the Casino through the app pass and membership card, then eventually place paced bets on visible racer cards before the betting window closes. The race enters a short intro phase so late Tezos operations can resolve, then the race runs live, paid effects can be injected under strict caps, results settle with a house take, and replay angles roll while the next race book opens.

## Core Loop

1. Race card opens with track, field, racer stats, current conditions, global variables, odds, and bet window close time.
2. Bets are accepted only during `betting_open`.
3. Betting enters `betting_lockout` for final chain resolution and no new wager intents are accepted.
4. `intro_marks` runs for about 30 seconds with 3D racers walking to lanes, idle loops, lane camera sweeps, and tote-board finalization.
5. `racing` begins. Users may buy capped effects/cheats, but every effect is clamped, cooldown-bound, paid, auditable, and too small to make the race deterministic.
6. `results_replay` announces winner, settles payouts, records replay manifests, and starts multi-angle playback while the next race opens.

## Product Guarantees

- Strong stats help, but never decide the race alone.
- Underdogs always retain a live win floor.
- No racer can exceed the max win probability cap.
- Track conditions, random effects, and user effects shift odds within bounded ranges.
- Bets must be placed before the lockout window.
- Effects can only be bought during the race and never after a settlement-relevant cutoff.
- The house takes a small configured slice, default 5%.
- Replays must be immutable enough to audit what users saw and what contract state settled.

## Subdomains

| Subdomain | Responsibility | Primary handles |
| --- | --- | --- |
| Race scheduler | Builds race cadence, phase clock, next-race handoff, and lockout transitions. | `guinea_pig_raceway.race_card.viewed`, `guinea_pig_raceway.intro.started`, `guinea_pig_raceway.race.started` |
| Racer stable | Owns racer stats, model variants, animation sets, scouting reports, retirements, and visible form history. | `guinea_pig_raceway.race_card.viewed` |
| Track director | Selects one of five track layouts, lane counts, surface metadata, camera rails, and track-specific stat biases. | `guinea_pig_raceway.rules.viewed` |
| Conditions engine | Generates race conditions and global variables, clamps their influence, and exposes player-readable summaries. | `guinea_pig_raceway.race_card.viewed` |
| Odds and underdog model | Converts stats plus bounded modifiers into win probability bands with floors and caps. | `guinea_pig_raceway.race_card.viewed` |
| Wager book | Accepts, verifies, locks, rejects, and audits bet intents. | `guinea_pig_raceway.bet_intent_created`, `guinea_pig_raceway.bet_locked`, `guinea_pig_raceway.bet_rejected` |
| Intro marks | Runs the 30-second finality buffer with racer animations, final tote board, and signer settlement preparation. | `guinea_pig_raceway.intro.started` |
| Live race renderer | Renders live 3D race positions, camera cuts, animation state, effect VFX, and finish-line timing. | `guinea_pig_raceway.race.started` |
| Effect market | Sells snack tosses, distractions, chants, and other capped interventions with wallet/racer cooldowns. | `guinea_pig_raceway.effect_intent_created`, `guinea_pig_raceway.effect_rejected` |
| Randomness beacon | Commits and reveals entropy after betting closes so outcomes cannot be known during the book. | `guinea_pig_raceway.race.settled` |
| Settlement verifier | Applies winner, house take, no-winner carryover, payout dust, and replay hash checks. | `guinea_pig_raceway.race.settled`, `guinea_pig_raceway.wager.rejected` |
| Replay archive | Stores replay manifest hashes, camera angle manifests, keyframes, effect timeline, and winning frame proof. | `guinea_pig_raceway.replay.viewed` |
| LiveOps risk desk | Monitors odds anomalies, effect spam, late-bet attempts, stuck phases, replay drift, and settlement failures. | `guinea_pig_raceway.bet_rejected`, `guinea_pig_raceway.effect_rejected` |

## Raceway Rule Pack

Current rule module: `server/features/casino/games/guinea-pig-raceway/rules.ts`

- Five tracks:
  - Cloverleaf Classic
  - Tunnel Turnpike
  - Snack Bowl Speedway
  - Hay Bale Chicane
  - Moonlight Boardwalk
- Default stable:
  - Miso Missile
  - Pickle Jet
  - Button Biscuit
  - Waffle Thunder
  - Nori Nova
  - Hazel Havoc
  - Mochi Moon
  - Kimchi Comet
- Visible stats:
  - speed
  - stamina
  - cornering
  - focus
  - courage
- Phase timings:
  - betting open: 90 seconds
  - betting lockout: 20 seconds
  - intro marks: 30 seconds
  - race: 75 seconds
  - replay: 60 seconds
- Replay camera angles:
  - broadcast follow
  - finish line
  - lane low
  - overhead tactical
  - winner closeup

## 3D Model Requirements

- Format: GLB.
- Rig: lightweight quadruped rig.
- Animations:
  - idle
  - take marks
  - sprint
  - stumble
  - nibble
  - cheer
  - victory
  - loss
- Per-racer target:
  - 8,000 triangles or fewer.
  - 1024px textures or smaller.
  - close, mid, and far LODs.
- Each model variant needs coat/color differences that are visible at race camera distance.
- The renderer should run the primary scene full-bleed inside the Casino table view, with UI overlays constrained to tote board, race clock, bet slip, and replay controls.

Current generated asset pack:

- Generator: `scripts/generate-guinea-pig-raceway-assets.ts`
- Manifest: `public/games/casino/guinea-pig-raceway/assets/manifest.json`
- Preview: `public/games/casino/guinea-pig-raceway/assets/preview.html`
- Racer GLBs: `public/games/casino/guinea-pig-raceway/assets/models/racers/*.glb`
- Racer thumbnails: `public/games/casino/guinea-pig-raceway/assets/thumbnails/*.svg`
- Track layouts: `public/games/casino/guinea-pig-raceway/assets/tracks/*.json`

The first pack is procedural and runtime-ready rather than final art direction. Each racer has a distinct coat palette, stable node names, personality metadata, unique idle loop description, winner/loser mood text, and eight animation clips. Future art upgrades should preserve the manifest shape and rig node names so renderer and tests do not drift.

## Contract Shape

The dedicated raceway contract should not ship until the Casino membership and app-pass gates are proven in actor-backed E2E.

Required entrypoints:

- `open_race`
- `place_bet`
- `lock_betting`
- `resolve_bet`
- `inject_effect`
- `publish_randomness_commitment`
- `reveal_randomness_seed`
- `settle_race`
- `claim_payout`
- `record_replay_manifest`

Required storage:

- race id and phase
- race card hash
- selected track id
- condition ids and global variable hash
- racer ids and visible stat hash
- bet ledger by wallet/racer/stake
- effect ledger by wallet/racer/effect/time/cost
- lockout start and close times
- randomness commitment and reveal
- winner id
- house take
- carryover balance
- payout ledger
- replay manifest hash
- settlement status

## Fairness Model

The fair outcome flow should use commit/reveal or a trusted randomness beacon. Betting must close before final entropy is revealed.

The odds model can be deterministic for audit after all inputs are known, but the race result must not be determined by stats alone. The model must enforce:

- per-racer win floor
- max single-racer win cap
- clamped track/condition swing
- clamped random effect swing
- clamped user-injected effect swing
- per-wallet and per-racer effect caps
- effect cooldowns
- no post-lockout bet acceptance
- no post-race effect acceptance

## Payout Model

Default house take: 5%.

Settlement:

1. Sum all accepted bets.
2. Move house take to Casino accounting.
3. Pay winning-racer bettors pro rata from the winner pool.
4. Assign payout dust deterministically.
5. If no one backed the winner, carry the winner pool into a configured jackpot/carryover bucket.
6. Persist audit events for house take, payout rows, rejected bets, rejected effects, and replay manifest.

## Test Matrix

Implemented skeleton tests:

- phase windows and bet/effect gates
- five track identities
- visible stable stats and model variants
- underdog floor and favorite cap
- track/effect/random modifier clamps
- paid effect costs, caps, and cooldowns
- house-take split and payout dust
- no-winner carryover
- race uniqueness profile drift
- generated asset manifest, racer GLBs, rig node names, animation clips, personality metadata, and track layout files

Required before enabling wagering:

- SmartPy or contract-level unit tests for every entrypoint.
- Wallet-backed bet and effect flows with exact sender/amount/ref checks.
- Actor-backed puppet tests for app pass, active membership, accepted bet, late bet rejection, accepted effect, spammed effect rejection, settlement, claim, and replay viewing.
- Browser 3D tests proving the race scene renders nonblank on desktop/mobile, animations play, and camera replay angles work.
- Abuse tests for odds manipulation, late bet replay, duplicate operation hash, wrong wallet, wrong token amount, stale race id, replay manifest tampering, and settlement double-claim.

## Release Gate

Do not flip `wageringEnabled` until:

- compliance gate exists
- Casino app pass and membership gate are actor-tested
- raceway contract is deployed and verified
- randomness path is audited
- wallet preflight blocks wrong network/account
- bet and effect operations are wallet-backed, not manual op-hash claims
- house accounting has durable ledger rows
- replay archive stores immutable manifests
- live 3D renderer has Playwright screenshot/canvas checks
- inventory, puppets, and contract tests pass
