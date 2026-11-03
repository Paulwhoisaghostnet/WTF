import assert from "node:assert/strict";
import test from "node:test";
import { parseHorfOwnedTokenPage } from "./owned-tokens";

test("Horf owned-token cache rejects malformed pages before Stables or Gifts render them", () => {
  assert.deepEqual(parseHorfOwnedTokenPage({
    items: [{ contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId: "7", balance: "2", walletAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" }],
    pagination: { hasMore: false, nextOffset: 1 },
  }).items.length, 1);
  for (const malformed of [null, { items: [], pagination: null }, { items: [null], pagination: { hasMore: false, nextOffset: 1 } }]) {
    assert.throws(() => parseHorfOwnedTokenPage(malformed), /Paste an Objkt token link/);
  }
});
