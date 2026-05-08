import { existsSync } from "node:fs";
import {
  OPERATOR_SIGNER_PROTOCOL_VERSION,
  type OperatorSignerResponse,
} from "@shared/operator-signer";
import {
  createSignerHealthEnvelope,
  getOperatorSignerClientConfig,
  requestSigner,
  SignerError,
} from "./client";

export type OperatorSignerHealth = {
  configured: boolean;
  socketPath: string;
  socketPresent: boolean;
  protocolVersion: number;
  reachable: boolean;
  ok: boolean;
  code?: string;
  error?: string;
  response?: OperatorSignerResponse;
};

function publicHealthResponse(
  response: OperatorSignerResponse
): OperatorSignerResponse {
  if (!response.ok) return response;
  const { wallet: _wallet, wallets: _wallets, ...safe } = response;
  return safe;
}

export async function checkOperatorSignerHealth(): Promise<OperatorSignerHealth> {
  const config = getOperatorSignerClientConfig();
  const base = {
    configured: config.authToken.length > 0,
    socketPath: config.socketPath,
    socketPresent: existsSync(config.socketPath),
    protocolVersion: OPERATOR_SIGNER_PROTOCOL_VERSION,
  };

  if (!base.configured) {
    return {
      ...base,
      reachable: false,
      ok: false,
      code: "signer_not_configured",
      error: "WTF_OPERATOR_SIGNER_AUTH_TOKEN is missing",
    };
  }

  try {
    const envelope = createSignerHealthEnvelope({
      authToken: config.authToken,
    });
    const response = await requestSigner(envelope, {
      ...config,
      connectTimeoutMs: Math.min(config.connectTimeoutMs, 1_000),
      responseTimeoutMs: Math.min(config.responseTimeoutMs, 2_000),
    });
    return {
      ...base,
      reachable: true,
      ok: response.ok && response.version === OPERATOR_SIGNER_PROTOCOL_VERSION,
      response: publicHealthResponse(response),
    };
  } catch (err) {
    if (err instanceof SignerError) {
      return {
        ...base,
        reachable: false,
        ok: false,
        code: err.code,
        error: err.message,
      };
    }
    return {
      ...base,
      reachable: false,
      ok: false,
      code: "signer_health_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
