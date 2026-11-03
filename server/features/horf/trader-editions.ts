import { horfMainnetIndex } from "./mainnet-index";

type TokenKey = { contract: string; tokenId: string };
type BalanceRow = {
  account?: { address?: string };
  token?: { contract?: { address?: string }; tokenId?: string };
  balance?: string;
};

export function editionKey(token: TokenKey): string {
  return `${token.contract}/${token.tokenId}`;
}

/** Query exact current wallet balances for the tokens shown on a profile page. */
export async function getTraderEditionCounts(
  wallet: string,
  tokens: TokenKey[],
  batchSize: number,
  read: typeof horfMainnetIndex.getJson = horfMainnetIndex.getJson,
): Promise<Map<string, string>> {
  const counts = new Map<string, string>();
  const byContract = new Map<string, Set<string>>();
  for (const token of tokens) {
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(token.contract) || !/^\d+$/.test(token.tokenId)) {
      throw new Error("Invalid trader token key");
    }
    counts.set(editionKey(token), "0");
    const ids = byContract.get(token.contract) || new Set<string>();
    ids.add(token.tokenId);
    byContract.set(token.contract, ids);
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid balance query page size");
  for (const [contract, idSet] of byContract) {
    const ids = [...idSet];
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      const pageIds = ids.slice(offset, offset + batchSize);
      const rows = await read<BalanceRow[]>("/tokens/balances", {
        account: wallet,
        "token.contract": contract,
        "token.tokenId.in": pageIds.join(","),
        limit: pageIds.length + 1,
      });
      if (!Array.isArray(rows) || rows.length > pageIds.length) throw new Error("Unexpected trader balance response");
      const requested = new Set(pageIds);
      for (const row of rows) {
        const tokenId = String(row.token?.tokenId ?? "");
        const balance = row.balance;
        if (row.account?.address !== wallet || row.token?.contract?.address !== contract ||
            !requested.has(tokenId) || typeof balance !== "string" || !/^\d+$/.test(balance)) {
          throw new Error("Trader balance index did not return the requested wallet and tokens");
        }
        const key = editionKey({ contract, tokenId });
        counts.set(key, (BigInt(counts.get(key) || "0") + BigInt(balance)).toString());
      }
    }
  }
  return counts;
}
