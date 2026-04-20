/**
 * Backfill handlers — one function per `task_type`.
 *
 * Every handler:
 *   • takes a `BackfillRow` (target + payload),
 *   • calls the appropriate rate-limited client (`tzkt` / `objkt`),
 *   • persists whatever it learned into the canonical table
 *     (`xtz_usd_daily`, `address_labels`, `token_sales`, …),
 *   • throws on transient upstream failure (dispatcher will retry),
 *   • calls `skip()` on the row's id when the gap is structurally
 *     unrecoverable (token burnt, op not indexed, etc.).
 *
 * Handlers are intentionally small and independent so each one can
 * evolve alone and so we can add new task types without touching the
 * dispatcher.
 */

import { db } from "../db";
import { tzkt, objkt, UpstreamError } from "./upstream";
import { skip } from "./backfill-manifest";
import type { BackfillRow, BackfillTaskType } from "./backfill-manifest";
import { sql } from "drizzle-orm";

export type Handler = (row: BackfillRow) => Promise<void>;

export const HANDLERS: Record<BackfillTaskType, Handler> = {
  xtz_price_gap: handleXtzPriceGap,
  address_label: handleAddressLabel,
  sale_reconcile: handleSaleReconcile,
  wallet_history: handleWalletHistory,
  token_market: handleTokenMarket,
  token_mint_enrich: handleTokenMintEnrich,
};

/* ----------------------------------------------------------------------- */
/* xtz_price_gap                                                             */
/* ----------------------------------------------------------------------- */

/**
 * Fetch the XTZ/USD quote for a single day from TzKT.
 *
 * TzKT quotes endpoint serves minute-level granularity; we average
 * across the day to get one honest daily close.  Target is the
 * ISO date string, e.g. "2021-07-05".
 */
async function handleXtzPriceGap(row: BackfillRow): Promise<void> {
  const day = row.target; // "YYYY-MM-DD"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    await skip(row.id, "malformed day target");
    return;
  }

  const next = new Date(day + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const nextIso = next.toISOString().slice(0, 10);

  // Ask TzKT for every quote row inside that day (sparse — usually
  // one per block on big days, less on old ones).  We take the
  // average to avoid cherry-picking.
  const quotes = await tzkt.getJson<
    Array<{ timestamp: string; usd?: number | null }>
  >("/quotes", {
    "timestamp.ge": `${day}T00:00:00Z`,
    "timestamp.lt": `${nextIso}T00:00:00Z`,
    select: "timestamp,usd",
    limit: 10_000,
  });

  if (!Array.isArray(quotes) || quotes.length === 0) {
    // Pre-mainnet / no data.  Mark skipped so we don't re-check.
    await skip(row.id, "no quotes for day");
    return;
  }

  let sum = 0;
  let count = 0;
  for (const q of quotes) {
    const v = typeof q.usd === "number" ? q.usd : null;
    if (v != null && Number.isFinite(v) && v > 0) {
      sum += v;
      count += 1;
    }
  }
  if (count === 0) {
    await skip(row.id, "quotes had no valid usd values");
    return;
  }

  const avg = sum / count;

  await db.execute(sql`
    INSERT INTO xtz_usd_daily (day, price_usd, source, fetched_at)
    VALUES (${day}::date, ${avg.toFixed(6)}::numeric, 'tzkt_quotes', now())
    ON CONFLICT (day) DO UPDATE SET
      price_usd  = EXCLUDED.price_usd,
      source     = EXCLUDED.source,
      fetched_at = now()
  `);
}

/* ----------------------------------------------------------------------- */
/* address_label                                                             */
/* ----------------------------------------------------------------------- */

/**
 * Resolve a friendly label for a Tezos address.
 *
 * Order of precedence:
 *   1. TzKT /accounts/:addr  → alias (community-curated), kind, type,
 *                              and balance.  Also confirms existence.
 *   2. TzKT reverseRecord     → forward Tezos Domains resolution for tz1/tz2.
 *   3. Objkt GraphQL          → alias (user-set display name).
 *
 * We update `address_labels` with whatever we find.
 */
