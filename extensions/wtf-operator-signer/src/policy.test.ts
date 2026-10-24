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
  WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS: [],
  WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: "",
  WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID: "",
    WTF_OPERATOR_SIGNER_WTFIAP_RPC: "",
  WTF_OPERATOR_SIGNER_WTFIAP_JOURNAL_PATH: "/tmp/wtfiap-journal",
  WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CONTRACTS: [],
  WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_WALLET_ID: "",
  WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CHAIN_ID: "",
  WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_RPC: "",
  WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_JOURNAL_PATH: "/tmp/wtfiap-mainnet-journal",
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

test("WTFIAP lane pins contract, wallet and chain even when custom calls are disabled", () => {
  const envelope = operatorSignerEnvelopeSchema.parse({
    version: 1, auth: env.WTF_OPERATOR_SIGNER_AUTH_TOKEN, requestId: "room-creation",
    walletId: "wtfiap-referee", intent: "wtfiap_escrow", payload: {
      contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", chainId: "NetXdQprcVkpaWU",
      entrypoint: "start_room", args: { room_id: "a".repeat(64), expected_terms_hash: "b".repeat(64), match_id: "c".repeat(64) },
    },
  });
  const allowed = { ...env, WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS: ["KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD"],
    WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: "wtfiap-referee", WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID: "NetXdQprcVkpaWU", WTF_OPERATOR_SIGNER_WTFIAP_RPC: "https://tezos-mainnet.octez.io/" };
  assert.equal(policyCode(env, envelope), "WTFIAP_CONTRACT");
  assert.equal(enforceEnvelopePolicy(allowed, envelope), null);
  assert.equal(policyCode({ ...allowed, WTF_OPERATOR_SIGNER_WTFIAP_RPC: "" }, envelope), "WTFIAP_RPC");
  assert.equal(policyCode({ ...allowed, WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: "operator" }, envelope), "WTFIAP_WALLET");
  assert.equal(policyCode({ ...allowed, WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID: "NetXsqzbfFenSTS" }, envelope), "WTFIAP_CHAIN");
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...envelope, payload: { ...envelope.payload, mutez: 1 } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...envelope, payload: { ...envelope.payload, entrypoint: "claim" } }));
  const custom = operatorSignerEnvelopeSchema.parse({ ...envelope, intent: "custom", payload: {
    contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", entrypoint: "start_room", args: {}, mutez: 0,
  } });
  assert.equal(policyCode({ ...allowed, WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 1 }, custom), "WTFIAP_INTENT_REQUIRED");
});

test("Shadownet and Mainnet WTFIAP signer lanes remain separate", () => {
  const shadownetContract = "KT1" + "1".repeat(33), mainnetContract = "KT1" + "2".repeat(33);
  const settings: SignerEnv = { ...env,
    WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS: [shadownetContract], WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID: "test-referee",
    WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID: "NetXsqzbfFenSTS", WTF_OPERATOR_SIGNER_WTFIAP_RPC: "https://tezos-shadownet.octez.io/",
    WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CONTRACTS: [mainnetContract], WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_WALLET_ID: "mainnet-referee",
    WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CHAIN_ID: "NetXdQprcVkpaWU", WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_RPC: "https://tezos-mainnet.octez.io/" };
  const make = (walletId: string, chainId: string, contract: string) => operatorSignerEnvelopeSchema.parse({
    version: 1, auth: settings.WTF_OPERATOR_SIGNER_AUTH_TOKEN, requestId: "room-start", walletId,
    intent: "wtfiap_escrow", payload: { contract, chainId, entrypoint: "start_room",
      args: { room_id: "a".repeat(64), expected_terms_hash: "b".repeat(64), match_id: "c".repeat(64) } } });
  assert.equal(enforceEnvelopePolicy(settings, make("test-referee", "NetXsqzbfFenSTS", shadownetContract)), null);
  assert.equal(enforceEnvelopePolicy(settings, make("mainnet-referee", "NetXdQprcVkpaWU", mainnetContract)), null);
  assert.equal(policyCode(settings, make("test-referee", "NetXdQprcVkpaWU", shadownetContract)), "WTFIAP_CONTRACT");
  assert.equal(policyCode(settings, make("mainnet-referee", "NetXsqzbfFenSTS", mainnetContract)), "WTFIAP_CONTRACT");
  assert.equal(policyCode({ ...settings, WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 1 }, operatorSignerEnvelopeSchema.parse({
    ...make("mainnet-referee", "NetXdQprcVkpaWU", mainnetContract), intent: "custom",
    payload: { contract: mainnetContract, entrypoint: "start_room", args: {}, mutez: 0 } })), "WTFIAP_INTENT_REQUIRED");
});

