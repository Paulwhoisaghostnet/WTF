import { getNetwork } from "../../lib/tezos/loaders";
import { assertNetworkReadyForSend } from "../../lib/tezos/preflight";
import { getTezos } from "../../lib/tezos/wallet";
import { assertWalletLinkedToCurrentUser } from "../../lib/tezos/wallet-ownership";
import type { FundingWalletGateway } from "./funding-wallet";

export const fundingWalletGateway: FundingWalletGateway = {
  network: getNetwork,
  assertOwnership: assertWalletLinkedToCurrentUser,
  assertReady: assertNetworkReadyForSend,
  async chainId() { return (await getTezos()).rpc.getChainId(); },
  async send(calls, expectedWallet, network, chainId) {
    const tezos = await getTezos();
    const batch = tezos.wallet.batch();
    for (const call of calls) {
      const contract = await tezos.wallet.at(call.contract);
      const method = contract.methodsObject[call.entrypoint];
      if (!method) throw new Error("The configured escrow does not support this action.");
      // Taquito preserves mutez via amount.toString(); its narrower TS type must not cause a Number conversion.
      const transfer = method(call.params).toTransferParams({ amount: call.amountMutez as unknown as number, mutez: true });
      batch.withTransfer(transfer);
    }
    // Contract loading is asynchronous. Recheck the active account after it, immediately before the wallet request.
    await assertNetworkReadyForSend(expectedWallet);
    if (getNetwork() !== network || await tezos.rpc.getChainId() !== chainId) throw new Error("The wallet network changed while preparing the tournament action.");
    return batch.send();
  },
};
