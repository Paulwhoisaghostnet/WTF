import type { PoolClient } from "pg";
import { pool } from "../../db";
import { HORF_SEASON_START, type HorfTransfer } from "./model";
import type { HorfSeason } from "./seasons";
import { HORF_MAINNET_BLOCK_MS } from "./mainnet";
import { assertHorfRoomsMainnet } from "./rooms/chain";
import { horfRoomsContractAddress } from "./rooms/config";
import { fetchHorfRoomSettlementPage, type HorfRoomSettlement } from "./room-settlements";

const PUBLIC_SYNC_ERROR = "Horse room settlements are temporarily unavailable. Last completed counts remain visible.";

interface RoomSyncState {
  contract_address: string;
  cursor: string;
  status: "ready" | "syncing" | "error";
  as_of: Date | null;
  error: string | null;
  updated_at: Date;
}

export interface StoredRoomSettlement {
  contract_address: string;
  tzkt_event_id: string;
  occurred_at: Date;
  operation_hash: string;
  mode: number;
  owner_address: string;
  claimant_address: string;
  output_contract: string;
  output_token_id: string;
  input_contract: string | null;
  input_token_id: string | null;
}

export interface RoomSettlementSnapshot {
  status: "ready" | "syncing" | "error";
  asOf: string | null;
  error: string | null;
  nextRefreshAt: string | null;
  transfers: HorfTransfer[];
}

const runningSyncs = new Map<string, Promise<void>>();

function safeEventId(value: string | number): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error("Invalid Horf room event cursor");
  return id;
}

async function stateFor(contractAddress: string, client?: PoolClient): Promise<RoomSyncState> {
  const query = client || pool;
  await query.query(
    `INSERT INTO public.horf_room_settlement_sync (contract_address) VALUES ($1)
     ON CONFLICT (contract_address) DO NOTHING`, [contractAddress]);
  const result = await query.query<RoomSyncState>(
    `SELECT contract_address, cursor, status, as_of, error, updated_at
       FROM public.horf_room_settlement_sync WHERE contract_address = $1`, [contractAddress]);
  if (!result.rows[0]) throw new Error("Horf room settlement sync row is unavailable");
  return result.rows[0];
}

async function persistPage(client: PoolClient, contractAddress: string,
  settlements: HorfRoomSettlement[], cursor: number, complete: boolean) {
  await client.query("BEGIN");
  try {
    if (settlements.length) {
      await client.query(
        `INSERT INTO public.horf_room_settlement_events (
           contract_address, tzkt_event_id, occurred_at, operation_hash, mode,
           owner_address, claimant_address, output_contract, output_token_id,
           input_contract, input_token_id
         )
         SELECT $1::text, x.id, x.occurred_at, x.operation_hash, x.mode,
                x.owner_address, x.claimant_address, x.output_contract, x.output_token_id,
                x.input_contract, x.input_token_id
           FROM jsonb_to_recordset($2::jsonb) AS x(
             id bigint, occurred_at timestamptz, operation_hash text, mode smallint,
             owner_address text, claimant_address text, output_contract text,
             output_token_id text, input_contract text, input_token_id text
           )
         ON CONFLICT (contract_address, tzkt_event_id) DO NOTHING`,
        [contractAddress, JSON.stringify(settlements.map((event) => ({
          id: event.id, occurred_at: event.timestamp, operation_hash: event.operationHash,
          mode: event.mode, owner_address: event.owner, claimant_address: event.claimant,
          output_contract: event.outputContract, output_token_id: event.outputTokenId,
          input_contract: event.inputContract, input_token_id: event.inputTokenId,
        })))],
      );
    }
    await client.query(
      `UPDATE public.horf_room_settlement_sync
          SET cursor = $2::bigint,
              status = CASE WHEN $3::boolean THEN 'ready' ELSE 'syncing' END,
              as_of = CASE WHEN $3::boolean THEN now() ELSE as_of END,
              error = NULL, updated_at = now()
        WHERE contract_address = $1`, [contractAddress, cursor, complete]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function syncRooms(contractAddress: string) {
  const client = await pool.connect();
  const lockKey = `horf:room-settlements:${contractAddress}`;
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired", [lockKey]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return;
    await assertHorfRoomsMainnet();
    const state = await stateFor(contractAddress, client);
    let cursor = safeEventId(state.cursor);
    await client.query(
      `UPDATE public.horf_room_settlement_sync SET status = 'syncing', error = NULL, updated_at = now()
        WHERE contract_address = $1`, [contractAddress]);
    while (true) {
      const page = await fetchHorfRoomSettlementPage(contractAddress, cursor, HORF_SEASON_START, null);
      cursor = page.cursor;
      await persistPage(client, contractAddress, page.settlements, cursor, page.complete);
      if (page.complete) break;
    }
  } catch (error) {
    console.error("[horf] room settlement sync failed:", error);
    try {
      await client.query(
        `UPDATE public.horf_room_settlement_sync SET status = 'error', error = $2, updated_at = now()
          WHERE contract_address = $1`, [contractAddress, PUBLIC_SYNC_ERROR]);
    } catch (writeError) {
      console.error("[horf] room settlement error could not be stored:", writeError);
    }
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtext($1::text))", [lockKey]); }
      catch (error) { console.error("[horf] room settlement advisory unlock failed:", error); }
    }
    client.release();
  }
}

