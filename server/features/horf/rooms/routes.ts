import { Router } from "express";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../../db";
import { horfInspectionApprovals, horfOpenRangeOffers, horfTokenNonhorseDecisions } from "@shared/schema";
import { getTraderEditionCounts, editionKey } from "../trader-editions";
import { loadHorfTraderNames } from "../trader-names";
import { isTezosWallet } from "../model";
import { requireHorfCsrf, requireHorfWallet } from "../wallet-scope";
import { HorseTokenIneligibleError, HorseTokenNotFoundError, inspectHorseTokenCached } from "../stables/eligibility";
import { HorfCustodyUntrustedError } from "../stables/custody";
import { confirmHorfPrivateOfferEvent, getHorfTradeOffer, HorfTradeOfferError } from "../trade-offers";
import { getHorfRoomsSnapshot, readHorfPrivateTerms, type HorfRoomListing, type HorfRoomMode } from "./chain";
import { HorfRoomsNetworkError, HorfRoomsUnconfiguredError } from "./config";
import { issueHorfRoomPermit, type HorfRoomPermitRequest } from "./permit";
import { HorfPrivateProofPendingError, verifyHorfPrivateOfferEvent } from "./private-proof";

const router = Router();
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

function nat(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  return /^\d+$/.test(text) ? BigInt(text).toString() : null;
}

export function parseHorfRoomPermitRequest(value: unknown): (HorfRoomPermitRequest & { offerId?: number }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!isTezosWallet(body.address) || (body.action !== 0 && body.action !== 1 && body.action !== 2) ||
      (body.mode !== 0 && body.mode !== 1 && body.mode !== 2 && body.mode !== 3) ||
      typeof body.tokenContract !== "string" || !KT1_RE.test(body.tokenContract)) return null;
  const listingId = nat(body.listingId);
  const tokenId = nat(body.tokenId);
  const amount = nat(body.amount);
  if (listingId === null || tokenId === null || amount === null || amount === "0") return null;
  if (body.action === 0 && listingId !== "0") return null;
  if (body.action === 1 && (body.mode !== 2 || amount !== "1")) return null;
  if (body.action === 2 && (body.mode !== 3 || amount !== "1")) return null;
  if (body.action === 0 && body.mode === 3 && amount !== "1") return null;
  const offerId = Number(body.offerId);
  if (body.mode === 3 && (!Number.isSafeInteger(offerId) || offerId <= 0)) return null;
  return { address: body.address, action: body.action, mode: body.mode as HorfRoomMode,
    listingId, tokenContract: body.tokenContract, tokenId, amount,
    ...(body.mode === 3 ? { offerId } : {}) };
}

function key(listing: Pick<HorfRoomListing, "tokenContract" | "tokenId">): string {
  return `${listing.tokenContract}/${listing.tokenId}`;
}

/** Public horse art and the owner's recovery path are deliberately separate. */
router.get("/api/horf/rooms", async (req, res) => {
  const address = req.query.address;
  const market = req.query.market ?? "all";
  if ((address != null && !isTezosWallet(address)) ||
      (market !== "all" && market !== "marshal" && market !== "outlaw")) {
    return res.status(400).json({ error: "Choose a valid wallet and room market" });
  }
  try {
    const viewer = typeof address === "string" ? address : null;
    const snapshot = await getHorfRoomsSnapshot(viewer);
    const publicListings = snapshot.listings.filter((listing) => listing.mode !== 3);
    if (!publicListings.length) return res.json({ ...snapshot, listings: [], balanceStatus: viewer ? "ready" : null });
    const tokens = Array.from(new Map(publicListings.map((listing) => [key(listing), listing])).values());
    const [approvals, excluded] = await Promise.all([
      db.select({ contract: horfInspectionApprovals.tokenContract, tokenId: horfInspectionApprovals.tokenId })
        .from(horfInspectionApprovals).where(and(eq(horfInspectionApprovals.active, true),
          or(...tokens.map((token) => and(eq(horfInspectionApprovals.tokenContract, token.tokenContract),
            eq(horfInspectionApprovals.tokenId, token.tokenId)))))),
      db.select({ contract: horfTokenNonhorseDecisions.tokenContract, tokenId: horfTokenNonhorseDecisions.tokenId })
        .from(horfTokenNonhorseDecisions).where(eq(horfTokenNonhorseDecisions.active, true)),
    ]);
    const approved = new Set(approvals.map((row) => `${row.contract}/${row.tokenId}`));
    const blocked = new Set(excluded.map((row) => `${row.contract}/${row.tokenId}`));
    const checked = await Promise.all(publicListings.map(async (listing) => {
      if (blocked.has(key(listing))) return { listing, token: null };
      try { return { listing, token: await inspectHorseTokenCached(listing.tokenContract, listing.tokenId) }; }
      catch (error) {
        if (error instanceof HorseTokenNotFoundError || error instanceof HorseTokenIneligibleError) {
          return { listing, token: null };
        }
        // A transient Objkt outage must not hide the owner's cancellation route.
        return { listing, token: null };
      }
    }));
    const publicItems = checked.filter(({ listing, token }) => token &&
      (listing.mode === 2 || approved.has(key(listing))));
    const visible = checked.filter(({ listing, token }) => {
      if (market === "marshal" && listing.mode === 2) return false;
      if (market === "outlaw" && listing.mode !== 2) return false;
      return Boolean(token && (listing.mode === 2 || approved.has(key(listing)))) ||
        (market === "all" && viewer === listing.owner);
    });
    const owners = Array.from(new Set(visible.flatMap(({ listing, token }) =>
      token?.creatorAddress ? [listing.owner, token.creatorAddress] : [listing.owner])));
    const names = await loadHorfTraderNames(owners);
    let viewerBalances: Map<string, string> | null = null;
    if (viewer && visible.length) {
      try {
        viewerBalances = await getTraderEditionCounts(viewer,
          visible.map(({ listing }) => ({ contract: listing.tokenContract, tokenId: listing.tokenId })), 48);
      } catch (error) { console.warn("[horf] room viewer balances unavailable:", error); }
    }
    return res.json({ ...snapshot, balanceStatus: viewer ? viewerBalances ? "ready" : "unavailable" : null,
      listings: visible.map(({ listing, token }) => ({ ...listing,
        token: token ? { contract: token.contract, tokenId: token.tokenId,
          name: token.name, image: token.image, artifactUri: token.artifactUri, mime: token.mime } : null,
        ownerName: names.get(listing.owner)?.displayName ?? null,
        creatorAddress: token?.creatorAddress ?? null,
        creatorName: token?.creatorAddress ? names.get(token.creatorAddress)?.displayName ?? token.creatorName : null,
        approvedForMarshalsMarket: approved.has(key(listing)),
        publicVisible: publicItems.some((entry) => entry.listing.id === listing.id),
        ownedByWallet: viewerBalances ? BigInt(viewerBalances.get(editionKey({ contract: listing.tokenContract,
          tokenId: listing.tokenId })) || "0") > 0n : null,
      })),
    });
  } catch (error) {
    console.error("[horf] room chain read failed:", error);
    return res.status(503).json({ error: "Horse escrow rooms are temporarily unavailable" });
  }
});

