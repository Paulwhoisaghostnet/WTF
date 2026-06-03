import { api } from "../api";

export interface LinkedWalletOwnershipRow {
  walletAddress?: string | null;
}

export function sameTezosWalletAddress(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = typeof left === "string" ? left.trim() : "";
  const b = typeof right === "string" ? right.trim() : "";
  return Boolean(a && b && a === b);
}

export function assertWalletLinkedToRows(
  walletAddress: string | null | undefined,
  wallets: readonly LinkedWalletOwnershipRow[],
): string {
  const address = typeof walletAddress === "string" ? walletAddress.trim() : "";
  if (!address) {
    throw new Error("Connect a Tezos wallet before buying.");
  }
  const linked = wallets.some((wallet) =>
    sameTezosWalletAddress(wallet.walletAddress, address)
  );
  if (!linked) {
    throw new Error(
      "The active Tezos wallet is not linked to this signed-in WTF OS account. " +
        "Reconnect or link that wallet from this account before buying."
    );
  }
  return address;
}

export async function assertWalletLinkedToCurrentUser(
  walletAddress: string | null | undefined,
): Promise<string> {
  const wallets = await api.get<LinkedWalletOwnershipRow[]>("/api/wallets");
  return assertWalletLinkedToRows(walletAddress, wallets);
}
