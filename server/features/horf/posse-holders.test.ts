import assert from "node:assert/strict";
import test from "node:test";
import { getPosseHorseHolders } from "./posse-holders";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const addresses = [
  "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
  "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79",
];

test("posse holder check batches exact token queries and excludes wallets with editions", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const read = async <T>(path: string, params?: Record<string, unknown>): Promise<T> => {
    assert.equal(path, "/tokens/balances");
    calls.push(params ?? {});
    return (calls.length === 1 ? [{
      account: { address: addresses[0] }, token: { contract: { address: contract }, tokenId: "7" }, balance: "2",
    }] : []) as T;
  };
  const holders = await getPosseHorseHolders(addresses, { contract, tokenId: "7" }, read, 2);
  assert.deepEqual([...holders], [addresses[0]]);
  assert.deepEqual(calls.map((params) => params["account.in"]), [addresses.slice(0, 2).join(","), addresses[2]]);
  assert.deepEqual(calls.map((params) => params.limit), [3, 2]);
  assert.ok(calls.every((params) => params["token.contract"] === contract && params["token.tokenId"] === "7" && params["balance.gt"] === 0));
});

test("posse holder check fails closed on a mismatched or duplicate index row", async () => {
  const read = async <T>(): Promise<T> => ([{
    account: { address: addresses[1] }, token: { contract: { address: contract }, tokenId: "8" }, balance: "1",
  }] as T);
  await assert.rejects(() => getPosseHorseHolders(addresses.slice(0, 2), { contract, tokenId: "7" }, read), /did not match/);
  const duplicate = async <T>(): Promise<T> => ([
    { account: { address: addresses[0] }, token: { contract: { address: contract }, tokenId: "7" }, balance: "1" },
    { account: { address: addresses[0] }, token: { contract: { address: contract }, tokenId: "7" }, balance: "1" },
  ] as T);
  await assert.rejects(() => getPosseHorseHolders(addresses.slice(0, 2), { contract, tokenId: "7" }, duplicate), /did not match/);
});
