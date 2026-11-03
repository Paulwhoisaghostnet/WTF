import type { PoolClient } from "pg";
import { pool } from "../../../db";
import { HORF_SEASON_START, type HorfTransfer } from "../model";
import type { HorfSeason } from "../seasons";
import { horseContractAddress } from "../horse-config";
import { horfMainnetIndex } from "../mainnet-index";
import { HORF_MAINNET_BLOCK_MS } from "../mainnet";
import { assertHorfStablesMainnet } from "../stables/chain";
import { horseMarketAddress } from "./market";
import {
  fetchHorfHorseMarketSalePage, HorfHorseMarketSaleProofError,
  isLastHorfHorseMarketSalePage, verifyHorfHorseMarketSale,
  type HorfHorseMarketSale,
} from "./sales";

interface SyncState {
  cursor: string;
  status: "ready" | "syncing" | "error";
  as_of: Date | null;
  error: string | null;
  updated_at: Date;
}

interface StoredSale {
  tzkt_event_id: string;
  transaction_id: string;
  occurred_at: Date;
  seller_address: string;
  buyer_address: string;
  listing_id: string;
  token_contract: string;
  token_id: string;
  quantity: string;
  total_horse_raw: string;
}

const running = new Map<string, Promise<void>>();
const SOURCE_ERROR = "HORSE market sales are temporarily unavailable. Last verified sales remain visible.";

function safeId(value: string | number): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error("Invalid HORSE sale event ID");
  return id;
}

async function stateFor(address: string, client: PoolClient | typeof pool = pool): Promise<SyncState> {
  await client.query(`INSERT INTO public.horf_horse_market_sale_sync (contract_address)
    VALUES ($1) ON CONFLICT (contract_address) DO NOTHING`, [address]);
  const result = await client.query<SyncState>(`SELECT cursor, status, as_of, error, updated_at
    FROM public.horf_horse_market_sale_sync WHERE contract_address = $1`, [address]);
  if (!result.rows[0]) throw new Error("HORSE market sale source is unavailable");
  return result.rows[0];
}

async function persistPage(client: PoolClient, address: string, page: HorfHorseMarketSale[], cursor: number) {
  await client.query("BEGIN");
  try {
    if (page.length) {
      await client.query(`INSERT INTO public.horf_horse_market_sale_events (
          contract_address, tzkt_event_id, transaction_id, occurred_at, seller_address,
          buyer_address, listing_id, token_contract, token_id, quantity, total_horse_raw
        )
        SELECT $1::text, x.id, x.transaction_id, x.occurred_at, x.seller, x.buyer,
          x.listing_id, x.token_contract, x.token_id, x.quantity, x.total_horse_raw
        FROM jsonb_to_recordset($2::jsonb) AS x(
          id bigint, transaction_id bigint, occurred_at timestamptz, seller text, buyer text,
          listing_id text, token_contract text, token_id text, quantity text, total_horse_raw text
        )
        ON CONFLICT DO NOTHING`,
      [address, JSON.stringify(page.map((sale) => ({
        id: sale.id, transaction_id: sale.transactionId, occurred_at: sale.timestamp,
        seller: sale.seller, buyer: sale.buyer, listing_id: sale.listingId,
        token_contract: sale.tokenContract, token_id: sale.tokenId,
        quantity: sale.quantity, total_horse_raw: sale.totalHorseRaw,
      }))) ]);
    }
    await client.query(`UPDATE public.horf_horse_market_sale_sync
      SET cursor = $2::bigint, updated_at = now() WHERE contract_address = $1`, [address, cursor]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function fromStored(row: StoredSale): HorfHorseMarketSale {
  return {
    id: safeId(row.tzkt_event_id), transactionId: safeId(row.transaction_id),
    timestamp: new Date(row.occurred_at).toISOString(), seller: row.seller_address,
    buyer: row.buyer_address, listingId: row.listing_id,
    tokenContract: row.token_contract, tokenId: row.token_id,
    quantity: row.quantity, totalHorseRaw: row.total_horse_raw,
  };
}

async function verifyPending(client: PoolClient, address: string, paymentContract: string) {
  const pending = await client.query<StoredSale>(`SELECT tzkt_event_id, transaction_id, occurred_at,
      seller_address, buyer_address, listing_id, token_contract, token_id, quantity, total_horse_raw
    FROM public.horf_horse_market_sale_events
    WHERE contract_address = $1 AND verified_at IS NULL ORDER BY tzkt_event_id ASC`, [address]);
  for (const row of pending.rows) {
    try {
      const proof = await verifyHorfHorseMarketSale(fromStored(row), address, paymentContract);
      await client.query(`UPDATE public.horf_horse_market_sale_events SET
        operation_hash = $3, horse_transfer_id = $4::bigint,
        payment_transfer_id = $5::bigint, verified_at = now(),
        last_checked_at = now(), verification_error = NULL
        WHERE contract_address = $1 AND tzkt_event_id = $2::bigint AND verified_at IS NULL`,
      [address, row.tzkt_event_id, proof.operationHash, proof.horseTransferId, proof.paymentTransferId]);
    } catch (error) {
      if (!(error instanceof HorfHorseMarketSaleProofError)) throw error;
      await client.query(`UPDATE public.horf_horse_market_sale_events SET
        last_checked_at = now(), verification_error = $3
        WHERE contract_address = $1 AND tzkt_event_id = $2::bigint AND verified_at IS NULL`,
      [address, row.tzkt_event_id, error.message]);
    }
  }
}

async function syncSales(address: string, paymentContract: string): Promise<void> {
  const client = await pool.connect();
  const key = `horf:horse-market-sales:${address}`;
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired", [key]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return;
    await assertHorfStablesMainnet(horfMainnetIndex);
    const marketStorage = await horfMainnetIndex.getJson<{ horse_contract?: string }>(`/contracts/${address}/storage`);
    if (marketStorage?.horse_contract !== paymentContract) throw new Error("HORSE market payment contract mismatch");
    const state = await stateFor(address, client);
    let cursor = safeId(state.cursor);
    await client.query(`UPDATE public.horf_horse_market_sale_sync SET status = 'syncing', error = NULL, updated_at = now()
      WHERE contract_address = $1`, [address]);
    while (true) {
      const page = await fetchHorfHorseMarketSalePage(address, cursor, HORF_SEASON_START, null);
      if (page.length) cursor = page[page.length - 1]!.id;
      await persistPage(client, address, page, cursor);
      if (isLastHorfHorseMarketSalePage(page)) break;
    }
    // Pending proofs are retried on later syncs without blocking other riders.
    await verifyPending(client, address, paymentContract);
    await client.query(`UPDATE public.horf_horse_market_sale_sync
      SET status = 'ready', as_of = now(), error = NULL, updated_at = now()
      WHERE contract_address = $1`, [address]);
  } catch (error) {
    console.error("[horf-market] sale sync failed:", error);
    try {
      await client.query(`UPDATE public.horf_horse_market_sale_sync
        SET status = 'error', error = $2, updated_at = now() WHERE contract_address = $1`, [address, SOURCE_ERROR]);
    } catch (writeError) { console.error("[horf-market] sale sync error could not be stored:", writeError); }
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtext($1::text))", [key]); }
      catch (error) { console.error("[horf-market] sale sync advisory unlock failed:", error); }
    }
    client.release();
  }
}

