import assert from "node:assert/strict";
import test from "node:test";
import { forgetObjktPurchase, pendingObjktPurchases, rememberObjktPurchase, type PendingObjktPurchase } from "./objkt-purchase";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

const purchase: PendingObjktPurchase = {
  intentId: "intent-1", opHash: "oo-submitted-operation",
  buyerAddress: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
  tokenContract: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E", tokenId: "49633",
};

test("a submitted Objkt operation retains its intent until proof is verified", () => {
  const storage = memoryStorage();
  rememberObjktPurchase(purchase, storage);
  assert.deepEqual(pendingObjktPurchases(storage), [purchase]);
  rememberObjktPurchase({ ...purchase, opHash: "oo-current-operation" }, storage);
  assert.deepEqual(pendingObjktPurchases(storage).map((item) => item.opHash), ["oo-current-operation"]);
  forgetObjktPurchase(purchase.intentId, storage);
  assert.deepEqual(pendingObjktPurchases(storage), []);
});

test("invalid browser storage does not become a purchase proof", () => {
  const storage = memoryStorage();
  storage.setItem("horf:objkt-pending-purchases", "not json");
  assert.deepEqual(pendingObjktPurchases(storage), []);
  storage.setItem("horf:objkt-pending-purchases", JSON.stringify([{ intentId: "x", opHash: "oo", buyerAddress: "tz1", tokenContract: "KT1", tokenId: "not-nat" }]));
  assert.deepEqual(pendingObjktPurchases(storage), []);
});
