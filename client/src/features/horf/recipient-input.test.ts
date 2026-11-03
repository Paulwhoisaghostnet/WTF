import assert from "node:assert/strict";
import test from "node:test";
import {
  HORF_RECIPIENT_LIMIT,
  parseHorseRecipientCsv,
  toAtomicHorseAmount,
  validateHorseRecipients,
} from "./recipient-input";

const alice = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const bob = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const carol = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";

test("HORSE recipient CSV accepts comma lists and address,amount rows", () => {
  assert.deepEqual(parseHorseRecipientCsv(`${alice},${bob}\n${carol}`, "1.5"), [
    { address: alice, amount: "1.5" },
    { address: bob, amount: "1.5" },
    { address: carol, amount: "1.5" },
  ]);
  assert.deepEqual(parseHorseRecipientCsv(`address,amount\n${alice},2.25\n${bob},3`, "1"), [
    { address: alice, amount: "2.25" },
    { address: bob, amount: "3" },
  ]);
  assert.deepEqual(parseHorseRecipientCsv(`"address","amount"\n"${alice}","2.25"`, "1"), [
    { address: alice, amount: "2.25" },
  ]);
});

test("HORSE sends reject duplicate or oversized recipient sets before wallet preflight", () => {
  assert.throws(() => parseHorseRecipientCsv(`${alice},${alice}`, "1"), /repeats/);
  assert.throws(() => validateHorseRecipients([{ address: bob, amount: "1" }, { address: bob, amount: "2" }], alice, 8), /more than once/);
  assert.throws(() => validateHorseRecipients(Array.from({ length: HORF_RECIPIENT_LIMIT + 1 }, () => ({ address: bob, amount: "1" })), alice, 8), /up to 50/);
  assert.throws(() => validateHorseRecipients([{ address: alice, amount: "1" }], alice, 8), /own wallet/);
});

test("HORSE decimal amounts preserve 8-decimal atomic precision", () => {
  assert.equal(toAtomicHorseAmount("0.00000001", 8), "1");
  assert.equal(toAtomicHorseAmount("123456789.12345678", 8), "12345678912345678");
  assert.throws(() => toAtomicHorseAmount("0.000000001", 8), /8 decimal/);
  assert.throws(() => toAtomicHorseAmount("0", 8), /greater than zero/);
});
