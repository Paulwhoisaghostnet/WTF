import { getNetwork } from "../../lib/tezos/loaders";
import { assertNetworkReadyForSend } from "../../lib/tezos/preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "../../lib/tezos/wallet";
import { assertWalletLinkedToCurrentUser } from "../../lib/tezos/wallet-ownership";
import type { FundingWalletGateway } from "./funding-wallet";

type WalletRpcDependencies = {
  fallback: typeof withTezosRpcFallback;
  activate: typeof ensureWalletProviderForSend;
  ready: typeof assertNetworkReadyForSend;
  network: typeof getNetwork;
};

export async function sendFundingCallsWithFallback(
  calls: Parameters<FundingWalletGateway["send"]>[0],
  expectedWallet: string,
  network: string,
  chainId: string,
  deps: WalletRpcDependencies = {
    fallback: withTezosRpcFallback,
    activate: ensureWalletProviderForSend,
    ready: assertNetworkReadyForSend,
    network: getNetwork,
  },
) {
  await deps.ready(expectedWallet, { network, useFallback: true });
  const prepared = await deps.fallback(async (tezos, { rpcUrl }) => {
    if (deps.network() !== network || await tezos.rpc.getChainId() !== chainId) {
      throw new Error("The wallet network changed while preparing the tournament action.");
    }
    await deps.activate(expectedWallet, { network, rpcUrl });
    const batch = tezos.wallet.batch();
    for (const call of calls) {
      const contract = await tezos.wallet.at(call.contract);
      const method = contract.methodsObject[call.entrypoint];
      if (!method) throw new Error("The configured escrow does not support this action.");
      // Taquito preserves mutez via amount.toString(); its narrower TS type must not cause a Number conversion.
      const transfer = method(call.params).toTransferParams({ amount: call.amountMutez as unknown as number, mutez: true });
      batch.withTransfer(transfer);
    }
    return { batch, tezos, rpcUrl };
  }, { network });
  // Contract loading is asynchronous. Recheck account and chain immediately before the wallet request.
  await deps.ready(expectedWallet, { network, rpcUrl: prepared.rpcUrl });
  if (deps.network() !== network || await prepared.tezos.rpc.getChainId() !== chainId) {
    throw new Error("The wallet network changed while preparing the tournament action.");
  }
  // Never retry the wallet submission: only RPC reads and batch preparation can fail over.
  return prepared.batch.send();
}

export const fundingWalletGateway: FundingWalletGateway = {
  network: getNetwork,
  assertOwnership: assertWalletLinkedToCurrentUser,
  assertReady: wallet => assertNetworkReadyForSend(wallet, { useFallback: true }),
  async chainId() { return withTezosRpcFallback(tezos => tezos.rpc.getChainId()); },
  send: sendFundingCallsWithFallback,
};
