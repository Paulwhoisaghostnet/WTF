import assert from "node:assert/strict";
import test from "node:test";
import { validateArtSendRecipients } from "./art-send-recipients";
import { HORF_RECIPIENT_LIMIT } from "./recipient-input";

const sender = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const alice = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const bob = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";

test("one FA2 horse can be allocated to multiple riders without exceeding editions owned", () => {
  assert.deepEqual(validateArtSendRecipients([
    { address: alice, amount: "01" },
    { address: bob, amount: "2" },
  ], sender, "3"), {
    recipients: [{ address: alice, amountRaw: "1" }, { address: bob, amountRaw: "2" }],
    total: "3",
  });
  assert.throws(() => validateArtSendRecipients([
    { address: alice, amount: "2" }, { address: bob, amount: "2" },
  ], sender, "3"), /assigned 4 editions.*owns 3/);
});

test("horse batch validation rejects duplicates, self sends, zero and over-limit rows", () => {
  assert.throws(() => validateArtSendRecipients([{ address: alice, amount: "1" }, { address: alice, amount: "1" }], sender, "3"), /more than once/);
  assert.throws(() => validateArtSendRecipients([{ address: sender, amount: "1" }], sender, "3"), /another trader/);
  assert.throws(() => validateArtSendRecipients([{ address: alice, amount: "0" }], sender, "3"), /at least one/);
  assert.throws(() => validateArtSendRecipients(Array.from({ length: HORF_RECIPIENT_LIMIT + 1 }, () => ({ address: alice, amount: "1" })), sender, "100"), /up to 50/);
});
