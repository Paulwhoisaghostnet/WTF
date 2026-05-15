import type { Request } from "express";
import { createInMemoryRateLimit } from "./in-memory-rate-limit";

export const BOARD_WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;
export const BOARD_WEBHOOK_RATE_LIMIT_MAX = 20;
export const BOARD_WEBHOOK_RATE_LIMIT_MAX_ENTRIES = 5_000;

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function boundedPart(value: unknown, fallback: string): string {
  const normalized = String(value || fallback).trim();
  return (normalized || fallback).slice(0, 128);
}

export function boardWebhookSourceIp(req: Request): string {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  return boundedPart(
    forwardedFor.split(",")[0] || req.ip || req.socket.remoteAddress,
    "unknown"
  );
}

export function boardWebhookRateLimitKey(req: Request): string {
  const token = boundedPart(req.params?.token, "missing-token");
  const sourceIp = boardWebhookSourceIp(req);
  return `${token}:${sourceIp}`;
}

export function createBoardWebhookRateLimit(options?: {
  maxEntries?: number;
  sweepIntervalMs?: number;
}) {
  return createInMemoryRateLimit({
    windowMs: BOARD_WEBHOOK_RATE_LIMIT_WINDOW_MS,
    max: BOARD_WEBHOOK_RATE_LIMIT_MAX,
    message: { error: "Webhook rate limit exceeded" },
    keyGenerator: boardWebhookRateLimitKey,
    maxEntries: options?.maxEntries ?? BOARD_WEBHOOK_RATE_LIMIT_MAX_ENTRIES,
    sweepIntervalMs: options?.sweepIntervalMs,
  });
}

export const boardWebhookRateLimit = createBoardWebhookRateLimit();
