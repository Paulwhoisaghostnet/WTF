import { Router } from "express";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "../db";
import { horfGiftTransfers, horfInspectionApprovals, horfInspectionRequests, horfOpenRangeOffers, horfStableClaimEvents } from "@shared/schema";
import { validOpenRangeCursor } from "../features/horf/open-range-source";
import { cachedOpenRangeMintPage } from "../features/horf/open-range-cache";
import { visibleOpenRangeItems } from "../features/horf/open-range-visibility";
import { visibleNonBurnedOpenRangeItems } from "../features/horf/open-range-holders";
import { HORF_SEASONS, resolveHorfSeason } from "../features/horf/seasons";
import { isTezosWallet } from "../features/horf/model";
import { assertCurrentOwner, HorfTokenNotOwnedError } from "../features/horf/inspections";
import { HorseTokenIneligibleError, HorseTokenNotFoundError, inspectHorseToken, inspectHorseTokenCached } from "../features/horf/stables/eligibility";
import { requireHorfCsrf, requireHorfWallet } from "../features/horf/wallet-scope";
import { loadHorfTraderNames } from "../features/horf/trader-names";
import { editionKey, getTraderEditionCounts } from "../features/horf/trader-editions";
import { currentHorfRole } from "../features/horf/roles";
import { excludedHorseTokenKeys } from "../features/horf/nonhorse-reports";

const router = Router();
const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
// Match the existing Horf trader holdings balance batch size.
const BALANCE_PAGE_SIZE = 48;

function key(contract: string, tokenId: string) { return `${contract}/${tokenId}`; }

function offerDto(row: typeof horfOpenRangeOffers.$inferSelect) {
  return { id: row.id, ownerAddress: row.ownerWalletAddress, tokenContract: row.tokenContract,
    tokenId: row.tokenId, amount: row.amount, acceptedTokenPolicy: row.acceptedTokenPolicy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString() };
}

