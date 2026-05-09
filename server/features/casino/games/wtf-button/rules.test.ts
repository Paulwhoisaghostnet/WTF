import assert from "node:assert/strict";
import test from "node:test";
import {
  allButtonsIdle,
  calculateHouseCut,
  calculatePressCost,
  calculateSettlementFee,
  calculateTimeAdded,
  createButtonRound,
  createIdleButtonRound,
  createWtfButtonGameState,
  DAY_SECONDS,
  getRottenness,
  HOUR_SECONDS,
  MUTEZ_PER_XTZ,
  maybeRestartButton,
  pressButton,
  quotePress,
  resolveClash,
  runWtfButtonSimulation,
  SECOND_MS,
  settleRound,
  selectClashWinner,
  TRIAL_COOLDOWN_SECONDS,
  type WtfButtonGameState,
  type WtfButtonId,
  type WtfButtonUser,
} from "./index";
import {
  createWtfButtonQuote,
  resetWtfButtonMockState,
} from "./service";

const NOW = 1_760_000_000_000;
const ALICE: WtfButtonUser = { walletId: "alice", displayName: "Alice" };
const BOB: WtfButtonUser = { walletId: "bob", displayName: "Bob" };
const MIRA: WtfButtonUser = { walletId: "mira", displayName: "Mira" };

function stateWithBalances(nowMs = NOW): WtfButtonGameState {
  return createWtfButtonGameState(nowMs, {
    alice: 100n * MUTEZ_PER_XTZ,
    bob: 100n * MUTEZ_PER_XTZ,
    mira: 100n * MUTEZ_PER_XTZ,
    "mock-wallet-1": 30n * MUTEZ_PER_XTZ,
  });
}

function quoteAndPress(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  user: WtfButtonUser,
  nowMs: number,
  toleranceMutez = 0n
): WtfButtonGameState {
  const quote = quotePress(
    state,
    buttonId,
    user,
    nowMs,
    toleranceMutez > 0n ? "flexible" : "strict",
    toleranceMutez
  );
  const result = pressButton(state, buttonId, user, quote, nowMs);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.state;
}

test("WTF Button press cost respects table caps", () => {
  const state = stateWithBalances();
  const round = state.buttons.red;
  round.totalPressCount = 500;
  round.roundStartMs = NOW - round.startDurationSeconds * 4 * SECOND_MS;
  round.participants.alice = {
    walletId: "alice",
    displayName: "Alice",
    presses: 20,
    totalPaidMutez: 0n,
    totalPotAddedMutez: 0n,
    totalWtfPaidMutez: 0n,
    lastPressAtMs: null,
    lastStatus: "challenger",
  };
  assert.equal(calculatePressCost(round, ALICE, NOW), 2_500_000n);
});

test("WTF Button house cut honors min, max, and age rates", () => {
  const state = stateWithBalances();
  const fresh = state.buttons.red;
  assert.equal(calculateHouseCut(1_000_000n, fresh, NOW), 100_000n);
  assert.equal(calculateHouseCut(1_000_001n, fresh, NOW), 100_001n);

  const rotten = state.buttons.blue;
  rotten.roundStartMs = NOW - rotten.startDurationSeconds * 4 * SECOND_MS;
  assert.equal(getRottenness(rotten, NOW), "rotten");
  assert.equal(calculateHouseCut(4_000_000n, rotten, NOW), 600_000n);
});

test("WTF Button strict price protection fails if price increases", () => {
  const state = stateWithBalances();
  const quote = quotePress(state, "red", ALICE, NOW, "strict", 0n);
  state.buttons.red.totalPressCount = 25;
  const result = pressButton(state, "red", ALICE, quote, NOW + 1_000);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PRICE_CHANGED");
    assert.equal(result.actualCostMutez, 1_050_000n);
  }
});

test("WTF Button flexible price protection allows a selected small increase", () => {
  const state = stateWithBalances();
  const quote = quotePress(state, "red", ALICE, NOW, "flexible", 100_000n);
  state.buttons.red.totalPressCount = 25;
  const result = pressButton(state, "red", ALICE, quote, NOW + 1_000);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.actualCostMutez, 1_050_000n);
});

