import assert from "node:assert/strict";
import test from "node:test";
import type { horfOpenRangeOffers } from "@shared/schema";
import { HORF_MAINNET_CHAIN_ID } from "./stables/config";
import { HorfTradeOfferError, parseHorfTradeOfferProposal,
  privateOfferProofMatches, validateHorfTradeOfferProposal } from "./trade-offers";

const owner = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const offerer = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const outputContract = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const inputContract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const roomsContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const operationHash = `o${"A".repeat(50)}`;

const sign = {
  id: 7, active: true, amount: "2", ownerWalletAddress: owner,
  tokenContract: outputContract, tokenId: "42", acceptedTokenPolicy: "any_qualifying",
} as typeof horfOpenRangeOffers.$inferSelect;

const proposal = {
  offererAddress: offerer, signId: 7, offeredTokenContract: inputContract,
  offeredTokenId: "9", message: "My horse would like to meet yours",
};

const stored = {
  offererWalletAddress: offerer, ownerWalletAddress: owner,
  requestedTokenContract: outputContract, requestedTokenId: "42",
  offeredTokenContract: inputContract, offeredTokenId: "9", privateListingId: null,
};

const escrowProof = {
  kind: "private_offer_escrowed" as const, chainId: HORF_MAINNET_CHAIN_ID,
  contractAddress: roomsContract, operationHash, listingId: "0",
  ownerAddress: owner, offererAddress: offerer,
  outputTokenContract: outputContract, outputTokenId: "42",
  inputTokenContract: inputContract, inputTokenId: "9",
};

test("a wallet-held trade proposal always means one currently owned edition", () => {
  assert.deepEqual(parseHorfTradeOfferProposal({ ...proposal, offeredTokenId: "0009" }), proposal);
  assert.deepEqual(parseHorfTradeOfferProposal({ ...proposal, amount: "1" }), proposal);
  assert.equal(parseHorfTradeOfferProposal({ ...proposal, amount: "2" }), null);
  assert.equal(parseHorfTradeOfferProposal({ ...proposal, quantity: 0 }), null);
  assert.equal(parseHorfTradeOfferProposal({ ...proposal, offeredTokenContract: "bad" }), null);
  assert.equal(parseHorfTradeOfferProposal({ ...proposal, offererAddress: owner, message: {} }), null);
});

test("an active sign cannot be offered its own horse or owner wallet", () => {
  assert.doesNotThrow(() => validateHorfTradeOfferProposal(proposal, sign));
  assert.throws(() => validateHorfTradeOfferProposal({ ...proposal, offererAddress: owner }, sign), HorfTradeOfferError);
  assert.throws(() => validateHorfTradeOfferProposal({ ...proposal,
    offeredTokenContract: outputContract, offeredTokenId: "42" }, sign), HorfTradeOfferError);
  assert.throws(() => validateHorfTradeOfferProposal(proposal, { ...sign, active: false }), HorfTradeOfferError);
});

test("first private listing ID zero is valid only with exact Mainnet escrow identities", () => {
  assert.equal(privateOfferProofMatches(stored, escrowProof, "private_offer_escrowed", operationHash, roomsContract), true);
  for (const altered of [
    { offererAddress: owner }, { ownerAddress: offerer }, { outputTokenId: "43" },
    { inputTokenContract: outputContract }, { contractAddress: outputContract },
    { chainId: "NetXnHfVqm9iesp" }, { operationHash: `o${"B".repeat(50)}` },
    { listingId: "not-a-number" },
  ]) {
    assert.equal(privateOfferProofMatches(stored, { ...escrowProof, ...altered },
      "private_offer_escrowed", operationHash, roomsContract), false);
  }
});

test("fulfillment and owner recovery must prove the same private listing", () => {
  const accepted = { ...stored, privateListingId: "0" };
  assert.equal(privateOfferProofMatches(accepted, { ...escrowProof, kind: "private_offer_fulfilled" },
    "private_offer_fulfilled", operationHash, roomsContract), true);
  assert.equal(privateOfferProofMatches(accepted, { ...escrowProof, kind: "private_offer_fulfilled", listingId: "1" },
    "private_offer_fulfilled", operationHash, roomsContract), false);
  assert.equal(privateOfferProofMatches(accepted, { ...escrowProof, kind: "horse_cancelled", mode: 3, amount: "1" },
    "horse_cancelled", operationHash, roomsContract), true);
  assert.equal(privateOfferProofMatches(accepted, { ...escrowProof, kind: "horse_cancelled", mode: 2, amount: "1" },
    "horse_cancelled", operationHash, roomsContract), false);
});
