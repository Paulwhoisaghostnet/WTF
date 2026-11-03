import assert from "node:assert/strict";
import test from "node:test";
import { buildHorfRewardEntitlements, HORF_HORSE_REWARD_RAW_PER_UNIT } from "./rewards";

const sender = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const recipient = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const horseArt = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const horseCurrency = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";

test("each outbound current-season edition accrues 10 HORSE only to its sender", () => {
  const rows = buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "100", from: sender, to: recipient, units: "3", tokenContract: horseArt },
    { kind: "stable", sourceKey: "KT1Stable:200", from: recipient, to: sender, units: "1", tokenContract: horseArt },
  ], horseCurrency);
  assert.equal(HORF_HORSE_REWARD_RAW_PER_UNIT.toString(), "1000000000");
  assert.deepEqual(rows.map((row) => [row.sourceKind, row.sourceKey, row.traderAddress, row.units, row.amountRaw]), [
    ["direct", "100", sender, "3", "3000000000"],
    ["stable", "KT1Stable:200", recipient, "1", "1000000000"],
  ]);
});

test("self sends and HORSE currency transfers never produce entitlement rows", () => {
  assert.deepEqual(buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "self", from: sender, to: sender, units: "1", tokenContract: horseArt },
    { kind: "direct", sourceKey: "currency", from: sender, to: recipient, units: "1", tokenContract: horseCurrency },
    { kind: "direct", sourceKey: "zero", from: sender, to: recipient, units: "0", tokenContract: horseArt },
  ], horseCurrency), []);
});

test("a return send is a new outbound award for its own sender", () => {
  const rows = buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "1", from: sender, to: recipient, units: "1", tokenContract: horseArt },
    { kind: "direct", sourceKey: "2", from: recipient, to: sender, units: "1", tokenContract: horseArt },
  ], horseCurrency);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.traderAddress), [sender, recipient]);
  assert.deepEqual(rows.map((row) => row.amountRaw), ["1000000000", "1000000000"]);
});
