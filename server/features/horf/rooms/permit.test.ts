import assert from "node:assert/strict";
import test from "node:test";
import { packHorfRoomPermit } from "./permit";

/** Independent Tezos Mainnet RPC `helpers/scripts/pack_data` result for action 2/mode 3. */
const MAINNET_PACKED = "0507070a000000047a06a77007070a0000001601b752c7f3de31759bce246416a6823e86b9756c6c0007070a000000160000379dfd0263493eab3182c1abed190d7bc4e2ac3107070002070700030707000007070a00000016017e73cfaf4bcbb88ed678fd03dbeff9e97fb5bc9000070700070707000107070a0000002011111111111111111111111111111111111111111111111111111111111111110000";

test("private fulfillment permit PACK matches Tezos Mainnet RPC", () => {
  assert.equal(packHorfRoomPermit({
    chainId: "NetXdQprcVkpaWU",
    contractAddress: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    address: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
    action: 2, mode: 3, listingId: "0",
    tokenContract: "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12",
    tokenId: "7", amount: "1", nonce: `0x${"11".repeat(32)}`, oracleEpoch: "0",
  }), MAINNET_PACKED);
});
