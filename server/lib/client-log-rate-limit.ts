import type { Request } from "express";
import { createInMemoryRateLimit } from "./in-memory-rate-limit";

export const CLIENT_LOG_RATE_LIMIT_WINDOW_MS = 60_000;
export const CLIENT_LOG_RATE_LIMIT_MAX = 120;
export const CLIENT_LOG_RATE_LIMIT_MAX_ENTRIES = 5_000;

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function boundedPart(value: unknown, fallback: string): string {
  const normalized = String(value || fallback).trim();
  return (normalized || fallback).slice(0, 128);
}

export function clientLogRateLimitKey(req: Request): string {
  const user = req.user as { id?: number | string } | undefined;
  if (user?.id != null) return `user:${boundedPart(user.id, "unknown")}`;

  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  const sourceIp = boundedPart(
    forwardedFor.split(",")[0] || req.ip || req.socket.remoteAddress,
    "unknown"
  );
  return `ip:${sourceIp}`;
}

export function createClientLogRateLimit(options?: {
  maxEntries?: number;
  sweepIntervalMs?: number;
}) {
  return createInMemoryRateLimit({
    windowMs: CLIENT_LOG_RATE_LIMIT_WINDOW_MS,
    max: CLIENT_LOG_RATE_LIMIT_MAX,
    message: { error: "Too many client log events, please try again later" },
    keyGenerator: clientLogRateLimitKey,
    maxEntries: options?.maxEntries ?? CLIENT_LOG_RATE_LIMIT_MAX_ENTRIES,
    sweepIntervalMs: options?.sweepIntervalMs,
  });
}

export const clientLogRateLimit = createClientLogRateLimit();
