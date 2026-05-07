import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  type OperatorSignerContractCallPayload,
  type OperatorSignerFa2TransferPayload,
} from "@shared/operator-signer";
import { createSignerEnvelope } from "./client";

const AUTH = "test-auth-token";
const CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const WALLET = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

test("operator signer wraps WTF disburse requests in the shared protocol", () => {
  const envelope = createSignerEnvelope(
    {
      intent: "disburse_wtf",
      assetContract: CONTRACT,
      assetTokenId: 0,
      recipients: [{ address: WALLET, amount: "42" }],
      runId: 123,
    },
    { authToken: AUTH, requestId: "req-disburse" }
  );

  assert.equal(envelope.version, OPERATOR_SIGNER_PROTOCOL_VERSION);
  assert.equal(envelope.auth, AUTH);
  assert.equal(envelope.requestId, "req-disburse");
  assert.equal(envelope.runId, "123");
  assert.equal(envelope.intent, "disburse_wtf");

  const payload = envelope.payload as OperatorSignerFa2TransferPayload;
  assert.equal(payload.tokenContract, CONTRACT);
  assert.equal(payload.tokenId, 0);
  assert.deepEqual(payload.transfers, [{ to: WALLET, amount: "42" }]);
});

test("operator signer maps buyback actions to contract entrypoints", () => {
  const fund = createSignerEnvelope(
    {
      intent: "fund_buyback",
      counterpartyContract: CONTRACT,
      amountMutez: "1250000",
    },
    { authToken: AUTH, requestId: "req-fund" }
  );
  const fundPayload = fund.payload as OperatorSignerContractCallPayload;
  assert.equal(fund.intent, "fund_buyback");
  assert.equal(fundPayload.entrypoint, "fund_xtz");
  assert.equal(fundPayload.mutez, 1250000);

  const withdraw = createSignerEnvelope(
    {
      intent: "withdraw_buyback_wtf",
      counterpartyContract: CONTRACT,
      amount: "999",
    },
    { authToken: AUTH, requestId: "req-withdraw" }
  );
  const withdrawPayload =
    withdraw.payload as OperatorSignerContractCallPayload;
  assert.equal(withdrawPayload.entrypoint, "withdraw_accumulated_wtf");
  assert.equal(withdrawPayload.args, "999");
});
