import { Router } from "express";
import { eq } from "drizzle-orm";
import { horfInspectionApprovals, horfTokenNonhorseDecisions } from "@shared/schema";
import { db } from "../../../db";
import { isTezosWallet } from "../model";
import { requireHorfCsrf, requireHorfWallet } from "../wallet-scope";
import { getHorfStablesSnapshot } from "./chain";
import { HorseTokenIneligibleError, HorseTokenNotFoundError } from "./eligibility";
import { HorfStablesNetworkError, HorfStablesUnconfiguredError } from "./config";
import { issueHorfDepositPermit, type HorfPermitRequest } from "./permit";
import { HorfCustodyUntrustedError } from "./custody";
import { marshalMarketListings } from "./market-visibility";

const router = Router();

function nat(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : "";
  return /^\d+$/.test(text) ? BigInt(text).toString() : null;
}

export function parseHorfPermitRequest(value: unknown): HorfPermitRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!isTezosWallet(body.address)) return null;
  if (body.mode !== 0 && body.mode !== 1 && body.mode !== 2) return null;
  if (typeof body.tokenContract !== "string" ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(body.tokenContract)) return null;
  const tokenId = nat(body.tokenId);
  const amount = nat(body.amount);
  if (tokenId === null || amount === null || amount === "0") return null;
  return {
    address: body.address,
    mode: body.mode,
    tokenContract: body.tokenContract,
    tokenId,
    amount,
  };
}

router.get("/api/horf/stables", async (req, res) => {
  const address = req.query.address;
  const marketOnly = req.query.market === "1";
  if (address != null && !isTezosWallet(address)) {
    return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  }
  if (req.query.market != null && !marketOnly) {
    return res.status(400).json({ error: "Invalid Marshal's Market filter" });
  }
  try {
    const snapshot = await getHorfStablesSnapshot(address || null);
    if (!marketOnly || snapshot.listings.length === 0) {
      return res.json({ ...snapshot, custodyReady: true, depositBlockReason: null });
    }
    const [approvalRows, excludedRows] = await Promise.all([
      db.select({ contract: horfInspectionApprovals.tokenContract, tokenId: horfInspectionApprovals.tokenId })
        .from(horfInspectionApprovals).where(eq(horfInspectionApprovals.active, true)),
      db.select({ contract: horfTokenNonhorseDecisions.tokenContract, tokenId: horfTokenNonhorseDecisions.tokenId })
        .from(horfTokenNonhorseDecisions).where(eq(horfTokenNonhorseDecisions.active, true)),
    ]);
    const approved = new Set(approvalRows.map((row) => `${row.contract}/${row.tokenId}`));
    const excluded = new Set(excludedRows.map((row) => `${row.contract}/${row.tokenId}`));
    return res.json({ ...snapshot,
      listings: marshalMarketListings(snapshot.listings, approved, excluded),
      custodyReady: true, depositBlockReason: null });
  } catch (error) {
    console.error("[horf] stable chain read failed:", error);
    res.status(503).json({ error: "The horse stables are temporarily unavailable" });
  }
});

router.post("/api/horf/stables/permit", requireHorfCsrf, async (req, res) => {
  const request = parseHorfPermitRequest(req.body);
  if (!request) {
    return res.status(400).json({ error: "Valid wallet, stable, FA2 token, and positive edition count are required" });
  }
  try {
    if (!(await requireHorfWallet(req, res, request.address))) return;
    res.json(await issueHorfDepositPermit(request));
  } catch (error) {
    if (error instanceof HorseTokenNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof HorseTokenIneligibleError) {
      return res.status(422).json({ error: error.message });
    }
    if (error instanceof HorfCustodyUntrustedError) {
      return res.status(422).json({ code: "HORF_CUSTODY_UNTRUSTED", error: error.message });
    }
    if (error instanceof HorfStablesUnconfiguredError || error instanceof HorfStablesNetworkError) {
      return res.status(503).json({ error: error.message });
    }
    console.error("[horf] stable eligibility permit failed:", error);
    res.status(503).json({ error: "Horse token eligibility could not be checked right now" });
  }
});

export default router;
