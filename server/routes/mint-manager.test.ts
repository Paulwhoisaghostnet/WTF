import assert from "node:assert/strict";
import test from "node:test";
import { findLinkedMintTransfer, tokenContractAddress } from "./mint-manager";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const wallet = "tz1burnburnburnburnburnburnburjAYjjX";

test("mint receipt accepts only a token mint into the linked wallet", () => {
  const transfer = findLinkedMintTransfer([
    { token: { contract: { address: contract }, tokenId: "4" }, from: { address: "tz1Other" }, to: { address: wallet }, amount: "1" },
    { token: { contract: { address: contract }, tokenId: "5" }, from: null, to: { address: wallet }, amount: "2" },
  ], [wallet], { contract, tokenId: "5" });
  assert.equal(transfer?.amount, "2");
  assert.equal(tokenContractAddress(transfer!), contract);
});

test("mint receipt rejects unrelated recipients and mismatched token identities", () => {
  const rows = [
    { token: { contract, tokenId: "7" }, from: null, to: { address: "tz1Other" }, amount: "1" },
  ];
  assert.equal(findLinkedMintTransfer(rows, [wallet], { contract, tokenId: "7" }), null);
  assert.equal(findLinkedMintTransfer(rows, ["tz1Other"], { contract, tokenId: "8" }), null);
});
