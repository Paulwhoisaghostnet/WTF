import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "./wallet";

export const HORF_STABLES_CHAIN_ID = "NetXdQprcVkpaWU";
export type HorfStableMode = 0 | 1 | 2;

export type HorfStableContract = {
  contractAddress: string;
  chainId: string;
};

export type HorfDepositPermit = HorfStableContract & {
  mode: HorfStableMode;
  tokenContract: string;
  tokenId: string;
  amount: string;
  nonce: string;
  signature: string;
  oracleEpoch: string;
  token: { contract: string; tokenId: string; name: string; image: string | null };
};

export type HorfSelectedDeposit = {
  tokenContract: string;
  tokenId: string;
  amount: string;
};

export type HorfAuthorizedDeposit = {
  selection: HorfSelectedDeposit;
  permit: HorfDepositPermit;
};

type Progress = {
  onStage?: (stage: "preflight" | "preparing" | "wallet" | "confirming") => void;
  onSubmitted?: (opHash: string) => void;
};

function positiveNat(value: string, label: string): string {
  const normalized = toNatString(value);
  if (normalized === "0") throw new Error(`${label} must be greater than zero.`);
  return normalized;
}

function assertHorfContract(config: HorfStableContract): void {
  if (config.chainId !== HORF_STABLES_CHAIN_ID) {
    throw new Error("Horf Stables only accepts Tezos Mainnet operations.");
  }
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress)) {
    throw new Error("Horf Stables has no valid deployed contract address.");
  }
}

function assertPermit(
  permit: HorfDepositPermit,
  selection: HorfSelectedDeposit,
  config: HorfStableContract,
  mode: HorfStableMode,
): void {
  if (permit.contractAddress !== config.contractAddress || permit.chainId !== config.chainId) {
    throw new Error("Horf's eligibility permit targets a different stable or network. Refresh and try again.");
  }
  if (
    permit.mode !== mode ||
    permit.tokenContract !== selection.tokenContract ||
    toNatString(permit.tokenId) !== toNatString(selection.tokenId) ||
    toNatString(permit.amount) !== positiveNat(selection.amount, "Deposit amount") ||
    !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(permit.tokenContract)
  ) {
    throw new Error("Horf's eligibility permit does not match this horse deposit.");
  }
  positiveNat(permit.amount, "Deposit amount");
  toNatString(permit.tokenId);
  if (!/^0x[0-9a-fA-F]{64}$/.test(permit.nonce) || !permit.signature?.trim()) {
    throw new Error("Horf received an invalid one-use eligibility permit.");
  }
}

async function sendStableBatch(
  walletAddress: string,
  config: HorfStableContract,
  build: (tezos: any) => Promise<any>,
  progress: Progress,
): Promise<string> {
  assertHorfContract(config);
  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== HORF_STABLES_CHAIN_ID) {
      throw new Error("The selected RPC is not Tezos Mainnet.");
    }
    await ensureWalletProviderForSend(walletAddress, { network: "mainnet", rpcUrl });
    return { tezos, rpcUrl, batch: await build(tezos) };
  }, { network: "mainnet" });

  // Contract reads and operation construction can take time. Bind the active
  // signer and RPC again immediately before the one wallet submission.
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  if (await prepared.tezos.rpc.getChainId() !== HORF_STABLES_CHAIN_ID) {
    throw new Error("The Tezos network changed while preparing this stable action.");
  }
  progress.onStage?.("wallet");
  const op = await prepared.batch.send();
  progress.onSubmitted?.(op.opHash);
  progress.onStage?.("confirming");
  await op.confirmation(1);
  return op.opHash;
}

/** One wallet group grants each FA2 operator, deposits, then revokes it. */
export async function depositHorfHorses(
  walletAddress: string,
  config: HorfStableContract,
  mode: HorfStableMode,
  deposits: HorfAuthorizedDeposit[],
  progress: Progress = {},
): Promise<string> {
  assertHorfContract(config);
  if (!deposits.length) throw new Error("Add a horse before depositing.");
  for (const { permit, selection } of deposits) assertPermit(permit, selection, config, mode);
  return sendStableBatch(walletAddress, config, async (tezos) => {
    const stable = await tezos.wallet.at(config.contractAddress);
    if (!stable.methodsObject.deposit) throw new Error("The configured stable does not support deposits.");
    const batch = tezos.wallet.batch();
    for (const { permit } of deposits) {
      const fa2 = await tezos.wallet.at(permit.tokenContract);
      if (!fa2.methodsObject.update_operators) throw new Error("This token contract does not support FA2 operator updates.");
      const operator = {
        owner: walletAddress,
        operator: config.contractAddress,
        token_id: toNatString(permit.tokenId),
      };
      batch.withContractCall(fa2.methodsObject.update_operators([{ add_operator: operator }]));
      batch.withContractCall(stable.methodsObject.deposit({
        mode,
        token_contract: permit.tokenContract,
        token_id: toNatString(permit.tokenId),
        amount: positiveNat(permit.amount, "Deposit amount"),
        nonce: permit.nonce,
        signature: permit.signature,
      }));
      batch.withContractCall(fa2.methodsObject.update_operators([{ remove_operator: operator }]));
    }
    return batch;
  }, progress);
}

export async function claimHorfHorse(
  walletAddress: string,
  config: HorfStableContract,
  listingId: string,
  progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  return sendStableBatch(walletAddress, config, async (tezos) => {
    const stable = await tezos.wallet.at(config.contractAddress);
    if (!stable.methodsObject.claim) throw new Error("The configured stable does not support claims.");
    return tezos.wallet.batch().withContractCall(stable.methodsObject.claim(id));
  }, progress);
}

export async function cancelHorfListing(
  walletAddress: string,
  config: HorfStableContract,
  listingId: string,
  amount: string,
  progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  const quantity = positiveNat(amount, "Cancel amount");
  return sendStableBatch(walletAddress, config, async (tezos) => {
    const stable = await tezos.wallet.at(config.contractAddress);
    if (!stable.methodsObject.cancel) throw new Error("The configured stable does not support cancellation.");
    return tezos.wallet.batch().withContractCall(stable.methodsObject.cancel({ listing_id: id, amount: quantity }));
  }, progress);
}

/** Separately signs the Stable contract's restriction from its on-chain admin wallet. */
export async function setHorfStableBlacklist(
  adminWallet: string,
  config: HorfStableContract,
  traderWallet: string,
  blocked: boolean,
  progress: Progress = {},
): Promise<string> {
  if (!/^tz[123][1-9A-HJ-NP-Za-km-z]{33}$/.test(traderWallet)) {
    throw new Error("Choose a valid Tezos trader wallet for the on-chain restriction.");
  }
  return sendStableBatch(adminWallet, config, async (tezos) => {
    const stable = await tezos.wallet.at(config.contractAddress);
    const storage = await stable.storage() as { admin?: string };
    if (String(storage.admin ?? "") !== adminWallet) {
      throw new Error("The selected wallet is not this Stable contract's on-chain administrator.");
    }
    if (!stable.methodsObject.set_blacklisted) {
      throw new Error("The configured Stable contract does not support on-chain restrictions.");
    }
    return tezos.wallet.batch().withContractCall(stable.methodsObject.set_blacklisted({ wallet: traderWallet, blocked }));
  }, progress);
}