test("WTF Button rejects quotes when the round changed", () => {
  const state = stateWithBalances();
  const quote = quotePress(state, "red", ALICE, NOW, "strict", 0n);
  state.buttons.red.roundId = "red-new-round";
  const result = pressButton(state, "red", ALICE, quote, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ROUND_MISMATCH");
});

test("WTF Button rejects a flexible quote when actual cost exceeds max accepted", () => {
  const state = stateWithBalances();
  const quote = quotePress(state, "red", ALICE, NOW, "flexible", 50_000n);
  state.buttons.red.totalPressCount = 75;
  const result = pressButton(state, "red", ALICE, quote, NOW + 1_000);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PRICE_CHANGED");
});

test("WTF Button per-user time decay follows the public bands", () => {
  const state = stateWithBalances();
  const round = state.buttons.red;
  const participant = {
    walletId: "alice",
    displayName: "Alice",
    presses: 0,
    totalPaidMutez: 0n,
    totalPotAddedMutez: 0n,
    totalWtfPaidMutez: 0n,
    lastPressAtMs: null,
    lastStatus: "challenger" as const,
  };
  round.participants.alice = participant;
  const expected = [1_800, 1_350, 900, 450, 15];
  for (let presses = 0; presses < expected.length; presses += 1) {
    participant.presses = presses;
    assert.equal(calculateTimeAdded(round, ALICE, NOW), expected[presses]);
  }
});

test("WTF Button round-age time decay changes with rottenness", () => {
  const state = stateWithBalances();
  const round = state.buttons.red;
  round.roundStartMs = NOW;
  assert.equal(calculateTimeAdded(round, ALICE, NOW), 1_800);
  round.roundStartMs = NOW - (round.startDurationSeconds + 1) * SECOND_MS;
  assert.equal(calculateTimeAdded(round, ALICE, NOW), 1_350);
  round.roundStartMs = NOW - (round.startDurationSeconds * 2 + 1) * SECOND_MS;
  assert.equal(calculateTimeAdded(round, ALICE, NOW), 900);
  round.roundStartMs = NOW - (round.startDurationSeconds * 3 + 1) * SECOND_MS;
  assert.equal(calculateTimeAdded(round, ALICE, NOW), 450);
});

test("WTF Button leader exclusivity blocks a wallet from leading two buttons", () => {
  let state = stateWithBalances();
  state = quoteAndPress(state, "red", ALICE, NOW);
  const greenQuote = quotePress(state, "green", ALICE, NOW + 1_000, "strict", 0n);
  assert.equal(greenQuote.canPress, false);
  assert.match(greenQuote.reason ?? "", /already leader on Red/);
});

test("WTF Button winner cooldown blocks another press after settlement", () => {
  let state = stateWithBalances();
  state = quoteAndPress(state, "red", ALICE, NOW);
  state = quoteAndPress(state, "red", BOB, NOW + 1_000);
  state.buttons.red.countdownEndMs = NOW + 2_000;
  const settled = settleRound(state, "red", NOW + 3_000);
  assert.equal(settled.settled, true);
  if (settled.settled) {
    const quote = quotePress(settled.state, "green", BOB, NOW + 4_000, "strict", 0n);
    assert.equal(quote.canPress, false);
    assert.match(quote.reason ?? "", /Winner cooldown/);
  }
});

test("WTF Button current leader cannot press the same button again", () => {
  const state = quoteAndPress(stateWithBalances(), "red", ALICE, NOW);
  const quote = quotePress(state, "red", ALICE, NOW + 1_000, "strict", 0n);
  assert.equal(quote.canPress, false);
  assert.match(quote.reason ?? "", /already leader/);
});

test("WTF Button one-player rounds refund and do not keep WTF earnings", () => {
  let state = stateWithBalances();
  state = quoteAndPress(state, "red", ALICE, NOW);
  state.buttons.red.countdownEndMs = NOW + 1_000;
  const settled = settleRound(state, "red", NOW + 2_000);
  assert.equal(settled.settled, true);
  if (settled.settled) {
    assert.equal(settled.record.kind, "no_contest_refund");
    assert.equal(settled.state.balances.alice, 100n * MUTEZ_PER_XTZ);
    assert.equal(settled.state.wtfTreasuryMutez, 0n);
  }
});

test("WTF Button daily WTF minimum applies to long three-plus-player rounds", () => {
  let state = stateWithBalances();
  state = quoteAndPress(state, "red", ALICE, NOW);
  state = quoteAndPress(state, "red", BOB, NOW + 1_000);
  state = quoteAndPress(state, "red", MIRA, NOW + 2_000);
  const settleAt = NOW + state.buttons.red.startDurationSeconds * SECOND_MS + 2 * DAY_SECONDS * SECOND_MS;
  state.buttons.red.countdownEndMs = settleAt - 1_000;
  const fee = calculateSettlementFee(state.buttons.red, settleAt);
  assert.ok(fee > 0n);
  const settled = settleRound(state, "red", settleAt);
  assert.equal(settled.settled, true);
  if (settled.settled) assert.equal(settled.record.settlementFeeMutez, fee);
});

test("WTF Button daily WTF minimum does not apply below three unique pressers", () => {
  let state = stateWithBalances();
  state = quoteAndPress(state, "red", ALICE, NOW);
  state = quoteAndPress(state, "red", BOB, NOW + 1_000);
  const settleAt = NOW + state.buttons.red.startDurationSeconds * SECOND_MS + 3 * DAY_SECONDS * SECOND_MS;
  assert.equal(calculateSettlementFee(state.buttons.red, settleAt), 0n);
});

test("WTF Button Rug Clash only allows one valid press per wallet", () => {
  let state = stateWithBalances();
  state.buttons.red.countdownEndMs = NOW + 30_000;
  const firstQuote = quotePress(state, "red", ALICE, NOW, "strict", 0n);
  const first = pressButton(state, "red", ALICE, firstQuote, NOW);
  assert.equal(first.ok, true);
  if (first.ok) {
    const secondQuote = quotePress(first.state, "red", ALICE, NOW + 1_000, "strict", 0n);
    const second = pressButton(first.state, "red", ALICE, secondQuote, NOW + 1_000);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "CLASH_DUPLICATE");
  }
});

