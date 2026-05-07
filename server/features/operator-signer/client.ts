import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import {
  OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT,
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  operatorSignerEnvelopeSchema,
  operatorSignerResponseSchema,
  type OperatorSignerEnvelope,
  type OperatorSignerResponse,
} from "@shared/operator-signer";

export const DEFAULT_OPERATOR_SIGNER_SOCKET =
  "/run/wtf/operator-signer.sock";

export type OperatorSignerClientConfig = {
  socketPath: string;
  authToken: string;
  connectTimeoutMs: number;
  responseTimeoutMs: number;
};

export class SignerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { code?: string; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "SignerError";
    this.code = opts.code ?? "signer_error";
    this.retryable = Boolean(opts.retryable);
  }
}

export type DisburseRecipient = {
  address: string;
  amount: string;
};

export type SignerRequest =
  | {
      intent: "disburse_wtf";
      assetContract: string;
      assetTokenId: number;
      recipients: DisburseRecipient[];
      runId?: number | string;
    }
  | {
      intent: "fund_buyback";
      counterpartyContract: string;
      amountMutez: string;
      runId?: number | string;
    }
  | {
      intent: "withdraw_buyback_xtz";
      counterpartyContract: string;
      runId?: number | string;
    }
  | {
      intent: "withdraw_buyback_wtf";
      counterpartyContract: string;
      amount: string;
      runId?: number | string;
    }
  | {
      intent: "pause_buyback" | "unpause_buyback";
      counterpartyContract: string;
      runId?: number | string;
    }
  | {
      intent: "custom";
      counterpartyContract: string;
      entrypoint: string;
      params: Record<string, unknown> | unknown[];
      amountMutez?: string;
      runId?: number | string;
    };

export type SignerResponse = Extract<OperatorSignerResponse, { ok: true }>;

export function getOperatorSignerClientConfig(
  env: NodeJS.ProcessEnv = process.env
): OperatorSignerClientConfig {
  return {
    socketPath:
      (env.WTF_OPERATOR_SIGNER_SOCKET ?? "").trim() ||
      DEFAULT_OPERATOR_SIGNER_SOCKET,
    authToken: (env.WTF_OPERATOR_SIGNER_AUTH_TOKEN ?? "").trim(),
    connectTimeoutMs: coercePositiveInt(
      env.WTF_OPERATOR_SIGNER_CONNECT_TIMEOUT_MS,
      5_000
    ),
    responseTimeoutMs: coercePositiveInt(
      env.WTF_OPERATOR_SIGNER_RESPONSE_TIMEOUT_MS,
      45_000
    ),
  };
}

export function isSignerConfigured(): boolean {
  return getOperatorSignerClientConfig().authToken.length > 0;
}

export function createSignerEnvelope(
  request: SignerRequest,
  opts: {
    authToken?: string;
    requestId?: string;
  } = {}
): OperatorSignerEnvelope {
  const auth = opts.authToken ?? getOperatorSignerClientConfig().authToken;
  const base = {
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    auth,
    requestId: opts.requestId ?? randomUUID(),
    runId: request.runId == null ? undefined : String(request.runId),
  };

  switch (request.intent) {
    case "disburse_wtf":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          tokenContract: request.assetContract,
          tokenId: request.assetTokenId,
          transfers: request.recipients.map((recipient) => ({
            to: recipient.address,
            amount: recipient.amount,
          })),
        },
      });
    case "fund_buyback":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          contract: request.counterpartyContract,
          entrypoint: OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT[request.intent],
          args: null,
          mutez: mutezStringToNumber(request.amountMutez, "amountMutez"),
        },
      });
    case "withdraw_buyback_xtz":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          contract: request.counterpartyContract,
          entrypoint: OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT[request.intent],
          args: null,
          mutez: 0,
        },
      });
    case "withdraw_buyback_wtf":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          contract: request.counterpartyContract,
          entrypoint: OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT[request.intent],
          args: request.amount,
          mutez: 0,
        },
      });
    case "pause_buyback":
    case "unpause_buyback":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          contract: request.counterpartyContract,
          entrypoint: OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT[request.intent],
          args: null,
          mutez: 0,
        },
      });
    case "custom":
      return operatorSignerEnvelopeSchema.parse({
        ...base,
        intent: request.intent,
        payload: {
          contract: request.counterpartyContract,
          entrypoint: request.entrypoint,
          args: request.params,
          mutez:
            request.amountMutez == null
              ? 0
              : mutezStringToNumber(request.amountMutez, "amountMutez"),
        },
      });
  }
}

