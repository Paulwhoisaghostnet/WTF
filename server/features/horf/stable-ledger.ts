import type { PoolClient } from "pg";
import { pool } from "../../db";
import { HORF_SEASON_START, type HorfTransfer } from "./model";
import type { HorfSeason } from "./seasons";
import { horfStablesContractAddress } from "./stables/config";
import { assertHorfStablesMainnet } from "./stables/chain";
import { fetchHorfClaimEventPage, isLastHorfClaimEventPage, type HorfStableClaim } from "./stables/claims";

// Tallinn's six-second mainnet block interval is the read cadence for the
// current race. One database-backed cursor is shared across viewers.
const MAINNET_BLOCK_MS = 6_000;
const PUBLIC_SYNC_ERROR = "Stable claims are temporarily unavailable. Last completed counts are shown when available.";

interface ClaimSyncState {
  contract_address: string;
  cursor: string;
  status: "ready" | "syncing" | "error";
  as_of: Date | null;
  error: string | null;
  updated_at: Date;
}

interface StoredClaim {
  tzkt_event_id: string;
  occurred_at: Date;
  owner_address: string;
  claimant_address: string;
  mode: number;
  token_contract: string;
  token_id: string;
}

const runningSyncs = new Map<string, Promise<void>>();

function safeId(value: string | number): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error("Invalid Horf stable event cursor");
  return id;
}

async function stateFor(contractAddress: string, client?: PoolClient): Promise<ClaimSyncState> {
  const query = client || pool;
  await query.query(
    `INSERT INTO public.horf_stable_claim_sync (contract_address) VALUES ($1)
     ON CONFLICT (contract_address) DO NOTHING`,
    [contractAddress],
  );
  const result = await query.query<ClaimSyncState>(
    `SELECT contract_address, cursor, status, as_of, error, updated_at
       FROM public.horf_stable_claim_sync WHERE contract_address = $1`,
    [contractAddress],
  );
  if (!result.rows[0]) throw new Error("Horf stable claim sync row is unavailable");
  return result.rows[0];
}

async function persistPage(
  client: PoolClient,
  contractAddress: string,
  claims: HorfStableClaim[],
  cursor: number,
  complete: boolean,
): Promise<void> {
  await client.query("BEGIN");
  try {
    if (claims.length) {
      await client.query(
        `INSERT INTO public.horf_stable_claim_events (
           contract_address, tzkt_event_id, occurred_at, owner_address,
           claimant_address, mode, token_contract, token_id
         )
         SELECT $1::text, x.id, x.occurred_at, x.from_address,
                x.to_address, x.mode, x.token_contract, x.token_id
           FROM jsonb_to_recordset($2::jsonb) AS x(
             id bigint, occurred_at timestamptz, from_address text,
             to_address text, mode smallint, token_contract text, token_id text
           )
         ON CONFLICT (contract_address, tzkt_event_id) DO NOTHING`,
        [contractAddress, JSON.stringify(claims.map((claim) => ({
          id: claim.id,
          occurred_at: claim.timestamp,
          from_address: claim.from,
          to_address: claim.to,
          mode: claim.mode,
          token_contract: claim.token.contract,
          token_id: claim.token.tokenId,
        })))],
      );
    }
    await client.query(
      `UPDATE public.horf_stable_claim_sync
          SET cursor = $2::bigint,
              status = CASE WHEN $3::boolean THEN 'ready' ELSE 'syncing' END,
              as_of = CASE WHEN $3::boolean THEN now() ELSE as_of END,
              error = NULL, updated_at = now()
        WHERE contract_address = $1`,
      [contractAddress, cursor, complete],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function syncClaims(contractAddress: string): Promise<void> {
  const client = await pool.connect();
  const lockKey = `horf:stable-claims:${contractAddress}`;
  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired",
      [lockKey],
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return;
    await assertHorfStablesMainnet();
    const state = await stateFor(contractAddress, client);
    let cursor = safeId(state.cursor);
    await client.query(
      `UPDATE public.horf_stable_claim_sync
          SET status = 'syncing', error = NULL, updated_at = now()
        WHERE contract_address = $1`,
      [contractAddress],
    );
    while (true) {
      const page = await fetchHorfClaimEventPage(contractAddress, cursor, HORF_SEASON_START, null);
      if (page.length) cursor = page[page.length - 1]!.id;
      const complete = isLastHorfClaimEventPage(page);
      await persistPage(client, contractAddress, page, cursor, complete);
      if (complete) break;
    }
  } catch (error) {
    console.error("[horf] stable claim sync failed:", error);
    try {
      await client.query(
        `UPDATE public.horf_stable_claim_sync
            SET status = 'error', error = $2, updated_at = now()
          WHERE contract_address = $1`,
        [contractAddress, PUBLIC_SYNC_ERROR],
      );
    } catch (writeError) {
      console.error("[horf] stable claim sync error could not be stored:", writeError);
    }
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1::text))", [lockKey]);
      } catch (error) {
        console.error("[horf] stable claim advisory unlock failed:", error);
      }
    }
    client.release();
  }
}

