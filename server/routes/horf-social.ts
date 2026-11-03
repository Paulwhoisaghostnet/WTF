import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { horfMainnetIndex } from "../features/horf/mainnet-index";
import { fetchTransactionsByHash } from "../lib/tzkt-ops";
import { horfGiftTransfers, horfPossePartners } from "@shared/schema";
import { getHorfHorseActivity, getHorfHorseConfig, horseContractAddress, HORF_HORSE_CHAIN_ID } from "../features/horf/horse-config";
import { getHorfRewardActivity, issueHorfHorseClaimPermit } from "../features/horf/rewards";
import { HorfHorseClaimSyncError, HorfHorseClaimUnconfiguredError } from "../features/horf/horse-claims";
import { isTezosWallet } from "../features/horf/model";
import { HorseTokenIneligibleError, HorseTokenNotFoundError, inspectHorseToken, inspectHorseTokenCached } from "../features/horf/stables/eligibility";
import { matchGiftTransfers, parseGiftConfirmation, parsePossePartner, type IndexedGiftTransfer } from "../features/horf/social";
import { requireHorfCsrf, requireHorfWallet } from "../features/horf/wallet-scope";

const router = Router();
const FA2_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

function currentUserId(req: { user?: unknown }): number | null {
  const id = Number((req.user as { id?: unknown } | undefined)?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function giftDto(row: typeof horfGiftTransfers.$inferSelect) {
  return {
    id: row.id,
    from: row.fromAddress,
    to: row.toAddress,
    token: { contract: row.tokenContract, tokenId: row.tokenId, name: row.tokenName, image: row.tokenImage },
    amount: Number(row.amount),
    timestamp: row.occurredAt.toISOString(),
    opHash: row.operationHash,
    returnedFavor: row.returnedFavor,
    returnedAt: row.returnedAt?.toISOString() ?? null,
  };
}

async function indexedTransfersFor(transactionIds: number[]): Promise<IndexedGiftTransfer[]> {
  const rows: IndexedGiftTransfer[] = [];
  let cursor = 0;
  // TzKT documents 100 as its default page size; cursor paging has no total cap.
  const pageSize = 100;
  while (true) {
    const page = await horfMainnetIndex.getJson<IndexedGiftTransfer[]>("/tokens/transfers", {
      "transactionId.in": transactionIds.join(","),
      "id.gt": cursor,
      "sort.asc": "id",
      limit: pageSize,
    });
    if (!Array.isArray(page)) throw new Error("Horse gift transfer index returned an invalid page");
    for (const transfer of page) {
      const id = Number(transfer.id);
      if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("Horse gift transfer cursor did not advance");
      cursor = id;
      rows.push(transfer);
    }
    if (page.length < pageSize) return rows;
  }
}

router.get("/api/horf/horse/config", async (req, res) => {
  const address = req.query.address;
  if (address != null && !isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    res.json(await getHorfHorseConfig(address || null));
  } catch (error) {
    console.error("[horf] HORSE contract configuration read failed:", error);
    res.status(503).json({ error: "HORSE contract verification is temporarily unavailable" });
  }
});

router.get("/api/horf/horse/activity", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    res.json(await getHorfHorseActivity(address));
  } catch (error) {
    console.error("[horf] HORSE activity read failed:", error);
    res.status(503).json({ error: "HORSE participation receipts are temporarily unavailable" });
  }
});

router.get("/api/horf/horse/rewards", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    return res.json(await getHorfRewardActivity(address));
  } catch (error) {
    console.error("[horf] HORSE reward activity read failed:", error);
    return res.status(503).json({ error: "HORSE reward entitlements are temporarily unavailable" });
  }
});

router.post("/api/horf/horse/claim-permit", requireHorfCsrf, async (req, res) => {
  const address = req.body?.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    return res.json(await issueHorfHorseClaimPermit(address));
  } catch (error) {
    if (error instanceof HorfHorseClaimSyncError) return res.status(503).json({
      code: "HORF_HORSE_REWARD_SYNCING", error: error.message,
    });
    if (error instanceof HorfHorseClaimUnconfiguredError) return res.status(503).json({
      code: "HORF_HORSE_CLAIM_UNCONFIGURED", error: error.message,
    });
    console.error("[horf] HORSE claim permit failed:", error);
    return res.status(503).json({ error: "HORSE claim permit is temporarily unavailable" });
  }
});

