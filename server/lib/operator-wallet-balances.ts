/**
 * Periodic balance watcher for the unified operator wallet (Phase 9).
 *
 * Polls TzKT for the operator wallet's XTZ + FA2 balances and upserts
 * them into `operator_wallet_balances`, so the Control Board can show
 * live balances and low-balance alerts without every page load hitting
 * TzKT directly.
 *
 * We never sign from here; this is a read-only probe. Top-ups arrive
 * from the treasury wallet via the normal wallet-events pipeline; this
 * watcher just reconciles the resulting on-chain state.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { operatorWalletBalances } from "@shared/schema";
import {
  WTF_OPERATOR_ASSETS,
  WTF_OPERATOR_WALLET_ADDRESS,
  type OperatorAsset,
} from "./constants";
import { register as registerJob } from "./scheduler";

const TZKT_BASE = (
  process.env.TZKT_API_URL || "https://api.tzkt.io/v1"
).replace(/\/+$/, "");

const BALANCE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

export type OperatorBalanceRow = {
  assetKind: "fa2" | "xtz";
  assetContract: string | null;
  assetTokenId: string | null;
  balance: string;
  lowThreshold: string | null;
  checkedAt: Date;
};

function parseLowThreshold(
  asset: OperatorAsset
): string | null {
  const envKey =
    asset.kind === "xtz"
      ? "WTF_OPERATOR_LOW_XTZ_MUTEZ"
      : `WTF_OPERATOR_LOW_FA2_${asset.contract}_${asset.tokenId}`;
  const raw = (process.env[envKey] ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

async function fetchAccountBalance(address: string): Promise<string> {
  const url = `${TZKT_BASE}/accounts/${address}/balance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT balance ${res.status}`);
  const value = await res.text();
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`TzKT balance not numeric: ${trimmed.slice(0, 60)}`);
  }
  return trimmed;
}

async function fetchFa2Balance(
  address: string,
  contract: string,
  tokenId: number
): Promise<string> {
  const url = `${TZKT_BASE}/tokens/balances?token.contract=${contract}&token.tokenId=${tokenId}&account=${address}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT fa2 balance ${res.status}`);
  const rows = (await res.json()) as Array<{ balance?: string | number }>;
  const entry = Array.isArray(rows) ? rows[0] : null;
  if (!entry) return "0";
  const raw = String(entry.balance ?? "0").trim();
  return /^\d+$/.test(raw) ? raw : "0";
}

async function upsertBalance(
  asset: OperatorAsset,
  balance: string
): Promise<void> {
  const assetContract = asset.kind === "fa2" ? asset.contract : null;
  const assetTokenId =
    asset.kind === "fa2" ? String(asset.tokenId) : null;
  const lowThreshold = parseLowThreshold(asset);

  const existing = await db
    .select()
    .from(operatorWalletBalances)
    .where(
      and(
        eq(operatorWalletBalances.assetKind, asset.kind),
        asset.kind === "fa2"
          ? and(
              eq(operatorWalletBalances.assetContract, assetContract!),
              eq(operatorWalletBalances.assetTokenId, assetTokenId!)
            )!
          : and(
              isNull(operatorWalletBalances.assetContract),
              isNull(operatorWalletBalances.assetTokenId)
            )
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(operatorWalletBalances).values({
      assetKind: asset.kind,
      assetContract,
      assetTokenId,
      balance,
      lowThreshold,
      checkedAt: new Date(),
    });
    return;
  }

  await db
    .update(operatorWalletBalances)
    .set({
      balance,
      lowThreshold,
      checkedAt: new Date(),
    })
    .where(eq(operatorWalletBalances.id, existing[0].id));
}

/**
 * Pull current balances for every asset in `WTF_OPERATOR_ASSETS` and
 * upsert them. Returns the freshly-recorded rows. Runs a single pass;
 * schedule via `registerOperatorWalletBalanceWatcher()` for recurring
 * polling.
 */
export async function runOperatorBalanceCheck(): Promise<{
  wallet: string | null;
  updated: number;
  failures: string[];
}> {
  const wallet = WTF_OPERATOR_WALLET_ADDRESS;
  if (!wallet) {
    return { wallet: null, updated: 0, failures: ["operator wallet unset"] };
  }

  const failures: string[] = [];
  let updated = 0;

  for (const asset of WTF_OPERATOR_ASSETS) {
    try {
      const balance =
        asset.kind === "xtz"
          ? await fetchAccountBalance(wallet)
          : await fetchFa2Balance(wallet, asset.contract, asset.tokenId);
      await upsertBalance(asset, balance);
      updated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(
        `${asset.kind}${
          asset.kind === "fa2" ? `:${asset.contract}/${asset.tokenId}` : ""
        }: ${msg}`
      );
    }
  }

  return { wallet, updated, failures };
}

/** Read the latest cached balances (no network). */
export async function getOperatorBalances(): Promise<OperatorBalanceRow[]> {
  const rows = await db.select().from(operatorWalletBalances);
  return rows.map((r) => ({
    assetKind: r.assetKind as "fa2" | "xtz",
    assetContract: r.assetContract ?? null,
    assetTokenId: r.assetTokenId ?? null,
    balance: r.balance,
    lowThreshold: r.lowThreshold,
    checkedAt: r.checkedAt,
  }));
}

/** Result of a low-balance check, used by Control Board alerts. */
export type OperatorLowBalanceAlert = {
  assetKind: "fa2" | "xtz";
  assetContract: string | null;
  assetTokenId: string | null;
  balance: string;
  lowThreshold: string;
};

export async function getOperatorLowBalanceAlerts(): Promise<
  OperatorLowBalanceAlert[]
> {
  const rows = await db
    .select()
    .from(operatorWalletBalances)
    .where(sql`low_threshold is not null and balance < low_threshold`);
  return rows.map((r) => ({
    assetKind: r.assetKind as "fa2" | "xtz",
    assetContract: r.assetContract ?? null,
    assetTokenId: r.assetTokenId ?? null,
    balance: r.balance,
    lowThreshold: r.lowThreshold ?? "",
  }));
}

export function registerOperatorWalletBalanceWatcher(): void {
  if (!WTF_OPERATOR_WALLET_ADDRESS) {
    console.log(
      "[operator-wallet] no WTF_OPERATOR_WALLET_ADDRESS — balance watcher skipped"
    );
    return;
  }
  registerJob({
    name: "operator-wallet-balances",
    fn: async () => {
      const res = await runOperatorBalanceCheck();
      if (res.failures.length) {
        console.warn(
          "[operator-wallet] balance check failures:",
          res.failures.join("; ")
        );
      }
      return {
        itemsIn: WTF_OPERATOR_ASSETS.length,
        itemsOut: res.updated,
      };
    },
    intervalMs: BALANCE_CHECK_INTERVAL_MS,
  });
  console.log(
    `[operator-wallet] balance watcher registered (every ${BALANCE_CHECK_INTERVAL_MS / 1000}s)`
  );
}