function kickSync(address: string, paymentContract: string) {
  if (running.has(address)) return;
  const pending = syncSales(address, paymentContract)
    .catch((error) => console.error("[horf-market] sale sync could not start:", error))
    .finally(() => running.delete(address));
  running.set(address, pending);
}

function toTransfer(row: StoredSale): HorfTransfer {
  const sale = fromStored(row);
  return {
    id: sale.id, timestamp: sale.timestamp, from: sale.seller, to: sale.buyer,
    amount: 1, settlement: "market",
    token: { contract: sale.tokenContract, tokenId: sale.tokenId,
      name: `Horse #${sale.tokenId}`, image: null },
  };
}

export interface HorseMarketSaleSnapshot {
  status: "ready" | "syncing" | "error";
  asOf: string | null;
  error: string | null;
  nextRefreshAt: string | null;
  transfers: HorfTransfer[];
}

export async function getHorseMarketSaleSnapshot(season: HorfSeason): Promise<HorseMarketSaleSnapshot> {
  const address = horseMarketAddress();
  const paymentContract = horseContractAddress();
  if (!address || !paymentContract || (season.endsAt && season.endsAt <= HORF_SEASON_START)) {
    return { status: "ready", asOf: null, error: null, nextRefreshAt: null, transfers: [] };
  }
  const state = await stateFor(address);
  const now = Date.now();
  const reference = state.status === "ready" ? state.as_of : state.updated_at;
  const due = state.status === "syncing" || !reference ||
    now >= new Date(reference).getTime() + HORF_MAINNET_BLOCK_MS;
  if (due) kickSync(address, paymentContract);
  const asOf = state.as_of ? new Date(state.as_of).toISOString() : null;
  let transfers: HorfTransfer[] = [];
  if (asOf) {
    const result = await pool.query<StoredSale>(`SELECT tzkt_event_id, transaction_id, occurred_at,
        seller_address, buyer_address, listing_id, token_contract, token_id, quantity, total_horse_raw
      FROM public.horf_horse_market_sale_events
      WHERE contract_address = $1 AND verified_at IS NOT NULL
        AND occurred_at >= $2::timestamptz
        AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
      ORDER BY occurred_at ASC, tzkt_event_id ASC`, [address, season.startsAt, season.endsAt]);
    transfers = result.rows.map(toTransfer);
  }
  const status = due && state.status === "ready" ? "syncing" : state.status;
  return {
    status, asOf, error: state.error,
    nextRefreshAt: status === "ready" && season.endsAt ? null : new Date(now + HORF_MAINNET_BLOCK_MS).toISOString(),
    transfers,
  };
}
