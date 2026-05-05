import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findAppliedContractCall,
  transactionEntrypoint,
  type TzktTransactionOp,
} from "./tzkt-ops";

const MARKET = "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE";
const WTF_TOKEN = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const TREASURY = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";

test("findAppliedContractCall accepts live TzKT parameter.entrypoint rows", () => {
  const rows: TzktTransactionOp[] = [
    {
      type: "transaction",
      hash: "opFYjwM15ToKfdZCKeNb5cSqodPAeHygmL77LxtSNLqaH66w2P9",
      level: 13073048,
      timestamp: "2026-05-05T17:54:10Z",
      sender: { address: TREASURY },
      target: { address: MARKET },
      entrypoint: null,
      status: "applied",
      amount: 0,
      parameter: {
        entrypoint: "purchase",
        value: {
          listing_id: "0",
          purchase_ref: "cart:19:mosxg34p:24df9bce",
          amount_wtf_units: "1000000000",
        },
      },
    },
    {
      type: "transaction",
      hash: "opFYjwM15ToKfdZCKeNb5cSqodPAeHygmL77LxtSNLqaH66w2P9",
      level: 13073048,
      timestamp: "2026-05-05T17:54:10Z",
      sender: { address: MARKET },
      target: { address: WTF_TOKEN },
      entrypoint: null,
      status: "applied",
      amount: 0,
      parameter: { entrypoint: "transfer", value: [] },
    },
  ];

  assert.equal(transactionEntrypoint(rows[0]), "purchase");
  const match = findAppliedContractCall(rows, {
    contract: MARKET,
    senderOneOf: [TREASURY],
    entrypoint: "purchase",
  });

  assert.equal(match?.entrypoint, "purchase");
  assert.equal(match?.sender, TREASURY);
  assert.equal(match?.target, MARKET);
});

test("findAppliedContractCall still accepts row-level entrypoint rows", () => {
  const rows: TzktTransactionOp[] = [
    {
      hash: "ooFakeHashForShapeOnly111111111111111111111111111111",
      sender: { address: TREASURY },
      target: { address: MARKET },
      entrypoint: "purchase",
      status: "applied",
    },
  ];

  const match = findAppliedContractCall(rows, {
    contract: MARKET,
    senderOneOf: [TREASURY],
    entrypoint: "purchase",
  });

  assert.equal(match?.entrypoint, "purchase");
});
