import type { Request } from "express";
import { isTezosWallet } from "../features/horf/model";

/** Horf gets a separate, post-auth quota without exempting unrelated APIs. */
export function isHorfApiRequest(req: Request): boolean {
  const raw = String(req.originalUrl || req.url || req.path || "");
  const path = raw.split("?", 1)[0] || raw;
  return path.startsWith("/api/horf/");
}

/** A verified wallet or WTF user must not share a quota with another rider at the same IP. */
export function horfApiRateLimitKey(req: Request): string {
  const userId = Number((req.user as { id?: unknown } | undefined)?.id);
  if (Number.isSafeInteger(userId) && userId > 0) return `user:${userId}`;
  const wallet = (req.session as typeof req.session & { horfWalletAddress?: unknown } | undefined)?.horfWalletAddress;
  if (isTezosWallet(wallet)) return `wallet:${wallet}`;
  return req.ip || String(req.headers?.["x-forwarded-for"] || "") || "anonymous";
}
