import { assertTraderAddress } from "../../features/horf/recipient-input";
import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "./wallet";

const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const FA2_CONTRACT = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export type HorfTokenTransfer = {
  sender: string;
  chainId: string;
  tokenContract: string;
  tokenId: string;
  recipients: Array<{ address: string; amountRaw: string }>;
};

export type HorfSendProgress = {
  onStage?: (stage: "preflight" | "preparing" | "wallet" | "confirming") => void;
  onSubmitted?: (opHash: string) => void;
};

/** Sends all FA2 recipient transactions in one wallet-approved Mainnet call. */
export async function sendHorfTokenTransfer(
  transfer: HorfTokenTransfer,
  progress: HorfSendProgress = {},
): Promise<string> {
  const sender = assertTraderAddress(transfer.sender);
  if (transfer.chainId !== MAINNET_CHAIN_ID) throw new Error("Horf sends require Tezos Mainnet.");
  if (!FA2_CONTRACT.test(transfer.tokenContract)) throw new Error("A verified FA2 token contract is required.");
  const tokenId = toNatString(transfer.tokenId);
  if (!transfer.recipients.length) throw new Error("Add at least one recipient.");
  const seen = new Set<string>();
  const txs = transfer.recipients.map((recipient) => {
    const address = assertTraderAddress(recipient.address);
    if (address === sender) throw new Error("Remove your own wallet from the recipient list.");
    if (seen.has(address)) throw new Error(`Recipient ${address} appears more than once.`);
    seen.add(address);
    const amount = toNatString(recipient.amountRaw);
    if (amount === "0") throw new Error("Every transfer amount must be greater than zero.");
    return { to_: address, token_id: tokenId, amount };
  });

  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(sender, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) {
      throw new Error("The selected RPC is not Tezos Mainnet.");
    }
    await ensureWalletProviderForSend(sender, { network: "mainnet", rpcUrl });
    const fa2 = await tezos.wallet.at(transfer.tokenContract);
    if (!fa2.methodsObject.transfer) throw new Error("This token contract has no FA2 transfer entrypoint.");
    return {
      tezos,
      rpcUrl,
      call: fa2.methodsObject.transfer([{ from_: sender, txs }]),
    };
  }, { network: "mainnet" });

  await assertNetworkReadyForSend(sender, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  if (await prepared.tezos.rpc.getChainId() !== MAINNET_CHAIN_ID) {
    throw new Error("The Tezos network changed while preparing this send.");
  }
  progress.onStage?.("wallet");
  const op = await prepared.call.send();
  progress.onSubmitted?.(op.opHash);
  progress.onStage?.("confirming");
  await op.confirmation(1);
  return op.opHash;
}
