import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_EXACT_EXEMPTIONS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/wallet/challenge",
  "/api/auth/wallet/verify",
  "/api/auth/wallet/register",
  "/api/system/logs/client",
  "/api/tv/playback/events",
  "/api/tv/telemetry/item-end",
]);

const CSRF_PREFIX_EXEMPTIONS = [
  "/api/auth/google",
  "/api/auth/github",
  "/api/auth/twitter",
  "/api/auth/twitter-oauth2",
  "/api/auth/discord",
  "/api/board/webhook/",
  "/api/board/webhooks/",
];

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidCsrfToken(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isCsrfExemptRequest(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (!UNSAFE_METHODS.has(normalizedMethod)) return true;
  const normalizedPath = path.split("?", 1)[0] || "/";
  if (CSRF_EXACT_EXEMPTIONS.has(normalizedPath)) return true;
  return CSRF_PREFIX_EXEMPTIONS.some((prefix) => normalizedPath.startsWith(prefix));
}

export function ensureSessionCsrfToken(req: Request): string {
  const session = req.session as any;
  if (!session.csrfToken) {
    session.csrfToken = createCsrfToken();
  }
  return session.csrfToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const path = req.path || req.originalUrl || "";
  if (!path.startsWith("/api/")) return next();
  if (isCsrfExemptRequest(req.method, path)) return next();
  if (typeof req.isAuthenticated === "function" && !req.isAuthenticated()) {
    return next();
  }

  const expected = ensureSessionCsrfToken(req);
  const provided =
    req.get("x-csrf-token") ||
    req.get("x-xsrf-token") ||
    (typeof req.body?.csrfToken === "string" ? req.body.csrfToken : "");

  if (!isValidCsrfToken(provided, expected)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }

  return next();
}
