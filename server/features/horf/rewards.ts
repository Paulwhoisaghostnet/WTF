import { randomUUID } from "node:crypto";
import { pool } from "../../db";
import { getHorfSeasonSnapshot } from "./ledger";
import { HORF_CURRENT_SEASON_KEY, HORF_SEASONS } from "./seasons";
import { horseContractAddress } from "./horse-config";
import { horfStablesContractAddress } from "./stables/config";
import { horseMarketAddress } from "./horse-market/market";
import { isTezosWallet } from "./model";
import { HorfHorseClaimSyncError, readConfiguredHorseClaimVault, readHorseClaimVault, signHorseClaimPermit } from "./horse-claims";

export const HORF_HORSE_REWARD_PER_UNIT = 10n;
export const HORF_HORSE_REWARD_RAW_PER_UNIT = HORF_HORSE_REWARD_PER_UNIT * 100_000_000n;
const CURRENT = HORF_SEASONS.find((season) => season.key === HORF_CURRENT_SEASON_KEY)!;
let lastReconciledSourceFingerprint: string | null = null;

export interface HorfRewardSourceEvent {
  kind: "direct" | "stable" | "market" | "objkt";
  sourceKey: string;
  from: string;
  to: string;
  units: string;
  tokenContract: string;
}

export interface HorfRewardEntitlementInput {
  sourceKind: "direct" | "stable" | "market" | "objkt";
  sourceKey: string;
  traderAddress: string;
  counterpartyAddress: string;
  units: string;
  amountRaw: string;
}

/** The canonical season ledger already excludes marketplace and self sends. */
export function buildHorfRewardEntitlements(
  events: HorfRewardSourceEvent[],
  excludedHorseContract: string | null,
): HorfRewardEntitlementInput[] {
  const rows: HorfRewardEntitlementInput[] = [];
  for (const event of events) {
    if (!isTezosWallet(event.from) || !isTezosWallet(event.to) || event.from === event.to ||
        !/^\d+$/.test(event.units) || BigInt(event.units) <= 0n ||
        (excludedHorseContract && event.tokenContract === excludedHorseContract)) continue;
    const units = BigInt(event.units).toString();
    const amountRaw = (BigInt(units) * HORF_HORSE_REWARD_RAW_PER_UNIT).toString();
    rows.push({ sourceKind: event.kind, sourceKey: event.sourceKey,
      traderAddress: event.from, counterpartyAddress: event.to, units, amountRaw });
  }
  return rows;
}

interface RawDirect {
  event_id: string;
  from_address: string;
  to_address: string;
  amount: string;
  token_contract: string;
}

interface RawStable {
  contract_address: string;
  tzkt_event_id: string;
  owner_address: string;
  claimant_address: string;
  token_contract: string;
}

interface RawMarket {
  contract_address: string;
  tzkt_event_id: string;
  seller_address: string;
  buyer_address: string;
  token_contract: string;
}

interface RawObjkt {
  id: string;
  seller_address: string;
  buyer_address: string;
  token_contract: string;
}

