import { Router } from "express";
import { asc, and, eq } from "drizzle-orm";
import { db } from "../db";
import { horfOpenRangeOffers } from "@shared/schema";
import { getOwnedFa2TokensPage } from "../tzkt";
import { HORF_HORSE_CHAIN_ID } from "../features/horf/horse-config";
import { horfMainnetIndex, HORF_MAINNET_TZKT_BASE } from "../features/horf/mainnet-index";
import { isTezosWallet } from "../features/horf/model";
import {
  loadTraderObjktTokens, qualifyingTraderHorses, traderTokenImage, traderTokenKey,
} from "../features/horf/trader-horses";

const router = Router();
// Match the existing public Horf wallet page. Every qualifying holding remains
// reachable through the offset cursor, including after a page with no matches.
const BALANCE_PAGE_SIZE = 48;

router.get("/api/horf/traders/:address/horses", async (req, res) => {
  const address = req.params.address;
  const offset = Number(req.query.offset ?? 0);
  if (!isTezosWallet(address) || !Number.isSafeInteger(offset) || offset < 0) {
    return res.status(400).json({ error: "Valid trader wallet and nonnegative offset are required" });
  }
  try {
    const head = await horfMainnetIndex.getJson<{ chainId?: string }>("/head");
    if (head.chainId !== HORF_HORSE_CHAIN_ID) {
      return res.status(503).json({ error: "Trader horses require the Tezos Mainnet index" });
    }
    const page = await getOwnedFa2TokensPage(address, BALANCE_PAGE_SIZE, offset, { sourceBase: HORF_MAINNET_TZKT_BASE });
    const indexed = await loadTraderObjktTokens(page.items);
    return res.json({
      address,
      items: qualifyingTraderHorses(page.items, indexed),
      pagination: { hasMore: page.hasMore, nextOffset: page.nextOffset },
    });
  } catch (error) {
    console.error("[horf] trader horse holdings failed:", error);
    return res.status(503).json({ error: "Trader horse holdings are temporarily unavailable" });
  }
});

router.get("/api/horf/traders/:address/offers", async (req, res) => {
  const address = req.params.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid trader wallet is required" });
  try {
    const rows = await db.select().from(horfOpenRangeOffers)
      .where(and(eq(horfOpenRangeOffers.active, true), eq(horfOpenRangeOffers.ownerWalletAddress, address)))
      .orderBy(asc(horfOpenRangeOffers.createdAt), asc(horfOpenRangeOffers.id));
    let indexed: Awaited<ReturnType<typeof loadTraderObjktTokens>> = [];
    let metadataStatus: "ready" | "unavailable" = "ready";
    try {
      indexed = await loadTraderObjktTokens(rows.map((row) => ({ contract: row.tokenContract, tokenId: row.tokenId })));
    } catch (error) {
      metadataStatus = "unavailable";
      console.warn("[horf] trader offer artwork unavailable:", error);
    }
    const byKey = new Map(indexed.filter((token) => typeof token.fa_contract === "string" && typeof token.token_id === "string")
      .map((token) => [traderTokenKey({ contract: token.fa_contract!, tokenId: token.token_id! }), token]));
    return res.json({
      address,
      metadataStatus,
      offers: rows.map((row) => {
        const token = byKey.get(traderTokenKey({ contract: row.tokenContract, tokenId: row.tokenId }));
        return {
          id: row.id,
          ownerAddress: row.ownerWalletAddress,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          amount: row.amount,
          acceptedTokenPolicy: row.acceptedTokenPolicy,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          name: String(token?.name || `Token #${row.tokenId}`).trim() || `Token #${row.tokenId}`,
          image: token ? traderTokenImage(token) : null,
        };
      }),
    });
  } catch (error) {
    console.error("[horf] trader offers failed:", error);
    return res.status(503).json({ error: "Trader offers are temporarily unavailable" });
  }
});

export default router;