router.get("/api/horf/open-range", async (req, res) => {
  const mode = typeof req.query.season === "string" ? req.query.season : "current-2026";
  const cursor = req.query.cursor == null ? "0" : req.query.cursor;
  const viewer = req.query.viewer;
  const selected = resolveHorfSeason(mode);
  if (!selected && mode !== "all-seasons" && mode !== "all-horse-search") {
    return res.status(400).json({ error: "Unknown horse season", seasons: HORF_SEASONS });
  }
  if (typeof cursor !== "string" || !validOpenRangeCursor(mode, cursor)) {
    return res.status(400).json({ error: "Invalid Objkt mint cursor" });
  }
  if (viewer !== undefined && !isTezosWallet(viewer)) {
    return res.status(400).json({ error: "A valid viewer wallet is required" });
  }
  const refresh = req.query.refresh == null ? false : req.query.refresh === "1";
  if (req.query.refresh != null && !refresh) {
    return res.status(400).json({ error: "Invalid Open Range refresh value" });
  }
  try {
    const marshalPatrol = req.query.marshal === "1";
    if (req.query.marshal != null && !marshalPatrol) return res.status(400).json({ error: "Invalid Marshal patrol value" });
    if (marshalPatrol) {
      const role = await currentHorfRole(req);
      if (!role?.admin && !role?.marshal) return res.status(403).json({ error: "HORF MARSHAL role required" });
    }
    // Horse metadata comes from durable discovery pages. Offer, trade, and
    // inspection state below is joined live on every request.
    const page = await cachedOpenRangeMintPage(mode, cursor, { refresh });
    const scannedSourceRows = page.sourceRows;
    if (!page.items.length) return res.json({
      season: selected || { key: mode, label: mode === "all-seasons" ? "All Horse Seasons" : "All Horse Search",
        startsAt: null, endsAt: null },
      items: [], nextCursor: page.nextCursor, hasMore: page.hasMore,
      asOf: page.asOf, scannedSourceRows, cacheStatus: page.cacheStatus,
      holderStatus: "ready", balanceStatus: "ready",
    });
    const [approvalRows, excluded] = await Promise.all([db.select({ contract: horfInspectionApprovals.tokenContract,
      tokenId: horfInspectionApprovals.tokenId })
      .from(horfInspectionApprovals).where(and(eq(horfInspectionApprovals.active, true),
        or(...page.items.map((item) => and(
          eq(horfInspectionApprovals.tokenContract, item.contract), eq(horfInspectionApprovals.tokenId, item.tokenId)))))),
      excludedHorseTokenKeys(page.items)]);
    const approved = new Set(approvalRows.map((row) => key(row.contract, row.tokenId)));
    const eligibleItems = visibleOpenRangeItems(page.items, approved, marshalPatrol)
      .filter((item) => !excluded.has(key(item.contract, item.tokenId)));
    const { items, holderStatus } = await visibleNonBurnedOpenRangeItems(eligibleItems);
    if (!items.length) return res.json({
      season: selected || { key: mode, label: mode === "all-seasons" ? "All Horse Seasons" : "All Horse Search",
        startsAt: null, endsAt: null },
      items: [], nextCursor: page.nextCursor, hasMore: page.hasMore,
      asOf: page.asOf, scannedSourceRows, cacheStatus: page.cacheStatus,
      holderStatus, balanceStatus: "ready",
    });
    let viewerBalances: Map<string, string> | null = null;
    if (typeof viewer === "string") {
      try {
        viewerBalances = await getTraderEditionCounts(viewer, items, BALANCE_PAGE_SIZE);
      } catch (error) {
        console.warn("[horf] Open Range viewer balance unavailable:", error);
      }
    }
    const transferFilter = or(...items.map((item) => and(
      eq(horfGiftTransfers.tokenContract, item.contract), eq(horfGiftTransfers.tokenId, item.tokenId))));
    const claimFilter = or(...items.map((item) => and(
      eq(horfStableClaimEvents.tokenContract, item.contract), eq(horfStableClaimEvents.tokenId, item.tokenId))));
    const offerFilter = or(...items.map((item) => and(
      eq(horfOpenRangeOffers.tokenContract, item.contract), eq(horfOpenRangeOffers.tokenId, item.tokenId))));
    const inspectionFilter = or(...items.map((item) => and(
      eq(horfInspectionRequests.tokenContract, item.contract), eq(horfInspectionRequests.tokenId, item.tokenId))));
    const [confirmed, claims, offers, inspections] = await Promise.all([
      db.select({ contract: horfGiftTransfers.tokenContract, tokenId: horfGiftTransfers.tokenId })
        .from(horfGiftTransfers).where(transferFilter),
      db.select({ contract: horfStableClaimEvents.tokenContract, tokenId: horfStableClaimEvents.tokenId })
        .from(horfStableClaimEvents).where(claimFilter),
      db.select().from(horfOpenRangeOffers).where(and(eq(horfOpenRangeOffers.active, true), offerFilter)),
      db.select({ contract: horfInspectionRequests.tokenContract, tokenId: horfInspectionRequests.tokenId,
        status: horfInspectionRequests.status, source: horfInspectionRequests.source })
        .from(horfInspectionRequests).where(inspectionFilter).orderBy(desc(horfInspectionRequests.id)),
    ]);
    const traded = new Set([...confirmed, ...claims].map((row) => key(row.contract, row.tokenId)));
    const offersByToken = new Map<string, ReturnType<typeof offerDto>[]>();
    const reviewed = new Map<string, string>();
    for (const row of inspections) {
      const tokenKey = key(row.contract, row.tokenId);
      if (!reviewed.has(tokenKey)) reviewed.set(tokenKey,
        row.source === "community_report" && row.status === "approved" ? "reviewed" : row.status);
    }
    for (const row of offers) {
      const tokenKey = key(row.tokenContract, row.tokenId);
      offersByToken.set(tokenKey, [...(offersByToken.get(tokenKey) || []), offerDto(row)]);
    }
    return res.json({
      season: selected || { key: mode, label: mode === "all-seasons" ? "All Horse Seasons" : "All Horse Search",
        startsAt: null, endsAt: null },
      items: items.map((item) => ({ ...item,
        viewerBalance: typeof viewer === "string" ? viewerBalances?.get(editionKey(item)) ?? null : null,
        tradedThroughHorf: traded.has(key(item.contract, item.tokenId)),
        activelyForTradeOnHorf: offersByToken.has(key(item.contract, item.tokenId)),
        approvedForMarshalsMarket: approved.has(key(item.contract, item.tokenId)),
        inspectionStatus: approved.has(key(item.contract, item.tokenId)) ? "approved" : reviewed.get(key(item.contract, item.tokenId)) ?? "none",
        offers: offersByToken.get(key(item.contract, item.tokenId)) || [],
      })),
      nextCursor: page.nextCursor, hasMore: page.hasMore,
      asOf: page.asOf, scannedSourceRows, cacheStatus: page.cacheStatus, holderStatus,
      balanceStatus: viewer && !viewerBalances ? "unavailable" : "ready",
    });
  } catch (error) {
    console.error("[horf] Open Range mint page failed:", error);
    return res.status(503).json({ error: "Objkt horse mint page is temporarily unavailable" });
  }
});

