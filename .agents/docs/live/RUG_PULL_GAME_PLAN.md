# Rug Pull: The Game Implementation Plan

Last reviewed: 2026-05-09

## Current Status

Rug Pull is registered as a mocked-playable WTF Casino table with deterministic
server-side rule math, a fail-closed mock XTZ service, a `/casino/rug-pull`
React95 table surface, and Casino-gated API handlers for join, delay, press,
witness, and witness-vote actions. Live wagering remains disabled until the
dedicated Tezos contract, verifier, compliance gate, and live actor tests exist.

## Product Contract

- Entry: active Casino member with the Casino app pass.
- Player join cost: 5 XTZ.
- Player join split: 4 XTZ current pot, 1 XTZ platform.
- Press cost: 5 XTZ.
- Press split: 4 XTZ next round seed, 1 XTZ platform.
- Witness cost: 0.25 XTZ.
- Witness split: 0.20 XTZ current pot, 0.05 XTZ platform.
- Base share speed: 1 share per second.
- Join lock: 45 seconds.
- Delay lock: 15 seconds, capped at 45 seconds from now.
- Panic mode: 30 seconds.
- Wagering status: mocked/fail-closed for live value transfer.

## Required Contract Shape

Working name: `WtfRugPullGame`.

Entrypoints:

- `join_round(round_ref)`: exact 5 XTZ, sends 1 XTZ to platform, credits 4 XTZ to current pot, assigns join order, locks button.
- `delay_button(round_id, delay_ref)`: active unpressed players only, exact escalating delay fee, full payment to current pot, cannot be same wallet as previous locker, caps lock at 45 seconds from now.
- `press_button(round_id, press_ref)`: exact 5 XTZ, first press detonates current round and starts Panic Mode; every press seeds next round with 4 XTZ and sends 1 XTZ to platform.
- `join_witness(round_id, witness_ref)`: exact 0.25 XTZ, sends 0.05 XTZ platform and 0.20 XTZ current pot.
- `vote_witness_modifier(round_id, vote)`: Panic Mode witness-only vote for `mercy`, `cruelty`, or `silence`.
- `settle_round(round_id)`: after Panic Mode, locks remaining shares, computes payouts, initializes next round from press order.

Storage:

- Global config: platform wallet, fee splits, timing constants, pause flag, admin.
- Active round id and round state.
- Round pot, next-round seed pot, started_at, panic_started_at, button_lock_until, last_lock_wallet.
- Player state: wallet, join_order, pressed_order, joined_at, locked_at, final_microshares, delay_count, active/pressed/autolocked status.
- Witness state: wallet, vote, joined_at.
- Settlement state: total_final_microshares, payout rows, settled_at, settlement_ref.

## Server and Indexer Needs

- Wallet preflight before every browser-originated contract call.
- Current mock endpoints: `/api/casino/rug-pull/state`, `/api/casino/rug-pull/join`, `/api/casino/rug-pull/delay`, `/api/casino/rug-pull/press`, `/api/casino/rug-pull/witness`, and `/api/casino/rug-pull/vote`.
- Future server intents for join, delay, press, witness join, witness vote, and settlement.
- TzKT verification for every op hash: sender linked wallet, target contract, entrypoint, exact fee, platform forward, pot accounting, and intent ref.
- Round projection worker that rebuilds active round state from contract storage/events.
- Reconciliation job that compares DB payout records against chain settlement.
- Live broadcast channel for countdowns, pressure, button lock, Panic Mode, witness vote state, and settlement.

## Abuse Controls

- Casino app pass plus active 30-day membership required before game actions.
- Wagering disabled until compliance policy is configured.
- Same wallet cannot cause two button locks in a row.
- Delay count and cost are per wallet per round.
- Button lock cannot exceed 45 seconds from current time.
- Panic vote is witness-only, one vote per witness wallet per round.
- Settlement must be idempotent and replay-resistant.
- Share math and dust distribution must be deterministic between contract, server, and tests.

## E2E and Test Matrix

- Pure rule tests for payment splits, share rates, pressure bands, delay locks, panic modifiers, and proportional payout dust.
- Contract tests for every entrypoint, wrong fee, wrong phase, wrong wallet, duplicate delay lock, vote eligibility, and settlement.
- Server verifier tests for each intent/op hash path.
- Inventory E2E route/domain coverage for the planned table and handles.
- Actor-backed live puppet tests before enabling wagers: multiple wallets join, delay, press, witness vote, settle, and verify payout records.

## Release Gate

Rug Pull cannot be marked live until:

- The dedicated SmartPy contract compiles and passes tests.
- The app has configured contract address, network, and platform wallet.
- The live puppet suite proves wallet-backed round actions and settlement.
- `WTF-BB-138` is at least Fixed with explicit residual risk notes.