export function createSignerHealthEnvelope(
  opts: {
    authToken?: string;
    requestId?: string;
  } = {}
): OperatorSignerEnvelope {
  return operatorSignerEnvelopeSchema.parse({
    version: OPERATOR_SIGNER_PROTOCOL_VERSION,
    auth: opts.authToken ?? getOperatorSignerClientConfig().authToken,
    requestId: opts.requestId ?? randomUUID(),
    intent: "health",
    payload: {},
  });
}

export async function requestSigner(
  envelope: OperatorSignerEnvelope,
  overrides: Partial<OperatorSignerClientConfig> = {}
): Promise<OperatorSignerResponse> {
  const config = { ...getOperatorSignerClientConfig(), ...overrides };
  const raw = await sendOne(JSON.stringify(envelope), config);
  if (!raw) {
    throw new SignerError("signer returned empty response", {
      code: "signer_empty_response",
      retryable: true,
    });
  }

  try {
    return operatorSignerResponseSchema.parse(JSON.parse(raw));
  } catch {
    throw new SignerError(
      `signer returned malformed JSON: ${raw.slice(0, 240)}`,
      { code: "signer_malformed_response" }
    );
  }
}

export async function callSigner(
  request: SignerRequest
): Promise<SignerResponse> {
  const config = getOperatorSignerClientConfig();
  if (config.authToken.length === 0) {
    throw new SignerError(
      "operator signer not configured (WTF_OPERATOR_SIGNER_AUTH_TOKEN missing)",
      { code: "signer_not_configured" }
    );
  }

  const envelope = createSignerEnvelope(request, {
    authToken: config.authToken,
  });
  const parsed = await requestSigner(envelope, config);
  if (!parsed.ok) {
    throw new SignerError(parsed.error || "signer refused request", {
      code: normalizeSignerErrorCode(parsed.code),
    });
  }
  return parsed;
}

async function sendOne(
  raw: string,
  config: OperatorSignerClientConfig
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const done = (err: unknown, value?: string) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value ?? "");
    };

    let socket: Socket;
    try {
      socket = createConnection({ path: config.socketPath });
    } catch (err) {
      return done(err);
    }

    let buf = Buffer.alloc(0);

    const connectTimer = setTimeout(() => {
      socket.destroy();
      done(
        new SignerError("signer connect timed out", {
          code: "signer_unavailable",
          retryable: true,
        })
      );
    }, config.connectTimeoutMs);

    const responseTimer = setTimeout(() => {
      socket.destroy();
      done(
        new SignerError("signer response timed out", {
          code: "signer_timeout",
          retryable: true,
        })
      );
    }, config.responseTimeoutMs);

    socket.on("connect", () => {
      clearTimeout(connectTimer);
      socket.write(raw + "\n");
    });
    socket.on("data", (chunk: Buffer | string) => {
      const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buf = Buffer.concat([buf, b]);
    });
    socket.on("error", (err) => {
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
      done(
        new SignerError(`signer socket error: ${(err as Error).message}`, {
          code: "signer_unavailable",
          retryable: true,
        })
      );
    });
    socket.on("close", () => {
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
      done(null, buf.toString("utf8").trim());
    });
  });
}

function coercePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mutezStringToNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SignerError(`${field} must be a safe non-negative mutez integer`, {
      code: "bad_signer_request",
    });
  }
  return parsed;
}

function normalizeSignerErrorCode(code: string | undefined): string {
  switch (code) {
    case "INVALID_AUTH":
      return "signer_invalid_auth";
    case "BAD_BODY":
      return "signer_malformed_request";
    case "BAD_PAYLOAD":
    case "BAD_EP":
      return "signer_refused";
    case "BATCH_TOO_LARGE":
      return "policy_recipients";
    case "XTZ_CAP":
      return "policy_xtz_cap";
    case "COUNTERPARTY":
      return "policy_contract_not_allowed";
    case "CUSTOM_DISABLED":
      return "policy_custom_disabled";
    case "SIGN_FAILED":
      return "signer_broadcast_failed";
    default:
      return code || "signer_refused";
  }
}