router.get("/api/horf/open-range/offers", async (req, res) => {
  const address = req.query.address;
  if (address != null && !isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet is required" });
  try {
    const rows = await db.select().from(horfOpenRangeOffers)
      .where(address ? and(eq(horfOpenRangeOffers.active, true), eq(horfOpenRangeOffers.ownerWalletAddress, address))
        : eq(horfOpenRangeOffers.active, true))
      .orderBy(asc(horfOpenRangeOffers.createdAt), asc(horfOpenRangeOffers.id));
    const checked = await Promise.all(rows.map(async (row) => {
      try { return { row, token: await inspectHorseTokenCached(row.tokenContract, row.tokenId) }; }
      catch (error) {
        if (error instanceof HorseTokenIneligibleError || error instanceof HorseTokenNotFoundError) return null;
        throw error;
      }
    }));
    const visible = checked.filter((entry) => entry !== null);
    const names = await loadHorfTraderNames(visible.flatMap(({ row, token }) =>
      token.creatorAddress ? [row.ownerWalletAddress, token.creatorAddress] : [row.ownerWalletAddress]));
    return res.json({ offers: visible.map(({ row, token }) => ({
      ...offerDto(row),
      ownerName: names.get(row.ownerWalletAddress)?.displayName ?? null,
      name: token.name,
      image: token.image,
      artifactUri: token.artifactUri,
      mime: token.mime,
      creatorAddress: token.creatorAddress,
      creatorName: (token.creatorAddress ? names.get(token.creatorAddress)?.displayName : null) || token.creatorName,
    })) });
  } catch (error) {
    console.error("[horf] Open Range offers failed:", error);
    return res.status(503).json({ error: "Open Range offers are temporarily unavailable" });
  }
});

router.post("/api/horf/open-range/offers", requireHorfCsrf, async (req, res) => {
  const address = req.body?.address;
  const tokenContract = req.body?.tokenContract;
  const rawId = req.body?.tokenId;
  const rawAmount = req.body?.amount;
  const acceptedTokenPolicy = req.body?.acceptedTokenPolicy ?? "any_qualifying";
  if (!isTezosWallet(address) || typeof tokenContract !== "string" || !CONTRACT_RE.test(tokenContract) ||
      typeof rawId !== "string" || !/^\d+$/.test(rawId) ||
      typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount) || BigInt(rawAmount) <= 0n) {
    return res.status(400).json({ error: "Owner wallet, FA2 token, and positive edition amount are required" });
  }
  if (acceptedTokenPolicy !== "marshal_only" && acceptedTokenPolicy !== "any_qualifying") {
    return res.status(400).json({ error: "Choose Marshal approved horses only or any qualifying horse" });
  }
  const tokenId = BigInt(rawId).toString();
  const amount = BigInt(rawAmount).toString();
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const [balance] = await Promise.all([
      assertCurrentOwner(address, tokenContract, tokenId),
      inspectHorseToken(tokenContract, tokenId),
    ]);
    if (BigInt(balance) < BigInt(amount)) {
      return res.status(422).json({ code: "HORF_INSUFFICIENT_EDITIONS", error: "This wallet holds fewer editions than the offer" });
    }
    const [row] = await db.insert(horfOpenRangeOffers).values({
      ownerWalletAddress: address, tokenContract, tokenId, amount, acceptedTokenPolicy,
    }).onConflictDoUpdate({
      target: [horfOpenRangeOffers.ownerWalletAddress, horfOpenRangeOffers.tokenContract, horfOpenRangeOffers.tokenId],
      set: { amount, acceptedTokenPolicy, active: true, updatedAt: new Date(), removedAt: null },
    }).returning();
    return res.json(offerDto(row));
  } catch (error) {
    if (error instanceof HorfTokenNotOwnedError) return res.status(422).json({ code: "HORF_TOKEN_NOT_OWNED", error: error.message });
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof HorseTokenIneligibleError) return res.status(422).json({ error: error.message });
    console.error("[horf] Open Range offer save failed:", error);
    return res.status(503).json({ error: "Open Range offer could not be saved" });
  }
});

router.delete("/api/horf/open-range/offers/:id", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid Open Range offer" });
  try {
    const [row] = await db.select().from(horfOpenRangeOffers).where(eq(horfOpenRangeOffers.id, id)).limit(1);
    if (!row || !row.active) return res.status(404).json({ error: "Open Range offer not found" });
    if (!(await requireHorfWallet(req, res, row.ownerWalletAddress))) return;
    await db.update(horfOpenRangeOffers).set({ active: false, removedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(horfOpenRangeOffers.id, id), eq(horfOpenRangeOffers.ownerWalletAddress, row.ownerWalletAddress)));
    return res.status(204).end();
  } catch (error) {
    console.error("[horf] Open Range offer removal failed:", error);
    return res.status(503).json({ error: "Open Range offer could not be removed" });
  }
});

export default router;
