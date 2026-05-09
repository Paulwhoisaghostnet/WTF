import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateEarnedMicroshares,
  calculatePanicRemainingMicroshares,
  calculatePayouts,
  canWalletCauseButtonLock,
  computeDelayLockUntilSecond,
  getDelayCostMutezForNextUse,
  getJoinOrderMultiplierBps,
  getPressureMultiplierBps,
  getShareRateMicrosharesPerSecond,
  MICROSHARES_PER_SHARE,
  splitRugPullPayment,
} from "./rules";

test("Rug Pull join-order multipliers follow the public table", () => {
  assert.equal(getJoinOrderMultiplierBps(1), 10_000);
  assert.equal(getJoinOrderMultiplierBps(2), 11_500);
  assert.equal(getJoinOrderMultiplierBps(5), 16_000);
  assert.equal(getJoinOrderMultiplierBps(6), 17_500);
  assert.equal(getJoinOrderMultiplierBps(99), 17_500);
  assert.throws(() => getJoinOrderMultiplierBps(0), /positive integer/);
});

test("Rug Pull pressure multipliers advance on 45-second bands", () => {
  assert.equal(getPressureMultiplierBps(0), 10_000);
  assert.equal(getPressureMultiplierBps(44), 10_000);
  assert.equal(getPressureMultiplierBps(45), 12_000);
  assert.equal(getPressureMultiplierBps(90), 14_000);
  assert.equal(getPressureMultiplierBps(180), 18_000);
});

test("Rug Pull share speed combines base, join order, and pressure", () => {
  assert.equal(
    getShareRateMicrosharesPerSecond({ joinOrder: 1, secondsSinceRoundStart: 0 }),
    BigInt(MICROSHARES_PER_SHARE)
  );
  assert.equal(
    getShareRateMicrosharesPerSecond({ joinOrder: 2, secondsSinceRoundStart: 45 }),
    1_380_000n
  );
});

test("Rug Pull earned shares integrate across pressure bands", () => {
  assert.equal(
    calculateEarnedMicroshares({ joinOrder: 1, fromRoundSecond: 0, toRoundSecond: 45 }),
    45_000_000n
  );
  assert.equal(
    calculateEarnedMicroshares({ joinOrder: 1, fromRoundSecond: 0, toRoundSecond: 90 }),
    99_000_000n
  );
  assert.equal(
    calculateEarnedMicroshares({ joinOrder: 2, fromRoundSecond: 45, toRoundSecond: 90 }),
    62_100_000n
  );
});

test("Rug Pull delay costs and button lock rules are deterministic", () => {
  assert.equal(getDelayCostMutezForNextUse(0), 1_000_000);
  assert.equal(getDelayCostMutezForNextUse(1), 2_000_000);
  assert.equal(getDelayCostMutezForNextUse(4), 8_000_000);
  assert.equal(getDelayCostMutezForNextUse(5), null);
  assert.equal(
    canWalletCauseButtonLock({ walletAddress: "tz1ABC", lastLockWalletAddress: "tz1abc" }),
    false
  );
  assert.equal(
    canWalletCauseButtonLock({ walletAddress: "tz1ABC", lastLockWalletAddress: "tz1zzz" }),
    true
  );
  assert.equal(computeDelayLockUntilSecond({ nowSecond: 100, currentLockUntilSecond: 120 }), 135);
  assert.equal(computeDelayLockUntilSecond({ nowSecond: 100, currentLockUntilSecond: 140 }), 145);
});

test("Rug Pull panic modifiers change share bleed without going negative", () => {
  assert.equal(
    calculatePanicRemainingMicroshares({
      startingMicroshares: 100_000_000n,
      elapsedPanicSeconds: 10,
      modifier: "mercy",
    }),
    95_000_000n
  );
  assert.equal(
    calculatePanicRemainingMicroshares({
      startingMicroshares: 100_000_000n,
      elapsedPanicSeconds: 10,
      modifier: "cruelty",
    }),
    85_000_000n
  );
  assert.equal(
    calculatePanicRemainingMicroshares({
      startingMicroshares: 3_000_000n,
      elapsedPanicSeconds: 10,
      modifier: "none",
    }),
    0n
  );
});

test("Rug Pull payment splits match the game description", () => {
  assert.deepEqual(splitRugPullPayment("join"), {
    totalMutez: 5_000_000,
    potMutez: 4_000_000,
    platformMutez: 1_000_000,
  });
  assert.deepEqual(splitRugPullPayment("press"), {
    totalMutez: 5_000_000,
    potMutez: 4_000_000,
    platformMutez: 1_000_000,
  });
  assert.deepEqual(splitRugPullPayment("witness"), {
    totalMutez: 250_000,
    potMutez: 200_000,
    platformMutez: 50_000,
  });
});

test("Rug Pull settlement distributes pot by final locked shares", () => {
  assert.deepEqual(
    calculatePayouts({
      potMutez: 10n,
      participants: [
        { id: "alice", finalMicroshares: 1n },
        { id: "bob", finalMicroshares: 2n },
      ],
    }),
    [
      { id: "alice", finalMicroshares: 1n, payoutMutez: 3n },
      { id: "bob", finalMicroshares: 2n, payoutMutez: 7n },
    ]
  );
});
