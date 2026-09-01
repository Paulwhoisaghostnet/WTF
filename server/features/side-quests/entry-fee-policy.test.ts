import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSideQuestEntryFee } from "./entry-fee-policy";

test("free side quests do not require a fee record", () => {
  assert.deepEqual(evaluateSideQuestEntryFee("0", []), {
    allowed: true,
    requiredWtf: "0",
    confirmedWtf: null,
  });
});

test("paid side quests reject absent, pending, and underpaid fees", () => {
  assert.equal(evaluateSideQuestEntryFee("25", []).allowed, false);
  assert.equal(
    evaluateSideQuestEntryFee("25", [{ amountWtf: "25", status: "pending" }])
      .allowed,
    false,
  );
  assert.deepEqual(
    evaluateSideQuestEntryFee("25", [{ amountWtf: "24", status: "confirmed" }]),
    { allowed: false, requiredWtf: "25", confirmedWtf: "24" },
  );
});

test("paid side quests accept exact and greater confirmed fees", () => {
  assert.equal(
    evaluateSideQuestEntryFee("25", [{ amountWtf: "25", status: "confirmed" }])
      .allowed,
    true,
  );
  assert.deepEqual(
    evaluateSideQuestEntryFee("25", [{ amountWtf: "30", status: "confirmed" }]),
    { allowed: true, requiredWtf: "25", confirmedWtf: "30" },
  );
});

test("malformed database amounts fail closed", () => {
  assert.equal(
    evaluateSideQuestEntryFee("not-a-number", [
      { amountWtf: "999", status: "confirmed" },
    ]).allowed,
    false,
  );
  assert.equal(
    evaluateSideQuestEntryFee("25", [
      { amountWtf: "25.5", status: "confirmed" },
    ]).allowed,
    false,
  );
});
