import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  collectFa2Transfers,
  verifyBuybackSwapByHash,
} from "./wtf-op-verification";
import type { TzktTransactionOp } from "./tzkt-ops";

test("collectFa2Transfers reads TzKT FA2 transfer payloads with Michelson field names", () => {
  const op: TzktTransactionOp = {
    parameter: {
      entrypoint: "transfer",
      value: [
        {
          from_: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
          txs: [
            {
              to_: "tz1Yk4vRt39FMq3bhL1zLNo1hxhNQamZbGy4",
              token_id: "0",
              amount: "100000000",
            },
          ],
        },
      ],
    },
  };

  assert.deepEqual(collectFa2Transfers(op), [
    {
      from: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
      to: "tz1Yk4vRt39FMq3bhL1zLNo1hxhNQamZbGy4",
      tokenId: "0",
      amount: "100000000",
    },
  ]);
});

test("collectFa2Transfers reads TzKT FA2 transfer payloads with normalized field names", () => {
  const op: TzktTransactionOp = {
    parameter: {
      entrypoint: "transfer",
      value: [
        {
          from: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
          txs: [
            {
              to: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
              tokenId: 0,
              amount: 42,
            },
          ],
        },
      ],
    },
  };

  assert.deepEqual(collectFa2Transfers(op), [
    {
      from: "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
      to: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
      tokenId: "0",
      amount: "42",
    },
  ]);
});

test("recapture and buyback routes verify op hashes before recording user-value writes", () => {
  const recapture = readFileSync("server/routes/wtf-recapture.ts", "utf8");
  const buyback = readFileSync("server/routes/buyback-windows.ts", "utf8");
  const auctions = readFileSync("server/routes/wtf-auctions.ts", "utf8");

  assert.match(recapture, /verifyWtfTransferToOperatorByHash/);
  assert.match(recapture, /ANTE_OPHASH_\$\{\(verified\.reason \?\? "mismatch"\)\.toUpperCase\(\)\}/);
  assert.match(recapture, /ENTRY_FEE_OPHASH_\$\{\(verified\.reason \?\? "mismatch"\)\.toUpperCase\(\)\}/);
  assert.match(buyback, /verifyBuybackSwapByHash/);
  assert.match(buyback, /BUYBACK_OPHASH_\$\{\(verified\.reason \?\? "mismatch"\)\.toUpperCase\(\)\}/);
  const buybackVerify = buyback.indexOf("const verified = await verifyBuybackSwapByHash");
  const buybackReject = buyback.indexOf("if (!verified.ok)", buybackVerify);
  const buybackWrite = buyback.indexOf(".update(buybackAllowlist)", buybackReject);
  assert.ok(buybackVerify >= 0 && buybackVerify < buybackReject);
  assert.ok(buybackReject < buybackWrite);
  assert.match(auctions, /verifyWtfTransferToOperatorByHash/);
  assert.match(auctions, /AUCTION_SETTLEMENT_OPHASH_\$\{\(verified\.reason \?\? "mismatch"\)\.toUpperCase\(\)\}/);
});

test("an invalid buyback operation hash fails before any TzKT lookup can authorize state", async () => {
  const result = await verifyBuybackSwapByHash({
    opHash: "not-a-tezos-operation",
    buybackContract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
    senderOneOf: ["tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt"],
    amountWtf: "100000000",
  });
  assert.deepEqual(result, { ok: false, reason: "invalid_hash" });
});
