import { randomUUID } from "node:crypto";
import { pool } from "../../../db";
import { HORF_MAINNET_BLOCK_MS } from "../mainnet";
import { horseContractAddress } from "../horse-config";
import { isTezosWallet, type HorfTransfer } from "../model";
import type { HorfSeason } from "../seasons";
import { inspectHorseTokenCached } from "../stables/eligibility";
import { preflightHorfObjktPurchase, type HorfObjktListing } from "./objkt-listings";
import {
  ObjktPurchaseInvalidError, ObjktPurchasePendingError,
  objktPurchaseOperationHash, readHorfMainnetRpcLevel, verifyHorfObjktPurchase,
  type ObjktProofIntent,
} from "./objkt-proof";

interface StoredIntent {
  id: string;
  buyer_address: string;
  seller_address: string;
  marketplace_contract: string;
  ask_id: string;
  token_contract: string;
  token_id: string;
  price_mutez: string;
  preflight_level: string;
  created_at: Date;
  operation_hash: string | null;
  status: "prepared" | "pending" | "verified" | "invalid";
  verified_at: Date | null;
  occurred_at: Date | null;
  root_transaction_id: string | null;
}

function proofInput(row: StoredIntent): ObjktProofIntent {
  const preflightLevel = Number(row.preflight_level);
  if (!Number.isSafeInteger(preflightLevel)) throw new Error("Invalid stored Objkt Mainnet preflight level");
  return {
    buyerAddress: row.buyer_address, sellerAddress: row.seller_address,
    marketplaceContract: row.marketplace_contract, askId: row.ask_id,
    tokenContract: row.token_contract, tokenId: row.token_id,
    priceMutez: row.price_mutez, preflightLevel,
  };
}

export async function createHorfObjktPurchaseIntent(
  buyerAddress: string,
  selected: Pick<HorfObjktListing, "marketplaceContract" | "askId" | "tokenContract" | "tokenId" | "sellerAddress" | "priceMutez">,
) {
  if (!isTezosWallet(buyerAddress) || !isTezosWallet(selected.sellerAddress) || buyerAddress === selected.sellerAddress) {
    throw new ObjktPurchaseInvalidError("A buyer and a different trader seller are required");
  }
  if (selected.tokenContract === horseContractAddress()) {
    throw new ObjktPurchaseInvalidError("HORSE is the reward currency, not a traded horse artwork");
  }
  const [{ purchase }] = await Promise.all([
    preflightHorfObjktPurchase(selected),
    inspectHorseTokenCached(selected.tokenContract, selected.tokenId),
  ]);
  // The RPC head, rather than a possibly lagging indexer head, prevents a
  // purchase that already happened before this Horf intent from earning credit.
  const preflightLevel = await readHorfMainnetRpcLevel();
  const intentId = randomUUID();
  await pool.query(`INSERT INTO public.horf_objkt_purchase_intents
      (id, buyer_address, seller_address, marketplace_contract, ask_id,
       token_contract, token_id, price_mutez, preflight_level)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::bigint)`,
  [intentId, buyerAddress, selected.sellerAddress, selected.marketplaceContract, selected.askId,
    selected.tokenContract, selected.tokenId, selected.priceMutez, preflightLevel]);
  return { intentId, purchase };
}

async function findIntent(intentId: string, buyerAddress: string): Promise<StoredIntent | null> {
  const result = await pool.query<StoredIntent>(`SELECT id, buyer_address, seller_address,
      marketplace_contract, ask_id, token_contract, token_id, price_mutez,
      preflight_level, created_at, operation_hash, status, verified_at, occurred_at, root_transaction_id
    FROM public.horf_objkt_purchase_intents
    WHERE id = $1::uuid AND buyer_address = $2`, [intentId, buyerAddress]);
  return result.rows[0] || null;
}

async function verifyStoredIntent(row: StoredIntent) {
  if (!row.operation_hash) return { status: "pending" as const, operationHash: null, tradeCounted: false };
  if (row.status === "verified") return { status: "verified" as const, operationHash: row.operation_hash, tradeCounted: true };
  if (row.status === "invalid") throw new ObjktPurchaseInvalidError("This operation does not prove the selected Objkt horse sale");
  try {
    const proof = await verifyHorfObjktPurchase(proofInput(row), row.operation_hash);
    await pool.query(`UPDATE public.horf_objkt_purchase_intents SET
        status = 'verified', verified_at = now(), occurred_at = $4::timestamptz,
        root_transaction_id = $2::bigint, horse_transfer_id = $3::bigint,
        last_checked_at = now(), error_code = NULL
      WHERE id = $1::uuid AND status = 'pending'`, [row.id, proof.rootTransactionId, proof.horseTransferId, proof.timestamp]);
    return { status: "verified" as const, operationHash: row.operation_hash, tradeCounted: true };
  } catch (error) {
    if (error instanceof ObjktPurchasePendingError) {
      await pool.query(`UPDATE public.horf_objkt_purchase_intents SET
          last_checked_at = now(), error_code = 'index_pending'
        WHERE id = $1::uuid AND status = 'pending'`, [row.id]);
      return { status: "pending" as const, operationHash: row.operation_hash, tradeCounted: false };
    }
    if (error instanceof ObjktPurchaseInvalidError) {
      await pool.query(`UPDATE public.horf_objkt_purchase_intents SET
          status = 'invalid', last_checked_at = now(), error_code = 'invalid_chain_proof'
        WHERE id = $1::uuid AND status = 'pending'`, [row.id]);
    }
    throw error;
  }
}

