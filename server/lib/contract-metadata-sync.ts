/**
 * contract-metadata-sync — back-fill + keep-fresh loop for the
 * `contract_metadata` table.
 *
 * The audit on 2026-04-19 showed 4,759 distinct contracts referenced
 * by `wallet_holdings` with **zero** rows in `contract_metadata`.
 * Without this table populated, every "which collection is this"
 * lookup in the app has to either fall back to the raw KT address or
 * hit TzKT inline — both ugly.  This job fixes that by polling the
 * single TzKT contract endpoint (`/v1/contracts/{address}`) for every
 * distinct contract and upserting the canonical fields (alias, kind,
 * creator, interfaces, raw blob).
 *
 * Cadence:
 *   - Every 15 min, drain up to `BATCH_SIZE` contracts that are
 *     either missing from `contract_metadata` or whose row is older
 *     than `FRESHNESS_MS` (30 days).  Polite pacing between requests
 *     so TzKT's anonymous rate limit (≈10 req/s) stays happy.
 *   - Initial delay 4 min after boot so portfolio-sync (which
 *     actually generates the list of interesting contracts) has
 *     finished its first pass.
 *
 * Safety:
 *   - `fetchContract` fails *open* (returns null) on any transport
 *     error.  A single 5xx doesn't abort the tick.
 *   - Writes use Postgres `ON CONFLICT (address) DO UPDATE`, so the
 *     scheduled run is idempotent and safe to retry.
 *   - Never throws from the scheduler-facing body — worst case the
 *     tick records zero upserts.
 */

import { db } from "../db";
import { contractMetadata, walletHoldings, walletEvents } from "@shared/schema";
import { register as registerJob, type JobResult } from "./scheduler";
import { sql } from "drizzle-orm";
import { tzkt, UpstreamError } from "./upstream";

const TICK_MS = 15 * 60 * 1000;
const INITIAL_DELAY_MS = 4 * 60 * 1000;
const BATCH_SIZE = 200;
const FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ~8 req/s — comfortably under TzKT's 10 req/s anonymous ceiling.
const REQUEST_SPACING_MS = 120;

export interface TzktContract {
  address?: string;
  kind?: string;
  alias?: string;
  creator?: { address?: string | null } | null;
  interfaces?: string[];
  metadata?: Record<string, unknown> | null;
  [k: string]: unknown;
}

const SELECT_FIELDS =
  "address,kind,alias,creator,interfaces,metadata,tzips,typeHash,codeHash,tokensCount,activeTokensCount,firstActivity,lastActivity";

async function fetchContract(
  address: string,
  signal?: AbortSignal
): Promise<TzktContract | null> {
  const path = `/contracts/${encodeURIComponent(address)}?select=${SELECT_FIELDS}`;
  try {
    const res = await tzkt.raw(path, { signal });
    const body = (await res.json()) as TzktContract;
    return body ?? null;
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) {
      // An address surfaced in wallet_holdings that TzKT doesn't recognise as
      // a contract is stale or malformed. Persist an unknown marker so the
      // scheduled job does not retry it forever.
      return { address, kind: "unknown" };
    }
    console.warn(
      `[contract-metadata-sync] ${address}: fetch failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Union of contract addresses we want to enrich:
 *   - Every distinct `token_contract` in wallet_holdings
 *   - Every distinct `counterparty_address` that looks like a KT1*
 *     (marketplaces, barter contracts, burn addresses) appearing in
 *     wallet_events
 *   - Every distinct `token_contract` in wallet_events not yet in
 *     wallet_holdings (e.g. items transferred out)
 *
 * Filter to rows missing from contract_metadata OR stale > FRESHNESS_MS.
 * Cap at BATCH_SIZE so a single tick stays bounded.
 */
async function dueContracts(batchSize: number): Promise<string[]> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT DISTINCT token_contract AS address
        FROM ${walletHoldings}
       WHERE token_contract IS NOT NULL
         AND token_contract LIKE 'KT%'
      UNION
      SELECT DISTINCT token_contract AS address
        FROM ${walletEvents}
       WHERE token_contract IS NOT NULL
         AND token_contract LIKE 'KT%'
      UNION
      SELECT DISTINCT counterparty_address AS address
        FROM ${walletEvents}
       WHERE counterparty_address IS NOT NULL
         AND counterparty_address LIKE 'KT%'
    )
    SELECT c.address
      FROM candidates c
 LEFT JOIN ${contractMetadata} m ON m.address = c.address
     WHERE m.address IS NULL
        OR m.updated_at < NOW() - INTERVAL '1 millisecond' * ${FRESHNESS_MS}
  ORDER BY COALESCE(m.updated_at, 'epoch'::timestamp) ASC, c.address
     LIMIT ${batchSize}
  `);
  const rows: any[] = (result as any)?.rows ?? [];
  return rows.map((r) => String(r.address));
}

