/**
 * Thin client for the out-of-process `wtf-operator-signer` service.
 *
 * The signer listens on a Unix domain socket (socket path is configured
 * via `WTF_OPERATOR_SIGNER_SOCKET`) and accepts one JSON request per
 * connection, returning one JSON response. Every request is authenticated
 * by a shared token (`WTF_OPERATOR_SIGNER_AUTH_TOKEN`).
 *
 * This module is the WTF-app side of that contract: we marshal a typed
 * request into the wire format, open the socket, send the line, and parse
 * whatever the signer wrote back. All errors are surfaced as thrown
 * `SignerError` instances so routes can map them to HTTP status codes.
 *
 * Note on isolation: the signer is a separate OS user with its own
 * filesystem, its own copy of the secret key, and its own audit log.
 * The WTF app never sees the private key and cannot bypass the signer's
 * policy checks (per-intent allowlists, XTZ caps, recipient caps).
 */

import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";

const SOCKET_PATH =
  (process.env.WTF_OPERATOR_SIGNER_SOCKET ?? "").trim() ||
  "/run/wtf/operator-signer.sock";
const AUTH_TOKEN = (
  process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN ?? ""
).trim();
const CONNECT_TIMEOUT_MS = 5_000;
const RESPONSE_TIMEOUT_MS = 45_000;

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

export function isSignerConfigured(): boolean {
  return AUTH_TOKEN.length > 0;
}

export type DisburseRecipient = {
  address: string;
  amount: string; // stringified nat (FA2 units)
};

export type SignerRequest =
  | {
      intent: "disburse_wtf";
      assetContract: string;
      assetTokenId: number;
      recipients: DisburseRecipient[];
      runId?: number;
    }
  | {
      intent: "fund_buyback";
      counterpartyContract: string;
      amountMutez: string;
      runId?: number;
    }
  | {
      intent: "withdraw_buyback_xtz";
      counterpartyContract: string;
      runId?: number;
    }
  | {
      intent: "withdraw_buyback_wtf";
      counterpartyContract: string;
      amount: string; // stringified nat
      runId?: number;
    }
  | {
      intent: "pause_buyback" | "unpause_buyback";
      counterpartyContract: string;
      runId?: number;
    }
  | {
      intent: "custom";
      counterpartyContract: string;
      entrypoint: string;
      params: Record<string, unknown> | unknown[];
      amountMutez?: string;
      runId?: number;
    };

export type SignerResponse = {
  ok: boolean;
  opHash?: string;
  intent?: string;
  code?: string;
  error?: string;
  signedBy?: string;
};

async function sendOne(raw: string): Promise<string> {
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
      socket = createConnection({ path: SOCKET_PATH });
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
    }, CONNECT_TIMEOUT_MS);

    const responseTimer = setTimeout(() => {
      socket.destroy();
      done(
        new SignerError("signer response timed out", {
          code: "signer_timeout",
          retryable: true,
        })
      );
    }, RESPONSE_TIMEOUT_MS);

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

/**
 * Submit a request to the signer. Returns the parsed JSON response; throws
 * `SignerError` on connection / protocol / policy failure.
 */
export async function callSigner(
  request: SignerRequest
): Promise<SignerResponse> {
  if (!isSignerConfigured()) {
    throw new SignerError(
      "operator signer not configured (WTF_OPERATOR_SIGNER_AUTH_TOKEN missing)",
      { code: "signer_not_configured" }
    );
  }
  const wire = JSON.stringify({
    ...request,
    token: AUTH_TOKEN,
    requestId: randomUUID(),
  });
  const raw = await sendOne(wire);
  if (!raw) {
    throw new SignerError("signer returned empty response", {
      code: "signer_empty_response",
      retryable: true,
    });
  }
  let parsed: SignerResponse;
  try {
    parsed = JSON.parse(raw) as SignerResponse;
  } catch {
    throw new SignerError(
      `signer returned malformed JSON: ${raw.slice(0, 240)}`,
      { code: "signer_malformed_response" }
    );
  }
  if (!parsed.ok) {
    throw new SignerError(parsed.error ?? "signer refused request", {
      code: parsed.code ?? "signer_refused",
    });
  }
  return parsed;
}