async function handleAddressLabel(row: BackfillRow): Promise<void> {
  const address = row.target;

  type AccountResp = {
    alias?: string | null;
    type?: string | null;
    kind?: string | null;
  };

  let alias: string | null = null;
  let category: string | null = null;
  let domain: string | null = null;
  let hasEverMinted: boolean | null = null;

  try {
    const acct = await tzkt.getJson<AccountResp>(
      `/accounts/${encodeURIComponent(address)}`,
      {
        select: "alias,type,kind",
      }
    );
    if (acct?.alias) alias = acct.alias.slice(0, 255);
    if (acct?.type) category = acct.type.slice(0, 32);
    else if (acct?.kind) category = acct.kind.slice(0, 32);
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) {
      await skip(row.id, "address not known to tzkt");
      return;
    }
    throw err;
  }

  try {
    const dom = await tzkt.getJson<Array<{ name?: string | null }>>(
      `/domains`,
      {
        address,
        "select.values": "name",
        limit: 1,
      }
    );
    if (Array.isArray(dom) && dom.length > 0 && dom[0] && typeof dom[0] === 'string') {
      // select.values=name returns a flat string array
      domain = (dom as unknown as string[])[0] ?? null;
    }
  } catch {
    // Tezos Domains is optional enrichment.  Don't let a domain
    // outage fail the whole handler.
  }

  // Objkt GraphQL alias: its `holder` table has a `name` column the
  // user set on their profile.  Not mandatory — if it fails, carry on.
  try {
    const gql = await objkt.postJson<{
      data?: { holder?: Array<{ alias?: string | null; name?: string | null }> };
    }>("", {
      query: `query($addr: String!) {
        holder(where: { address: { _eq: $addr } }, limit: 1) {
          alias
          name
        }
      }`,
      variables: { addr: address },
    });
    const h = gql?.data?.holder?.[0];
    if (!alias) {
      const objktAlias = (h?.alias ?? h?.name) ?? null;
      if (objktAlias) alias = objktAlias.slice(0, 255);
    }
  } catch {
    // Objkt is optional enrichment.
  }

  // has_ever_minted: 1 if TzKT reports any mint op from this address.
  try {
    const count = await tzkt.getJson<number>(
      `/operations/transactions/count`,
      {
        sender: address,
        entrypoint: "mint",
        limit: 1,
      }
    );
    hasEverMinted = typeof count === "number" && count > 0;
  } catch {
    // Leave null; caller keeps previous value.
  }

  await db.execute(sql`
    INSERT INTO address_labels (
      address, label, category, tezos_domain,
      has_ever_minted, last_resolved_at, updated_at
    )
    VALUES (
      ${address},
      ${alias},
      ${category},
      ${domain},
      ${hasEverMinted ?? false},
      now(),
      now()
    )
    ON CONFLICT (address) DO UPDATE SET
      label             = COALESCE(EXCLUDED.label, address_labels.label),
      category          = COALESCE(EXCLUDED.category, address_labels.category),
      tezos_domain      = COALESCE(EXCLUDED.tezos_domain, address_labels.tezos_domain),
      has_ever_minted   = COALESCE(EXCLUDED.has_ever_minted, address_labels.has_ever_minted),
      last_resolved_at  = EXCLUDED.last_resolved_at,
      updated_at        = now()
  `);
}

/* ----------------------------------------------------------------------- */
/* sale_reconcile                                                            */
/* ----------------------------------------------------------------------- */

/**
 * A sale row has either a synthetic op_hash (`synth:<id>`) or a
 * missing seller.  We ask TzKT for the transaction that moved the
 * same edition to the same buyer near `sold_at` and, if we find one,
 * replace the synthetic values with the real chain data.
 *
 * If the chain doesn't contain a matching transfer, we mark the row
 * `skipped` — the data we already have (buyer + time + price) is
 * still usable for cost-basis; we just lost the chance to swap in a
 * real op_hash.  The sale row stays intact.
 */
