import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  operatorSignerEnvelopeSchema,
} from "../../../shared/operator-signer";
import type { SignerEnv } from "./env";
import { enforceEnvelopePolicy } from "./policy";

const env: SignerEnv = {
  WTF_OPERATOR_SIGNER_RPC: "https://tezos-mainnet.octez.io/",
  WTF_OPERATOR_SIGNER_SOCKET: "/tmp/wtf-operator-signer.sock",
  WTF_OPERATOR_SIGNER_AUTH_TOKEN: "test-auth-token",
  WTF_OPERATOR_SIGNER_SECRET: "",
  WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID: "operator",
  WTF_PLATFORM_KEYRING_PATH: "/tmp/keyring.json",
  WTF_PLATFORM_KEYRING_MASTER_KEY: "",
  WTF_PLATFORM_KEYRING_MASTER_KEY_FILE: "",
  WTF_PLATFORM_KEYRING_CREATE_ENABLED: 0,
  WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: [],
  WTF_OPERATOR_SIGNER_DISBURSE_ASSETS: ["KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD:0"],
  WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: 100_000_000,
  WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: 200,
  WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 0,
  WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION: 0,
  WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES: 750_000,
  WTF_OPERATOR_SIGNER_AUDIT_LOG: "/tmp/operator-signer.log",
};

test("disburse_wtf policy only permits configured FA2 reward assets", () => {
  const allowed = operatorSignerEnvelopeSchema.parse({
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    auth: env.WTF_OPERATOR_SIGNER_AUTH_TOKEN,
    requestId: "allowed",
    intent: "disburse_wtf",
    payload: {
      tokenContract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
      tokenId: 0,
      transfers: [{ to: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU", amount: "100000000" }],
    },
  });
  assert.equal(enforceEnvelopePolicy(env, allowed), null);

  const blocked = operatorSignerEnvelopeSchema.parse({
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    auth: env.WTF_OPERATOR_SIGNER_AUTH_TOKEN,
    requestId: "blocked",
    intent: "disburse_wtf",
    payload: {
      tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
      tokenId: 0,
      transfers: [{ to: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU", amount: "100000000" }],
    },
  });
  const refused = enforceEnvelopePolicy(env, blocked);
  assert.equal(refused?.ok, false);
  assert.equal(refused?.code, "DISBURSE_ASSET");
});
