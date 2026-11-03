import assert from "node:assert/strict";
import test from "node:test";
import {
  findHorfObjktListings,
  ObjktListingChangedError,
  preflightHorfObjktPurchase,
  type HorfObjktListing,
  type ObjktChainReader,
  type ObjktListingReader,
} from "./objkt-listings";

const tokenContract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const marketplaceContract = "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X";
const sellerAddress = "tz2QrdpoDnE9epLMfGCsDGYH8rfNJ7zyxpjy";
const listing: HorfObjktListing = {
  listingId: "8669074", askId: "12802880", marketplaceContract, version: "v6.2", entrypoint: "fulfill_ask",
  sellerAddress, priceMutez: "12000000", amountLeft: "9", tokenContract, tokenId: "49633",
};

function chain(valueOverrides: Record<string, unknown> = {}, keyOverrides: Record<string, unknown> = {}): ObjktChainReader {
  const value = {
    token: { address: tokenContract, token_id: "49633" },
    amount: "12000000", creator: sellerAddress, editions: "9", currency: { tez: {} },
    condition: null, start_time: null, expiry_time: null, ...valueOverrides,
  };
  return {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/head") return { chainId: "NetXdQprcVkpaWU", timestamp: "2026-11-03T20:00:00Z" } as T;
      if (path.endsWith("/storage")) return { asks: 684371 } as T;
      if (path === "/bigmaps/684371/keys/12802880") return { active: true, key: "12802880", value, ...keyOverrides } as T;
      throw new Error(`Unexpected test read: ${path}`);
    },
  };
}

test("Objkt discovery uses the big-map ask key and exact mutez price", async () => {
  const reader: ObjktListingReader = { async load() {
    return [{ id: 8669074, bigmap_key: 12802880, marketplace_contract: marketplaceContract,
      seller_address: sellerAddress, price: 12000000, amount_left: 9, currency: { type: "tez" } }];
  } };
  assert.deepEqual(await findHorfObjktListings(tokenContract, "49633", 0, reader), { listings: [listing], nextCursor: null });
  const result = await preflightHorfObjktPurchase(listing, chain(), Date.parse("2026-11-03T20:00:00Z"));
  assert.equal(result.purchase.askId, "12802880");
  assert.equal(result.purchase.priceMutez, "12000000");
  assert.equal(result.purchase.network, "mainnet");
});

test("Objkt preflight rejects an ask that closed or changed its price", async () => {
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({}, { active: false })), ObjktListingChangedError);
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({ amount: "13000000" })), ObjktListingChangedError);
});

test("Objkt preflight rejects a different token, recipient-targeted ask, and unsupported condition", async () => {
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({ token: { address: tokenContract, token_id: "1" } })), ObjktListingChangedError);
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({ target: sellerAddress })), ObjktListingChangedError);
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({ condition: { allowlist: true } })), ObjktListingChangedError);
});

test("Objkt preflight checks offer timing and Mainnet", async () => {
  await assert.rejects(preflightHorfObjktPurchase(listing, chain({ start_time: "2026-11-04T00:00:00Z" }), Date.parse("2026-11-03T20:00:00Z")), ObjktListingChangedError);
  const wrongChain: ObjktChainReader = { async getJson<T>() { return { chainId: "NetXnHfVqm9iesp" } as T; } };
  await assert.rejects(preflightHorfObjktPurchase(listing, wrongChain), /Tezos Mainnet/);
});

test("Objkt v1 asks use issuer, objkt_id, and xtz_per_objkt", async () => {
  const oldListing = { ...listing, marketplaceContract: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq", version: "v1", askId: "20", tokenId: "157120", priceMutez: "3000000", amountLeft: "8" };
  const oldChain: ObjktChainReader = { async getJson<T>(path: string): Promise<T> {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as T;
    if (path.endsWith("/storage")) return { asks: 5909 } as T;
    return { active: true, key: "20", value: { fa2: tokenContract, objkt_id: "157120", issuer: sellerAddress,
      xtz_per_objkt: "3000000", amount: "8" } } as T;
  } };
  const result = await preflightHorfObjktPurchase(oldListing, oldChain);
  assert.equal(result.purchase.priceMutez, "3000000");
});