router.get("/api/horf/token-eligibility", async (req, res) => {
  const contract = req.query.contract;
  const tokenId = req.query.tokenId;
  if (typeof contract !== "string" || !FA2_RE.test(contract) ||
      typeof tokenId !== "string" || !/^\d+$/.test(tokenId)) {
    return res.status(400).json({ eligible: false, error: "A Tezos FA2 contract and token ID are required" });
  }
  try {
    if (contract === horseContractAddress()) {
      return res.status(422).json({ eligible: false, error: "HORSE rewards are sent separately from horse-art gifts" });
    }
    return res.json({ eligible: true, token: await inspectHorseTokenCached(contract, BigInt(tokenId).toString()) });
  } catch (error) {
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ eligible: false, error: error.message });
    if (error instanceof HorseTokenIneligibleError) return res.status(422).json({ eligible: false, error: error.message });
    console.error("[horf] gift token eligibility failed:", error);
    return res.status(503).json({ eligible: false, error: "Horse token eligibility could not be checked right now" });
  }
});

router.get("/api/horf/posse", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid owner wallet is required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const rows = await db.select().from(horfPossePartners)
      .where(eq(horfPossePartners.ownerWalletAddress, address))
      .orderBy(asc(horfPossePartners.createdAt), asc(horfPossePartners.id));
    return res.json({ partners: rows.map((row) => ({
      id: row.id, address: row.address, nickname: row.nickname, createdAt: row.createdAt.toISOString(),
    })) });
  } catch (error) {
    console.error("[horf] posse read failed:", error);
    return res.status(503).json({ error: "Your posse could not be loaded" });
  }
});

router.post("/api/horf/posse", requireHorfCsrf, async (req, res) => {
  const userId = currentUserId(req);
  const ownerAddress = req.body?.ownerAddress;
  if (!isTezosWallet(ownerAddress)) return res.status(400).json({ error: "A valid owner wallet is required" });
  const partner = parsePossePartner(req.body);
  if (!partner) return res.status(400).json({ error: "A valid Tezos partner wallet is required" });
  if (partner.address === ownerAddress) return res.status(400).json({ error: "A wallet cannot join its own posse" });
  try {
    if (!(await requireHorfWallet(req, res, ownerAddress))) return;
    const [row] = await db.insert(horfPossePartners)
      .values({ userId, ownerWalletAddress: ownerAddress, ...partner })
      .onConflictDoUpdate({
        target: [horfPossePartners.ownerWalletAddress, horfPossePartners.address],
        set: { nickname: partner.nickname },
      }).returning();
    return res.status(200).json({
      id: row.id, address: row.address, nickname: row.nickname, createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[horf] posse add failed:", error);
    return res.status(503).json({ error: "That posse partner could not be saved" });
  }
});

router.delete("/api/horf/posse/:id", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid posse partner" });
  try {
    const [partner] = await db.select({ ownerWalletAddress: horfPossePartners.ownerWalletAddress })
      .from(horfPossePartners).where(eq(horfPossePartners.id, id)).limit(1);
    if (!partner) return res.status(404).json({ error: "Posse partner not found" });
    if (!partner.ownerWalletAddress || !(await requireHorfWallet(req, res, partner.ownerWalletAddress))) return;
    const removed = await db.delete(horfPossePartners)
      .where(and(eq(horfPossePartners.id, id), eq(horfPossePartners.ownerWalletAddress, partner.ownerWalletAddress)))
      .returning({ id: horfPossePartners.id });
    return removed.length ? res.status(204).end() : res.status(404).json({ error: "Posse partner not found" });
  } catch (error) {
    console.error("[horf] posse removal failed:", error);
    return res.status(503).json({ error: "That posse partner could not be removed" });
  }
});

router.post(["/api/horf/gifts/confirm", "/api/horf/trades/confirm"], requireHorfCsrf, async (req, res) => {
  const kind = req.path === "/api/horf/trades/confirm" ? "trade" : "gift";
  const userId = currentUserId(req);
  const confirmation = parseGiftConfirmation(req.body);
  if (!confirmation) return res.status(400).json({ error: "Valid sending wallet, operation hash, recipients, and horse editions are required" });
  try {
    if (!(await requireHorfWallet(req, res, confirmation.address))) return;
    const head = await horfMainnetIndex.getJson<{ chainId?: string }>("/head");
    if (head.chainId !== HORF_HORSE_CHAIN_ID) {
      return res.status(503).json({ error: "Horse gifts require the Tezos Mainnet index" });
    }
    const horseContract = horseContractAddress();
    if (horseContract && confirmation.gifts.some((gift) => gift.tokenContract === horseContract)) {
      return res.status(422).json({ error: "HORSE rewards are sent separately from horse-art gifts" });
    }
    const operations = await fetchTransactionsByHash(confirmation.opHash, { client: horfMainnetIndex });
    if (operations.length === 0) return res.status(202).json({ status: "pending", opHash: confirmation.opHash });
    const applied = operations.filter((operation) =>
      operation.hash === confirmation.opHash && operation.status === "applied" &&
      operation.sender?.address === confirmation.address &&
      Number.isSafeInteger(operation.id),
    );
    if (applied.length === 0) {
      return res.status(422).json({ error: "No applied Mainnet operation from this wallet matches the submitted hash" });
    }
    const transfers = await indexedTransfersFor(applied.map((operation) => operation.id!));
    if (transfers.length === 0) return res.status(202).json({ status: "pending", opHash: confirmation.opHash });
    const matched = matchGiftTransfers(confirmation, operations, transfers);
    if (!matched) return res.status(422).json({ error: "The operation did not send every declared horse edition to its recipient" });
    const verifiedTokens = new Map<string, Awaited<ReturnType<typeof inspectHorseToken>>>();
    for (const gift of confirmation.gifts) {
      const key = `${gift.tokenContract}/${gift.tokenId}`;
      if (!verifiedTokens.has(key)) verifiedTokens.set(key, await inspectHorseToken(gift.tokenContract, gift.tokenId));
    }
    const inserted = confirmation.gifts.map((gift, index) => {
      const transfer = matched[index]!;
      const token = verifiedTokens.get(`${gift.tokenContract}/${gift.tokenId}`)!;
      return {
        tzktTransferId: transfer.id!, operationHash: confirmation.opHash, kind,
        senderUserId: userId, fromAddress: confirmation.address, toAddress: gift.recipient,
        tokenContract: gift.tokenContract, tokenId: gift.tokenId, amount: Number(gift.amount),
        tokenName: token.name, tokenImage: token.image,
        occurredAt: new Date(transfer.timestamp!),
      };
    });
    await db.insert(horfGiftTransfers).values(inserted).onConflictDoNothing({ target: horfGiftTransfers.tzktTransferId });
    const saved = await db.select().from(horfGiftTransfers)
      .where(inArray(horfGiftTransfers.tzktTransferId, matched.map((transfer) => transfer.id!)))
      .orderBy(asc(horfGiftTransfers.tzktTransferId));
    if (saved.length !== matched.length || saved.some((row) =>
      row.operationHash !== confirmation.opHash || row.fromAddress !== confirmation.address || row.kind !== kind ||
      !confirmation.gifts.some((gift) => gift.recipient === row.toAddress &&
        gift.tokenContract === row.tokenContract && gift.tokenId === row.tokenId &&
        gift.amount === String(row.amount)))) {
      return res.status(409).json({ error: "A transfer in this operation is already recorded as a different gift" });
    }
    return res.json(kind === "gift" ? { gifts: saved.map(giftDto) } : { trades: saved.map(giftDto) });
  } catch (error) {
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof HorseTokenIneligibleError) return res.status(422).json({ error: error.message });
    console.error("[horf] gift confirmation failed:", error);
    return res.status(503).json({ error: "Horse gift confirmation is temporarily unavailable; keep the operation hash and retry" });
  }
});