async function handleSaleReconcile(row: BackfillRow): Promise<void> {
  const p = (row.payload ?? {}) as {
    saleId?: number;
    tokenContract?: string;
    tokenId?: string;
    buyerAddress?: string;
    sellerAddress?: string | null;
    synthOpHash?: string | null;
  };
  if (!p.saleId || !p.tokenContract || !p.tokenId || !p.buyerAddress) {
    await skip(row.id, "incomplete payload");
    return;
  }

  // Pull the canonical sale timestamp so we can constrain the TzKT
  // query to a ±5-minute window — /tokens/transfers over "forever"
  // would be too heavy and ambiguous.
  const soldAtRes = (await db.execute(sql`
    SELECT sold_at, op_hash, seller_address
    FROM token_sales
    WHERE id = ${p.saleId}
    LIMIT 1
  `)) as any;
  const hit: any = (soldAtRes?.rows ?? soldAtRes ?? [])[0] ?? null;
  if (!hit) {
    await skip(row.id, "sale row disappeared");
    return;
  }
  const soldAt = new Date(hit.sold_at);
  const from = new Date(soldAt.getTime() - 5 * 60_000);
  const to = new Date(soldAt.getTime() + 5 * 60_000);

  type Tr = {
    id?: number;
    level?: number;
    timestamp?: string;
    from?: { address?: string };
    to?: { address?: string };
    token?: { contract?: { address?: string }; tokenId?: string };
    amount?: string;
    transactionId?: number;
  };

  let transfers: Tr[] = [];
  try {
    transfers = await tzkt.getJson<Tr[]>(`/tokens/transfers`, {
      "token.contract": p.tokenContract,
      "token.tokenId": p.tokenId,
      "to": p.buyerAddress,
      "timestamp.ge": from.toISOString(),
      "timestamp.le": to.toISOString(),
      limit: 20,
    });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) {
      await skip(row.id, "tzkt 404 on transfers");
      return;
    }
    throw err;
  }

  // Pick the closest transfer to `soldAt` that isn't a self-transfer.
  let best: Tr | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const t of transfers) {
    if (!t.timestamp) continue;
    if (!t.from?.address || !t.to?.address) continue;
    const delta = Math.abs(new Date(t.timestamp).getTime() - soldAt.getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      best = t;
    }
  }

  if (!best || !best.transactionId) {
    await skip(row.id, "no matching transfer at ±5min");
    return;
  }

  // Resolve the op_hash from the parent transaction.
  let opHash: string | null = null;
  let sellerAddress: string | null = best.from?.address ?? null;
  try {
    const parent = await tzkt.getJson<Array<{ hash?: string; sender?: { address?: string } }>>(
      `/operations/transactions`,
      {
        id: best.transactionId,
        select: "hash,sender",
        limit: 1,
      }
    );
    if (Array.isArray(parent) && parent.length > 0) {
      opHash = parent[0]?.hash ?? null;
    }
  } catch {
    // Leave opHash null; we still persist seller if we have it.
  }

  if (!opHash && !sellerAddress) {
    await skip(row.id, "could not resolve op_hash or seller");
    return;
  }

  await db.execute(sql`
    UPDATE token_sales
       SET op_hash        = COALESCE(${opHash}, op_hash),
           seller_address = COALESCE(${sellerAddress}, seller_address),
           tzkt_op_id     = COALESCE(${best.transactionId}, tzkt_op_id),
           block_level    = COALESCE(${best.level ?? null}, block_level),
           source         = regexp_replace(
                              regexp_replace(source, '_synth', '', 'g'),
                              '_noseller', '', 'g'
                            ) || '_reconciled'
     WHERE id = ${p.saleId}
  `);
}

/* ----------------------------------------------------------------------- */
/* wallet_history                                                            */
/* ----------------------------------------------------------------------- */

