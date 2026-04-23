/**
 * Shared HMAC helper used for server-to-server webhooks (the Discord bot, the
 * operator signer, future services on the Hetzner host).
 *
 * The shared secret lives in `WTF_BOT_WEBHOOK_SECRET` (and, per-service,
 * `WTF_OPERATOR_WEBHOOK_SECRET`) — set it in both the WTF server `.env` and
 * the service `.env`. Messages are signed as:
 *
 *   ts = unix-millis
 *   body = raw JSON (or empty string for GET)
 *   signature = HMAC_SHA256(secret, `${ts}.${body}`)
 *
 * The request must send `x-wtf-signature: sha256=<hex>` and `x-wtf-timestamp:
 * <ts>`. Requests older than `MAX_SKEW_MS` are rejected to blunt replay.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const MAX_SKEW_MS = 5 * 60 * 1000;

export interface VerifyOptions {
  secretEnv: string;
  /**
   * If true, any request missing `x-wtf-signature` is allowed through — used
   * for endpoints that are dual-mounted (e.g. `POST /api/attendance/in-app`
   * can be hit either by the bot with HMAC or by an authenticated browser
   * session).
   */
  optional?: boolean;
}

export function verifyWtfWebhookSignature(opts: VerifyOptions) {
  return function verifyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const signature =
      typeof req.headers["x-wtf-signature"] === "string"
        ? (req.headers["x-wtf-signature"] as string)
        : Array.isArray(req.headers["x-wtf-signature"])
          ? req.headers["x-wtf-signature"][0]
          : "";

    if (!signature) {
      if (opts.optional) {
        (req as any).wtfWebhookVerified = false;
        return next();
      }
      return res.status(401).json({ error: "missing_signature" });
    }

    const secret = process.env[opts.secretEnv];
    if (!secret) {
      console.warn(
        `[webhook-hmac] ${opts.secretEnv} not configured; rejecting signed request`
      );
      return res.status(503).json({ error: "webhook_not_configured" });
    }

    const ts =
      typeof req.headers["x-wtf-timestamp"] === "string"
        ? (req.headers["x-wtf-timestamp"] as string)
        : Array.isArray(req.headers["x-wtf-timestamp"])
          ? req.headers["x-wtf-timestamp"][0]
          : "";

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      return res.status(401).json({ error: "bad_timestamp" });
    }
    if (Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
      return res.status(401).json({ error: "timestamp_skew" });
    }

    const body =
      typeof (req as any).rawBody === "string"
        ? ((req as any).rawBody as string)
        : req.body
          ? JSON.stringify(req.body)
          : "";

    const expected = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");

    const provided = signature.replace(/^sha256=/, "").trim();

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))
    ) {
      return res.status(401).json({ error: "bad_signature" });
    }

    (req as any).wtfWebhookVerified = true;
    return next();
  };
}

/**
 * Convenience helper used by services (Discord bot, operator signer) to sign
 * their outgoing webhook calls with the same scheme.
 */
export function signWtfWebhook(
  secret: string,
  body: string
): { ts: string; signature: string } {
  const ts = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
  return { ts, signature: `sha256=${signature}` };
}
