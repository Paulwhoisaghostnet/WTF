import { toNatString } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { ensureWalletProviderForSend, withTezosRpcFallback } from "./wallet";

export const HORF_ROOMS_CHAIN_ID = "NetXdQprcVkpaWU";
export type HorfPublicRoomMode = 0 | 1 | 2;
export type HorfRoomMode = HorfPublicRoomMode | 3;

export type HorfRoomContract = { contractAddress: string; chainId: string };
export type HorfRoomPermit = HorfRoomContract & {
  address: string;
  action: 0 | 1 | 2;
  mode: HorfRoomMode;
  listingId: string;
  tokenContract: string;
  tokenId: string;
  amount: string;
  nonce: string;
  signature: string;
  oracleEpoch: string;
  token: { contract: string; tokenId: string; name: string; image: string | null };
};
export type HorfRoomDeposit = { tokenContract: string; tokenId: string; amount: string; permit: HorfRoomPermit };

type Progress = {
  onStage?: (stage: "preflight" | "preparing" | "wallet" | "confirming") => void;
  onSubmitted?: (opHash: string) => void;
};

function positiveNat(value: string, label: string): string {
  const normalized = toNatString(value);
  if (normalized === "0") throw new Error(`${label} must be greater than zero.`);
  return normalized;
}

function assertContract(config: HorfRoomContract): void {
  if (config.chainId !== HORF_ROOMS_CHAIN_ID) throw new Error("Horf rooms require Tezos Mainnet.");
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.contractAddress)) {
    throw new Error("Horf has no valid escrow-room contract address.");
  }
}

function assertPermit(
  permit: HorfRoomPermit, walletAddress: string, config: HorfRoomContract,
  action: 0 | 1 | 2, mode: HorfRoomMode, listingId: string,
  tokenContract: string, tokenId: string, amount: string,
): void {
  assertContract(config);
  if (permit.contractAddress !== config.contractAddress || permit.chainId !== config.chainId ||
      permit.address !== walletAddress || permit.action !== action || permit.mode !== mode ||
      toNatString(permit.listingId) !== toNatString(listingId) ||
      permit.tokenContract !== tokenContract || toNatString(permit.tokenId) !== toNatString(tokenId) ||
      toNatString(permit.amount) !== positiveNat(amount, "Edition amount") ||
      !/^0x[0-9a-fA-F]{64}$/.test(permit.nonce) || !permit.signature?.trim()) {
    throw new Error("Horf's one-use permit does not match this reviewed horse transaction.");
  }
}

function completionNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function sendRoomBatch(
  walletAddress: string, config: HorfRoomContract, build: (tezos: any) => Promise<any>,
  progress: Progress,
): Promise<string> {
  assertContract(config);
  progress.onStage?.("preflight");
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", useFallback: true });
  progress.onStage?.("preparing");
  const prepared = await withTezosRpcFallback(async (tezos, { rpcUrl }) => {
    if (await tezos.rpc.getChainId() !== HORF_ROOMS_CHAIN_ID) throw new Error("The selected RPC is not Tezos Mainnet.");
    await ensureWalletProviderForSend(walletAddress, { network: "mainnet", rpcUrl });
    return { tezos, rpcUrl, batch: await build(tezos) };
  }, { network: "mainnet" });
  await assertNetworkReadyForSend(walletAddress, { network: "mainnet", rpcUrl: prepared.rpcUrl });
  if (await prepared.tezos.rpc.getChainId() !== HORF_ROOMS_CHAIN_ID) {
    throw new Error("The Tezos network changed while preparing this room action.");
  }
  progress.onStage?.("wallet");
  const operation = await prepared.batch.send();
  progress.onSubmitted?.(operation.opHash);
  progress.onStage?.("confirming");
  await operation.confirmation(1);
  return operation.opHash;
}

/** Each selected edition count is explicit; operators are removed in the same wallet group. */
export async function depositHorfRoomHorses(
  walletAddress: string, config: HorfRoomContract, mode: HorfPublicRoomMode,
  deposits: HorfRoomDeposit[], progress: Progress = {},
): Promise<string> {
  if (!deposits.length) throw new Error("Select a horse before opening a room.");
  for (const item of deposits) {
    assertPermit(item.permit, walletAddress, config, 0, mode, "0",
      item.tokenContract, item.tokenId, item.amount);
  }
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    if (!room.methodsObject.deposit) throw new Error("The configured contract cannot open escrow rooms.");
    const batch = tezos.wallet.batch();
    for (const item of deposits) {
      const fa2 = await tezos.wallet.at(item.tokenContract);
      if (!fa2.methodsObject.update_operators) throw new Error("This horse FA2 cannot grant an operator.");
      const operator = { owner: walletAddress, operator: config.contractAddress, token_id: toNatString(item.tokenId) };
      batch.withContractCall(fa2.methodsObject.update_operators([{ add_operator: operator }]));
      batch.withContractCall(room.methodsObject.deposit({
        mode, token_contract: item.tokenContract, token_id: toNatString(item.tokenId),
        amount: positiveNat(item.amount, "Edition amount"), nonce: item.permit.nonce,
        signature: item.permit.signature,
      }));
      batch.withContractCall(fa2.methodsObject.update_operators([{ remove_operator: operator }]));
    }
    return batch;
  }, progress);
}

