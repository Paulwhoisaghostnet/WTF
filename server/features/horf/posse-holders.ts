import { horfMainnetIndex } from "./mainnet-index";
import { isTezosWallet } from "./model";

type TokenKey = { contract: string; tokenId: string };
type BalanceRow = {
  account?: { address?: string };
  token?: { contract?: { address?: string }; tokenId?: string };
  balance?: string;
};

// The Stable's existing batch-return picker accepts up to 50 recipients.
export const HORF_RETURN_RECIPIENT_LIMIT = 50;

export function parseHorseHolderRecipients(value: unknown, sender: string): string[] {
  const recipients = typeof value === "string" ? [value] : value;
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > HORF_RETURN_RECIPIENT_LIMIT ||
      recipients.some((recipient) => !isTezosWallet(recipient) || recipient === sender) ||
      new Set(recipients).size !== recipients.length) {
    throw new Error(`Choose 1 to ${HORF_RETURN_RECIPIENT_LIMIT} distinct Tezos recipient wallets other than your own`);
  }
  return recipients;
}

/** Read exact current holders in TzKT's documented default page-sized batches. */
export async function getPosseHorseHolders(
  addresses: string[],
  token: TokenKey,
  read: typeof horfMainnetIndex.getJson = horfMainnetIndex.getJson,
  batchSize = 100,
): Promise<Set<string>> {
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(token.contract) || !/^\d+$/.test(token.tokenId)) {
    throw new Error("A valid horse token is required");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid holder query batch size");
  const holders = new Set<string>();
  const unique = [...new Set(addresses)];
  for (let offset = 0; offset < unique.length; offset += batchSize) {
    const requested = unique.slice(offset, offset + batchSize);
    const rows = await read<BalanceRow[]>("/tokens/balances", {
      "account.in": requested.join(","),
      "token.contract": token.contract,
      "token.tokenId": token.tokenId,
      "balance.gt": 0,
      limit: requested.length + 1,
    });
    if (!Array.isArray(rows) || rows.length > requested.length) {
      throw new Error("The horse holder index returned an incomplete or invalid result");
    }
    const wanted = new Set(requested);
    const seen = new Set<string>();
    for (const row of rows) {
      const account = row.account?.address;
      if (!account || !wanted.has(account) || seen.has(account) ||
          row.token?.contract?.address !== token.contract || String(row.token?.tokenId) !== token.tokenId ||
          typeof row.balance !== "string" || !/^\d+$/.test(row.balance) || BigInt(row.balance) <= 0n) {
        throw new Error("The horse holder index did not match the requested posse and token");
      }
      seen.add(account);
      holders.add(account);
    }
  }
  return holders;
}
