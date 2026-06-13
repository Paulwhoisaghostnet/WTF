import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { porcupinConnections, porcupinPremiumEligibility } from "@shared/schema";
import { checkPorcupinPremiumEligibility } from "../features/porcupin/eligibility";
import { getTzktBase } from "../lib/contract-config";
import { getServerWtfToken } from "../lib/wtf-token-config";
import { encryptToken, decryptToken } from "../lib/token-encryption";
import { logSystemEvent } from "../lib/system-log";
import { listRolesForUserSnapshot } from "../lib/user-roles";
import { syncPinCollectorRoleFromInventory } from "../features/ipfs-pinning/service";
import {
  assertSafeOutboundUrl,
  fetchSafeHttp,
  OutboundUrlRejectedError,
  porcupinOutboundPolicy,
} from "../lib/outbound-url";

const router = Router();

const connectSchema = z.object({
  remoteUrl: z.string().url().trim(),
  authToken: z.string().trim().min(1).max(512),
});

function validatedPorcupinRemoteUrl(raw: string): string {
  return assertSafeOutboundUrl(raw, porcupinOutboundPolicy()).toString().replace(/\/+$/, "");
}

function userId(req: any): number {
  return Number(req.user?.id);
}

async function fetchWtfBalance(walletAddress: string): Promise<number> {
  const tzktBase = getTzktBase();
  const wtfToken = getServerWtfToken();

  try {
    const url = `${tzktBase}/tokens/balances?account=${walletAddress}&token.contract.address=${wtfToken.contract}&token.tokenId=${wtfToken.tokenId}&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) return 0;
    const data: any[] = await resp.json();
    return Number(data[0]?.balance ?? 0);
  } catch {
    return 0;
  }
}

async function getUserWalletAndInventory(uid: number) {
  const { inAppInventoryItems, userWallets } = await import("@shared/schema");

  const [wallets, inventory] = await Promise.all([
    db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, uid))
    .limit(1),
    db
      .select({ sku: inAppInventoryItems.sku, quantity: inAppInventoryItems.quantity })
      .from(inAppInventoryItems)
      .where(eq(inAppInventoryItems.userId, uid)),
  ]);

  const walletAddress = wallets[0]?.walletAddress ?? null;
  const inventorySkus = inventory.filter((item) => item.quantity > 0).map((item) => item.sku);
  return { walletAddress, inventorySkus };
}

router.get("/api/porcupin/connection", isAuthenticated, async (req, res) => {
  try {
    const [conn] = await db
      .select({
        id: porcupinConnections.id,
        remoteUrl: porcupinConnections.remoteUrl,
        status: porcupinConnections.status,
        lastCheckAt: porcupinConnections.lastCheckAt,
        createdAt: porcupinConnections.createdAt,
      })
      .from(porcupinConnections)
      .where(eq(porcupinConnections.userId, userId(req)))
      .limit(1);
    res.json(conn ?? null);
  } catch (err) {
    console.error("[porcupin] connection fetch failed", err);
    res.status(500).json({ error: "Failed to fetch connection" });
  }
});

router.post("/api/porcupin/connect", isAuthenticated, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
  }

  try {
    let remoteUrl: string;
    try {
      remoteUrl = validatedPorcupinRemoteUrl(parsed.data.remoteUrl);
    } catch (err) {
      const message =
        err instanceof OutboundUrlRejectedError
          ? err.message
          : "Remote URL is not allowed";
      return res.status(400).json({ error: message });
    }

    const uid = userId(req);
    const enc = encryptToken(parsed.data.authToken);

    const existing = await db
      .select({ id: porcupinConnections.id })
      .from(porcupinConnections)
      .where(eq(porcupinConnections.userId, uid))
      .limit(1);

    let connId: number;
    if (existing.length > 0) {
      const [updated] = await db
        .update(porcupinConnections)
        .set({
          remoteUrl,
          authTokenEnc: enc,
          status: "connected",
          lastCheckAt: new Date(),
        })
        .where(eq(porcupinConnections.userId, uid))
        .returning();
      connId = updated.id;
    } else {
      const [conn] = await db
        .insert(porcupinConnections)
        .values({
          userId: uid,
          remoteUrl,
          authTokenEnc: enc,
          status: "connected",
          lastCheckAt: new Date(),
        })
        .returning();
      connId = conn.id;
    }

    logSystemEvent({
      source: "server",
      eventType: "porcupin.connect",
      severity: "info",
      userId: uid,
      method: req.method,
      path: req.path,
      metadata: { connectionId: connId, remoteUrl },
    });

    res.status(existing.length > 0 ? 200 : 201).json({ ok: true, id: connId });
  } catch (err) {
    console.error("[porcupin] connect failed", err);
    res.status(500).json({ error: "Failed to save connection" });
  }
});

router.delete("/api/porcupin/connection", isAuthenticated, async (req, res) => {
  try {
    await db
      .delete(porcupinConnections)
      .where(eq(porcupinConnections.userId, userId(req)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[porcupin] disconnect failed", err);
    res.status(500).json({ error: "Disconnect failed" });
  }
});

router.get("/api/porcupin/status", isAuthenticated, async (req, res) => {
  try {
    const uid = userId(req);
    const [conn] = await db
      .select()
      .from(porcupinConnections)
      .where(eq(porcupinConnections.userId, uid))
      .limit(1);

    if (!conn) return res.json({ connected: false });

    const token = decryptToken(conn.authTokenEnc);

    try {
      let statusUrl: string;
      try {
        statusUrl = `${validatedPorcupinRemoteUrl(conn.remoteUrl)}/api/status`;
      } catch {
        return res.json({
          connected: true,
          remoteReachable: false,
          error: "Stored remote URL is no longer allowed",
        });
      }
      const resp = await fetchSafeHttp(
        statusUrl,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        },
        porcupinOutboundPolicy()
      );
      const data = await resp.json();

      await db
        .update(porcupinConnections)
        .set({ status: "connected", lastCheckAt: new Date() })
        .where(eq(porcupinConnections.id, conn.id));

      res.json({ connected: true, remote: data });
    } catch {
      await db
        .update(porcupinConnections)
        .set({ status: "unreachable", lastCheckAt: new Date() })
        .where(eq(porcupinConnections.id, conn.id));
      res.json({ connected: false, status: "unreachable" });
    }
  } catch (err) {
    console.error("[porcupin] status failed", err);
    res.status(500).json({ error: "Status check failed" });
  }
});

router.get("/api/porcupin/premium-eligibility", isAuthenticated, async (req, res) => {
  try {
    const uid = userId(req);
    await syncPinCollectorRoleFromInventory(uid);
    const { walletAddress, inventorySkus } = await getUserWalletAndInventory(uid);
    const roles = await listRolesForUserSnapshot(req.user as any);

    // Check active dues from club_dues_member_ledger
    const { clubDuesMemberLedger } = await import("@shared/schema");
    const dueLedger = await db
      .select({ status: clubDuesMemberLedger.status })
      .from(clubDuesMemberLedger)
      .where(eq(clubDuesMemberLedger.userId, uid))
      .limit(1);

    const hasActiveDues = dueLedger[0]?.status === "active";

    const result = await checkPorcupinPremiumEligibility({
      walletAddress,
      hasActiveDues,
      inventorySkus,
      roles,
      fetchWtfBalance,
    });

    // Cache the result
    const existing = await db
      .select({ userId: porcupinPremiumEligibility.userId })
      .from(porcupinPremiumEligibility)
      .where(eq(porcupinPremiumEligibility.userId, uid))
      .limit(1);

    const record = {
      wtfBalanceOk: result.wtfBalanceOk,
      membershipCardOk: result.membershipCardOk,
      duesActiveOk: result.duesActiveOk,
      eligible: result.eligible,
      checkedAt: new Date(),
      notes: result.notes.join("; "),
    };

    if (existing.length > 0) {
      await db
        .update(porcupinPremiumEligibility)
        .set(record)
        .where(eq(porcupinPremiumEligibility.userId, uid));
    } else {
      await db
        .insert(porcupinPremiumEligibility)
        .values({ userId: uid, ...record });
    }

    logSystemEvent({
      source: "server",
      eventType: "porcupin.premium.check",
      severity: "info",
      userId: uid,
      method: req.method,
      path: req.path,
      metadata: { eligible: result.eligible, walletAddress },
    });

    res.json(result);
  } catch (err) {
    console.error("[porcupin] eligibility failed", err);
    res.status(500).json({ error: "Eligibility check failed" });
  }
});

export default router;