test("WTFIAP signer validates two-human AI rooms and full-field ranks while preserving pinned old rooms", () => {
  const entrants = ["tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ", "tz1g49uR2BF63hfhZzWr1yQRGfVWinycYwBJ"];
  const target = { version: 1, auth: "test", requestId: "ai-room", walletId: "wtfiap-referee", intent: "wtfiap_escrow",
    payload: { contract: "KT1G1zBKD5fVdmXFTAikmMAAK1urRnQ699nh", chainId: "NetXsqzbfFenSTS", entrypoint: "create_room",
      args: { room_id: "a".repeat(64), terms_hash: "b".repeat(64), rules_hash: "c".repeat(64), seed_commitment: "d".repeat(64),
        referee: entrants[0], currency: "0", entry_amount: "10000", payout_mode: "1", entrants } } };
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse(target));
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse({ ...target, payload: { ...target.payload,
    args: { ...target.payload.args, payout_mode: "0" } } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...target, payload: { ...target.payload,
    args: { ...target.payload.args, entrants: [entrants[0]] } } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...target, payload: { ...target.payload,
    args: { ...target.payload.args, payout_mode: "0", entrants: [...entrants, "tz1a5q2EhDdenvyYB95oYtaaBWJ4PStzgBmk"] } } }));
  const oldEntrants = Array.from({ length: 8 }, (_, i) => "tz1" + String(i + 1).repeat(33));
  const { payout_mode: _mode, ...oldArgs } = target.payload.args;
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse({ ...target, payload: { ...target.payload,
    args: { ...oldArgs, entrants: oldEntrants } } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...target, payload: { ...target.payload, args: oldArgs } }));
  const ranks = entrants.map((player, i) => ({ player, rank: String(i ? 5 : 2), group_size: "1" }));
  const finish = { ...target, payload: { contract: target.payload.contract, chainId: target.payload.chainId,
    entrypoint: "finalize_room", args: { room_id: target.payload.args.room_id, match_id: "e".repeat(64),
      transcript_hash: "f".repeat(64), result_hash: "a".repeat(64), ranks } } };
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse(finish));
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse({ ...finish, payload: { ...finish.payload,
    args: { ...finish.payload.args, ranks: oldEntrants.map((player, i) => ({ player, rank: String(i + 1) })) } } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...finish, payload: { ...finish.payload,
    args: { ...finish.payload.args, ranks: ranks.map(({ group_size: _size, ...rank }) => rank) } } }));
});

function policyCode(config: SignerEnv, envelope: Parameters<typeof enforceEnvelopePolicy>[1]) {
  const result = enforceEnvelopePolicy(config, envelope);
  return result && !result.ok ? result.code : undefined;
}

test("WTFIAP void evidence and fixed treasury claims cannot become arbitrary transfers", () => {
  const base = { version: 1, auth: "test", requestId: "room-void", walletId: "wtfiap-referee", intent: "wtfiap_escrow" };
  const target = { contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", chainId: "NetXdQprcVkpaWU", mutez: 0 };
  const args = { room_id: "a".repeat(64), reason_hash: "b".repeat(64), evidence_hash: "c".repeat(64) };
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse({ ...base, payload: { ...target, entrypoint: "void_room", args } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...base, payload: { ...target, entrypoint: "void_room", args: { room_id: args.room_id } } }));
  assert.doesNotThrow(() => operatorSignerEnvelopeSchema.parse({ ...base, payload: { ...target, entrypoint: "claim_treasury", args: args.room_id } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...base, payload: { ...target, entrypoint: "claim_treasury", args: { room_id: args.room_id, to: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU", amount: "1" } } }));
  assert.throws(() => operatorSignerEnvelopeSchema.parse({ ...base, payload: { ...target, entrypoint: "refund", args: args.room_id } }));
});