/**
 * Paginate TzKT token transfers for a wallet forward from its last
 * stored cursor.  Writes every new transfer to `wallet_events` and
 * advances the cursor.  A single call grabs up to 1000 rows (TzKT's
 * max page).
 *
 * Handler is deliberately small — the dispatcher calls it repeatedly
 * as long as there's more data.  When TzKT returns an empty page the
 * handler exits cleanly; the next seeder pass re-enqueues if more
 * arrives.
 */
async function handleWalletHistory(row: BackfillRow): Promise<void> {
  const addr = row.target;

  // Read cursor.
  const cur = (await db.execute(sql`
    SELECT last_transfer_id, last_level
    FROM wallet_sync_cursors
    WHERE wallet_address = ${addr}
    LIMIT 1
  `)) as any;
  const last: any = (cur?.rows ?? cur ?? [])[0] ?? null;
  const cursor = last?.last_transfer_id ?? 0;

  type Tr = {
    id: number;
    level?: number;
    timestamp?: string;
    from?: { address?: string } | null;
    to?: { address?: string } | null;
    token?: {
      contract?: { address?: string };
      tokenId?: string;
    } | null;
    amount?: string;
    transactionId?: number | null;
  };

  let batch: Tr[] = [];
  try {
    batch = await tzkt.getJson<Tr[]>(`/tokens/transfers`, {
      "anyof.from.to": addr,
      "id.gt": cursor,
      "sort.asc": "id",
      limit: 1000,
    });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 400) {
      // Some query param was rejected — recover by falling back to `or` syntax.
      batch = await tzkt.getJson<Tr[]>(`/tokens/transfers`, {
        "from.eq,to.eq": addr,
        "id.gt": cursor,
        "sort.asc": "id",
        limit: 1000,
      });
    } else {
      throw err;
    }
  }

  if (!Array.isArray(batch) || batch.length === 0) {
    // Nothing new — still update last_synced_at so the cursor row
    // reflects that we checked.
    await db.execute(sql`
      INSERT INTO wallet_sync_cursors (wallet_address, last_transfer_id, last_synced_at)
      VALUES (${addr}, ${cursor}, now())
      ON CONFLICT (wallet_address) DO UPDATE SET last_synced_at = now()
    `);
    return;
  }

  // Convert transfers → wallet_events rows, one event per leg.
  //
  // Mapped to the real `wallet_events` schema:
  //   - level (int8)
  //   - timestamp (timestamptz)
  //   - tzkt_kind = 'transfer'
  //   - tzkt_transfer_id (unique per wallet)
  //   - counterparty_address (not `counterparty`)
  //   - token_amount (not `amount`)
  type EvtInsert = {
    wallet_address: string;
    event_type: string;
    level: number;
    timestamp: Date;
    tzkt_transfer_id: number;
    token_contract: string | null;
    token_id: string | null;
    token_amount: string | null;
    counterparty_address: string | null;
  };
  const events: EvtInsert[] = [];
  let maxId = cursor;
  let maxLevel = last?.last_level ?? 0;

  for (const t of batch) {
    if (!t.timestamp) continue;
    const ts = new Date(t.timestamp);
    const fromA = t.from?.address ?? null;
    const toA = t.to?.address ?? null;
    const contract = t.token?.contract?.address ?? null;
    const tokenId = t.token?.tokenId ?? null;
    const level = t.level ?? 0;

    if (t.id > maxId) maxId = t.id;
    if (level > maxLevel) maxLevel = level;

    const isIn = toA && toA.toLowerCase() === addr.toLowerCase();
    const isOut = fromA && fromA.toLowerCase() === addr.toLowerCase();
    const isMint = !fromA || fromA === "tz1burnburnburnburnburnburnburjAYjjX";

    if (isIn) {
      events.push({
        wallet_address: addr,
        event_type: isMint ? "token_mint" : "token_transfer_in",
        level,
        timestamp: ts,
        tzkt_transfer_id: t.id,
        token_contract: contract,
        token_id: tokenId,
        token_amount: t.amount ?? null,
        counterparty_address: fromA,
      });
    }
    if (isOut) {
      events.push({
        wallet_address: addr,
        event_type: "token_transfer_out",
        level,
        timestamp: ts,
        tzkt_transfer_id: t.id,
        token_contract: contract,
        token_id: tokenId,
        token_amount: t.amount ?? null,
        counterparty_address: toA,
      });
    }
  }

  if (events.length) {
    // wallet_events has `uq_wallet_event_transfer` unique on
    // (wallet_address, tzkt_transfer_id) — ON CONFLICT makes this
    // idempotent against re-fetches.
    const chunkSize = 500;
    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      const valuesSql = sql.join(
        chunk.map(
          (e) => sql`(
            ${e.wallet_address},
            ${e.event_type}::wallet_event_type,
            ${e.level},
            ${e.timestamp},
            'transfer',
            ${e.tzkt_transfer_id},
            ${e.token_contract},
            ${e.token_id},
            ${e.token_amount},
            ${e.counterparty_address}
          )`
        ),
        sql`, `
      );
      await db.execute(sql`
        INSERT INTO wallet_events (
          wallet_address, event_type, level, timestamp,
          tzkt_kind, tzkt_transfer_id,
          token_contract, token_id, token_amount,
          counterparty_address
        )
        VALUES ${valuesSql}
        ON CONFLICT (wallet_address, tzkt_transfer_id) DO NOTHING
      `);
    }
  }

  // Advance cursor.
  await db.execute(sql`
    INSERT INTO wallet_sync_cursors (
      wallet_address, last_transfer_id, last_level, last_synced_at
    )
    VALUES (${addr}, ${maxId}, ${maxLevel}, now())
    ON CONFLICT (wallet_address) DO UPDATE SET
      last_transfer_id = EXCLUDED.last_transfer_id,
      last_level       = GREATEST(wallet_sync_cursors.last_level, EXCLUDED.last_level),
      last_synced_at   = now()
  `);
}

