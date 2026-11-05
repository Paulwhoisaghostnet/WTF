import assert from "node:assert/strict";
import test from "node:test";
import { b58Encode, PrefixV2 } from "@taquito/utils";
import { validateArtSendRecipients } from "./art-send-recipients";

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

test("horse batch validation rejects duplicates, self sends and zero editions", () => {
  assert.throws(() => validateArtSendRecipients([{ address: alice, amount: "1" }, { address: alice, amount: "1" }], sender, "3"), /more than once/);
  assert.throws(() => validateArtSendRecipients([{ address: sender, amount: "1" }], sender, "3"), /another trader/);
  assert.throws(() => validateArtSendRecipients([{ address: alice, amount: "0" }], sender, "3"), /at least one/);
});

test("horse art batch accepts the full eligible posse beyond the HORSE payout recipient limit", () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    address: b58Encode((index + 1).toString(16).padStart(40, "0"), PrefixV2.Ed25519PublicKeyHash),
    amount: "1",
  }));
  const result = validateArtSendRecipients(rows, sender, "51");
  assert.equal(result.total, "51");
  assert.equal(result.recipients.length, 51);
});
