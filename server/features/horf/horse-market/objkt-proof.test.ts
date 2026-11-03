import assert from "node:assert/strict";
import test from "node:test";
import type { ChainReader } from "../stables/chain";
import {
  ObjktPurchaseInvalidError, ObjktPurchasePendingError,
  readHorfMainnetRpcLevel, verifyHorfObjktPurchase,
  type ObjktProofIntent,
} from "./objkt-proof";

const hash = "op84g6ySuPjHmpEdRip2ge4cJ84kRZxw7HLkBJQSsmU4M57bUya";
const market = "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X";
const horse = "KT1Q1ZtDEW87VfZMs3QFnYX5Lbh8wN2B5ypV";
const seller = "tz1QRpNvWXH3SsoeUnr4E2F6DMaGxDGrFc3X";
const buyer = "tz1b9fAr8Byrzr6nuYPdf9HwuuLmq4GutfLx";
const intent: ObjktProofIntent = {
  marketplaceContract: market, askId: "12802918", tokenContract: horse, tokenId: "554",
  sellerAddress: seller, buyerAddress: buyer, priceMutez: "2000000", preflightLevel: 15659542,
};

function reader(options: { askId?: string; level?: number; amount?: string; transferFrom?: string; transferAmount?: string; status?: string; indexed?: boolean } = {}): ChainReader {
  return { async getJson<T>(path: string): Promise<T> {
    if (path.startsWith("/operations/transactions/")) return options.indexed === false ? [] as T : [
      { id: 3042308030201856, hash, counter: 156097290, nonce: null,
        sender: { address: buyer }, target: { address: market }, status: options.status || "applied",
        parameter: { entrypoint: "fulfill_ask", value: { ask_id: options.askId || "12802918", amount: "1" } },
        amount: options.amount || "2000000", level: options.level || 15659543, timestamp: "2026-11-03T20:55:37Z" },
      { id: 3042308031250432, hash, counter: 156097290, nonce: 0,
        sender: { address: market }, initiator: { address: buyer }, target: { address: horse }, status: "applied",
        parameter: { entrypoint: "transfer" } },
    ] as T;
    if (path === "/tokens/transfers") return [{
      id: 3042308031250434, transactionId: 3042308031250432,
      token: { contract: { address: horse }, tokenId: "554" },
      from: { address: options.transferFrom || seller }, to: { address: buyer }, amount: options.transferAmount || "1",
    }] as T;
    throw new Error(`Unexpected test path ${path}`);
  } };
}

test("Horf Objkt proof binds a later applied ask to its exact indexed horse transfer", async () => {
  const proof = await verifyHorfObjktPurchase(intent, hash, reader());
  assert.deepEqual(proof, {
    operationHash: hash, rootTransactionId: 3042308030201856,
    horseTransferId: 3042308031250434, timestamp: "2026-11-03T20:55:37.000Z",
  });
});

test("historic or mismatched Objkt purchases cannot be attributed to a Horf intent", async () => {
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ level: 15659542 })), ObjktPurchaseInvalidError);
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ askId: "12802919" })), ObjktPurchaseInvalidError);
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ amount: "3000000" })), ObjktPurchaseInvalidError);
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ status: "failed" })), ObjktPurchaseInvalidError);
});

test("an unindexed operation or mismatched horse transfer stays uncounted", async () => {
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ indexed: false })), ObjktPurchasePendingError);
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ transferFrom: buyer })), ObjktPurchasePendingError);
  await assert.rejects(verifyHorfObjktPurchase(intent, hash, reader({ transferAmount: "2" })), ObjktPurchasePendingError);
});

test("Horf purchase intent takes its Mainnet block level from RPC", async () => {
  const reads: string[] = [];
  const level = await readHorfMainnetRpcLevel({ HORF_MAINNET_RPC_URL: "https://example.test/" }, async (url) => {
    reads.push(url);
    return url.endsWith("/chain_id") ? "NetXdQprcVkpaWU" : { level: 15659542 };
  });
  assert.equal(level, 15659542);
  assert.deepEqual(reads.sort(), ["https://example.test/chains/main/blocks/head/header", "https://example.test/chains/main/chain_id"]);
  await assert.rejects(readHorfMainnetRpcLevel({ HORF_MAINNET_RPC_URL: "https://wrong.test" }, async (url) =>
    url.endsWith("/chain_id") ? "NetXnHfVqm9iesp" : { level: 15659542 }), /not Tezos Mainnet/);
});
