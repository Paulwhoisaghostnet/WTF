import assert from "node:assert/strict";
import test from "node:test";
import { sponsorWalletCalls, type SponsorWalletRoom } from "./sponsor-funding-calls";
import type { FundingWalletAction } from "./funding-types";

const room = (): SponsorWalletRoom => ({
  config: { enabled: true }, roomId: "a".repeat(64), termsHash: "b".repeat(64),
  network: "shadownet", chainId: "NetXsqzbfFenSTS", escrowContract: "KT1Escrow",
  houseFeeAtomic: "500000", wtfToken: { contract: "KT1WTF", tokenId: "0" },
  terms: { deposit: { xtzAtomic: "2500000" },
    entry: { currency: "XTZ", entryAtomic: "1000000" },
    tokens: [{ contract: "KT1Art", tokenId: "42" }] },
  self: { walletAddress: "tz1Bound" },
});
const action = (value: SponsorWalletRoom, entrypoint: string, params: unknown,
  amountMutez = "0", fa2Operator?: FundingWalletAction["fa2Operator"]): FundingWalletAction => ({
  contract: value.escrowContract, network: value.network, chainId: value.chainId,
  expectedWallet: "tz1Bound", entrypoint, params, amountMutez, ...(fa2Operator ? { fa2Operator } : {}),
});
const fundingParams = (value: SponsorWalletRoom) => ({ room_id: value.roomId, expected_terms_hash: value.termsHash });

test("sponsor XTZ deposit pins the prize plus room fee and refuses altered wallet actions", () => {
  const value = room(), valid = action(value, "fund_sponsor_xtz", fundingParams(value), "3000000");
  assert.deepEqual(sponsorWalletCalls(value, valid, "sponsorXtz"), [{
    contract: "KT1Escrow", entrypoint: "fund_sponsor_xtz", params: fundingParams(value), amountMutez: "3000000",
  }]);
  for (const altered of [
    { amountMutez: "2500000" }, { amountMutez: "3e6" }, { expectedWallet: "tz1Other" },
    { contract: "KT1Other" }, { network: "mainnet" as const }, { chainId: "NetXdQprcVkpaWU" },
    { entrypoint: "claim_cash" }, { params: { ...fundingParams(value), extra: true } },
    { params: { room_id: value.roomId, expected_terms_hash: "wrong" } },
    { fa2Operator: { contract: "KT1WTF", tokenId: "0", owner: "tz1Bound", operator: "KT1Escrow" } },
  ]) assert.throws(() => sponsorWalletCalls(value, { ...valid, ...altered }, "sponsorXtz"));
  value.config.enabled = false;
  assert.throws(() => sponsorWalletCalls(value, valid, "sponsorXtz"));
  const claim = action(value, "claim_cash", { room_id: value.roomId, recipient: "tz1Bound", currency: 0 });
  assert.equal(sponsorWalletCalls(value, claim, "cashClaim", undefined, "XTZ")[0].entrypoint, "claim_cash");
});

test("paid XTZ and free entries sign exactly the room's price", () => {
  const value = room();
  const paid = action(value, "join_room", fundingParams(value), "1000000");
  assert.equal(sponsorWalletCalls(value, paid, "entry")[0].amountMutez, "1000000");
  value.terms.entry = { currency: "FREE", entryAtomic: "0" };
  const free = action(value, "join_room", fundingParams(value));
  assert.equal(sponsorWalletCalls(value, free, "entry")[0].amountMutez, "0");
  assert.throws(() => sponsorWalletCalls(value, paid, "entry"));
});

test("FA2 prize lot and WTF entry use only their pinned assets in permission/call/removal batches", () => {
  const value = room();
  const lot = action(value, "fund_sponsor_lot", { ...fundingParams(value), index: 0 }, "0",
    { contract: "KT1Art", tokenId: "42", owner: "tz1Bound", operator: "KT1Escrow" });
  const lotCalls = sponsorWalletCalls(value, lot, "sponsorLot", 0);
  assert.deepEqual(lotCalls.map(call => [call.contract, call.entrypoint, call.amountMutez]), [
    ["KT1Art", "update_operators", "0"], ["KT1Escrow", "fund_sponsor_lot", "0"],
    ["KT1Art", "update_operators", "0"],
  ]);
  assert.deepEqual(lotCalls[0].params, [{ add_operator: { owner: "tz1Bound", operator: "KT1Escrow", token_id: "42" } }]);
  assert.deepEqual(lotCalls[2].params, [{ remove_operator: { owner: "tz1Bound", operator: "KT1Escrow", token_id: "42" } }]);
  assert.throws(() => sponsorWalletCalls(value, { ...lot, fa2Operator: { ...lot.fa2Operator!, tokenId: "43" } }, "sponsorLot", 0));
  assert.throws(() => sponsorWalletCalls(value, lot, "sponsorLot", 1));

  value.terms.entry = { currency: "WTF", entryAtomic: "100000000" };
  const entry = action(value, "join_room", fundingParams(value), "0",
    { contract: "KT1WTF", tokenId: "0", owner: "tz1Bound", operator: "KT1Escrow" });
  assert.deepEqual(sponsorWalletCalls(value, entry, "entry").map(call => call.contract),
    ["KT1WTF", "KT1Escrow", "KT1WTF"]);
  assert.throws(() => sponsorWalletCalls(value, { ...entry, fa2Operator: lot.fa2Operator }, "entry"));
});

test("refund and claim parameters match the escrow ABI without token permissions", () => {
  const value = room();
  const refund = action(value, "refund_entry", { room_id: value.roomId, player: "tz1Bound" });
  assert.equal(sponsorWalletCalls(value, refund, "refundEntry")[0].entrypoint, "refund_entry");
  assert.throws(() => sponsorWalletCalls(value, { ...refund, params: value.roomId }, "refundEntry"));
  const cash = action(value, "claim_cash", { room_id: value.roomId, recipient: "tz1Bound", currency: 1 });
  assert.equal(sponsorWalletCalls(value, cash, "cashClaim", undefined, "WTF")[0].entrypoint, "claim_cash");
  assert.throws(() => sponsorWalletCalls(value, cash, "cashClaim", undefined, "XTZ"));
  const lot = action(value, "claim_lot", { room_id: value.roomId, index: 0 });
  assert.deepEqual(sponsorWalletCalls(value, lot, "lotClaim", 0).map(call => call.contract), ["KT1Escrow"]);
  assert.throws(() => sponsorWalletCalls(value, { ...lot, fa2Operator: {
    contract: "KT1Art", tokenId: "42", owner: "tz1Bound", operator: "KT1Escrow",
  } }, "lotClaim", 0));
});
