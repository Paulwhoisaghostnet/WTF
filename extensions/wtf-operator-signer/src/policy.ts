import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  isOperatorSignerContractCallIntent,
  operatorSignerEnvelopeSchema,
  type PlatformWalletPublic,
  type OperatorSignerContractCallPayload,
  type OperatorSignerEnvelope,
  type OperatorSignerIntent,
  type OperatorSignerOriginationPayload,
  type OperatorSignerResponse,
} from "../../../shared/operator-signer";
import type { SignerEnv } from "./env";

export function wtfIapSignerLane(env: SignerEnv, chainId: string) {
  if (chainId === "NetXdQprcVkpaWU" && env.WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID !== chainId &&
      env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CHAIN_ID === chainId) {
    return { contracts: env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CONTRACTS,
      walletId: env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_WALLET_ID,
      chainId: env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CHAIN_ID,
      rpc: env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_RPC,
      journalPath: env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_JOURNAL_PATH };
  }
  return { contracts: env.WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS,
    walletId: env.WTF_OPERATOR_SIGNER_WTFIAP_WALLET_ID,
    chainId: env.WTF_OPERATOR_SIGNER_WTFIAP_CHAIN_ID,
    rpc: env.WTF_OPERATOR_SIGNER_WTFIAP_RPC,
    journalPath: env.WTF_OPERATOR_SIGNER_WTFIAP_JOURNAL_PATH };
}

export function parseEnvelope(raw: string):
  | { ok: true; envelope: OperatorSignerEnvelope }
  | { ok: false; response: OperatorSignerResponse } {
  try {
    const envelope = operatorSignerEnvelopeSchema.parse(JSON.parse(raw));
    return { ok: true, envelope };
  } catch {
    return {
      ok: false,
      response: refuse("bad request body", "BAD_BODY"),
    };
  }
}

export function enforceEnvelopePolicy(
  env: SignerEnv,
  envelope: OperatorSignerEnvelope
): OperatorSignerResponse | null {
  if (envelope.auth !== env.WTF_OPERATOR_SIGNER_AUTH_TOKEN) {
    return refuse("invalid auth token", "INVALID_AUTH", envelope.requestId);
  }

  if (envelope.intent === "health") return null;

  if (envelope.intent === "wtfiap_escrow") {
    const lane = wtfIapSignerLane(env, envelope.payload.chainId);
    if (!lane.contracts?.includes(envelope.payload.contract)) {
      return refuse("WTFIAP escrow is not allowlisted", "WTFIAP_CONTRACT", envelope.requestId);
    }
    if (!lane.walletId || envelope.walletId !== lane.walletId) {
      return refuse("WTFIAP referee wallet mismatch", "WTFIAP_WALLET", envelope.requestId);
    }
    if (!lane.rpc) {
      return refuse("WTFIAP requires its own explicit RPC", "WTFIAP_RPC", envelope.requestId);
    }
    if (envelope.payload.chainId !== lane.chainId) {
      return refuse("WTFIAP chain mismatch", "WTFIAP_CHAIN", envelope.requestId);
    }
  }

  if (
    envelope.intent === "disburse_wtf" &&
    envelope.payload.transfers.length > env.WTF_OPERATOR_SIGNER_MAX_RECIPIENTS
  ) {
    return refuse("batch too large", "BATCH_TOO_LARGE", envelope.requestId);
  }

  if (envelope.intent === "disburse_wtf") {
    const asset = `${envelope.payload.tokenContract}:${envelope.payload.tokenId}`;
    if (!env.WTF_OPERATOR_SIGNER_DISBURSE_ASSETS.includes(asset)) {
      return refuse(
        "disbursement asset not allowlisted",
        "DISBURSE_ASSET",
        envelope.requestId
      );
    }
  }

  if (isOperatorSignerContractCallIntent(envelope.intent)) {
    const payload = envelope.payload as OperatorSignerContractCallPayload;
    if ([...env.WTF_OPERATOR_SIGNER_WTFIAP_CONTRACTS, ...env.WTF_OPERATOR_SIGNER_WTFIAP_MAINNET_CONTRACTS].includes(payload.contract)) {
      return refuse("WTFIAP escrow requires its durable typed intent", "WTFIAP_INTENT_REQUIRED", envelope.requestId);
    }
    if (payload.mutez > env.WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ) {
      return refuse(
        "exceeds per-op xtz cap",
        "XTZ_CAP",
        envelope.requestId
      );
    }
    if (
      env.WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST.length > 0 &&
      !env.WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST.includes(
        payload.contract
      )
    ) {
      return refuse(
        "counterparty not allowlisted",
        "COUNTERPARTY",
        envelope.requestId
      );
    }
  }

  if (
    envelope.intent === "custom" &&
    env.WTF_OPERATOR_SIGNER_ALLOW_CUSTOM !== 1
  ) {
    return refuse(
      "intent=custom disabled",
      "CUSTOM_DISABLED",
      envelope.requestId
    );
  }

  if (envelope.intent === "originate_contract") {
    const payload = envelope.payload as OperatorSignerOriginationPayload;
    if (env.WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION !== 1) {
      return refuse(
        "intent=originate_contract disabled",
        "ORIGINATION_DISABLED",
        envelope.requestId
      );
    }
    if (payload.balanceMutez > env.WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ) {
      return refuse(
        "exceeds per-op xtz cap",
        "XTZ_CAP",
        envelope.requestId
      );
    }
    const payloadBytes = Buffer.byteLength(
      JSON.stringify({ code: payload.code, init: payload.init }),
      "utf8"
    );
    if (payloadBytes > env.WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES) {
      return refuse(
        "origination payload too large",
        "ORIGINATION_TOO_LARGE",
        envelope.requestId
      );
    }
  }

  return null;
}

export function refuse(
  error: string,
  code: string,
  requestId?: string
): OperatorSignerResponse {
  return {
    ok: false,
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    requestId,
    error,
    code,
  };
}

export function okResponse(opts: {
  requestId: string;
  intent: OperatorSignerIntent;
  signedBy?: string;
  opHash?: string;
  contractAddress?: string;
  level?: number;
  keyringConfigured?: boolean;
  wallet?: PlatformWalletPublic;
  wallets?: PlatformWalletPublic[];
}): OperatorSignerResponse {
  return {
    ok: true,
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    requestId: opts.requestId,
    intent: opts.intent,
    rawIntent: opts.intent,
    signedBy: opts.signedBy,
    opHash: opts.opHash,
    contractAddress: opts.contractAddress,
    level: opts.level,
    keyringConfigured: opts.keyringConfigured,
    wallet: opts.wallet,
    wallets: opts.wallets,
  };
}
