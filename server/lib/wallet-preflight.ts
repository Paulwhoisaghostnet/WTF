import { eq } from "drizzle-orm";
import { db } from "../db";
import { userWallets } from "@shared/schema";

const TEZOS_IMPLICIT_ADDRESS_RE = /^(tz1|tz2|tz3)[1-9A-HJ-NP-Za-km-z]{33}$/;

export class WalletPreflightError extends Error {
  statusCode = 400;
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WalletPreflightError";
    this.code = code;
  }
}

export function normalizeUserWalletAddress(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return TEZOS_IMPLICIT_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

export async function assertLinkedWalletForUser(input: {
  userId: number;
  walletAddress: unknown;
  purpose: string;
}): Promise<string> {
  const walletAddress = normalizeUserWalletAddress(input.walletAddress);
  if (!walletAddress) {
    throw new WalletPreflightError(
      "wallet_preflight_invalid_address",
      "Connect a valid Tezos wallet before preparing this transaction."
    );
  }

  const rows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, input.userId));
  const linkedWallet = rows.find(
    (row) => row.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  );
  if (!linkedWallet) {
    throw new WalletPreflightError(
      "wallet_preflight_unlinked_wallet",
      "The connected wallet is not linked to this WTF account."
    );
  }

  return linkedWallet.walletAddress;
}
