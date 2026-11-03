import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "./wallet";

export const HORF_CLAIM_CHAIN_ID = "NetXdQprcVkpaWU";

export type HorfClaimPermit = {
  totalRaw: string;
  signature: string;
};

export type HorfClaimConfig = {
  contractAddress: string;
  chainId: string;
  totalRaw: string;
  permit: HorfClaimPermit;
};

export async function claimHorfRewards(
  walletAddress: string,
  config: HorfClaimConfig,
  progress: {
    onStage?: (stage: "preflight" | "preparing" | "wallet" | "confirming") => void;
    onSubmitted?: (opHash: string) => void;
  } = {},
): Promise<string> {
  if (config.chainId !== HORF_CLAIM_CHAIN_ID) throw new Error("HORSE rewards can only be claimed on Tezos Mainnet.");
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress)) throw new Error("The Horf claim vault is not configured.");
  const totalRaw = toNatString(config.totalRaw);
  if (totalRaw === "0" || toNatString(config.permit.totalRaw) !== totalRaw || !config.permit.signature?.trim()) {
    throw new Error("Horf returned an invalid cumulative claim permit. Refresh rewards and try again.");
  }

  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== HORF_CLAIM_CHAIN_ID) throw new Error("The selected RPC is not Tezos Mainnet.");
    await ensureWalletProviderForSend(walletAddress, { network: "mainnet", rpcUrl });
    const vault = await tezos.wallet.at(config.contractAddress);
    if (!vault.methodsObject.claim) throw new Error("The configured vault does not support HORSE claims.");
    return { tezos, rpcUrl, batch: tezos.wallet.batch().withContractCall(vault.methodsObject.claim({ total_raw: totalRaw, signature: config.permit.signature })) };
  }, { network: "mainnet" });

  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  if (await prepared.tezos.rpc.getChainId() !== HORF_CLAIM_CHAIN_ID) throw new Error("The Tezos network changed while preparing this claim.");
  progress.onStage?.("wallet");
  const operation = await prepared.batch.send();
  progress.onSubmitted?.(operation.opHash);
  progress.onStage?.("confirming");
  await operation.confirmation(1);
  return operation.opHash;
}