/* ----------------------------------------------------------------------- */
/* token_market                                                              */
/* ----------------------------------------------------------------------- */

/**
 * Refresh token market summary from Objkt GraphQL + token_sales.
 *
 * We call Objkt once for the active-listings snapshot (cheaper than
 * TzKT's bigmap walk), then aggregate sale stats out of our own
 * `token_sales` table (already populated by the Guidance import).
 */
async function handleTokenMarket(row: BackfillRow): Promise<void> {
  const p = (row.payload ?? {}) as { tokenContract?: string; tokenId?: string };
  const contract = p.tokenContract;
  const tokenId = p.tokenId;
  if (!contract || !tokenId) {
    await skip(row.id, "incomplete payload");
    return;
  }

  type Listing = {
    id?: number | string | null;
    price?: number | null;
    amount_left?: number | null;
    status?: string | null;
    seller_address?: string | null;
    marketplace_contract?: string | null;
    timestamp?: string | null;
  };

  type GqlResp = {
    data?: {
      listing?: Listing[];
    };
  };

  let listings: Listing[] = [];
  try {
    const resp = await objkt.postJson<GqlResp>("", {
      query: `query($fa: String!, $tid: String!) {
        listing(
          where: {
            token: { fa_contract: { _eq: $fa }, token_id: { _eq: $tid } }
            status: { _eq: "active" }
          }
          limit: 200
          order_by: { price: asc }
        ) {
          id
          price
          amount_left
          status
          seller_address
          marketplace_contract
          timestamp
        }
      }`,
      variables: { fa: contract, tid: tokenId },
    });
    listings = resp?.data?.listing ?? [];
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 404 || err.status === 400)) {
      listings = [];
    } else {
      throw err;
    }
  }

  // Mark any currently-active rows for this token inactive first.
  // Then upsert the fresh batch; anything that was still active on
  // Objkt will get flipped back to active=true.
  await db.execute(sql`
    UPDATE token_listings
       SET active       = false,
           cancelled_at = COALESCE(cancelled_at, now())
     WHERE token_contract = ${contract}
       AND token_id       = ${tokenId}
       AND active         = true
  `);

  if (listings.length > 0) {
    const rowsToInsert = listings
      .filter((l) => l.id != null && l.seller_address)
      .map((l) => {
        const priceMutez = BigInt(
          Math.max(0, Math.floor(Number(l.price ?? 0)))
        );
        return {
          listing_id: String(l.id),
          marketplace: (l.marketplace_contract ?? "objkt").slice(0, 32),
          seller_address: l.seller_address!,
          price_mutez: priceMutez,
          amount: Number(l.amount_left ?? 1),
          listed_at: l.timestamp ? new Date(l.timestamp) : new Date(),
        };
      });

    if (rowsToInsert.length > 0) {
      const valuesSql = sql.join(
        rowsToInsert.map(
          (r) => sql`(
            ${r.listing_id},
            ${r.marketplace},
            ${contract},
            ${tokenId},
            ${r.seller_address},
            ${r.price_mutez},
            ${r.amount},
            true,
            ${r.listed_at},
            'objkt_gql',
            now()
          )`
        ),
        sql`, `
      );
      await db.execute(sql`
        INSERT INTO token_listings (
          listing_id, marketplace, token_contract, token_id,
          seller_address, price_mutez, editions,
          active, listed_at, source, fetched_at
        )
        VALUES ${valuesSql}
        ON CONFLICT (marketplace, listing_id) DO UPDATE SET
          price_mutez  = EXCLUDED.price_mutez,
          editions     = EXCLUDED.editions,
          active       = true,
          fetched_at   = now(),
          cancelled_at = NULL
      `);
    }
  }

  // Aggregate sale metrics from our own token_sales table.
  const agg = (await db.execute(sql`
    SELECT
      MAX(sold_at)              AS last_sale_at,
      MAX(price_mutez)          AS highest_sale,
      MIN(price_mutez)          AS lowest_sale,
      AVG(price_mutez)::bigint  AS avg_sale,
      SUM(price_mutez)::bigint  AS total_volume,
      COUNT(*)                  AS sale_count,
      SUM(CASE WHEN is_primary THEN 1 ELSE 0 END)    AS primary_count,
      SUM(CASE WHEN is_primary THEN 0 ELSE 1 END)    AS secondary_count,
      SUM(royalties_mutez)::bigint                   AS total_royalties,
      SUM(platform_fee_mutez)::bigint                AS total_platform,
      COUNT(DISTINCT buyer_address)                  AS unique_buyers
    FROM token_sales
    WHERE token_contract = ${contract}
      AND token_id       = ${tokenId}
  `)) as any;
  const a: any = (agg?.rows ?? agg ?? [])[0] ?? {};

  const lastSalePriceRes = (await db.execute(sql`
    SELECT price_mutez FROM token_sales
    WHERE token_contract = ${contract} AND token_id = ${tokenId}
    ORDER BY sold_at DESC
    LIMIT 1
  `)) as any;
  const lastSaleRow: any = (lastSalePriceRes?.rows ?? lastSalePriceRes ?? [])[0] ?? {};
  const lastSalePrice = lastSaleRow?.price_mutez ?? null;

  // Listing metrics.
  let floor: bigint | null = null;
  let highestListing: bigint | null = null;
  let avgListing: bigint | null = null;
  if (listings.length > 0) {
    const prices = listings
      .map((l) => BigInt(Math.max(0, Math.floor(Number(l.price ?? 0)))))
      .filter((p) => p > 0n);
    if (prices.length > 0) {
      floor = prices[0]!;
      highestListing = prices[prices.length - 1]!;
      const sum = prices.reduce((acc, p) => acc + p, 0n);
      avgListing = sum / BigInt(prices.length);
    }
  }

  await db.execute(sql`
    INSERT INTO token_market_summary (
      token_contract, token_id,
      last_sale_mutez, last_sale_at,
      highest_sale_mutez, lowest_sale_mutez, average_sale_mutez,
      total_volume_mutez, sale_count,
      primary_sale_count, secondary_sale_count,
      current_floor_mutez, current_highest_listing_mutez,
      average_active_listing_mutez, active_listing_count,
      unique_owners_count,
      total_royalties_mutez, total_platform_fees_mutez,
      refreshed_at
    )
    VALUES (
      ${contract}, ${tokenId},
      ${lastSalePrice}, ${a.last_sale_at ?? null},
      ${a.highest_sale ?? null}, ${a.lowest_sale ?? null}, ${a.avg_sale ?? null},
      ${a.total_volume ?? 0}, ${Number(a.sale_count ?? 0)},
      ${Number(a.primary_count ?? 0)}, ${Number(a.secondary_count ?? 0)},
      ${floor}, ${highestListing},
      ${avgListing}, ${listings.length},
      ${Number(a.unique_buyers ?? 0)},
      ${a.total_royalties ?? 0}, ${a.total_platform ?? 0},
      now()
    )
    ON CONFLICT (token_contract, token_id) DO UPDATE SET
      last_sale_mutez              = EXCLUDED.last_sale_mutez,
      last_sale_at                 = EXCLUDED.last_sale_at,
      highest_sale_mutez           = EXCLUDED.highest_sale_mutez,
      lowest_sale_mutez            = EXCLUDED.lowest_sale_mutez,
      average_sale_mutez           = EXCLUDED.average_sale_mutez,
      total_volume_mutez           = EXCLUDED.total_volume_mutez,
      sale_count                   = EXCLUDED.sale_count,
      primary_sale_count           = EXCLUDED.primary_sale_count,
      secondary_sale_count         = EXCLUDED.secondary_sale_count,
      current_floor_mutez          = EXCLUDED.current_floor_mutez,
      current_highest_listing_mutez= EXCLUDED.current_highest_listing_mutez,
      average_active_listing_mutez = EXCLUDED.average_active_listing_mutez,
      active_listing_count         = EXCLUDED.active_listing_count,
      unique_owners_count          = EXCLUDED.unique_owners_count,
      total_royalties_mutez        = EXCLUDED.total_royalties_mutez,
      total_platform_fees_mutez    = EXCLUDED.total_platform_fees_mutez,
      refreshed_at                 = now()
  `);
}

