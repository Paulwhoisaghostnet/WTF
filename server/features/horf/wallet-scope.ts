import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { horfWalletBlacklist, userWallets } from "@shared/schema";
import { ensureSessionCsrfToken, isValidCsrfToken } from "../../lib/csrf";
import { isTezosWallet } from "./model";

export type HorfWalletSource = "wallet-proof" | "linked";

function sessionWallet(req: Request): string | null {
  const value = (req.session as typeof req.session & { horfWalletAddress?: unknown }).horfWalletAddress;
  return isTezosWallet(value) ? value : null;
}

export async function horfWalletSource(req: Request, address: string): Promise<HorfWalletSource | null> {
  if (!isTezosWallet(address)) return null;
  if (sessionWallet(req) === address) return "wallet-proof";
  const userId = Number((req.user as { id?: unknown } | undefined)?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const linked = await db.select({ id: userWallets.id }).from(userWallets)
    .where(and(eq(userWallets.userId, userId), eq(userWallets.walletAddress, address)))
    .limit(1);
  return linked.length ? "linked" : null;
}

export function horfSessionWallet(req: Request): string | null {
  return sessionWallet(req);
}

/** Global CSRF intentionally skips anonymous requests; Horf guest writes must not. */
export function requireHorfCsrf(req: Request, res: Response, next: NextFunction) {
  const expected = ensureSessionCsrfToken(req);
  const provided = req.get("x-csrf-token") || req.get("x-xsrf-token") || req.body?.csrfToken;
  if (!isValidCsrfToken(provided, expected)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }
  return next();
}

export async function requireHorfWallet(req: Request, res: Response, address: string): Promise<boolean> {
  if (!(await horfWalletSource(req, address))) {
    res.status(403).json({ error: "Verify this wallet to use its private Horf features" });
    return false;
  }
  const [blocked] = await db.select({ active: horfWalletBlacklist.active })
    .from(horfWalletBlacklist).where(eq(horfWalletBlacklist.address, address)).limit(1);
  if (blocked?.active) {
    res.status(403).json({ code: "HORF_BLACKLISTED", error: "This wallet is restricted from Horf private features" });
    return false;
  }
  return true;
}