/** A wallet-submitted hash is stored once; confirmation may arrive after the page closes. */
export async function confirmHorfObjktPurchaseIntent(input: { buyerAddress: string; intentId: string; opHash: string }) {
  if (!isTezosWallet(input.buyerAddress) || !objktPurchaseOperationHash(input.opHash)) {
    throw new ObjktPurchaseInvalidError("A verified buyer and operation hash are required");
  }
  let row = await findIntent(input.intentId, input.buyerAddress);
  if (!row) throw new ObjktPurchaseInvalidError("Horf purchase intent was not found for this wallet");
  if (row.operation_hash && row.operation_hash !== input.opHash) {
    throw new ObjktPurchaseInvalidError("A different operation was already submitted for this purchase intent");
  }
  if (!row.operation_hash) {
    try {
      await pool.query(`UPDATE public.horf_objkt_purchase_intents
        SET operation_hash = $3, status = 'pending', last_checked_at = now()
        WHERE id = $1::uuid AND buyer_address = $2 AND operation_hash IS NULL AND status = 'prepared'`,
      [input.intentId, input.buyerAddress, input.opHash]);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new ObjktPurchaseInvalidError("This operation has already been counted by Horf");
      }
      throw error;
    }
    row = await findIntent(input.intentId, input.buyerAddress);
    if (!row || row.operation_hash !== input.opHash) throw new ObjktPurchaseInvalidError("Objkt purchase intent changed");
  }
  return verifyStoredIntent(row);
}

let running: Promise<void> | null = null;
let lastKick = 0;

async function retryPendingIntents() {
  const client = await pool.connect();
  let locked = false;
  try {
    const acquired = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('horf:objkt-purchase-proofs')) AS ok");
    locked = acquired.rows[0]?.ok === true;
    if (!locked) return;
    const pending = await client.query<StoredIntent>(`SELECT id, buyer_address, seller_address,
        marketplace_contract, ask_id, token_contract, token_id, price_mutez,
        preflight_level, created_at, operation_hash, status, verified_at, occurred_at, root_transaction_id
      FROM public.horf_objkt_purchase_intents
      WHERE status = 'pending' AND operation_hash IS NOT NULL
        AND (last_checked_at IS NULL OR last_checked_at <= now() - interval '6 seconds')
      ORDER BY created_at ASC`);
    for (const row of pending.rows) {
      try { await verifyStoredIntent(row); }
      catch (error) { console.error("[horf-market] Objkt intent proof retry failed:", error); }
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('horf:objkt-purchase-proofs'))");
    client.release();
  }
}

function kickRetry() {
  const now = Date.now();
  if (running || now - lastKick < HORF_MAINNET_BLOCK_MS) return;
  lastKick = now;
  running = retryPendingIntents()
    .catch((error) => console.error("[horf-market] Objkt proof retry failed:", error))
    .finally(() => { running = null; });
}

export async function getHorfObjktPurchaseSnapshot(season: HorfSeason): Promise<{ transfers: HorfTransfer[] }> {
  kickRetry();
  const result = await pool.query<StoredIntent>(`SELECT id, buyer_address, seller_address,
      marketplace_contract, ask_id, token_contract, token_id, price_mutez,
      preflight_level, created_at, operation_hash, status, verified_at, occurred_at, root_transaction_id
    FROM public.horf_objkt_purchase_intents
    WHERE status = 'verified' AND occurred_at IS NOT NULL
      AND occurred_at >= $1::timestamptz
      AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz)
    ORDER BY occurred_at ASC, id ASC`, [season.startsAt, season.endsAt]);
  return { transfers: result.rows.map((row): HorfTransfer => ({
    id: Number(row.root_transaction_id),
    timestamp: new Date(row.occurred_at!).toISOString(),
    from: row.seller_address, to: row.buyer_address, amount: 1,
    settlement: "objkt", token: { contract: row.token_contract, tokenId: row.token_id,
      name: `Horse #${row.token_id}`, image: null },
  })) };
}