function kickSync(contractAddress: string): void {
  if (runningSyncs.has(contractAddress)) return;
  const pending = syncClaims(contractAddress)
    .catch((error) => console.error("[horf] could not start stable claim sync:", error))
    .finally(() => runningSyncs.delete(contractAddress));
  runningSyncs.set(contractAddress, pending);
}

function toTransfer(row: StoredClaim): HorfTransfer {
  const id = safeId(row.tzkt_event_id);
  if (id === 0 || (row.mode !== 0 && row.mode !== 1 && row.mode !== 2)) {
    throw new Error("Invalid stored Horf stable claim");
  }
  return {
    id: -id,
    timestamp: new Date(row.occurred_at).toISOString(),
    from: row.owner_address,
    to: row.claimant_address,
    amount: 1,
    token: {
      contract: row.token_contract,
      tokenId: row.token_id,
      name: `Horse token #${row.token_id}`,
      image: null,
    },
    settlement: "stable",
    stableMode: row.mode,
  };
}

export interface StableClaimSnapshot {
  status: "ready" | "syncing" | "error";
  asOf: string | null;
  error: string | null;
  nextRefreshAt: string | null;
  transfers: HorfTransfer[];
}

/** Historic archives predate the stable contract; they have no stable claims. */
export async function getStableClaimSnapshot(season: HorfSeason): Promise<StableClaimSnapshot> {
  const contractAddress = horfStablesContractAddress();
  if (!contractAddress || (season.endsAt && season.endsAt <= HORF_SEASON_START)) {
    return { status: "ready", asOf: null, error: null, nextRefreshAt: null, transfers: [] };
  }
  const state = await stateFor(contractAddress);
  const now = Date.now();
  const reference = state.status === "ready" ? state.as_of : state.updated_at;
  const due = state.status === "syncing" || !reference ||
    now >= new Date(reference).getTime() + MAINNET_BLOCK_MS;
  if (due) kickSync(contractAddress);
  const asOf = state.as_of ? new Date(state.as_of).toISOString() : null;
  let transfers: HorfTransfer[] = [];
  if (asOf) {
    const result = await pool.query<StoredClaim>(
      `SELECT tzkt_event_id, occurred_at, owner_address, claimant_address,
              mode, token_contract, token_id
         FROM public.horf_stable_claim_events
        WHERE contract_address = $1 AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
        ORDER BY occurred_at ASC, tzkt_event_id ASC`,
      [contractAddress, season.startsAt, season.endsAt],
    );
    transfers = result.rows.map(toTransfer);
  }
  const status = due && state.status === "ready" ? "syncing" : state.status;
  return {
    status,
    asOf,
    error: state.error,
    nextRefreshAt: status === "ready" && season.endsAt ? null
      : new Date(now + MAINNET_BLOCK_MS).toISOString(),
    transfers,
  };
}
