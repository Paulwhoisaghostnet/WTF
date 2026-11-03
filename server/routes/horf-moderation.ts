import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { horfWalletBlacklist } from "@shared/schema";
import { currentHorfRole } from "../features/horf/roles";
import { isTezosWallet } from "../features/horf/model";
import { requireHorfCsrf } from "../features/horf/wallet-scope";

const router = Router();

async function adminId(req: any): Promise<number | null> {
  const role = await currentHorfRole(req);
  return role?.admin ? role.userId : null;
}

function evidenceUrl(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function dto(row: typeof horfWalletBlacklist.$inferSelect) {
  return {
    address: row.address, active: row.active, reason: row.reason,
    evidenceUrl: row.evidenceUrl, listedAt: row.listedAt.toISOString(),
    listedByUserId: row.listedByUserId,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    clearedByUserId: row.clearedByUserId,
  };
}

router.get("/api/horf/trader-status", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    const [row] = await db.select().from(horfWalletBlacklist)
      .where(eq(horfWalletBlacklist.address, address)).limit(1);
    return res.json({
      address,
      blacklisted: !!row?.active,
      reason: row?.active ? row.reason : null,
      evidenceUrl: row?.active ? row.evidenceUrl : null,
      listedAt: row?.active ? row.listedAt.toISOString() : null,
    });
  } catch (error) {
    console.error("[horf] trader status failed:", error);
    return res.status(503).json({ error: "Trader status is temporarily unavailable" });
  }
});

router.get("/api/horf/admin/blacklist", async (req, res) => {
  if (!(await adminId(req))) return res.status(403).json({ error: "Horf admin access required" });
  try {
    const rows = await db.select().from(horfWalletBlacklist).orderBy(asc(horfWalletBlacklist.address));
    return res.json({ entries: rows.map(dto) });
  } catch (error) {
    console.error("[horf] blacklist read failed:", error);
    return res.status(503).json({ error: "Horf moderation list is temporarily unavailable" });
  }
});

router.post("/api/horf/admin/blacklist", requireHorfCsrf, async (req, res) => {
  const actor = await adminId(req);
  if (!actor) return res.status(403).json({ error: "Horf admin access required" });
  const address = req.body?.address;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const evidence = evidenceUrl(req.body?.evidenceUrl);
  if (!isTezosWallet(address) || !reason || evidence === undefined) {
    return res.status(400).json({ error: "A Tezos wallet, reason, and optional http(s) evidence URL are required" });
  }
  try {
    const [row] = await db.insert(horfWalletBlacklist).values({
      address, reason, evidenceUrl: evidence, listedByUserId: actor,
    }).onConflictDoUpdate({
      target: horfWalletBlacklist.address,
      set: { active: true, reason, evidenceUrl: evidence, listedByUserId: actor,
        listedAt: new Date(), clearedByUserId: null, clearedAt: null },
    }).returning();
    return res.json(dto(row));
  } catch (error) {
    console.error("[horf] blacklist update failed:", error);
    return res.status(503).json({ error: "Horf moderation decision could not be saved" });
  }
});

router.delete("/api/horf/admin/blacklist/:address", requireHorfCsrf, async (req, res) => {
  const actor = await adminId(req);
  if (!actor) return res.status(403).json({ error: "Horf admin access required" });
  const address = req.params.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    const [row] = await db.update(horfWalletBlacklist)
      .set({ active: false, clearedByUserId: actor, clearedAt: new Date() })
      .where(eq(horfWalletBlacklist.address, address)).returning();
    return row ? res.json(dto(row)) : res.status(404).json({ error: "Wallet was not on the Horf moderation list" });
  } catch (error) {
    console.error("[horf] blacklist clear failed:", error);
    return res.status(503).json({ error: "Horf moderation decision could not be cleared" });
  }
});

export default router;
