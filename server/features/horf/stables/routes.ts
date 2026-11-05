import { Router } from "express";
import { and, eq, or } from "drizzle-orm";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { horfInspectionApprovals, horfInspectionRequests, horfTokenNonhorseDecisions } from "@shared/schema";
import { db } from "../../../db";
import { isTezosWallet } from "../model";
import { requireHorfCsrf, requireHorfWallet } from "../wallet-scope";
import { getHorfStablesSnapshot, type HorfStableListing } from "./chain";
import { HorseTokenIneligibleError, HorseTokenNotFoundError } from "./eligibility";
import { HorfStablesNetworkError, HorfStablesUnconfiguredError } from "./config";
import { issueHorfDepositPermit, type HorfPermitRequest } from "./permit";
import { HorfCustodyUntrustedError } from "./custody";
import { marshalMarketListings } from "./market-visibility";

const router = Router();

interface ListingInspection {
  contract: string;
  tokenId: string;
  active: boolean;
  objktMetadata: Record<string, unknown> | null;
}

function safeMediaUri(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(normalizeIpfsUri(value.trim()));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function withInspectedToken(listing: HorfStableListing, inspection: ListingInspection | undefined) {
  const metadata = inspection?.objktMetadata;
  return {
    ...listing,
    token: {
      contract: listing.tokenContract,
      tokenId: listing.tokenId,
      name: typeof metadata?.name === "string" && metadata.name.trim()
        ? metadata.name.trim() : `Token #${listing.tokenId}`,
      image: safeMediaUri(metadata?.image),
      artifactUri: safeMediaUri(metadata?.artifactUri),
      mime: typeof metadata?.mime === "string" ? metadata.mime.trim().toLowerCase() || null : null,
    },
  };
}

async function loadListingInspections(listings: readonly HorfStableListing[]): Promise<ListingInspection[]> {
  const tokens = new Map<string, { contract: string; tokenId: string }>(listings.map((listing) => [
    `${listing.tokenContract}/${listing.tokenId}`,
    { contract: listing.tokenContract, tokenId: listing.tokenId },
  ]));
  return db.select({
    contract: horfInspectionApprovals.tokenContract,
    tokenId: horfInspectionApprovals.tokenId,
    active: horfInspectionApprovals.active,
    objktMetadata: horfInspectionRequests.objktMetadata,
  }).from(horfInspectionApprovals).leftJoin(
    horfInspectionRequests,
    and(
      eq(horfInspectionApprovals.inspectionId, horfInspectionRequests.id),
      eq(horfInspectionApprovals.tokenContract, horfInspectionRequests.tokenContract),
      eq(horfInspectionApprovals.tokenId, horfInspectionRequests.tokenId),
    ),
  ).where(or(...Array.from(tokens.values(), (token) => and(
    eq(horfInspectionApprovals.tokenContract, token.contract),
    eq(horfInspectionApprovals.tokenId, token.tokenId),
  ))));
}

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
    if (snapshot.listings.length === 0) {
      return res.json({ ...snapshot, custodyReady: true, depositBlockReason: null });
    }
    if (!marketOnly) {
      // Owner management remains available when inspection metadata is temporarily unavailable.
      let inspectionRows: ListingInspection[] = [];
      try {
        inspectionRows = await loadListingInspections(snapshot.listings);
      } catch (error) {
        console.warn("[horf] stable preview metadata unavailable:", error);
      }
      const inspections = new Map(inspectionRows.map((row) => [`${row.contract}/${row.tokenId}`, row]));
      return res.json({ ...snapshot,
        listings: snapshot.listings.map((listing) => withInspectedToken(
          listing, inspections.get(`${listing.tokenContract}/${listing.tokenId}`),
        )),
        custodyReady: true, depositBlockReason: null });
    }
    const [approvalRows, excludedRows] = await Promise.all([
      loadListingInspections(snapshot.listings),
      db.select({ contract: horfTokenNonhorseDecisions.tokenContract, tokenId: horfTokenNonhorseDecisions.tokenId })
        .from(horfTokenNonhorseDecisions).where(eq(horfTokenNonhorseDecisions.active, true)),
    ]);
    const approved = new Set(approvalRows.filter((row) => row.active).map((row) => `${row.contract}/${row.tokenId}`));
    const excluded = new Set(excludedRows.map((row) => `${row.contract}/${row.tokenId}`));
    const inspections = new Map(approvalRows.map((row) => [`${row.contract}/${row.tokenId}`, row]));
    return res.json({ ...snapshot,
      listings: marshalMarketListings(snapshot.listings, approved, excluded).map((listing) => withInspectedToken(
        listing, inspections.get(`${listing.tokenContract}/${listing.tokenId}`),
      )),
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
