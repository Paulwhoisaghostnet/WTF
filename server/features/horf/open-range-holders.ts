import { horfMainnetIndex } from "./mainnet-index";
import { HORF_MAINNET_BLOCK_MS } from "./mainnet";
import { HORF_MAINNET_CHAIN_ID } from "./stables/config";
import type { OpenRangeItem } from "./open-range-source";

const BURN_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX";
// Four concurrent contract groups completed the 19-contract live page in
// 1.43s; the shared TzKT client also enforces its configured host rate.
const HOLDER_READ_CONCURRENCY = 4;
type IndexRead = typeof horfMainnetIndex.getJson;
type BurnBalance = {
  "account.address": string;
  "token.contract.address": string;
  "token.tokenId": string;
  balance: string;
  "token.totalSupply": string;
};

function tokenKey(item: Pick<OpenRangeItem, "contract" | "tokenId">): string {
  return `${item.contract}/${item.tokenId}`;
}

async function burnOnlyKeys(items: readonly OpenRangeItem[], read: IndexRead): Promise<Set<string>> {
  const head = await read<{ chainId?: string }>("/head");
  if (head.chainId !== HORF_MAINNET_CHAIN_ID) throw new Error("Open Range holders require the Tezos Mainnet index");
  const byContract = new Map<string, Set<string>>();
  for (const item of items) {
    const ids = byContract.get(item.contract) || new Set<string>();
    ids.add(item.tokenId);
    byContract.set(item.contract, ids);
  }
  const excluded = new Set<string>();
  const groups = [...byContract].map(([contract, idSet]) => ({ contract, ids: [...idSet] }));
  for (let offset = 0; offset < groups.length; offset += HOLDER_READ_CONCURRENCY) {
    await Promise.all(groups.slice(offset, offset + HOLDER_READ_CONCURRENCY).map(async ({ contract, ids }) => {
      const rows = await read<BurnBalance[]>("/tokens/balances", {
        account: BURN_ADDRESS,
        "token.contract": contract,
        "token.tokenId.in": ids.join(","),
        "balance.gt": 0,
        select: "account.address,token.contract.address,token.tokenId,balance,token.totalSupply",
        limit: ids.length + 1,
      });
      if (!Array.isArray(rows) || rows.length > ids.length) throw new Error("Invalid Open Range holder page");
      const requested = new Set(ids);
      const seen = new Set<string>();
      for (const row of rows) {
        const tokenId = row["token.tokenId"];
        if (row["account.address"] !== BURN_ADDRESS || row["token.contract.address"] !== contract ||
            !requested.has(tokenId) || seen.has(tokenId) ||
            !/^\d+$/.test(row.balance) || !/^\d+$/.test(row["token.totalSupply"])) {
          throw new Error("Invalid Open Range burn balance");
        }
        seen.add(tokenId);
        if (BigInt(row.balance) > 0n && BigInt(row.balance) === BigInt(row["token.totalSupply"])) {
          excluded.add(`${contract}/${tokenId}`);
        }
      }
    }));
  }
  return excluded;
}

/** Mint pages persist; owner visibility is refreshed once per Mainnet block. */
export function createOpenRangeHolderFilter(
  read: IndexRead = horfMainnetIndex.getJson,
  now: () => number = Date.now,
) {
  const cache = new Map<string, { checkedAt: number; excluded: Set<string> }>();
  const failedAt = new Map<string, number>();
  const pending = new Map<string, Promise<Set<string>>>();
  return async function filter(items: readonly OpenRangeItem[]): Promise<{
    items: OpenRangeItem[]; holderStatus: "ready" | "stale";
  }> {
    if (!items.length) return { items: [], holderStatus: "ready" };
    const pageKey = items.map(tokenKey).sort().join("|");
    const time = now();
    const cached = cache.get(pageKey);
    const visible = (excluded: Set<string>, holderStatus: "ready" | "stale") => ({
      items: items.filter((item) => !excluded.has(tokenKey(item))), holderStatus,
    });
    if (cached && time - cached.checkedAt < HORF_MAINNET_BLOCK_MS) {
      return visible(cached.excluded, "ready");
    }
    const recentFailure = failedAt.get(pageKey);
    if (recentFailure !== undefined && time - recentFailure < HORF_MAINNET_BLOCK_MS) {
      if (cached) return visible(cached.excluded, "stale");
      throw new Error("Open Range holder index is temporarily unavailable");
    }
    try {
      let work = pending.get(pageKey);
      if (!work) {
        work = burnOnlyKeys(items, read);
        pending.set(pageKey, work);
        void work.finally(() => { if (pending.get(pageKey) === work) pending.delete(pageKey); }).catch(() => {});
      }
      const excluded = await work;
      cache.set(pageKey, { checkedAt: now(), excluded });
      failedAt.delete(pageKey);
      return visible(excluded, "ready");
    } catch (error) {
      failedAt.set(pageKey, now());
      if (cached) return visible(cached.excluded, "stale");
      throw error;
    }
  };
}

export const visibleNonBurnedOpenRangeItems = createOpenRangeHolderFilter();
