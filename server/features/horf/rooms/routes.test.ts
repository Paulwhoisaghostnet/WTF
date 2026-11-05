import assert from "node:assert/strict";
import test from "node:test";
import { parseHorfRoomPermitRequest } from "./routes";

const address = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const tokenContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

test("private room permits require one edition and an exact durable offer", () => {
  const base = { address, action: 0, mode: 3, listingId: "0", tokenContract,
    tokenId: "7", amount: "1", offerId: 12 };
  assert.deepEqual(parseHorfRoomPermitRequest(base), base);
  assert.equal(parseHorfRoomPermitRequest({ ...base, amount: "2" }), null);
  assert.equal(parseHorfRoomPermitRequest({ ...base, offerId: undefined }), null);
  assert.deepEqual(parseHorfRoomPermitRequest({ ...base, action: 2, listingId: "0" }),
    { ...base, action: 2, listingId: "0" });
  assert.equal(parseHorfRoomPermitRequest({ ...base, action: 1 }), null);
});