router.get("/api/horf/gifts", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const rows = await db.select().from(horfGiftTransfers)
      .where(and(eq(horfGiftTransfers.toAddress, address), eq(horfGiftTransfers.kind, "gift")))
      .orderBy(desc(horfGiftTransfers.occurredAt), desc(horfGiftTransfers.id));
    return res.json({ gifts: rows.map(giftDto) });
  } catch (error) {
    console.error("[horf] gift inbox failed:", error);
    return res.status(503).json({ error: "Gifted horses could not be loaded" });
  }
});

router.post("/api/horf/gifts/:id/returned", requireHorfCsrf, async (req, res) => {
  const userId = currentUserId(req);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.returnedFavor !== "boolean") {
    return res.status(400).json({ error: "A valid gift and returned-favor choice are required" });
  }
  try {
    const [gift] = await db.select().from(horfGiftTransfers).where(eq(horfGiftTransfers.id, id)).limit(1);
    if (!gift || gift.kind !== "gift") return res.status(404).json({ error: "Gifted horse not found" });
    if (!(await requireHorfWallet(req, res, gift.toAddress))) return;
    const [updated] = await db.update(horfGiftTransfers).set({
      returnedFavor: req.body.returnedFavor,
      returnedAt: req.body.returnedFavor ? new Date() : null,
      returnedByUserId: req.body.returnedFavor ? userId : null,
    }).where(eq(horfGiftTransfers.id, id)).returning();
    return res.json(giftDto(updated));
  } catch (error) {
    console.error("[horf] returned favor update failed:", error);
    return res.status(503).json({ error: "That returned-favor note could not be saved" });
  }
});

export default router;