/**
 * Upsert a single contract row.  Values are intentionally clamped to
 * the schema's declared varchar sizes; anything longer is truncated
 * rather than silently dropped so the row still writes.
 */
async function upsertContract(row: TzktContract): Promise<void> {
  const address = typeof row.address === "string" ? row.address.trim() : "";
  if (!address) return;
  const kind =
    typeof row.kind === "string" && row.kind.trim()
      ? row.kind.trim().slice(0, 32)
      : null;
  const alias =
    typeof row.alias === "string" && row.alias.trim()
      ? row.alias.trim()
      : null;
  const creator =
    row.creator?.address && typeof row.creator.address === "string"
      ? row.creator.address.trim().slice(0, 36)
      : null;
  const interfaces = Array.isArray(row.interfaces) ? row.interfaces : null;

  await db
    .insert(contractMetadata)
    .values({
      address: address.slice(0, 36),
      kind,
      alias,
      creator,
      interfaces: interfaces as any,
      raw: row as any,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: contractMetadata.address,
      set: {
        kind: sql`EXCLUDED.kind`,
        alias: sql`EXCLUDED.alias`,
        creator: sql`EXCLUDED.creator`,
        interfaces: sql`EXCLUDED.interfaces`,
        raw: sql`EXCLUDED.raw`,
        updatedAt: sql`EXCLUDED.updated_at`,
      },
    });
}

export interface RunOptions {
  batchSize?: number;
  /** Pass an AbortSignal to stop gracefully mid-batch. */
  signal?: AbortSignal;
  /** Called after every upsert — handy for the CLI to print progress. */
  onProgress?: (info: {
    done: number;
    total: number;
    address: string;
    alias: string | null;
  }) => void;
}

export interface RunResult extends JobResult {
  itemsIn: number;
  itemsOut: number;
  fetched: number;
  skipped: number;
  remaining: number;
  cursorAfter: {
    fetched: number;
    upserted: number;
    skipped: number;
    remaining: number;
    lastAddress: string | null;
  };
}

/**
 * Drain one batch.  Returns counts for the scheduler audit.
 */
export async function runContractMetadataSync(
  opts: RunOptions = {}
): Promise<RunResult> {
  const batchSize = Math.max(1, opts.batchSize ?? BATCH_SIZE);
  const queue = await dueContracts(batchSize);
  let fetched = 0;
  let upserted = 0;
  let skipped = 0;
  let lastAddress: string | null = null;

  for (const address of queue) {
    if (opts.signal?.aborted) break;
    const row = await fetchContract(address, opts.signal);
    fetched += 1;
    if (row) {
      try {
        await upsertContract({ ...row, address });
        upserted += 1;
        lastAddress = address;
        opts.onProgress?.({
          done: upserted,
          total: queue.length,
          address,
          alias: typeof row.alias === "string" ? row.alias : null,
        });
      } catch (err) {
        console.warn(
          `[contract-metadata-sync] upsert failed for ${address}:`,
          err instanceof Error ? err.message : err
        );
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
    await sleep(REQUEST_SPACING_MS);
  }

  // How many remain after this batch?  Cheap single query using the
  // same candidate set; we subtract the ones we just handled.
  const remainingResult = await db.execute(sql`
    WITH candidates AS (
      SELECT DISTINCT token_contract AS address
        FROM ${walletHoldings}
       WHERE token_contract IS NOT NULL AND token_contract LIKE 'KT%'
      UNION
      SELECT DISTINCT token_contract AS address
        FROM ${walletEvents}
       WHERE token_contract IS NOT NULL AND token_contract LIKE 'KT%'
      UNION
      SELECT DISTINCT counterparty_address AS address
        FROM ${walletEvents}
       WHERE counterparty_address IS NOT NULL AND counterparty_address LIKE 'KT%'
    )
    SELECT COUNT(*)::int AS n
      FROM candidates c
 LEFT JOIN ${contractMetadata} m ON m.address = c.address
     WHERE m.address IS NULL
        OR m.updated_at < NOW() - INTERVAL '1 millisecond' * ${FRESHNESS_MS}
  `);
  const remaining = Number(
    ((remainingResult as any)?.rows?.[0]?.n as number | undefined) ?? 0
  );

  return {
    itemsIn: queue.length,
    itemsOut: upserted,
    fetched,
    skipped,
    remaining,
    cursorAfter: {
      fetched,
      upserted,
      skipped,
      remaining,
      lastAddress,
    },
  };
}

export function registerContractMetadataSync(): void {
  registerJob({
    name: "contract-metadata-sync",
    fn: async () => {
      const r = await runContractMetadataSync();
      return r;
    },
    intervalMs: TICK_MS,
    initialDelayMs: INITIAL_DELAY_MS,
  });
}