function kickSync(contractAddress: string) {
  if (runningSyncs.has(contractAddress)) return;
  const pending = syncRooms(contractAddress)
    .catch((error) => console.error("[horf] could not start room settlement sync:", error))
    .finally(() => runningSyncs.delete(contractAddress));
  runningSyncs.set(contractAddress, pending);
}

/** A V3 swap has two horse sends but only one race/completed exchange per rider. */
export function roomSettlementTransfers(row: StoredRoomSettlement): HorfTransfer[] {
  const id = safeEventId(row.tzkt_event_id);
  if (id === 0 || row.mode < 0 || row.mode > 3 || !Number.isInteger(row.mode)) {
    throw new Error("Invalid stored Horf room settlement");
  }
  const timestamp = new Date(row.occurred_at).toISOString();
  const exchangeKey = row.mode >= 2 ? `${row.contract_address}:${row.tzkt_event_id}` : undefined;
  // Fractional negative IDs cannot collide with integer V2 stable event IDs.
  const output: HorfTransfer = {
    id: -id - 0.25, operationHash: row.operation_hash, timestamp,
    from: row.owner_address, to: row.claimant_address, amount: 1,
    token: { contract: row.output_contract, tokenId: row.output_token_id,
      name: `Horse token #${row.output_token_id}`, image: null },
    settlement: "stable", stableMode: row.mode as 0 | 1 | 2 | 3,
    ...(exchangeKey ? { exchangeKey } : {}),
  };
  if (row.mode <= 1) return [output];
  if (!row.input_contract || !row.input_token_id) throw new Error("Missing stored Horf room input token");
  return [output, {
    id: -id - 0.5, operationHash: row.operation_hash, timestamp,
    from: row.claimant_address, to: row.owner_address, amount: 1,
    token: { contract: row.input_contract, tokenId: row.input_token_id,
      name: `Horse token #${row.input_token_id}`, image: null },
    settlement: "stable", stableMode: row.mode as 2 | 3,
    exchangeKey: exchangeKey!, roomInput: true,
  }];
}

export async function getRoomSettlementSnapshot(season: HorfSeason): Promise<RoomSettlementSnapshot> {
  const contractAddress = horfRoomsContractAddress();
  if (!contractAddress || (season.endsAt && season.endsAt <= HORF_SEASON_START)) {
    return { status: "ready", asOf: null, error: null, nextRefreshAt: null, transfers: [] };
  }
  const state = await stateFor(contractAddress);
  const now = Date.now();
  const reference = state.status === "ready" ? state.as_of : state.updated_at;
  const due = state.status === "syncing" || !reference ||
    now >= new Date(reference).getTime() + HORF_MAINNET_BLOCK_MS;
  if (due) kickSync(contractAddress);
  const asOf = state.as_of ? new Date(state.as_of).toISOString() : null;
  let transfers: HorfTransfer[] = [];
  if (asOf) {
    const result = await pool.query<StoredRoomSettlement>(
      `SELECT contract_address, tzkt_event_id, occurred_at, operation_hash, mode,
              owner_address, claimant_address, output_contract, output_token_id,
              input_contract, input_token_id
         FROM public.horf_room_settlement_events
        WHERE contract_address = $1 AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
        ORDER BY occurred_at ASC, tzkt_event_id ASC`,
      [contractAddress, season.startsAt, season.endsAt],
    );
    transfers = result.rows.flatMap(roomSettlementTransfers);
  }
  const status = due && state.status === "ready" ? "syncing" : state.status;
  return { status, asOf, error: state.error,
    nextRefreshAt: status === "ready" && season.endsAt ? null
      : new Date(now + HORF_MAINNET_BLOCK_MS).toISOString(), transfers };
}
