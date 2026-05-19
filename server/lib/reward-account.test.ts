import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://wtf:wtf@localhost:5432/wtf_test";

const rewardAccount = await import("./reward-account");

test("WTF reward account converts whole rewards into raw FA2 units for payout", () => {
  assert.equal(rewardAccount.wholeWtfToRawUnits(1), "100000000");
  assert.equal(rewardAccount.wholeWtfToRawUnits("25"), "2500000000");
  assert.equal(rewardAccount.ceilRawUnitsToWholeWtfNumber("1"), 1);
  assert.equal(rewardAccount.ceilRawUnitsToWholeWtfNumber("100000000"), 1);
  assert.equal(rewardAccount.ceilRawUnitsToWholeWtfNumber("100000001"), 2);
});

test("reward allocation consumes oldest available rows and splits partial spends", () => {
  const plan = rewardAccount.planWtfRewardLedgerAllocation(
    [
      { id: 10, amountWtf: 4 },
      { id: 11, amountWtf: 9 },
      { id: 12, amountWtf: 3 },
    ],
    10
  );

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.availableWtf, 16);
  assert.deepEqual(plan.steps, [
    { ledgerId: 10, takeWtf: 4, remainingWtf: 0, split: false },
    { ledgerId: 11, takeWtf: 6, remainingWtf: 3, split: true },
  ]);
});

test("reward allocation refuses to overdraw the account", () => {
  const plan = rewardAccount.planWtfRewardLedgerAllocation(
    [
      { id: 1, amountWtf: 2 },
      { id: 2, amountWtf: 3 },
    ],
    6
  );

  assert.equal(plan.ok, false);
  assert.equal(plan.availableWtf, 5);
});

test("reward cashout validation enforces 20 WTF minimum before wallet payout", () => {
  assert.equal(rewardAccount.MIN_WTF_REWARD_CASHOUT, 20);

  assert.deepEqual(rewardAccount.validateWtfRewardCashoutAmount(19, 100), {
    ok: false,
    reason: "below_minimum",
    amountWtf: 19,
    availableWtf: 100,
    minimumWtf: 20,
  });

  assert.deepEqual(rewardAccount.validateWtfRewardCashoutAmount(20, 19), {
    ok: false,
    reason: "insufficient_balance",
    amountWtf: 20,
    availableWtf: 19,
    minimumWtf: 20,
  });

  assert.deepEqual(rewardAccount.validateWtfRewardCashoutAmount(20, 25), {
    ok: true,
    amountWtf: 20,
    availableWtf: 25,
    minimumWtf: 20,
  });
});