/* ----------------------------------------------------------------------- */
/* token_mint_enrich                                                         */
/* ----------------------------------------------------------------------- */

/**
 * Fill missing mint-event fields: platform, mint fee, first owner.
 */
async function handleTokenMintEnrich(row: BackfillRow): Promise<void> {
  const p = (row.payload ?? {}) as { mintEventId?: number; opHash?: string };
  const id = p.mintEventId;
  const hash = p.opHash;
  if (!id || !hash) {
    await skip(row.id, "incomplete payload");
    return;
  }

  type Op = {
    hash?: string;
    bakerFee?: number;
    storageFee?: number;
    sender?: { address?: string };
    target?: { address?: string };
    parameter?: { entrypoint?: string };
  };

  let ops: Op[] = [];
  try {
    ops = await tzkt.getJson<Op[]>(
      `/operations/transactions/${encodeURIComponent(hash)}`,
      {
        select: "hash,bakerFee,storageFee,sender,target,parameter",
        limit: 50,
      }
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) {
      await skip(row.id, "mint op not indexed");
      return;
    }
    throw err;
  }

  let bakerFee = 0;
  let storageFee = 0;
  let target: string | null = null;
  for (const o of ops) {
    bakerFee += Number(o.bakerFee ?? 0);
    storageFee += Number(o.storageFee ?? 0);
    if (!target && o.target?.address) target = o.target.address;
  }
  const totalFee = bakerFee + storageFee;

  await db.execute(sql`
    UPDATE token_mint_events
       SET mint_fee_mutez = COALESCE(mint_fee_mutez, ${totalFee}),
           platform       = COALESCE(platform, ${target})
     WHERE id = ${id}
  `);
}
