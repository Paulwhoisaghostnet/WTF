function sameWalletAddress(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

export class WalletAccountMismatchError extends Error {
  readonly code = "WALLET_ACCOUNT_MISMATCH";

  constructor(
    readonly expectedAddress: string,
    readonly actualAddress: string,
  ) {
    super(
      `Your active wallet is ${actualAddress}, but this operation was prepared for ${expectedAddress}. ` +
        "Reconnect that wallet or retry after the wallet display updates."
    );
  }
}

export function assertExpectedWalletAddress(
  expectedAddress: string | undefined,
  actualAddress: string,
): void {
  if (expectedAddress && !sameWalletAddress(actualAddress, expectedAddress)) {
    throw new WalletAccountMismatchError(expectedAddress, actualAddress);
  }
}
