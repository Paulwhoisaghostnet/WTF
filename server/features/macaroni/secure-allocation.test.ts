import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createSecureAllocation } from "./secure-allocation";

test("Macaroni secure allocation preserves editions and makes verifiable sealed slots", () => {
  const tokenCommitments = [
    createHash("sha256").update("token-0").digest("hex"),
    createHash("sha256").update("token-1").digest("hex"),
    createHash("sha256").update("token-2").digest("hex"),
  ];
  const slots = createSecureAllocation([
    { tokenId: 0, quantity: 2, metadataCommitment: tokenCommitments[0] },
    { tokenId: 1, quantity: 3, metadataCommitment: tokenCommitments[1] },
    { tokenId: 2, quantity: 1, metadataCommitment: tokenCommitments[2] },
  ], 6);

  assert.deepEqual(
    slots.map((slot) => slot.tokenId).sort((left, right) => left - right),
    [0, 0, 1, 1, 1, 2]
  );
  assert.deepEqual(slots.map((slot) => slot.slotId), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(slots.map((slot) => slot.nonce)).size, slots.length);
  for (const slot of slots) {
    assert.match(slot.nonce, /^[0-9a-f]{64}$/);
    assert.equal(
      slot.commitment,
      createHash("sha256")
        .update(Buffer.concat([
          Buffer.from(slot.nonce, "hex"),
          Buffer.from(tokenCommitments[slot.tokenId], "hex"),
        ]))
        .digest("hex")
    );
  }
});

test("Macaroni secure allocation rejects malformed commitments and supply drift", () => {
  assert.throws(
    () => createSecureAllocation([{ tokenId: 0, quantity: 1, metadataCommitment: "00" }], 1),
    /Missing metadata commitment/
  );
  assert.throws(
    () => createSecureAllocation([{
      tokenId: 0,
      quantity: 1,
      metadataCommitment: createHash("sha256").update("token").digest("hex"),
    }], 2),
    /does not match the on-chain edition supply/
  );
});