/** A private escrow is shown only to its owner or exact pinned offerer. */
router.get("/api/horf/rooms/private", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "Choose a valid private escrow wallet" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const snapshot = await getHorfRoomsSnapshot(address);
    if (!snapshot.contractAddress) return res.json({ contractAddress: null, listings: [] });
    const privateListings = snapshot.listings.filter((listing) => listing.mode === 3);
    const entries = await Promise.all(privateListings.map(async (listing) => ({
      listing, terms: await readHorfPrivateTerms(snapshot.contractAddress!, listing.id),
    })));
    return res.json({ contractAddress: snapshot.contractAddress, chainId: snapshot.chainId,
      listings: entries.filter(({ listing, terms }) => terms &&
        (listing.owner === address || terms.offerer === address)),
    });
  } catch (error) {
    console.error("[horf] private escrow recovery list failed:", error);
    return res.status(503).json({ error: "Private horse escrows are temporarily unavailable" });
  }
});

/** A private escrow is shown only to its owner or exact pinned offerer. */
router.get("/api/horf/rooms/private/:listingId", async (req, res) => {
  const address = req.query.address;
  const listingId = nat(req.params.listingId);
  if (!isTezosWallet(address) || listingId === null) {
    return res.status(400).json({ error: "Choose a valid wallet and private escrow" });
  }
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const snapshot = await getHorfRoomsSnapshot(address);
    const listing = snapshot.listings.find((row) => row.id === listingId && row.mode === 3);
    if (!listing || !snapshot.contractAddress) return res.status(404).json({ error: "Private horse escrow is no longer open" });
    const terms = await readHorfPrivateTerms(snapshot.contractAddress, listingId);
    if (!terms || (listing.owner !== address && terms.offerer !== address)) {
      return res.status(404).json({ error: "Private horse escrow was not found for this rider" });
    }
    const token = await inspectHorseTokenCached(listing.tokenContract, listing.tokenId).catch(() => null);
    return res.json({ network: snapshot.network, chainId: snapshot.chainId,
      contractAddress: snapshot.contractAddress, listing, terms,
      token: token ? { name: token.name, image: token.image, artifactUri: token.artifactUri, mime: token.mime } : null });
  } catch (error) {
    console.error("[horf] private escrow read failed:", error);
    return res.status(503).json({ error: "Private horse escrow is temporarily unavailable" });
  }
});

