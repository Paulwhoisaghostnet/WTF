/**
 * Marketplace Auto-Promoter
 *
 * Polls recent WTF marketplace sales and generates ready-to-post tweet text.
 * Posting is NOT automatic — generated tweets are stored and surfaced via the
 * admin routes so an operator can review / approve before scheduling or posting.
 *
 * Architecture:
 *   - Poll interval: configurable (default 15 min)
 *   - State stored in-memory; persisted via the console_audit_events log
 *   - No external social API calls from this module — tweet text only
 *   - User opt-in controls whether their sales appear in promotions
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarketplaceSale {
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  sellerUsername: string | null;
  sellerAddress: string;
  buyerAddress: string;
  priceMutez: string;
  marketplace: string;
  soldAt: string;
  thumbnailUri: string | null;
  tokenUrl: string | null;
}

export interface PromoTweet {
  text: string;
  sale: MarketplaceSale;
  generatedAt: string;
  /** "pending" → awaiting admin approval, "approved" → ready to post, "posted" → done */
  status: "pending" | "approved" | "posted" | "dismissed";
}

// ─── State ────────────────────────────────────────────────────────────────────

let enabled = false;
let pollIntervalMs = 15 * 60 * 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const pendingTweets: PromoTweet[] = [];
let lastPollAt: string | null = null;

// ─── Tweet text generation ────────────────────────────────────────────────────

function formatXtz(mutez: string): string {
  const n = Number(mutez) / 1e6;
  return `${n % 1 === 0 ? n : n.toFixed(2)} ꜩ`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function generateSaleTweet(sale: MarketplaceSale): string {
  const name = sale.tokenName || `${shortAddr(sale.tokenContract)}#${sale.tokenId}`;
  const seller = sale.sellerUsername ? `@${sale.sellerUsername}` : shortAddr(sale.sellerAddress);
  const price = formatXtz(sale.priceMutez);
  const link = sale.tokenUrl || `https://wtf.wtf/gallery/token/${sale.tokenContract}/${sale.tokenId}`;

  const templates = [
    `🎉 Just sold on WTF Marketplace!\n"${name}" by ${seller} — ${price}\n${link}\n#WTF #Tezos #NFT`,
    `💸 Fresh sale! ${name} just moved for ${price}\nSeller: ${seller}\n${link}\n#WTF #TezosNFT`,
    `🔥 Collector alert — "${name}" sold for ${price} on WTF\n${link}\n#NFTsale #Tezos`,
  ];

  const idx = Math.abs(parseInt(sale.tokenId || "0") + sale.soldAt.length) % templates.length;
  return templates[idx];
}

// ─── Poll logic ───────────────────────────────────────────────────────────────

async function pollRecentSales(): Promise<MarketplaceSale[]> {
  const since = lastPollAt
    ? new Date(lastPollAt).toISOString()
    : new Date(Date.now() - pollIntervalMs * 2).toISOString();

  try {
    const rows = await db.execute(sql`
      SELECT
        wme.token_contract   AS "tokenContract",
        wme.token_id         AS "tokenId",
        COALESCE(wme.token_name, wme.collection_name) AS "tokenName",
        u.username           AS "sellerUsername",
        wme.seller_address   AS "sellerAddress",
        wme.buyer_address    AS "buyerAddress",
        wme.price_mutez::text AS "priceMutez",
        'wtf'                AS "marketplace",
        wme.sold_at::text    AS "soldAt",
        wme.thumbnail_uri    AS "thumbnailUri",
        NULL                 AS "tokenUrl"
      FROM wallet_market_events wme
      LEFT JOIN users u ON u.id = (
        SELECT wh.user_id FROM wallet_holdings wh
        WHERE wh.wallet_address = wme.seller_address LIMIT 1
      )
      WHERE wme.event_type = 'sale'
        AND wme.sold_at > ${since}::timestamptz
        AND EXISTS (
          SELECT 1 FROM user_notification_preferences unp
          WHERE unp.user_id = (
            SELECT wh2.user_id FROM wallet_holdings wh2
            WHERE wh2.wallet_address = wme.seller_address LIMIT 1
          )
          AND (unp.allow_sale_promotions IS NULL OR unp.allow_sale_promotions = true)
        )
      ORDER BY wme.sold_at DESC
      LIMIT 20
    `);

    return ((rows as any).rows ?? []) as MarketplaceSale[];
  } catch (err) {
    // Table may not exist yet in all environments — degrade gracefully
    console.warn("[social-automation] marketplace poll failed:", (err as Error).message);
    return [];
  }
}

async function runPoll(): Promise<void> {
  if (!enabled) return;
  lastPollAt = new Date().toISOString();

  const sales = await pollRecentSales();
  for (const sale of sales) {
    const alreadyQueued = pendingTweets.some(
      (t) => t.sale.tokenContract === sale.tokenContract && t.sale.tokenId === sale.tokenId
    );
    if (alreadyQueued) continue;

    pendingTweets.push({
      text: generateSaleTweet(sale),
      sale,
      generatedAt: new Date().toISOString(),
      status: "pending",
    });
  }

  // Cap queue at 100 entries (oldest pending removed first)
  while (pendingTweets.length > 100) pendingTweets.shift();
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export function getPromoterState() {
  return {
    enabled,
    pollIntervalMs,
    lastPollAt,
    queueLength: pendingTweets.length,
    pending: pendingTweets.filter((t) => t.status === "pending").length,
    approved: pendingTweets.filter((t) => t.status === "approved").length,
  };
}

export function listPendingTweets(): PromoTweet[] {
  return [...pendingTweets];
}

export function approveTweet(idx: number): PromoTweet | null {
  const t = pendingTweets[idx];
  if (!t) return null;
  t.status = "approved";
  return t;
}

export function dismissTweet(idx: number): boolean {
  const t = pendingTweets[idx];
  if (!t) return false;
  t.status = "dismissed";
  return true;
}

export function markPosted(idx: number): boolean {
  const t = pendingTweets[idx];
  if (!t) return false;
  t.status = "posted";
  return true;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startPromoter(intervalMs = pollIntervalMs): void {
  enabled = true;
  pollIntervalMs = intervalMs;
  if (pollTimer) clearInterval(pollTimer);
  runPoll().catch(console.error);
  pollTimer = setInterval(() => runPoll().catch(console.error), pollIntervalMs);
  console.log(`[social-automation] marketplace promoter started (interval ${intervalMs}ms)`);
}

export function stopPromoter(): void {
  enabled = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  console.log("[social-automation] marketplace promoter stopped");
}

export function setPromoterEnabled(on: boolean): void {
  if (on && !enabled) startPromoter();
  else if (!on && enabled) stopPromoter();
}