test("WTF Button Rug Clash applies only the selected winner's time extension", () => {
  let state = stateWithBalances();
  state.buttons.red.countdownEndMs = NOW + 30_000;
  state = quoteAndPress(state, "red", ALICE, NOW);
  state = quoteAndPress(state, "red", BOB, NOW + 1_000);
  const originalEnd = NOW + 30_000;
  const resolved = resolveClash(state, "red", NOW + 16_000, "fixed-seed");
  assert.equal(resolved.resolved, true);
  if (resolved.resolved) {
    assert.equal(
      resolved.button.countdownEndMs,
      originalEnd + resolved.selected.timeAddedSeconds * SECOND_MS
    );
    assert.ok(resolved.button.countdownEndMs < originalEnd + 3_600 * SECOND_MS);
  }
});

test("WTF Button Rug Clash randomness is deterministic in test mode", () => {
  const state = stateWithBalances();
  state.buttons.red.countdownEndMs = NOW + 30_000;
  const first = pressButton(
    state,
    "red",
    ALICE,
    quotePress(state, "red", ALICE, NOW, "strict", 0n),
    NOW
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = pressButton(
    first.state,
    "red",
    BOB,
    quotePress(first.state, "red", BOB, NOW + 1_000, "strict", 0n),
    NOW + 1_000
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const clash = second.state.buttons.red.rugClashHistory[0];
  const winnerA = selectClashWinner(second.state.buttons.red, clash, "same-seed");
  const winnerB = selectClashWinner(second.state.buttons.red, clash, "same-seed");
  assert.equal(winnerA?.walletId, winnerB?.walletId);
});

test("WTF Button max round age caps timer extension", () => {
  const state = stateWithBalances();
  const round = state.buttons.red;
  round.roundStartMs = NOW;
  round.countdownEndMs = NOW + round.maxRoundAgeSeconds * SECOND_MS - 10_000;
  const result = pressButton(state, "red", ALICE, quotePress(state, "red", ALICE, NOW, "strict", 0n), NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.button.countdownEndMs,
      result.button.roundStartMs + result.button.maxRoundAgeSeconds * SECOND_MS
    );
  }
});

test("WTF Button trial restart rules restart only when other two buttons are active", () => {
  const state = stateWithBalances();
  state.buttons.red.currentState = "cooling_down";
  state.buttons.red.cooldownUntilMs = NOW - 1;
  let restarted = maybeRestartButton(state, "red", NOW);
  assert.equal(restarted.restarted, true);
  assert.equal(restarted.button.startDurationSeconds, 6 * HOUR_SECONDS);

  restarted.state.buttons.green = createIdleButtonRound("green", NOW);
  restarted.state.buttons.red.currentState = "cooling_down";
  restarted.state.buttons.red.cooldownUntilMs = NOW - 1;
  const idled = maybeRestartButton(restarted.state, "red", NOW);
  assert.equal(idled.idled, true);
});

test("WTF Button all-three-idle condition is explicit for simulations", () => {
  const state = stateWithBalances();
  state.buttons.red = createIdleButtonRound("red", NOW);
  state.buttons.green = createIdleButtonRound("green", NOW);
  state.buttons.blue = createIdleButtonRound("blue", NOW);
  assert.equal(allButtonsIdle(state, NOW), true);

  const report = runWtfButtonSimulation({
    users: 0,
    maxSimulatedDays: 12,
    stepSeconds: HOUR_SECONDS,
    seed: "idle-sim",
  });
  assert.match(["all_three_idle", "max_days"].join(","), new RegExp(report.endedBecause));
  assert.ok(report.textReport.includes("WTF Button simulation report"));
});

test("WTF Button uses mutez integer rounding for percentage cuts", () => {
  const state = stateWithBalances();
  assert.equal(calculateHouseCut(1_000_001n, state.buttons.red, NOW), 100_001n);
});

test("WTF Button service quote values match backend pure calculations", () => {
  resetWtfButtonMockState(Date.now());
  const quote = createWtfButtonQuote({
    rawUser: { id: 1, username: "alice" },
    buttonId: "red",
    priceProtectionMode: "flexible",
    toleranceMutez: 100_000n,
  });
  assert.equal(quote.quotedCost.mutez, "1000000");
  assert.equal(quote.houseCut.mutez, "100000");
  assert.equal(quote.potAdd.mutez, "900000");
  assert.equal(quote.timeAddedSeconds, 1_800);
  assert.equal(quote.maxAcceptedCost.mutez, "1100000");
});
