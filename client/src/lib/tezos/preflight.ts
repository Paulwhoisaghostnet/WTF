/**
 * Preflight checks we run immediately before submitting any signed
 * contract operation.
 *
 * The app is configured for a specific Tezos network via
 * `VITE_TEZOS_NETWORK` / localStorage `wtf:network`, but nothing stops a
 * user's wallet from being active on a *different* network — Beacon and
 * octez.connect both happily keep independent "preferred" and "active"
 * network metadata, and some wallets expose multiple accounts.  Sending
 * a `create_listing` op while the wallet is pointed at ghostnet would
 * produce an opHash that never lands on the contract we expect.
 *
 * The preflight helper:
 *   1. Confirms the active account exists.
 *   2. Confirms the account's bound network (when the wallet reports
 *      one) matches the app's configured network, or raises a
 *      descriptive error.
 *   3. Confirms the wallet's RPC chain_id matches the app's configured
 *      network — this is the authoritative check because it hits the
 *      actual RPC the op will be broadcast to, rather than trusting
 *      whatever label the wallet UI happens to show.
 *
 * Callers should `await assertNetworkReadyForSend()` before every
 * contract write path.
 */

import { ensureWalletProviderForSend, getTezos } from "./wallet";
import { getNetwork } from "./loaders";

const CHAIN_ID_TO_NETWORK: Record<string, string> = {
  // Mainnet chain id
  NetXdQprcVkpaWU: "mainnet",
  // Ghostnet chain id
  NetXnHfVqm9iesp: "ghostnet",
  // Shadownet chain id
  NetXsqzbfFenSTS: "shadownet",
};

const NETWORK_TO_CHAIN_ID: Record<string, string> = {
  mainnet: "NetXdQprcVkpaWU",
  ghostnet: "NetXnHfVqm9iesp",
  shadownet: "NetXsqzbfFenSTS",
};

function labelForChainId(chainId: string): string {
  return CHAIN_ID_TO_NETWORK[chainId] || `unknown (${chainId})`;
}

export class WalletNetworkMismatchError extends Error {
  readonly code = "WALLET_NETWORK_MISMATCH";
  constructor(expected: string, actualLabel: string) {
    super(
      `Your wallet is connected to ${actualLabel} but this site is configured for ${expected}. ` +
        `Switch your wallet to ${expected} before continuing.`
    );
  }
}

/**
 * Ask the configured RPC what chain it serves.  If this fails (e.g. the
 * RPC is unreachable) we deliberately throw rather than silently
 * assuming the right network.
 */
async function fetchChainId(): Promise<string> {
  const tezos = await getTezos();
  if (tezos?.rpc?.getChainId) {
    return await tezos.rpc.getChainId();
  }
  throw new Error("Unable to read chain id from Tezos RPC");
}

export async function assertNetworkReadyForSend(expectedAddress?: string): Promise<void> {
  await ensureWalletProviderForSend(expectedAddress);

  const expected = getNetwork();
  const expectedChainId = NETWORK_TO_CHAIN_ID[expected];
  if (!expectedChainId) {
    // Unconfigured network alias — skip the check rather than throw;
    // this lets devs point at a custom RPC without wedging the app.
    return;
  }

  let actualChainId: string;
  try {
    actualChainId = await fetchChainId();
  } catch (err) {
    throw new Error(
      `Could not verify wallet network: ${(err as Error).message}`
    );
  }

  if (actualChainId !== expectedChainId) {
    throw new WalletNetworkMismatchError(expected, labelForChainId(actualChainId));
  }
}