/** Rebuild pending rewards from the ready current-season source, preserving paid receipts. */
export async function reconcileCurrentHorfRewards(): Promise<{ status: "ready" | "syncing" | "error"; asOf: string | null; reconciled: boolean }> {
  const snapshot = await getHorfSeasonSnapshot(null, CURRENT);
  const status: "ready" | "syncing" | "error" = snapshot.status === "ready" ||
    snapshot.status === "syncing" || snapshot.status === "error" ? snapshot.status : "error";
  if (!snapshot.asOf) return { status, asOf: null, reconciled: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('horf-rewards-current-2026'))");
    // The public snapshot reports `syncing` as soon as a fresh block is due,
    // even while the prior source is complete. Lock raw source state so a
    // partial page cannot be reconciled or paid while its sync is advancing.
    const source = await client.query<{ status: string; as_of: Date | null }>(
      `SELECT status, as_of FROM public.horf_season_sync
        WHERE season_start = $1::timestamptz FOR SHARE`, [CURRENT.startsAt]);
    if (source.rows[0]?.status !== "ready" || !source.rows[0]?.as_of) {
      await client.query("ROLLBACK");
      return { status, asOf: snapshot.asOf, reconciled: false };
    }
    const stableAddress = horfStablesContractAddress();
    let stableAsOf: string | null = null;
    if (stableAddress) {
      const stableSource = await client.query<{ status: string; as_of: Date | null }>(
        `SELECT status, as_of FROM public.horf_stable_claim_sync
          WHERE contract_address = $1 FOR SHARE`, [stableAddress]);
      if (stableSource.rows[0]?.status !== "ready" || !stableSource.rows[0]?.as_of) {
        await client.query("ROLLBACK");
        return { status, asOf: snapshot.asOf, reconciled: false };
      }
      stableAsOf = new Date(stableSource.rows[0].as_of).toISOString();
    }
    const marketAddress = horseMarketAddress();
    let marketAsOf: string | null = null;
    if (marketAddress) {
      const marketSource = await client.query<{ status: string; as_of: Date | null }>(
        `SELECT status, as_of FROM public.horf_horse_market_sale_sync
          WHERE contract_address = $1 FOR SHARE`, [marketAddress]);
      if (marketSource.rows[0]?.status !== "ready" || !marketSource.rows[0]?.as_of) {
        await client.query("ROLLBACK");
        return { status, asOf: snapshot.asOf, reconciled: false };
      }
      marketAsOf = new Date(marketSource.rows[0].as_of).toISOString();
    }
    const objktSource = await client.query<{ count: string }>(`SELECT count(*)::text AS count
      FROM public.horf_objkt_purchase_intents WHERE status = 'verified'
        AND occurred_at >= $1::timestamptz
        AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz)`, [CURRENT.startsAt, CURRENT.endsAt]);
    const fingerprint = [CURRENT.startsAt, new Date(source.rows[0].as_of).toISOString(),
      stableAddress ?? "", stableAsOf ?? "", marketAddress ?? "", marketAsOf ?? "",
      objktSource.rows[0]?.count ?? "0", horseContractAddress() ?? ""].join("|");
    if (lastReconciledSourceFingerprint === fingerprint) {
      await client.query("COMMIT");
      return { status, asOf: snapshot.asOf, reconciled: true };
    }
    const direct = await client.query<RawDirect>(
      `SELECT event_id, from_address, to_address, amount, token_contract
         FROM public.horf_transfer_events WHERE season_start = $1::timestamptz
         ORDER BY event_id ASC`, [CURRENT.startsAt]);
    const stable = stableAddress ? await client.query<RawStable>(
      `SELECT contract_address, tzkt_event_id, owner_address, claimant_address, token_contract
         FROM public.horf_stable_claim_events
        WHERE contract_address = $1 AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
        ORDER BY tzkt_event_id ASC`, [stableAddress, CURRENT.startsAt, CURRENT.endsAt]) : { rows: [] as RawStable[] };
    const market = marketAddress ? await client.query<RawMarket>(
      `SELECT contract_address, tzkt_event_id, seller_address, buyer_address, token_contract
         FROM public.horf_horse_market_sale_events
        WHERE contract_address = $1 AND verified_at IS NOT NULL
          AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
        ORDER BY tzkt_event_id ASC`, [marketAddress, CURRENT.startsAt, CURRENT.endsAt]) : { rows: [] as RawMarket[] };
    const objktPurchases = await client.query<RawObjkt>(`SELECT id, seller_address, buyer_address, token_contract
      FROM public.horf_objkt_purchase_intents WHERE status = 'verified'
        AND occurred_at >= $1::timestamptz
        AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz)
      ORDER BY occurred_at ASC, id ASC`, [CURRENT.startsAt, CURRENT.endsAt]);
    const events: HorfRewardSourceEvent[] = [
      ...direct.rows.map((row) => ({ kind: "direct" as const, sourceKey: String(row.event_id),
        from: row.from_address, to: row.to_address, units: String(row.amount), tokenContract: row.token_contract })),
      ...stable.rows.map((row) => ({ kind: "stable" as const,
        sourceKey: `${row.contract_address}:${row.tzkt_event_id}`,
        from: row.owner_address, to: row.claimant_address, units: "1", tokenContract: row.token_contract })),
      ...market.rows.map((row) => ({ kind: "market" as const,
        sourceKey: `${row.contract_address}:${row.tzkt_event_id}`,
        from: row.seller_address, to: row.buyer_address, units: "1", tokenContract: row.token_contract })),
      ...objktPurchases.rows.map((row) => ({ kind: "objkt" as const,
        sourceKey: row.id, from: row.seller_address, to: row.buyer_address,
        units: "1", tokenContract: row.token_contract })),
    ];
    const entitlements = buildHorfRewardEntitlements(events, horseContractAddress());
    const runId = randomUUID();
    if (entitlements.length) {
      await client.query(
        `INSERT INTO public.horf_reward_entitlements
          (season_start, source_kind, source_key, trader_address, counterparty_address,
           units, amount_raw, source_active, status, last_seen_run)
         SELECT $1::timestamptz, x.source_kind, x.source_key, x.trader_address,
                x.counterparty_address, x.units, x.amount_raw, true, 'pending', $3::text
           FROM jsonb_to_recordset($2::jsonb) AS x(
             source_kind text, source_key text, trader_address text,
             counterparty_address text, units text, amount_raw text)
         ON CONFLICT (source_kind, source_key, trader_address) DO UPDATE SET
           source_active = true,
           units = EXCLUDED.units,
           amount_raw = EXCLUDED.amount_raw,
           counterparty_address = EXCLUDED.counterparty_address,
           status = 'pending',
           last_seen_run = EXCLUDED.last_seen_run, updated_at = now()`,
        [CURRENT.startsAt, JSON.stringify(entitlements.map((row) => ({
          source_kind: row.sourceKind, source_key: row.sourceKey,
          trader_address: row.traderAddress, counterparty_address: row.counterpartyAddress,
          units: row.units, amount_raw: row.amountRaw,
        }))), runId],
      );
    }
    await client.query(
      `UPDATE public.horf_reward_entitlements SET
         source_active = false,
         status = 'voided',
         updated_at = now()
       WHERE season_start = $1::timestamptz AND last_seen_run IS DISTINCT FROM $2`,
      [CURRENT.startsAt, runId],
    );
    await client.query("COMMIT");
    lastReconciledSourceFingerprint = fingerprint;
    return { status, asOf: snapshot.asOf, reconciled: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function getHorfRewardActivity(address: string) {
  if (!isTezosWallet(address)) throw new Error("Invalid HORSE reward wallet");
  const reconciliation = await reconcileCurrentHorfRewards();
  const result = await pool.query<{ units: string; accrued_raw: string }>(
    `SELECT COALESCE(SUM(CASE WHEN source_active AND status = 'pending' THEN units::numeric ELSE 0 END),0)::text AS units,
            COALESCE(SUM(CASE WHEN source_active AND status = 'pending' THEN amount_raw::numeric ELSE 0 END),0)::text AS accrued_raw
       FROM public.horf_reward_entitlements
      WHERE season_start = $1::timestamptz AND trader_address = $2`,
    [CURRENT.startsAt, address],
  );
  const row = result.rows[0]!;
  const accruedRaw = BigInt(row.accrued_raw);
  const vault = await readConfiguredHorseClaimVault(address);
  const claimedRaw = BigInt(vault?.claimedRaw ?? "0");
  const claimableRaw = accruedRaw > claimedRaw ? accruedRaw - claimedRaw : 0n;
  const sourceDiscrepancies = claimedRaw > accruedRaw ? 1n : 0n;
  const claimReady = reconciliation.reconciled && !!vault?.signer && claimableRaw > 0n &&
    BigInt(vault.balanceRaw) >= claimableRaw;
  return { season: HORF_CURRENT_SEASON_KEY, rateHorse: HORF_HORSE_REWARD_PER_UNIT.toString(),
    rateRaw: HORF_HORSE_REWARD_RAW_PER_UNIT.toString(), countedUnits: row.units,
    pendingRaw: claimableRaw.toString(), paidRaw: claimedRaw.toString(),
    sourceDiscrepancies: sourceDiscrepancies.toString(),
    asOf: reconciliation.asOf, status: reconciliation.status,
    accruedRaw: accruedRaw.toString(), totalRaw: accruedRaw.toString(),
    claimableRaw: claimableRaw.toString(), claimedRaw: claimedRaw.toString(),
    vaultAddress: vault?.contractAddress ?? null, claimReady, sourceComplete: reconciliation.reconciled,
    payoutAddress: null, payoutReady: false };
}

/** Sign only the completed canonical source, atomically with its entitlement rows. */
export async function issueHorfHorseClaimPermit(address: string) {
  if (!isTezosWallet(address)) throw new Error("Invalid HORSE claimant wallet");
  const reconciliation = await reconcileCurrentHorfRewards();
  if (!reconciliation.reconciled) throw new HorfHorseClaimSyncError("HORSE rewards are still syncing");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('horf-rewards-current-2026'))");
    const source = await client.query<{ status: string; as_of: Date | null }>(
      `SELECT status, as_of FROM public.horf_season_sync
        WHERE season_start = $1::timestamptz FOR SHARE`, [CURRENT.startsAt]);
    if (source.rows[0]?.status !== "ready" || !source.rows[0]?.as_of) {
      throw new HorfHorseClaimSyncError("HORSE season source is still syncing");
    }
    const stableAddress = horfStablesContractAddress();
    if (stableAddress) {
      const stable = await client.query<{ status: string; as_of: Date | null }>(
        `SELECT status, as_of FROM public.horf_stable_claim_sync
          WHERE contract_address = $1 FOR SHARE`, [stableAddress]);
      if (stable.rows[0]?.status !== "ready" || !stable.rows[0]?.as_of) {
        throw new HorfHorseClaimSyncError("HORSE Stable claim source is still syncing");
      }
    }
    const marketAddress = horseMarketAddress();
    if (marketAddress) {
      const market = await client.query<{ status: string; as_of: Date | null }>(
        `SELECT status, as_of FROM public.horf_horse_market_sale_sync
          WHERE contract_address = $1 FOR SHARE`, [marketAddress]);
      if (market.rows[0]?.status !== "ready" || !market.rows[0]?.as_of) {
        throw new HorfHorseClaimSyncError("HORSE market sale source is still syncing");
      }
    }
    const result = await client.query<{ total_raw: string }>(
      `SELECT COALESCE(SUM(CASE WHEN source_active AND status = 'pending'
                        THEN amount_raw::numeric ELSE 0 END),0)::text AS total_raw
         FROM public.horf_reward_entitlements
        WHERE season_start = $1::timestamptz AND trader_address = $2`,
      [CURRENT.startsAt, address],
    );
    const row = result.rows[0]!;
    const vault = await readHorseClaimVault(address);
    const permit = await signHorseClaimPermit(address, row.total_raw, vault);
    await client.query("COMMIT");
    return permit;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