/** A standard FA2 balance callback must finish before assert_completed or the whole wallet group reverts. */
export async function claimHorfRoomHorse(
  walletAddress: string, config: HorfRoomContract, listingId: string, progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  const nonce = completionNonce();
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    if (!room.methodsObject.claim || !room.methodsObject.assert_completed) {
      throw new Error("The configured room lacks the checked claim entrypoints.");
    }
    return tezos.wallet.batch()
      .withContractCall(room.methodsObject.claim({ listing_id: id, completion_nonce: nonce }))
      .withContractCall(room.methodsObject.assert_completed(nonce));
  }, progress);
}

/** One operator-grant/swap/finalizer/revoke group sends one horse each way atomically for honest FA2s. */
export async function swapHorfOutlawHorse(
  walletAddress: string, config: HorfRoomContract, listingId: string,
  inputTokenContract: string, inputTokenId: string, permit: HorfRoomPermit,
  progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  assertPermit(permit, walletAddress, config, 1, 2, id, inputTokenContract, inputTokenId, "1");
  const nonce = completionNonce();
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    const fa2 = await tezos.wallet.at(inputTokenContract);
    if (!room.methodsObject.swap_outlaw || !room.methodsObject.assert_completed || !fa2.methodsObject.update_operators) {
      throw new Error("The room or horse FA2 lacks the required atomic swap entrypoints.");
    }
    const operator = { owner: walletAddress, operator: config.contractAddress, token_id: toNatString(inputTokenId) };
    return tezos.wallet.batch()
      .withContractCall(fa2.methodsObject.update_operators([{ add_operator: operator }]))
      .withContractCall(room.methodsObject.swap_outlaw({
        listing_id: id, input_token_contract: inputTokenContract, input_token_id: toNatString(inputTokenId),
        permit_nonce: permit.nonce, signature: permit.signature, completion_nonce: nonce,
      }))
      .withContractCall(room.methodsObject.assert_completed(nonce))
      .withContractCall(fa2.methodsObject.update_operators([{ remove_operator: operator }]));
  }, progress);
}

/** The owner escrows exactly one edition for one named rider's exact offered horse. */
export async function createPrivateHorfOffer(
  walletAddress: string, config: HorfRoomContract,
  outputTokenContract: string, outputTokenId: string,
  offererAddress: string, inputTokenContract: string, inputTokenId: string,
  permit: HorfRoomPermit, progress: Progress = {},
): Promise<string> {
  if (offererAddress === walletAddress || !/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(offererAddress)) {
    throw new Error("Choose a different Tezos wallet for the private horse offer.");
  }
  if (outputTokenContract === inputTokenContract && toNatString(outputTokenId) === toNatString(inputTokenId)) {
    throw new Error("The horses on each side of this trade must differ.");
  }
  assertPermit(permit, walletAddress, config, 0, 3, "0", outputTokenContract, outputTokenId, "1");
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    const fa2 = await tezos.wallet.at(outputTokenContract);
    if (!room.methodsObject.create_private_offer || !fa2.methodsObject.update_operators) {
      throw new Error("The room or horse FA2 lacks the private escrow entrypoints.");
    }
    const operator = { owner: walletAddress, operator: config.contractAddress, token_id: toNatString(outputTokenId) };
    return tezos.wallet.batch()
      .withContractCall(fa2.methodsObject.update_operators([{ add_operator: operator }]))
      .withContractCall(room.methodsObject.create_private_offer({
        token_contract: outputTokenContract, token_id: toNatString(outputTokenId),
        offerer: offererAddress, input_token_contract: inputTokenContract,
        input_token_id: toNatString(inputTokenId), nonce: permit.nonce, signature: permit.signature,
      }))
      .withContractCall(fa2.methodsObject.update_operators([{ remove_operator: operator }]));
  }, progress);
}

/** The named offerer fulfills the pinned input token; the contract swaps both horses atomically. */
export async function fulfillPrivateHorfOffer(
  walletAddress: string, config: HorfRoomContract, listingId: string,
  inputTokenContract: string, inputTokenId: string, permit: HorfRoomPermit,
  progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  assertPermit(permit, walletAddress, config, 2, 3, id, inputTokenContract, inputTokenId, "1");
  const nonce = completionNonce();
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    const fa2 = await tezos.wallet.at(inputTokenContract);
    if (!room.methodsObject.fulfill_private_offer || !room.methodsObject.assert_completed ||
        !fa2.methodsObject.update_operators) {
      throw new Error("The room or horse FA2 lacks the checked private trade entrypoints.");
    }
    const operator = { owner: walletAddress, operator: config.contractAddress, token_id: toNatString(inputTokenId) };
    return tezos.wallet.batch()
      .withContractCall(fa2.methodsObject.update_operators([{ add_operator: operator }]))
      .withContractCall(room.methodsObject.fulfill_private_offer({
        listing_id: id, permit_nonce: permit.nonce, signature: permit.signature,
        completion_nonce: nonce,
      }))
      .withContractCall(room.methodsObject.assert_completed(nonce))
      .withContractCall(fa2.methodsObject.update_operators([{ remove_operator: operator }]));
  }, progress);
}

export async function cancelHorfRoomListing(
  walletAddress: string, config: HorfRoomContract, listingId: string, amount: string,
  progress: Progress = {},
): Promise<string> {
  const id = toNatString(listingId);
  const count = positiveNat(amount, "Return amount");
  return sendRoomBatch(walletAddress, config, async (tezos) => {
    const room = await tezos.wallet.at(config.contractAddress);
    if (!room.methodsObject.cancel) throw new Error("The configured room cannot return unclaimed horses.");
    return tezos.wallet.batch().withContractCall(room.methodsObject.cancel({ listing_id: id, amount: count }));
  }, progress);
}
