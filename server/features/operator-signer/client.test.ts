import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  type OperatorSignerContractCallPayload,
  type OperatorSignerFa2TransferPayload,
  type OperatorSignerOriginationPayload,
} from "@shared/operator-signer";
import { createSignerEnvelope } from "./client";

const AUTH = "test-auth-token";
const CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const WALLET = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

test("operator signer wraps WTF disburse requests in the shared protocol", () => {
  const envelope = createSignerEnvelope(
    {
      intent: "disburse_wtf",
      walletId: "arcade-treasury",
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
  assert.equal(envelope.walletId, "arcade-treasury");
  assert.equal(envelope.intent, "disburse_wtf");

  const payload = envelope.payload as OperatorSignerFa2TransferPayload;
  assert.equal(payload.tokenContract, CONTRACT);
  assert.equal(payload.tokenId, 0);
  assert.deepEqual(payload.transfers, [{ to: WALLET, amount: "42" }]);
});

test("operator signer wraps platform wallet keyring requests without secrets", () => {
  const list = createSignerEnvelope(
    { intent: "list_platform_wallets" },
    { authToken: AUTH, requestId: "req-wallets" }
  );
  assert.equal(list.intent, "list_platform_wallets");
  assert.deepEqual(list.payload, {});

  const create = createSignerEnvelope(
    {
      intent: "create_platform_wallet",
      id: "arcade-treasury",
      label: "Arcade Treasury",
      role: "arcade_treasury",
      network: "mainnet",
    },
    { authToken: AUTH, requestId: "req-create-wallet" }
  );
  assert.equal(create.intent, "create_platform_wallet");
  assert.deepEqual(create.payload, {
    id: "arcade-treasury",
    label: "Arcade Treasury",
    role: "arcade_treasury",
    network: "mainnet",
  });
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

test("operator signer wraps manager-wallet contract originations", () => {
  const envelope = createSignerEnvelope(
    {
      intent: "originate_contract",
      walletId: "club-dues-manager",
      code: [{ prim: "parameter", args: [{ prim: "unit" }] }],
      init: { prim: "Unit" },
      balanceMutez: "0",
      label: "club-dues:test",
      runId: "deploy-1",
    },
    { authToken: AUTH, requestId: "req-origin" }
  );

  assert.equal(envelope.intent, "originate_contract");
  assert.equal(envelope.walletId, "club-dues-manager");
  assert.equal(envelope.runId, "deploy-1");
  const payload = envelope.payload as OperatorSignerOriginationPayload;
  assert.equal(payload.balanceMutez, 0);
  assert.equal(payload.label, "club-dues:test");
  assert.deepEqual(payload.init, { prim: "Unit" });
});

test("WTFIAP escrow requires a stable intent ID and never attaches platform tez", () => {
  const request = {
    intent: "wtfiap_escrow" as const, requestId: "wtfiap:room:start", walletId: "wtfiap-referee",
    counterpartyContract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", chainId: "NetXdQprcVkpaWU" as const,
    entrypoint: "start_room" as const, params: { room_id: "a".repeat(64), expected_terms_hash: "b".repeat(64), match_id: "c".repeat(64) },
  };
  const first = createSignerEnvelope(request, { authToken: "test-auth" });
  const second = createSignerEnvelope(request, { authToken: "test-auth" });
  assert.equal(first.requestId, request.requestId);
  assert.deepEqual(first, second);
  assert.equal(first.intent, "wtfiap_escrow");
  if (first.intent === "wtfiap_escrow") {
    assert.equal(first.payload.mutez, 0);
    assert.equal(first.payload.chainId, "NetXdQprcVkpaWU");
  }
});

test("WTFIAP treasury automation passes only the immutable room identifier", () => {
  const envelope = createSignerEnvelope({ intent: "wtfiap_escrow", requestId: "treasury:room", walletId: "wtfiap-referee",
    counterpartyContract: CONTRACT, chainId: "NetXdQprcVkpaWU", entrypoint: "claim_treasury", params: "a".repeat(64) }, { authToken: AUTH });
  assert.equal(envelope.intent, "wtfiap_escrow");
  if (envelope.intent === "wtfiap_escrow") {
    assert.equal(envelope.payload.args, "a".repeat(64));
    assert.equal(envelope.payload.mutez, 0);
  }
});
