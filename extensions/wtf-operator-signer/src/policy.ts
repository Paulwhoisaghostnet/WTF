import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  isOperatorSignerContractCallIntent,
  operatorSignerEnvelopeSchema,
  type PlatformWalletPublic,
  type OperatorSignerContractCallPayload,
  type OperatorSignerEnvelope,
  type OperatorSignerIntent,
  type OperatorSignerResponse,
} from "../../../shared/operator-signer";
import type { SignerEnv } from "./env";

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

  if (
    envelope.intent === "disburse_wtf" &&
    envelope.payload.transfers.length > env.WTF_OPERATOR_SIGNER_MAX_RECIPIENTS
  ) {
    return refuse("batch too large", "BATCH_TOO_LARGE", envelope.requestId);
  }

  if (isOperatorSignerContractCallIntent(envelope.intent)) {
    const payload = envelope.payload as OperatorSignerContractCallPayload;
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
    level: opts.level,
    keyringConfigured: opts.keyringConfigured,
    wallet: opts.wallet,
    wallets: opts.wallets,
  };
}