router.post("/api/horf/rooms/permit", requireHorfCsrf, async (req, res) => {
  const request = parseHorfRoomPermitRequest(req.body);
  if (!request) return res.status(400).json({ error: "Choose a valid wallet, horse, action, and edition count" });
  try {
    if (!(await requireHorfWallet(req, res, request.address))) return;
    if (request.mode === 3) {
      const offer = await getHorfTradeOffer(request.offerId!);
      if (!offer) return res.status(404).json({ error: "Horse offer not found" });
      if (request.action === 0) {
        if (offer.status !== "proposed" || !offer.signActive || offer.ownerAddress !== request.address ||
            offer.requestedTokenContract !== request.tokenContract || offer.requestedTokenId !== request.tokenId) {
          return res.status(409).json({ error: "That horse offer is no longer ready for escrow" });
        }
      } else if (request.action === 2) {
        if (offer.status !== "accepted" || offer.offererAddress !== request.address ||
            offer.privateListingId !== request.listingId ||
            offer.offeredTokenContract !== request.tokenContract || offer.offeredTokenId !== request.tokenId) {
          return res.status(409).json({ error: "That private horse escrow is not ready for this rider" });
        }
        const snapshot = await getHorfRoomsSnapshot(request.address);
        const target = snapshot.listings.find((row) => row.id === request.listingId && row.mode === 3);
        if (!snapshot.contractAddress || !target || target.owner !== offer.ownerAddress ||
            target.tokenContract !== offer.requestedTokenContract || target.tokenId !== offer.requestedTokenId ||
            target.remaining !== "1" || target.claimedByWallet) {
          return res.status(409).json({ error: "That private horse escrow is no longer available" });
        }
        const terms = await readHorfPrivateTerms(snapshot.contractAddress, request.listingId);
        if (!terms || terms.offerer !== request.address || terms.inputTokenContract !== request.tokenContract ||
            terms.inputTokenId !== request.tokenId) {
          return res.status(409).json({ error: "Private escrow terms changed; review this trade again" });
        }
        const [sign] = await db.select({ acceptedTokenPolicy: horfOpenRangeOffers.acceptedTokenPolicy })
          .from(horfOpenRangeOffers).where(eq(horfOpenRangeOffers.id, offer.signId)).limit(1);
        if (sign?.acceptedTokenPolicy === "marshal_only") {
          const [approved] = await db.select({ tokenId: horfInspectionApprovals.tokenId })
            .from(horfInspectionApprovals).where(and(eq(horfInspectionApprovals.tokenContract, request.tokenContract),
              eq(horfInspectionApprovals.tokenId, request.tokenId), eq(horfInspectionApprovals.active, true))).limit(1);
          if (!approved) return res.status(422).json({ error: "This trader accepts Marshal-approved horses only" });
        }
      }
    }
    if (request.action === 1) {
      const snapshot = await getHorfRoomsSnapshot(request.address);
      const target = snapshot.listings.find((listing) => listing.id === request.listingId);
      if (!target || target.mode !== 2 || target.owner === request.address || target.remaining === "0" ||
          target.claimedByWallet) {
        return res.status(409).json({ error: "That Outlaw room is no longer claimable by this wallet" });
      }
      if (target.tokenContract === request.tokenContract && target.tokenId === request.tokenId) {
        return res.status(422).json({ error: "Offer a different horse from the one you want to claim" });
      }
    }
    return res.json(await issueHorfRoomPermit(request));
  } catch (error) {
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof HorseTokenIneligibleError || error instanceof HorfCustodyUntrustedError) {
      return res.status(422).json({ error: error.message });
    }
    if (error instanceof HorfRoomsUnconfiguredError || error instanceof HorfRoomsNetworkError) {
      return res.status(503).json({ error: error.message });
    }
    console.error("[horf] room eligibility permit failed:", error);
    return res.status(503).json({ error: "Horse room eligibility could not be checked right now" });
  }
});

function offerIdFromPath(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

for (const [path, kind, participant] of [
  ["accept", "private_offer_escrowed", "ownerAddress"],
  ["fulfill", "private_offer_fulfilled", "offererAddress"],
  ["escrow-cancel", "horse_cancelled", "ownerAddress"],
] as const) {
  router.post(`/api/horf/trade-offers/:id/${path}`, requireHorfCsrf, async (req, res) => {
    const id = offerIdFromPath(req.params.id);
    const address = req.body?.address;
    const operationHash = req.body?.operationHash;
    if (!id || !isTezosWallet(address) || typeof operationHash !== "string") {
      return res.status(400).json({ error: "Choose a valid rider and confirmed horse escrow transaction" });
    }
    try {
      if (!(await requireHorfWallet(req, res, address))) return;
      const offer = await getHorfTradeOffer(id);
      if (!offer) return res.status(404).json({ error: "Horse offer not found" });
      if (offer[participant] !== address) return res.status(403).json({ error: "This horse offer belongs to another rider" });
      const updated = await confirmHorfPrivateOfferEvent(id, operationHash, kind, verifyHorfPrivateOfferEvent);
      return res.json({ offer: updated });
    } catch (error) {
      if (error instanceof HorfPrivateProofPendingError) {
        return res.status(503).json({ error: `${error.message}. Keep the operation hash and retry confirmation.` });
      }
      if (error instanceof HorfTradeOfferError) return res.status(error.statusCode).json({ error: error.message });
      console.error("[horf] private offer proof failed:", error);
      return res.status(503).json({ error: "Horse escrow confirmation is still syncing. Keep your operation hash and retry shortly." });
    }
  });
}

export default router;
