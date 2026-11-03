import test from "node:test";
import assert from "node:assert/strict";
import { getTraderEditionCounts } from "./trader-editions";

const wallet = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const secondContract = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";

test("profile edition counts use exact wallet and token filters and retain zero for absent balances", async () => {
  const reads: Array<Record<string, unknown>> = [];
  const read = async <T>(_path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
    reads.push(params || {});
    const tokenId = params?.["token.tokenId.in"];
    const tokenContract = params?.["token.contract"];
    const row = tokenContract === contract && tokenId === "1,2"
      ? [{ account: { address: wallet }, token: { contract: { address: contract }, tokenId: "1" }, balance: "3" }]
      : [{ account: { address: wallet }, token: { contract: { address: secondContract }, tokenId: "7" }, balance: "2" }];
    return row as T;
  };
  const counts = await getTraderEditionCounts(wallet, [
    { contract, tokenId: "1" }, { contract, tokenId: "2" },
    { contract: secondContract, tokenId: "7" },
  ], 2, read);
  assert.deepEqual([...counts], [
    [`${contract}/1`, "3"], [`${contract}/2`, "0"], [`${secondContract}/7`, "2"],
  ]);
  assert.deepEqual(reads.map((params) => [params.account, params["token.contract"], params["token.tokenId.in"]]), [
    [wallet, contract, "1,2"], [wallet, secondContract, "7"],
  ]);
});

test("profile edition counts reject balances for a different wallet", async () => {
  await assert.rejects(() => getTraderEditionCounts(wallet, [{ contract, tokenId: "1" }], 2,
    async <T>() => [{ account: { address: "tz1wrong" }, token: { contract: { address: contract }, tokenId: "1" }, balance: "5" }] as T),
  /requested wallet and tokens/);
});
