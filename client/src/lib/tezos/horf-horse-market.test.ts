import assert from "node:assert/strict";
import test from "node:test";
import { assertHorseMarketPermitMatchesReview, assertObjktPurchaseMatches, formatHorseRaw, horseAmountToRaw, type HorfHorseMarketPermit, type HorfObjktPurchase } from "./horf-horse-market";

const ask: HorfObjktPurchase = {
  listingId: "8669074",
  askId: "12802880",
  marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
  version: "v6.2",
  entrypoint: "fulfill_ask",
  sellerAddress: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
  priceMutez: "12000000",
  amountLeft: "9",
  tokenContract: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E",
  tokenId: "49633",
};

test("HORSE price parsing preserves all eight decimal places and large integers", () => {
  assert.equal(horseAmountToRaw("0.00000001"), "1");
  assert.equal(horseAmountToRaw("123456789.87654321"), "12345678987654321");
  assert.equal(formatHorseRaw("12345678987654321"), "123,456,789.87654321");
  for (const invalid of ["0", "0.00000000", "1.000000001", "1e3", "-1", "1.2.3"]) {
    assert.throws(() => horseAmountToRaw(invalid));
  }
});

test("a HORSE listing permit must match the reviewed token, edition count, and price", () => {
  const permit: HorfHorseMarketPermit = {
    contractAddress: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", chainId: "NetXdQprcVkpaWU",
    address: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY", tokenContract: "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12",
    tokenId: "7", quantity: "3", unitPriceHorseRaw: "2500000000", nonce: "0x" + "a".repeat(64),
    signature: "sig", oracleEpoch: "1",
  };
  assert.doesNotThrow(() => assertHorseMarketPermitMatchesReview(permit, permit));
  for (const change of [
    { tokenContract: "KT1Other" }, { tokenId: "8" }, { quantity: "2" },
    { unitPriceHorseRaw: "2600000000" }, { address: "tz1Other" },
  ]) assert.throws(() => assertHorseMarketPermitMatchesReview({ ...permit, ...change }, permit));
});

test("an Objkt buy requires the same live ask, seller, price and token on Mainnet", () => {
  const fresh = { ...ask, listingId: undefined, amount: "1" as const, network: "mainnet" as const, chainId: "NetXdQprcVkpaWU" };
  assert.doesNotThrow(() => assertObjktPurchaseMatches(ask, fresh));
  for (const changed of [
    { priceMutez: "13000000" }, { sellerAddress: "tz1N1U2pafQFk4WnSm5v2JEFuFmn8kTsje5D" },
    { askId: "12802881" }, { tokenId: "49634" }, { amountLeft: "0" },
    { chainId: "NetXsqzbfFenSTS" }, { marketplaceContract: "KT1unlisted" },
  ]) assert.throws(() => assertObjktPurchaseMatches(ask, { ...fresh, ...changed }));
});
